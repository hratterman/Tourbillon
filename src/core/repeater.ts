import { TAU, DEG } from './constants'
import type { SnailSet } from './snails'
import {
  HOUR_SNAIL_R0,
  HOUR_SNAIL_DR,
  QUARTER_SNAIL_R0,
  QUARTER_SNAIL_DR,
  MINUTE_SNAIL_R0,
  MINUTE_SNAIL_DR,
} from './snails'

export interface StrikeEvent {
  t: number // simulated time
  gong: 'low' | 'high'
  velocity: number // 0..1, hammer energy -> loudness/brightness
}

export const RACK_IDLE = 0
export const RACK_FALLING = 1
export const RACK_LANDED = 2

/**
 * One spring-loaded rack. Released, it falls (a real rotational dynamic,
 * visible in slow motion) until its toothed tail lands on the snail step.
 * The landing angle is a pure function of the snail radius at that instant;
 * the number of rack teeth that then pass the gathering pallet on the way
 * back up IS the strike count. Nothing here knows what time it is.
 */
export class Rack {
  angle = 0 // rad fallen from rest (rest = fully gathered)
  vel = 0
  state = RACK_IDLE
  landedAngle = 0
  /** teeth the gathering pallet will collect = the computed strike count */
  teeth = 0
  gathered = 0 // teeth gathered so far during the strike

  constructor(
    public readonly toothPitch: number, // rad of rack rotation per tooth
    private readonly r0: number, // snail radius of the shallowest step
    private readonly radiusPerRad: number, // tail-tip radial drop per rad of rack fall
    private readonly springAccel: number, // rad/s^2 while falling
  ) {}

  release(): void {
    this.state = RACK_FALLING
    this.vel = 0
    this.gathered = 0
  }

  reset(): void {
    this.state = RACK_IDLE
    this.angle = 0
    this.vel = 0
    this.gathered = 0
    this.teeth = 0
  }

  /** @param snailRadius radius under the tail right now */
  step(dt: number, snailRadius: number): void {
    if (this.state !== RACK_FALLING) return
    // Contact angle allowed by the snail step currently under the tail:
    const maxFall = Math.max(0, (this.r0 - snailRadius) / this.radiusPerRad)
    this.vel += this.springAccel * dt
    this.angle += this.vel * dt
    if (this.angle >= maxFall) {
      // The tail lands on the step (dead-beat: the snail face absorbs it).
      this.angle = maxFall
      this.vel = 0
      this.state = RACK_LANDED
      this.landedAngle = maxFall
      // The teeth that now stand past the gathering pallet. The cam steps
      // are cut so a landing on step n exposes exactly n teeth; the +0.25
      // is the engagement tolerance of the pallet beak.
      this.teeth = Math.max(0, Math.floor(this.landedAngle / this.toothPitch + 0.25))
    }
  }

  /** Rack angle for rendering: ratchets back up as teeth are gathered. */
  currentAngle(gatherProgress: number): number {
    if (this.state === RACK_IDLE) return 0
    if (this.state === RACK_FALLING) return this.angle
    const lifted = this.gathered + Math.max(0, Math.min(1, gatherProgress))
    return Math.max(0, this.landedAngle - lifted * this.toothPitch)
  }
}

const PHASE_IDLE = 0
const PHASE_FALL = 1
const PHASE_RUN = 2
export type RepeaterPhase = typeof PHASE_IDLE | typeof PHASE_FALL | typeof PHASE_RUN

interface GatherSlot {
  phi: number // strike-train angle at which this hammer is released
  gong: 'low' | 'high'
  rack: Rack
}

// Strike train / governor dynamics (abstract units, J = 1)
const GOV_TORQUE_FULL = 60 // rad/s^2 at full charge, fresh spring
const GOV_DRAG = 0.78 // quadratic air drag of the fly: terminal w = sqrt(tq/drag)
const SPRING_TRAVEL_CAP = 240 // rad of train travel the slide push can supply
const ALL_OR_NOTHING_TRAVEL = 0.85
const GAP_REVS = 1 // blank revolution between hour/quarter/minute groups

/**
 * The minute repeater. Push the slide to wind the strike spring; the
 * all-or-nothing piece only latches past ALL_OR_NOTHING_TRAVEL — release
 * before that and the racks were never unblocked: total silence.
 *
 * On release (if latched): the racks fall onto their snails; once they have
 * landed, the strike train is freed and spins up against the fly governor,
 * whose air drag sets the cadence. Every revolution of the gathering pallet
 * lifts one rack tooth and trips the corresponding hammer. The strike
 * counts therefore come from the landed rack geometry and nowhere else.
 */
export class Repeater {
  readonly hourRack = new Rack(6 * DEG, HOUR_SNAIL_R0, HOUR_SNAIL_DR / (6 * DEG), 350)
  readonly quarterRack = new Rack(8 * DEG, QUARTER_SNAIL_R0, QUARTER_SNAIL_DR / (8 * DEG), 350)
  readonly minuteRack = new Rack(4.5 * DEG, MINUTE_SNAIL_R0, MINUTE_SNAIL_DR / (4.5 * DEG), 350)

  slideTravel = 0 // 0..1, current slide position
  latched = false // all-or-nothing piece has committed
  charge = 0 // 0..1 strike-spring charge stored at latch
  phase: RepeaterPhase = PHASE_IDLE

  trainPhi = 0 // strike train angle, rad
  trainOmega = 0
  private slots: GatherSlot[] = []
  private nextSlot = 0
  private endPhi = 0
  private strikes: StrikeEvent[] = []

  constructor(private readonly snails: SnailSet) {}

  /** Strike events since last drain (consumed by audio + hammer render). */
  drainStrikes(): StrikeEvent[] {
    const s = this.strikes
    this.strikes = []
    return s
  }

  get busy(): boolean {
    return this.phase !== PHASE_IDLE
  }

  /** Move the slide (user drag / press). Locked while a strike is running. */
  pushSlide(travel: number): void {
    if (this.busy) return
    this.slideTravel = Math.max(this.slideTravel, Math.min(1, travel))
    if (this.slideTravel >= ALL_OR_NOTHING_TRAVEL && !this.latched) {
      // The all-or-nothing piece snaps over: from here the strike is
      // committed and the spring charge is whatever was stored.
      this.latched = true
    }
    if (this.latched) this.charge = this.slideTravel
  }

  /** Release the slide. Fires if and only if the interlock latched. */
  releaseSlide(): void {
    if (this.busy) {
      this.slideTravel = 0
      return
    }
    const fire = this.latched
    this.latched = false
    this.slideTravel = 0
    if (!fire) return // all-or-nothing: nothing was armed, nothing chimes
    this.phase = PHASE_FALL
    this.hourRack.release()
    this.quarterRack.release()
    this.minuteRack.release()
  }

  /** Strike-spring torque left at train angle phi (declines as it unwinds). */
  private springTorque(phi: number): number {
    const wound = 0.6 + 0.4 * this.charge
    const depletion = Math.max(0.35, 1 - (0.5 * phi) / SPRING_TRAVEL_CAP)
    return GOV_TORQUE_FULL * wound * depletion
  }

  step(dt: number, t: number): void {
    if (this.phase === PHASE_IDLE) return

    if (this.phase === PHASE_FALL) {
      this.hourRack.step(dt, this.snails.hourRadius())
      this.quarterRack.step(dt, this.snails.quarterRadius())
      this.minuteRack.step(dt, this.snails.minuteRadius())
      if (
        this.hourRack.state === RACK_LANDED &&
        this.quarterRack.state === RACK_LANDED &&
        this.minuteRack.state === RACK_LANDED
      ) {
        this.buildGatherPlan()
        this.trainPhi = 0
        this.trainOmega = 0
        this.nextSlot = 0
        this.phase = PHASE_RUN
      }
      return
    }

    // PHASE_RUN: integrate the strike train against the fly governor.
    const tq = this.springTorque(this.trainPhi)
    const drag = GOV_DRAG * this.trainOmega * this.trainOmega
    this.trainOmega += (tq - drag) * dt
    if (this.trainOmega < 0) this.trainOmega = 0
    this.trainPhi += this.trainOmega * dt

    while (this.nextSlot < this.slots.length && this.trainPhi >= this.slots[this.nextSlot].phi) {
      const slot = this.slots[this.nextSlot]
      slot.rack.gathered = Math.min(slot.rack.teeth, slot.rack.gathered + (slot.gong === 'high' && slot.rack === this.quarterRack ? 0 : 1))
      // hammer energy follows the train speed (spring running down = softer)
      const velocity = Math.max(0.25, Math.min(1, this.trainOmega / 9))
      this.strikes.push({ t, gong: slot.gong, velocity })
      this.nextSlot++
    }

    if (this.trainPhi >= this.endPhi) {
      // racks fully gathered; the arrest drops and the train stops
      this.hourRack.reset()
      this.quarterRack.reset()
      this.minuteRack.reset()
      this.trainOmega = 0
      this.phase = PHASE_IDLE
    }
  }

  /**
   * Lay out the gathering geometry from the LANDED RACK TEETH ONLY.
   * One gathering-pallet revolution per tooth; the quarter cam has two
   * lobes half a revolution apart (low then high = ding-dong).
   */
  private buildGatherPlan(): void {
    this.slots = []
    let phi = TAU // spin-up revolution before the first strike
    for (let i = 0; i < this.hourRack.teeth; i++) {
      this.slots.push({ phi, gong: 'low', rack: this.hourRack })
      phi += TAU
    }
    if (this.hourRack.teeth > 0 && this.quarterRack.teeth > 0) phi += GAP_REVS * TAU
    for (let i = 0; i < this.quarterRack.teeth; i++) {
      this.slots.push({ phi, gong: 'low', rack: this.quarterRack })
      this.slots.push({ phi: phi + Math.PI, gong: 'high', rack: this.quarterRack })
      phi += TAU
    }
    if (this.quarterRack.teeth > 0 && this.minuteRack.teeth > 0) phi += GAP_REVS * TAU
    else if (this.hourRack.teeth > 0 && this.minuteRack.teeth > 0 && this.quarterRack.teeth === 0)
      phi += GAP_REVS * TAU
    for (let i = 0; i < this.minuteRack.teeth; i++) {
      this.slots.push({ phi, gong: 'high', rack: this.minuteRack })
      phi += TAU
    }
    this.endPhi = phi + TAU
  }

  /**
   * Train rotation (rad) remaining until the next strike on `gong`;
   * Infinity when none is pending. Drives the hammers' geometric lift —
   * they cock as the gathering approaches and drop exactly at the strike.
   * Reads only the landed-rack gather plan and the train angle.
   */
  phaseToNextStrike(gong: 'low' | 'high'): number {
    if (this.phase !== PHASE_RUN) return Infinity
    for (let i = this.nextSlot; i < this.slots.length; i++) {
      if (this.slots[i].gong === gong) return this.slots[i].phi - this.trainPhi
    }
    return Infinity
  }

  /** Gather progress within the current tooth, for rack render ratchet. */
  gatherProgress(rack: Rack): number {
    if (this.phase !== PHASE_RUN) return 0
    const active = this.slots[this.nextSlot]
    if (!active || active.rack !== rack) return 0
    const prevPhi = this.nextSlot > 0 ? this.slots[this.nextSlot - 1].phi : 0
    const span = Math.max(1e-9, active.phi - prevPhi)
    return (this.trainPhi - prevPhi) / span
  }
}
