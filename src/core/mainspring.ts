import { BARREL_TORQUE_FULL, MAINSPRING_MAX_TURNS, TAU, ESC_REVS_PER_BARREL_REV } from './constants'

/**
 * Mainspring barrel. Torque follows a non-linear curve: high and slightly
 * declining over most of the wind, falling off a cliff near the end of the
 * reserve. The watch stopping near the end of reserve is NOT coded anywhere:
 * it emerges because this torque can no longer sustain the escapement's
 * energy balance.
 */
export class Mainspring {
  /** Turns of wind remaining on the barrel arbor, 0..MAINSPRING_MAX_TURNS. */
  turns: number

  constructor(initialWindFraction = 0.75) {
    this.turns = MAINSPRING_MAX_TURNS * initialWindFraction
  }

  get windFraction(): number {
    return this.turns / MAINSPRING_MAX_TURNS
  }

  /** Barrel output torque, N·m. */
  torque(): number {
    const x = this.windFraction
    if (x <= 0) return 0
    // Gentle slope over the working range...
    const working = 0.55 + 0.5 * x
    // ...multiplied by a smooth cliff over the last ~12% of the reserve
    // (the spring uncoils off the barrel wall and torque collapses).
    const t = Math.min(1, x / 0.12)
    const cliff = t * t * (3 - 2 * t)
    return BARREL_TORQUE_FULL * working * cliff
  }

  /** Crown winding: add turns (ratchet ensures it only goes up).
   * Returns the turns ACTUALLY added — zero once the spring is solid,
   * which is what stops the crown dead at full wind. */
  wind(turns: number): number {
    if (turns <= 0) return 0
    const before = this.turns
    this.turns = Math.min(MAINSPRING_MAX_TURNS, this.turns + turns)
    return this.turns - before
  }

  /**
   * The going train unwinds the barrel as the escape wheel is released.
   * @param dEscAngle escape wheel rotation in radians (ground frame)
   */
  unwind(dEscAngle: number): void {
    const dBarrelTurns = dEscAngle / (TAU * ESC_REVS_PER_BARREL_REV)
    this.turns = Math.max(0, this.turns - dBarrelTurns)
  }
}
