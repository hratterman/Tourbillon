import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { chime, countStrikes, expectedCounts, runningMovement } from './helpers'

/**
 * Acceptance test 3 — the important one.
 * The chime count must EMERGE from the simulated rack falling onto the
 * snail and the teeth gathered on its return — never from reading the
 * clock. Two guards enforce it:
 *   (a) tamper guard: rotating a snail out of sync with the hands makes the
 *       watch faithfully chime the WRONG time. Any implementation that
 *       reads hours/minutes and calls play(n) chimes the right time and
 *       fails this test.
 *   (b) source guard: the repeater module must not reference the clock,
 *       the motion works, or the displayed time at all.
 */
describe('chime count emerges from rack-and-snail geometry', () => {
  const cases: Array<[number, number]> = [
    [10, 47], // canonical: 10 low, 3 ding-dong, 2 high
    [12, 59], // maximum: 12 low, 3 ding-dong, 14 high
    [1, 0], // minimum: 1 low, nothing else
    [3, 15], // 3 low, 1 ding-dong, 0 high
    [6, 44], // 6 low, 2 ding-dong, 14 high
  ]

  for (const [h, m] of cases) {
    it(`${h}:${String(m).padStart(2, '0')} strikes ${JSON.stringify(expectedCounts(h, m))}`, () => {
      const mv = runningMovement(h, m)
      const strikes = chime(mv)
      expect(countStrikes(strikes)).toEqual(expectedCounts(h, m))
    })
  }

  it('counts come from the racks themselves (teeth gathered == strikes)', () => {
    const mv = runningMovement(10, 47)
    // capture rack teeth right after the racks land
    for (let i = 0; i < 40; i++) mv.pushRepeaterSlide((i + 1) / 40)
    mv.releaseRepeaterSlide()
    mv.advance(0.5) // racks have fallen and landed by now
    expect(mv.repeater.hourRack.teeth).toBe(10)
    expect(mv.repeater.quarterRack.teeth).toBe(3)
    expect(mv.repeater.minuteRack.teeth).toBe(2)
  })

  it('GUARD (a): a tampered hour snail chimes the wrong hour, faithfully', () => {
    const mv = runningMovement(10, 47)
    mv.tamper.hourStarOffset = 2 // service error: snail pressed on two steps off
    const strikes = chime(mv)
    const c = countStrikes(strikes)
    // hands still say 10:47, but the geometry says 12 — the racks win
    expect(mv.displayedTime().h).toBe(10)
    expect(c.low).toBe(12)
    expect(c.dingdong).toBe(3)
    expect(c.high).toBe(2)
  })

  it('GUARD (a2): a tampered cannon offset shifts quarters and minutes', () => {
    const mv = runningMovement(10, 47)
    mv.tamper.cannonOffsetRad = (-20 / 60) * 2 * Math.PI // cams read 20 min earlier: 10:27
    const strikes = chime(mv)
    const c = countStrikes(strikes)
    expect(c.low).toBe(10)
    expect(c.dingdong).toBe(1) // 27 min = 1 quarter...
    expect(c.high).toBe(12) // ...+ 12 minutes
  })

  it('GUARD (b): the repeater module never touches the clock', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, '../src/core/repeater.ts'), 'utf8')
    for (const forbidden of [
      'displayedTime',
      'cannonAngle',
      'hourWheel',
      'hourStar',
      'centerAngle',
      'Date.',
      'minutesOfHour',
      'train.',
    ]) {
      expect(src.includes(forbidden), `repeater.ts must not reference "${forbidden}"`).toBe(false)
    }
    // it may only see the snail radius functions
    expect(src).toContain("from './snails'")
  })
})
