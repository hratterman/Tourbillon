import { describe, expect, it } from 'vitest'
import { chime, countStrikes, expectedCounts, runningMovement } from './helpers'
import { Movement } from '../src/core/movement'
import { TAU } from '../src/core/constants'

/**
 * Acceptance test 6 — set-time sync.
 * For randomized set times, chimed_time == displayed_time. The snails move
 * with the hands through the motion works, so this holds by construction —
 * this test proves the construction.
 */
describe('keyless works keep snails and hands in lockstep', () => {
  // deterministic pseudo-random times (mulberry32)
  function rng(seed: number) {
    return () => {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('chimed time equals displayed time for 12 randomized set times', () => {
    const rand = rng(20260701)
    for (let i = 0; i < 12; i++) {
      const h = 1 + Math.floor(rand() * 12)
      const m = Math.floor(rand() * 60)
      const mv = runningMovement(h, m)
      const t = mv.displayedTime()
      expect({ h: t.h, m: t.m }).toEqual({ h, m })
      const c = countStrikes(chime(mv))
      expect(c, `set ${h}:${m}`).toEqual(expectedCounts(h, m))
    }
  })

  it('setting via the crown (drag) also keeps them synced — both directions', () => {
    const mv = runningMovement(3, 0)
    mv.setCrownPulled(true)
    // wind the hands forward 1h37m: 97 min = 9.7 crown revs (1 rev = 10 min)
    for (let i = 0; i < 97; i++) {
      mv.turnCrown(0.1)
      mv.advance(0.02)
    }
    mv.setCrownPulled(false)
    const t = mv.displayedTime()
    expect(t.h).toBe(4)
    expect(t.m).toBe(37)
    const c = countStrikes(chime(mv))
    expect(c).toEqual(expectedCounts(4, 37))
  })

  it('backwards across the hour boundary reverses the star', () => {
    const mv = runningMovement(5, 5)
    mv.setCrownPulled(true)
    // 25 minutes backwards -> 4:40
    for (let i = 0; i < 25; i++) {
      mv.turnCrown(-0.1)
      mv.advance(0.02)
    }
    mv.setCrownPulled(false)
    const t = mv.displayedTime()
    expect(t.h).toBe(4)
    expect(t.m).toBe(40)
    const c = countStrikes(chime(mv))
    expect(c).toEqual(expectedCounts(4, 40))
  })

  it('winding the crown pushed-in does NOT move the hands', () => {
    const mv = new Movement({ h: 7, m: 30 })
    const before = mv.train.cannonAngle % TAU
    mv.turnCrown(5)
    expect(mv.train.cannonAngle % TAU).toBe(before)
    expect(mv.mainspring.turns).toBeGreaterThan(5.7 * 0.75)
  })
})
