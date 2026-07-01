import { describe, expect, it } from 'vitest'
import { chime, runningMovement } from './helpers'

/**
 * Acceptance test 5 — all-or-nothing.
 * A partial slide push must yield ZERO strikes — silence — not a partial
 * chime. The interlock is a real latch: insufficient travel arms nothing.
 */
describe('all-or-nothing interlock', () => {
  it('a partial push (50% travel) produces total silence', () => {
    const mv = runningMovement(10, 47)
    const strikes = chime(mv, 0.5)
    expect(strikes.length).toBe(0)
    expect(mv.repeater.busy).toBe(false)
  })

  it('a push just short of the latch point (80%) is still silent', () => {
    const mv = runningMovement(12, 59)
    const strikes = chime(mv, 0.8)
    expect(strikes.length).toBe(0)
  })

  it('a full push fires the complete chime', () => {
    const mv = runningMovement(10, 47)
    const strikes = chime(mv, 1)
    expect(strikes.length).toBe(10 + 3 * 2 + 2)
  })

  it('the slide is locked while a strike is in progress', () => {
    const mv = runningMovement(1, 16)
    for (let i = 0; i < 40; i++) mv.pushRepeaterSlide((i + 1) / 40)
    mv.releaseRepeaterSlide()
    mv.advance(1.0) // mid-chime
    expect(mv.repeater.busy).toBe(true)
    mv.pushRepeaterSlide(1) // try to re-arm mid-chime
    expect(mv.repeater.latched).toBe(false)
    let guard = 0
    while (mv.repeater.busy && guard++ < 500) mv.advance(0.25)
    const strikes = mv.drainStrikes()
    // exactly one chime's worth: 1 low + 1 ding-dong (2 notes) + 1 high
    expect(strikes.length).toBe(1 + 2 + 1)
  })
})
