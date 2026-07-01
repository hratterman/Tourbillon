import { Movement } from '../src/core/movement'
import type { StrikeEvent } from '../src/core/repeater'

/** Build a movement, let the escapement settle, then set the time (so the
 * settling run can't walk boundary-sensitive times across the hour). */
export function runningMovement(h = 10, m = 47, s = 0): Movement {
  const mv = new Movement()
  mv.advance(8) // settle transients
  mv.train.setDisplayedTime(h, m, s, mv.t)
  return mv
}

/**
 * Fire the repeater with a full, honest slide push and run the simulation
 * until the chime completes. Returns every strike event.
 */
export function chime(mv: Movement, travel = 1): StrikeEvent[] {
  const strikes: StrikeEvent[] = []
  // push the slide over ~0.4 s like a human thumb
  for (let i = 0; i < 40; i++) {
    mv.pushRepeaterSlide((travel * (i + 1)) / 40)
    mv.advance(0.01)
  }
  mv.releaseRepeaterSlide()
  let guard = 0
  do {
    mv.advance(0.25)
    strikes.push(...mv.drainStrikes())
    guard++
  } while (mv.repeater.busy && guard < 500)
  return strikes
}

/** Decompose a strike list into (low-only, ding-dong pairs, high-only). */
export function countStrikes(strikes: StrikeEvent[]): {
  low: number
  dingdong: number
  high: number
} {
  // Ding-dongs are a low immediately followed by a high half a governor
  // revolution later (~0.36 s); separate strikes are a full revolution or
  // more apart (~0.7 s+, slower still as the strike spring runs down).
  let low = 0
  let dd = 0
  let high = 0
  for (let i = 0; i < strikes.length; i++) {
    const s = strikes[i]
    const next = strikes[i + 1]
    if (s.gong === 'low' && next && next.gong === 'high' && next.t - s.t < 0.55) {
      dd++
      i++ // consume the pair
    } else if (s.gong === 'low') {
      low++
    } else {
      high++
    }
  }
  return { low, dingdong: dd, high }
}

export function expectedCounts(h: number, m: number): { low: number; dingdong: number; high: number } {
  return { low: h === 0 ? 12 : h > 12 ? h - 12 : h, dingdong: Math.floor(m / 15), high: m % 15 }
}
