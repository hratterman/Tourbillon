import { describe, expect, it } from 'vitest'
import { DEG } from '../src/core/constants'
import { Movement } from '../src/core/movement'
import { runningMovement } from './helpers'

/**
 * Acceptance test 2 — Sustain and decay.
 * Fully wound: amplitude holds steady in the healthy band. With the impulse
 * disabled the oscillation decays smoothly. Below a torque threshold the
 * escapement fails to sustain ON ITS OWN — there is no `if (reserve <= 0)`
 * anywhere in the codebase.
 */
describe('sustain and decay', () => {
  it('fully wound: amplitude holds in the healthy band (270–310°)', () => {
    const mv = new Movement({ h: 12, m: 0 })
    mv.mainspring.turns = 5.7 // full wind
    mv.advance(30) // settle
    for (let i = 0; i < 6; i++) {
      mv.advance(10)
      const a = mv.timing.amplitudeDeg()!
      expect(a).toBeGreaterThan(270)
      expect(a).toBeLessThan(310)
    }
  })

  it('amplitude sags as the mainspring runs down', () => {
    const full = new Movement({ h: 12, m: 0 })
    full.mainspring.turns = 5.7
    full.advance(40)
    const half = new Movement({ h: 12, m: 0 })
    half.mainspring.turns = 5.7 * 0.4
    half.advance(40)
    const aFull = full.timing.amplitudeDeg()!
    const aHalf = half.timing.amplitudeDeg()!
    expect(aHalf).toBeLessThan(aFull - 20) // visible sag
    expect(aHalf).toBeGreaterThan(150) // still healthy enough to run
  })

  it('with impulse disabled, amplitude decays smoothly toward rest', () => {
    const mv = runningMovement(12, 0)
    mv.esc.impulseEnabled = false
    let prev = Infinity
    const samples: number[] = []
    for (let i = 0; i < 8; i++) {
      mv.advance(5)
      samples.push(peakAmplitude(mv))
    }
    for (const a of samples) {
      expect(a).toBeLessThan(prev + 1e-9)
      prev = a
    }
    expect(samples[samples.length - 1]).toBeLessThan(samples[0] * 0.35)
  })

  it('below a torque threshold the escapement stops on its own', () => {
    const mv = runningMovement(12, 0)
    mv.mainspring.turns = 5.7 * 0.006 // deep in the torque cliff
    mv.advance(90)
    const beatsBefore = mv.esc.beatCount
    mv.advance(10)
    expect(mv.esc.beatCount - beatsBefore).toBe(0) // no more beats: stopped
    expect(mv.running).toBe(false)
    // and the stop emerged from energy balance: there is still *some* torque
    expect(mv.mainspring.torque()).toBeGreaterThan(0)
  })

  it('winding a stopped watch restarts it (with a shake)', () => {
    const mv = runningMovement(12, 0)
    mv.mainspring.turns = 0
    mv.advance(60) // dies
    expect(mv.running).toBe(false)
    for (let i = 0; i < 20; i++) mv.turnCrown(1) // wind it back up
    mv.advance(10)
    expect(mv.running).toBe(true)
  })
})

/** Sample the true peak |theta| over one full oscillation. */
function peakAmplitude(mv: Movement): number {
  let peak = 0
  for (let i = 0; i < 50; i++) {
    mv.advance(0.005)
    peak = Math.max(peak, Math.abs(mv.esc.theta / DEG))
  }
  return peak
}
