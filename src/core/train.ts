import {
  CARRIAGE_PER_CENTER,
  CARRIAGE_PER_THIRD,
  CENTER_PER_BARREL,
  ESC_REVS_PER_CARRIAGE_REV,
  HOUR_PER_CANNON,
  MINUTE_WHEEL_TEETH,
  CANNON_TEETH,
  TAU,
  THIRD_PER_CENTER,
} from './constants'

/**
 * Going train kinematics + motion works + the hour star / surprise piece.
 *
 * The train is a rigid gear chain: total escape-wheel rotation (metered by
 * the escapement) determines every wheel angle. The tourbillon carriage IS
 * the seconds hand; the escape pinion rolls around the fixed fourth wheel,
 * so ground-frame escape rotation = 16x carriage rotation.
 *
 * The cannon pinion is friction-fitted on the centre arbor (slip clutch):
 * time-setting rotates it (and everything dial-side of it: minute wheel,
 * hour wheel, and all three snails) without disturbing the train. This is
 * exactly why the snails can never disagree with the hands.
 */
export class Train {
  /** Setting offset added to the cannon pinion by the keyless works, rad. */
  private settingOffset: number
  /** Cannon pinion total rotation at the last sync, rad (unbounded). */
  private cannonPrev: number
  /**
   * Hour star position, 0..11 (0 = 12 o'clock). Snapped by the jumper;
   * advanced (or reversed) by the surprise-piece finger on the cannon
   * arbor each time the minute hand passes 12.
   */
  hourStar = 0
  /** Simulated time of the last star snap, for rendering the flick. */
  lastSnapT = -1e9
  /** Escape wheel total rotation, rad — mirrored from the escapement. */
  escAngle = 0

  constructor(initialCannonRad = 0) {
    this.settingOffset = initialCannonRad
    this.cannonPrev = initialCannonRad
  }

  // --- wheel angles, all in radians of total rotation (unbounded) ---

  /** Carriage (= seconds hand): 1 rev / 60 s. */
  get carriageAngle(): number {
    return this.escAngle / ESC_REVS_PER_CARRIAGE_REV
  }
  /** Centre wheel: 1 rev / hour. */
  get centerAngle(): number {
    return this.carriageAngle / CARRIAGE_PER_CENTER
  }
  get thirdAngle(): number {
    return this.carriageAngle / CARRIAGE_PER_THIRD
  }
  get barrelAngle(): number {
    return this.centerAngle / CENTER_PER_BARREL
  }
  /** Cannon pinion (minute hand): centre wheel + slip-clutch setting. */
  get cannonAngle(): number {
    return this.centerAngle + this.settingOffset
  }
  /** Minute wheel (idler in the motion works). */
  get minuteWheelAngle(): number {
    return -this.cannonAngle * (CANNON_TEETH / MINUTE_WHEEL_TEETH)
  }
  /** Hour wheel (hour hand + hour snail arbor): 1 rev / 12 h. */
  get hourWheelAngle(): number {
    return this.cannonAngle * HOUR_PER_CANNON
  }

  /**
   * Sync with the escapement and run the surprise-piece finger: every time
   * the cannon pinion crosses a full revolution (minute hand passes 12),
   * the finger kicks the spring-loaded surprise piece and the hour star
   * snaps one position — instantaneously at the top of the hour, in either
   * direction. This is what keeps the quarter reading and the hour reading
   * flipping at the same instant across the boundary.
   */
  sync(escAngle: number, t: number): void {
    this.escAngle = escAngle
    this.checkStarCrossing(t)
  }

  /** Keyless works, crown pulled: rotate the hands (and snails) directly. */
  setHands(deltaCannonRad: number, t: number): void {
    this.settingOffset += deltaCannonRad
    this.checkStarCrossing(t)
  }

  private checkStarCrossing(t: number): void {
    const now = this.cannonAngle
    const prevRev = Math.floor(this.cannonPrev / TAU)
    const nowRev = Math.floor(now / TAU)
    if (nowRev !== prevRev) {
      const dRev = nowRev - prevRev
      this.hourStar = ((this.hourStar + dRev) % 12 + 12) % 12
      this.lastSnapT = t
    }
    this.cannonPrev = now
  }

  /** Displayed time, read off the hand angles (not off any internal clock). */
  displayedTime(): { h: number; m: number; s: number } {
    const cannonDeg = (((this.cannonAngle / TAU) % 1) + 1) % 1 * 360
    const hourDeg = (((this.hourWheelAngle / TAU) % 1) + 1) % 1 * 360
    const m = cannonDeg / 6 + 1e-6 // 6 deg per minute (+ float-edge guard)
    let h = Math.floor(hourDeg / 30 + 1e-6) % 12
    if (h === 0) h = 12
    const sec = (m % 1) * 60
    return { h, m: Math.min(59, Math.floor(m)), s: sec }
  }

  /**
   * Set the displayed time via the keyless works — the same code path as
   * manual setting, so the hour star, hour wheel and snails stay in
   * lockstep by construction. The movement is assembled at 12:00:00 with
   * the star at position 0, and the star only ever changes through the
   * surprise-piece crossing logic, so star ≡ (whole cannon revolutions)
   * mod 12 ≡ hour-wheel hour at all times.
   */
  setDisplayedTime(h: number, m: number, s = 0, t = 0): void {
    const targetMinutes = (m + s / 60) % 60
    const targetFrac = targetMinutes / 60
    const curFrac = (((this.cannonAngle / TAU) % 1) + 1) % 1
    // rotate forward to the target minute-hand position...
    const delta = ((targetFrac - curFrac) % 1 + 1) % 1
    this.setHands(delta * TAU, t)
    // ...then whole revolutions until the hour star matches.
    const targetStar = ((h % 12) + 12) % 12
    let guard = 0
    while (this.hourStar !== targetStar && guard++ < 13) {
      this.setHands(TAU, t)
    }
  }
}
