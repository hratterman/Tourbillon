import { DT_PHYSICS, POWER_RESERVE_HOURS, TAU, DEG } from './constants'
import { Escapement } from './escapement'
import { Mainspring } from './mainspring'
import { TimingMachine } from './measurements'
import { Repeater, type StrikeEvent } from './repeater'
import { makeSnails } from './snails'
import { Train } from './train'

/**
 * The single source of truth: one object holding the entire mechanism
 * state. The renderer and the audio engine are read-only consumers.
 *
 * Physics runs on a fixed timestep with an accumulator (`advance` may be
 * called with any span of simulated time; it sub-steps internally). The
 * balance oscillator is stiff (4 Hz with contact events) so the default
 * step is 1e-4 s; `dtPhysics` may be coarsened for very high time scales.
 */
export class Movement {
  t = 0 // simulated time, s
  readonly mainspring = new Mainspring(0.75)
  readonly esc = new Escapement()
  readonly train = new Train()
  /** Tamper hooks used by the acceptance tests' "reads geometry, not clock" guard. */
  readonly tamper = { hourStarOffset: 0, cannonOffsetRad: 0 }
  readonly repeater = new Repeater(makeSnails(this.train, this.tamper))
  readonly timing = new TimingMachine()

  dtPhysics = DT_PHYSICS
  crownPulled = false
  regulator = 0 // -1..+1, moves the regulator index (rate adjust)

  private debt = 0
  private strikeSink: StrikeEvent[] = []

  constructor(startTime?: { h: number; m: number; s?: number }) {
    if (startTime) this.train.setDisplayedTime(startTime.h, startTime.m, startTime.s ?? 0, 0)
    this.esc.kick(270 * DEG) // the assembling watchmaker gives it a swing
  }

  /** Advance the simulation by `seconds` of simulated time. */
  advance(seconds: number): void {
    this.debt += seconds
    const dt = this.dtPhysics
    const esc = this.esc
    const train = this.train
    const rep = this.repeater
    const spring = this.mainspring
    let n = Math.floor(this.debt / dt)
    this.debt -= n * dt
    while (n-- > 0) {
      const torque = spring.torque()
      const dEsc = esc.step(dt, this.t, torque)
      if (dEsc !== 0) {
        spring.unwind(Math.max(0, dEsc))
        train.sync(esc.escAngle, this.t)
      }
      rep.step(dt, this.t)
      this.t += dt
    }
    this.timing.ingest(esc.drainEvents())
    const strikes = rep.drainStrikes()
    for (const s of strikes) this.strikeSink.push(s)
  }

  /** Strikes since last drain (audio scheduling / hammer flash). */
  drainStrikes(): StrikeEvent[] {
    const s = this.strikeSink
    this.strikeSink = []
    return s
  }

  // ------------------------------------------------------------------ //
  // Interaction layer (crown, slide, regulator)
  // ------------------------------------------------------------------ //

  /**
   * Turn the crown by `revs` revolutions.
   * Pushed in: winds the mainspring (ratchet: only forward counts).
   * Pulled out: sets the hands through the motion works — the snails move
   * in lockstep because they are geared to the same cannon pinion.
   */
  turnCrown(revs: number): void {
    if (this.crownPulled) {
      // keyless works gearing: one crown rev = 10 minutes of hand travel
      this.train.setHands(revs * (TAU / 6), this.t)
    } else if (revs > 0) {
      const wasRunning = this.running
      this.mainspring.wind(revs * 0.25) // click ratchet reduction
      if (!wasRunning && this.mainspring.windFraction > 0.05) {
        this.esc.kick(200 * DEG) // the shake that restarts a stopped watch
      }
    }
  }

  setCrownPulled(pulled: boolean): void {
    this.crownPulled = pulled
  }

  setRegulator(x: number): void {
    this.regulator = Math.max(-1, Math.min(1, x))
    // Moving the index changes the active hairspring length, hence k.
    // ±1 ≈ ±0.2% in k ≈ ±86 s/day.
    this.esc.kScale = 1 + this.regulator * 0.002
  }

  pushRepeaterSlide(travel: number): void {
    this.repeater.pushSlide(travel)
  }

  releaseRepeaterSlide(): void {
    this.repeater.releaseSlide()
  }

  // ------------------------------------------------------------------ //
  // Readouts
  // ------------------------------------------------------------------ //

  get running(): boolean {
    return this.timing.running(this.t) || Math.abs(this.esc.omega) > 1
  }

  displayedTime(): { h: number; m: number; s: number } {
    return this.train.displayedTime()
  }

  /** Power-reserve indication, hours (geared to the barrel like a real one). */
  reserveHours(): number {
    return this.mainspring.windFraction * POWER_RESERVE_HOURS
  }

  readouts() {
    return {
      rateSecPerDay: this.timing.rateSecPerDay(),
      amplitudeDeg: this.timing.amplitudeDeg(),
      beatErrorMs: this.timing.beatErrorMs(),
      reserveHours: this.reserveHours(),
      running: this.running,
    }
  }
}
