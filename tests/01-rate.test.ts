import { describe, expect, it } from 'vitest'
import { TAU } from '../src/core/constants'
import { runningMovement } from './helpers'

/**
 * Acceptance test 1 — Rate.
 * With timeScale = 1: the carriage completes one revolution in 60.0 s of
 * simulated time, and the balance completes 240 full oscillations in that
 * same minute. Both must EMERGE from the escapement metering the train.
 */
describe('rate: carriage and balance', () => {
  it('carriage turns once per 60 s and the balance beats 240 oscillations per rev', () => {
    const mv = runningMovement(10, 8)
    const startCarriage = mv.train.carriageAngle
    const startBeats = mv.esc.beatCount

    mv.advance(60)

    const revs = (mv.train.carriageAngle - startCarriage) / TAU
    const oscillations = (mv.esc.beatCount - startBeats) / 2

    // one carriage revolution in 60.0 s
    expect(revs).toBeGreaterThan(1 - 0.002)
    expect(revs).toBeLessThan(1 + 0.002)
    // 240 oscillations per carriage revolution (28,800 vph)
    expect(oscillations).toBeGreaterThanOrEqual(239)
    expect(oscillations).toBeLessThanOrEqual(241)
  })

  it('measured balance frequency is 4 Hz within epsilon', () => {
    const mv = runningMovement(3, 0)
    const b0 = mv.esc.beatCount
    mv.advance(30)
    const freq = (mv.esc.beatCount - b0) / 2 / 30
    expect(Math.abs(freq - 4.0)).toBeLessThan(0.01)
  })

  it('timing machine agrees: rate within ±30 s/day, beat error < 1 ms', () => {
    const mv = runningMovement(9, 15)
    mv.advance(20)
    const r = mv.readouts()
    expect(r.rateSecPerDay).not.toBeNull()
    expect(Math.abs(r.rateSecPerDay!)).toBeLessThan(30)
    expect(r.beatErrorMs).not.toBeNull()
    expect(r.beatErrorMs!).toBeLessThan(1)
  })

  it('regulator changes the rate in the right direction', () => {
    const fast = runningMovement(5, 0)
    fast.setRegulator(1) // shorter effective hairspring -> higher k -> fast
    fast.advance(30)
    const slow = runningMovement(5, 0)
    slow.setRegulator(-1)
    slow.advance(30)
    expect(fast.readouts().rateSecPerDay!).toBeGreaterThan(20)
    expect(slow.readouts().rateSecPerDay!).toBeLessThan(-20)
  })
})
