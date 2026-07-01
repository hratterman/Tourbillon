/**
 * Modal synthesis core for the repeater gongs. Pure, dependency-free JS:
 * this exact source is imported by the app and the tests, and is also
 * inlined (via ?raw) into the AudioWorklet module, so the worklet and the
 * headless tests are guaranteed to compute the same sound.
 *
 * Each gong is a curved steel rod modelled as a sum of decaying sinusoidal
 * modes (inharmonic overtones, higher modes decaying faster), excited by a
 * hammer impact. No samples anywhere.
 */

/**
 * Instantiate the mode set for one strike.
 * @param {{modes: {ratio: number, amp: number, tau: number}[], f0: number}} gong
 * @param {number} velocity 0..1 hammer energy: louder and slightly brighter
 * @returns {{f: number, amp: number, tau: number}[]}
 */
export function strikeModes(gong, velocity) {
  const v = Math.max(0, Math.min(1, velocity))
  const loud = 0.25 + 0.75 * v
  const out = []
  for (let i = 0; i < gong.modes.length; i++) {
    const m = gong.modes[i]
    // harder strike tilts energy toward the upper modes (brighter)
    const brightness = 1 + (v - 0.5) * 0.9 * (i / Math.max(1, gong.modes.length - 1))
    out.push({ f: gong.f0 * m.ratio, amp: m.amp * loud * brightness, tau: m.tau })
  }
  return out
}

/** Master soft limiter: overlapping strikes may sum well past 1; this keeps
 * the output clean without hard clipping. Odd, monotonic, |y| < 1. */
export function softLimit(x) {
  return Math.tanh(1.3 * x) / Math.tanh(1.3)
}

/** Attack window: brief raised-cosine contact so the onset doesn't click. */
export function attackGain(tSec, attack) {
  if (tSec >= attack) return 1
  if (tSec <= 0) return 0
  return 0.5 - 0.5 * Math.cos((Math.PI * tSec) / attack)
}

export const STRIKE_GAIN = 0.16 // per-voice gain headroom for polyphony
export const ATTACK_S = 0.002

/**
 * Offline render of a strike sequence (used by the acceptance tests and as
 * a fallback when AudioWorklet is unavailable). Same math the worklet runs.
 * @param {{t: number, gong: {modes: object[], f0: number}, velocity: number}[]} strikes
 * @param {number} sampleRate
 * @param {number} durationSec
 * @returns {Float32Array}
 */
export function renderStrikes(strikes, sampleRate, durationSec) {
  const n = Math.ceil(durationSec * sampleRate)
  const out = new Float32Array(n)
  for (const s of strikes) {
    const modes = strikeModes(s.gong, s.velocity)
    const i0 = Math.max(0, Math.floor(s.t * sampleRate))
    for (const m of modes) {
      const w = (2 * Math.PI * m.f) / sampleRate
      const decay = Math.exp(-1 / (m.tau * sampleRate))
      const cos = Math.cos(w)
      const sin = Math.sin(w)
      let amp = m.amp * STRIKE_GAIN
      // stop when the mode has decayed to silence
      const len = Math.min(n - i0, Math.ceil(m.tau * sampleRate * 8))
      // recursive phasor z = e^{jwt}: z_{k+1} = z_k * e^{jw}; sin = Im(z)
      let zRe = 1
      let zIm = 0
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate
        out[i0 + i] += amp * attackGain(t, ATTACK_S) * zIm
        const nRe = zRe * cos - zIm * sin
        const nIm = zRe * sin + zIm * cos
        zRe = nRe
        zIm = nIm
        amp *= decay
      }
    }
  }
  for (let i = 0; i < n; i++) out[i] = softLimit(out[i])
  return out
}
