import { describe, expect, it } from 'vitest'
import { chime, countStrikes, runningMovement } from './helpers'

/**
 * Acceptance test 4 — surprise-piece boundary.
 * A few seconds either side of the top of the hour, the quarter count must
 * flip cleanly WITH the hour: never "old hour with new quarters" or the
 * reverse. The surprise piece / hour star snap is what guarantees it.
 */
describe('surprise piece: top-of-the-hour boundary', () => {
  it('10:59:57 chimes 10 / 3 / 14', () => {
    const mv = runningMovement(10, 59, 57)
    const c = countStrikes(chime(mv))
    expect(c).toEqual({ low: 10, dingdong: 3, high: 14 })
  })

  it('11:00:02 chimes 11 / 0 / 0', () => {
    const mv = runningMovement(11, 0, 2)
    const c = countStrikes(chime(mv))
    expect(c).toEqual({ low: 11, dingdong: 0, high: 0 })
  })

  it('running ACROSS the boundary flips hour and quarter at the same instant', () => {
    // Start just before 11 and let the going train itself carry the
    // mechanism over the boundary — no set-time shortcut.
    const mv = runningMovement(10, 59, 50)
    mv.advance(30) // now ~11:00:20 by the train's own ticking
    const t = mv.displayedTime()
    expect(t.h).toBe(11)
    expect(t.m).toBe(0)
    const c = countStrikes(chime(mv))
    expect(c).toEqual({ low: 11, dingdong: 0, high: 0 })
  })

  it('12:59:58 -> 1:00:02 across the noon rollover', () => {
    const mv = runningMovement(12, 59, 58)
    mv.advance(10)
    const c = countStrikes(chime(mv))
    expect(c).toEqual({ low: 1, dingdong: 0, high: 0 })
  })
})
