import { TAU } from './constants'
import type { Train } from './train'

/**
 * The repeater's cams. A snail is a stepped spiral: the rack's tail falls
 * until it lands on the current step, and the landing depth — set purely by
 * the step radius under the rack tail at that instant — determines how many
 * rack teeth the gathering pallet will pick up on the way back. Deeper fall
 * (smaller radius) = more teeth = more strikes.
 *
 * The repeater subsystem sees ONLY these radius functions. It has no access
 * to the time. If a snail is deliberately rotated out of sync (see the
 * tamper guard in the acceptance tests), the repeater faithfully chimes the
 * wrong time — exactly like the real mechanism.
 */

export interface SnailSet {
  /** Radius of the hour snail under the hour-rack tail, arbitrary units. */
  hourRadius(): number
  /** Radius of the quarter snail under the quarter-rack tail. */
  quarterRadius(): number
  /** Radius of the minute snail under the minute-rack tail. */
  minuteRadius(): number
}

// Cam profiles. R0 = radius of the shallowest step (zero/one strikes);
// DR = radial drop per additional strike.
export const HOUR_SNAIL_R0 = 30
export const HOUR_SNAIL_DR = 1.6 // steps for 1..12 strikes
export const QUARTER_SNAIL_R0 = 24
export const QUARTER_SNAIL_DR = 2.4 // steps for 0..3 ding-dongs
export const MINUTE_SNAIL_R0 = 20
export const MINUTE_SNAIL_DR = 0.8 // steps for 0..14 strikes

/** Number of steps below the top of the hour snail for star position s. */
export function hourSnailSteps(star: number): number {
  return star === 0 ? 12 : star // 12 o'clock strikes twelve
}

/**
 * Hour snail: a 12-step cam sitting on the hour star (snapped by the jumper
 * and the surprise piece, so it is always exactly on a step — never between
 * two hours).
 */
export function hourSnailRadius(star: number): number {
  return HOUR_SNAIL_R0 - hourSnailSteps(star) * HOUR_SNAIL_DR
}

/**
 * Quarter snail: 4 steps on the cannon pinion (1 rev/h), one step per
 * quarter hour. `camAngle` is the cannon rotation in radians.
 */
// Engagement tolerance at a step edge: the rack tail has a finite tip, so a
// landing within a whisker of the cliff reads the step it is (numerically)
// meant to be on rather than falling off the float-rounding edge.
const EDGE_EPS = 1e-6

export function quarterSnailRadius(camAngle: number): number {
  const frac = ((camAngle / TAU) % 1 + 1) % 1 // 0..1 over the hour
  const step = Math.min(3, Math.floor(frac * 4 + EDGE_EPS)) // 0,1,2,3
  return QUARTER_SNAIL_R0 - step * QUARTER_SNAIL_DR
}

/**
 * Minute snail: 4 sectors of 15 graduated steps (0..14 minutes within the
 * current quarter), also on the cannon pinion.
 */
export function minuteSnailRadius(camAngle: number): number {
  const frac = ((camAngle / TAU) % 1 + 1) % 1
  const minutes = frac * 60 + EDGE_EPS
  const inQuarter = Math.min(14, Math.floor(minutes % 15))
  return MINUTE_SNAIL_R0 - inQuarter * MINUTE_SNAIL_DR
}

/**
 * Wire the snails to the motion works. `tamper` offsets let the acceptance
 * tests rotate a snail out of sync with the hands to prove the chime reads
 * geometry, not the clock.
 */
export function makeSnails(
  train: Train,
  tamper: { hourStarOffset: number; cannonOffsetRad: number },
): SnailSet {
  return {
    hourRadius: () =>
      hourSnailRadius((((train.hourStar + tamper.hourStarOffset) % 12) + 12) % 12),
    quarterRadius: () => quarterSnailRadius(train.cannonAngle + tamper.cannonOffsetRad),
    minuteRadius: () => minuteSnailRadius(train.cannonAngle + tamper.cannonOffsetRad),
  }
}
