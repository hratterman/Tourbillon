import {
  BALANCE_C,
  BALANCE_I,
  BEAT_OFFSET,
  ESC_ADVANCE_PER_BEAT,
  ESC_IMPULSE_ROT,
  ESC_RECOIL,
  HAIRSPRING_K,
  HALF_WINDOW,
  IMPULSE_ARC,
  IMPULSE_GAIN,
  PIVOT_FRICTION,
  UNLOCK_ARC,
  UNLOCK_TORQUE_RATIO,
} from './constants'

export const PHASE_LOCKED = 0
export const PHASE_UNLOCK = 1
export const PHASE_IMPULSE = 2

export interface EscEvent {
  /** 'engage' | 'unlock' | 'lock' */
  type: number // 0 engage, 1 unlocked (impulse begins), 2 lock (drop complete)
  t: number
  /** fork side at the time of the event (+1/-1): distinguishes tick from tock */
  side: number
}

export const EV_ENGAGE = 0
export const EV_UNLOCK = 1
export const EV_LOCK = 2

/**
 * The balance + Swiss lever escapement, simulated in the carriage frame.
 *
 * The balance is a torsional harmonic oscillator integrated with
 * semi-implicit (symplectic) Euler. The escapement is a discontinuous
 * contact problem handled with event detection on the impulse-pin angle:
 *
 *   locked -> (pin enters fork window moving inward) -> UNLOCK: the pin
 *   pushes the fork off the locked tooth against draw; the escape wheel
 *   recoils slightly; the balance pays energy.
 *   -> UNLOCKED: the freed tooth drives the pallet, the fork drives the pin:
 *   IMPULSE torque on the balance while the escape wheel turns through its
 *   impulse rotation.
 *   -> pin exits the window: DROP: the tooth leaves the pallet, the wheel
 *   free-falls a small angle and LOCKS on the opposite pallet, held by draw.
 *   The fork side flips and the balance swings free until the return beat.
 *
 * Lock and draw genuinely hold the wheel: escAngle only changes during
 * unlock (recoil), impulse, and drop.
 */
export class Escapement {
  theta = 0 // balance angle, rad
  omega = 0 // balance angular velocity, rad/s
  forkSide: 1 | -1 = 1 // side the fork is banked/locked on
  phase = PHASE_LOCKED
  escAngle = 0 // total escape wheel rotation, rad (ground gain applied by train)
  kScale = 1 // regulator: multiplies hairspring stiffness
  impulseEnabled = true // test hook: false = free oscillator, wheel held

  beatCount = 0 // completed beats (lock events)
  // Cumulative honest energy bookkeeping (J)
  energyIn = 0 // delivered to balance by impulse
  energyUnlock = 0 // paid by balance to unlock against draw
  energyFriction = 0 // viscous + Coulomb losses

  private events: EscEvent[] = []

  /** Drain events recorded since the last call (for the timing machine). */
  drainEvents(): EscEvent[] {
    const e = this.events
    this.events = []
    return e
  }

  /** Give the balance a starting swing (the wrist-shake that starts a watch). */
  kick(amplitudeRad: number): void {
    if (Math.abs(this.theta) < amplitudeRad) {
      this.theta = this.forkSide * amplitudeRad
      this.omega = 0
    }
  }

  /**
   * One physics sub-step.
   * @param dt   fixed physics timestep, s
   * @param t    current simulated time, s
   * @param barrelTorque current mainspring barrel torque, N·m
   * @returns escape wheel rotation this step (rad), for train/mainspring
   */
  step(dt: number, t: number, barrelTorque: number): number {
    const esc0 = this.escAngle
    const tauImp = IMPULSE_GAIN * barrelTorque
    const tauUnlock = UNLOCK_TORQUE_RATIO * tauImp

    const s = this.forkSide
    const p = this.theta - BEAT_OFFSET // impulse-pin angle relative to beat centre
    let escTorque = 0 // torque on the balance from the escapement

    if (this.impulseEnabled) {
      if (this.phase === PHASE_LOCKED) {
        // Engage: pin crosses into the fork window from the fork's side,
        // moving inward. (After a lock the pin is at the far edge moving
        // outward, so this does not re-trigger.)
        if (s * p <= HALF_WINDOW && s * p >= -HALF_WINDOW && s * this.omega < 0) {
          this.phase = PHASE_UNLOCK
          this.events.push({ type: EV_ENGAGE, t, side: s })
        }
      }
      if (this.phase === PHASE_UNLOCK) {
        if (s * p > HALF_WINDOW) {
          // Backed out before unlocking: draw re-seats the tooth.
          this.phase = PHASE_LOCKED
        } else if (s * p <= HALF_WINDOW - UNLOCK_ARC) {
          this.phase = PHASE_IMPULSE
          this.events.push({ type: EV_UNLOCK, t, side: s })
        } else {
          escTorque = s * tauUnlock // resists the inward-moving balance
        }
      }
      if (this.phase === PHASE_IMPULSE) {
        if (s * p < -HALF_WINDOW) {
          // Pin exits: drop, then lock on the opposite pallet. The tooth
          // lands on the pallet locking face at an exact geometric position,
          // so snap to it: this is what "lock" means, and it keeps the train
          // rate exactly tied to the beat count (no numerical drift).
          this.beatCount++
          this.escAngle = this.beatCount * ESC_ADVANCE_PER_BEAT
          this.forkSide = s === 1 ? -1 : 1
          this.phase = PHASE_LOCKED
          this.events.push({ type: EV_LOCK, t, side: s })
        } else {
          escTorque = -s * tauImp // aids the inward-moving balance
        }
      }
    }

    // --- integrate the balance (semi-implicit Euler: omega first) ---
    const k = (HAIRSPRING_K * this.kScale) / BALANCE_I
    let alpha = -k * this.theta - BALANCE_C * this.omega + escTorque / BALANCE_I
    // Coulomb pivot friction: constant magnitude opposing motion, with a
    // stiction clamp so it can't reverse the velocity within a step.
    if (this.omega !== 0) {
      const fr = (PIVOT_FRICTION / BALANCE_I) * Math.sign(this.omega)
      alpha -= Math.min(Math.abs(fr), Math.abs(this.omega) / dt) * Math.sign(this.omega)
    }
    const omegaNew = this.omega + alpha * dt
    const dTheta = omegaNew * dt
    this.theta += dTheta
    this.omega = omegaNew

    // --- escape wheel rotation tied to pin travel during contact ---
    let dEsc = 0
    if (this.phase === PHASE_UNLOCK && escTorque !== 0) {
      // Draw recoil: wheel backs up as the pin travels the unlock arc.
      dEsc = (ESC_RECOIL / UNLOCK_ARC) * (s * dTheta) // s*dTheta < 0 inward
      this.energyUnlock += Math.abs(escTorque * dTheta)
    } else if (this.phase === PHASE_IMPULSE && escTorque !== 0) {
      dEsc = (ESC_IMPULSE_ROT / IMPULSE_ARC) * (-s * dTheta) // > 0 inward
      this.energyIn += Math.abs(escTorque * dTheta)
    }
    this.escAngle += dEsc
    this.energyFriction +=
      BALANCE_C * BALANCE_I * this.omega * this.omega * dt +
      PIVOT_FRICTION * Math.abs(dTheta)

    // Includes the discrete drop rotation added at a lock transition.
    return this.escAngle - esc0
  }
}
