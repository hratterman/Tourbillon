import { describe, expect, it } from 'vitest'
// @ts-expect-error plain-JS module shared verbatim with the AudioWorklet
import { renderStrikes } from '../src/audio/modalcore.js'
import { DEFAULT_HIGH_F0, DEFAULT_LOW_F0, makeGong } from '../src/audio/gongparams'
import { chime, runningMovement } from './helpers'

const SR = 44100

/** Goertzel power of `buf` at frequency f. */
function goertzel(buf: Float32Array, f: number, sr: number): number {
  const w = (2 * Math.PI * f) / sr
  const coeff = 2 * Math.cos(w)
  let s0 = 0
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < buf.length; i++) {
    s0 = buf[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2
}

/**
 * Acceptance test 7 — audio sanity.
 * Low vs high strikes are clearly different pitches; the ding-dong is two
 * distinct tones; a full 12:59 chime (32 overlapping decays) never clips.
 */
describe('modal gong synthesis', () => {
  const low = makeGong(DEFAULT_LOW_F0)
  const high = makeGong(DEFAULT_HIGH_F0)

  it('a low strike and a high strike are clearly different pitches', () => {
    const lowBuf = renderStrikes([{ t: 0, gong: low, velocity: 0.9 }], SR, 1.5)
    const highBuf = renderStrikes([{ t: 0, gong: high, velocity: 0.9 }], SR, 1.5)
    // dominant energy of each buffer sits at its own fundamental
    expect(goertzel(lowBuf, DEFAULT_LOW_F0, SR)).toBeGreaterThan(goertzel(lowBuf, DEFAULT_HIGH_F0, SR) * 4)
    expect(goertzel(highBuf, DEFAULT_HIGH_F0, SR)).toBeGreaterThan(goertzel(highBuf, DEFAULT_LOW_F0, SR) * 4)
  })

  it('the ding-dong is audibly two distinct tones', () => {
    const buf = renderStrikes(
      [
        { t: 0, gong: low, velocity: 0.9 },
        { t: 0.36, gong: high, velocity: 0.9 },
      ],
      SR,
      2.0,
    )
    // before the second hammer falls there is no energy at the high
    // fundamental; right after it there is plenty — two distinct tones
    // sounding in sequence, then together.
    const win = (a: number, b: number) => buf.subarray(Math.floor(a * SR), Math.floor(b * SR))
    const highBefore = goertzel(win(0.2, 0.35), DEFAULT_HIGH_F0, SR)
    const highAfter = goertzel(win(0.37, 0.52), DEFAULT_HIGH_F0, SR)
    const lowAfter = goertzel(win(0.37, 0.52), DEFAULT_LOW_F0, SR)
    expect(highAfter).toBeGreaterThan(highBefore * 20)
    expect(lowAfter).toBeGreaterThan(0) // the first tone is still ringing
  })

  it('a full 12:59 chime stays below clipping through the soft limiter', () => {
    // Take the real strike schedule from the simulated mechanism.
    const mv = runningMovement(12, 59)
    const t0 = mv.t
    const events = chime(mv)
    expect(events.length).toBe(12 + 3 * 2 + 14)
    const strikes = events.map((e) => ({
      t: e.t - t0,
      gong: e.gong === 'low' ? low : high,
      velocity: e.velocity,
    }))
    const dur = strikes[strikes.length - 1].t + 3
    const buf = renderStrikes(strikes, SR, dur)
    let peak = 0
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
    expect(peak).toBeLessThan(0.995) // soft limiter: never hard-clips
    expect(peak).toBeGreaterThan(0.2) // ...and it is not silence
  })

  it('harder strikes are louder', () => {
    const soft = renderStrikes([{ t: 0, gong: low, velocity: 0.3 }], SR, 1)
    const hard = renderStrikes([{ t: 0, gong: low, velocity: 1.0 }], SR, 1)
    expect(rms(hard, 0, 0.5)).toBeGreaterThan(rms(soft, 0, 0.5) * 1.5)
  })
})

function rms(buf: Float32Array, fromSec: number, toSec: number): number {
  const a = Math.floor(fromSec * SR)
  const b = Math.min(buf.length, Math.floor(toSec * SR))
  let sum = 0
  for (let i = a; i < b; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / Math.max(1, b - a))
}
