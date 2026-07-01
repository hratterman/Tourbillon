import { BALANCE_FREQ_HZ, LIFT_ANGLE, DEG } from './constants'
import { EV_ENGAGE, EV_LOCK, type EscEvent } from './escapement'

/**
 * Timing-machine readouts, inferred the way a real machine infers them from
 * the escapement's acoustic events — NOT printed from the parameters that
 * were set. Inputs are only the event timestamps (engage / lock) plus the
 * published lift angle of the calibre.
 *
 *  - rate: mean beat period vs the nominal 1/(2f), in s/day
 *  - amplitude: from the time the pin takes to cross the lift window:
 *      theta(t) = A sin(w t)  =>  A = L / (2 sin(w_nominal * dt / 2))
 *  - beat error: half the difference between tick and tock periods
 */
export class TimingMachine {
  private lockTimes: number[] = []
  private lockSides: number[] = []
  private lastEngage: { t: number; side: number } | null = null
  private amplitudes: number[] = []
  lastLockT = -Infinity

  ingest(events: EscEvent[]): void {
    for (const ev of events) {
      if (ev.type === EV_ENGAGE) {
        this.lastEngage = ev
      } else if (ev.type === EV_LOCK) {
        this.lastLockT = ev.t
        this.lockTimes.push(ev.t)
        this.lockSides.push(ev.side)
        if (this.lockTimes.length > 128) {
          this.lockTimes.shift()
          this.lockSides.shift()
        }
        if (this.lastEngage && this.lastEngage.side === ev.side) {
          const dt = ev.t - this.lastEngage.t
          const wNom = 2 * Math.PI * BALANCE_FREQ_HZ
          const s = Math.sin((wNom * dt) / 2)
          if (s > 1e-6) {
            this.amplitudes.push(LIFT_ANGLE / (2 * s) / DEG)
            if (this.amplitudes.length > 16) this.amplitudes.shift()
          }
        }
      }
    }
  }

  /** True if beats have been observed recently (relative to sim time now). */
  running(now: number): boolean {
    return now - this.lastLockT < 0.5
  }

  /** Rate deviation in seconds/day (+ = fast). Needs a few beats of history. */
  rateSecPerDay(): number | null {
    const n = this.lockTimes.length
    if (n < 17) return null
    const span = this.lockTimes[n - 1] - this.lockTimes[0]
    const beat = span / (n - 1)
    const nominal = 1 / (2 * BALANCE_FREQ_HZ)
    return (nominal / beat - 1) * 86400
  }

  /** Balance amplitude in degrees, timing-machine style. */
  amplitudeDeg(): number | null {
    if (this.amplitudes.length === 0) return null
    return this.amplitudes.reduce((a, b) => a + b, 0) / this.amplitudes.length
  }

  /** Beat error in ms: asymmetry between tick and tock intervals. */
  beatErrorMs(): number | null {
    const n = this.lockTimes.length
    if (n < 9) return null
    let even = 0
    let odd = 0
    let ne = 0
    let no = 0
    for (let i = 1; i < n; i++) {
      const p = this.lockTimes[i] - this.lockTimes[i - 1]
      if (this.lockSides[i] > 0) {
        even += p
        ne++
      } else {
        odd += p
        no++
      }
    }
    if (ne === 0 || no === 0) return null
    return Math.abs(even / ne - odd / no) * 500 // half the difference, in ms
  }
}
