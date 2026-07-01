import { describe, expect, it } from 'vitest'
import {
  ALL_LAYERS,
  buildParts,
  partTransform,
  PRESETS,
} from '../src/render/parts'
import { RACK_LANDED } from '../src/core/repeater'
import { runningMovement } from './helpers'

/**
 * Acceptance test 8 — teardown integrity.
 * Every part has a layer, a Z-depth and both assembled and exploded
 * transforms; the four presets show exactly the intended parts; explode →
 * reassemble returns every part to its exact assembled transform; and the
 * simulation keeps running throughout, so a repeater fired in exploded view
 * shows the rack visibly landing on its snail step.
 */
describe('assembly stack and teardown', () => {
  const parts = buildParts()

  it('every part has a defined layer, Z-depth, and both transforms', () => {
    const mv = runningMovement(10, 47)
    const seen = new Set<string>()
    for (const p of parts) {
      expect(p.id.length).toBeGreaterThan(0)
      expect(seen.has(p.id), `duplicate part id ${p.id}`).toBe(false)
      seen.add(p.id)
      expect(ALL_LAYERS).toContain(p.layer)
      expect(Number.isFinite(p.z)).toBe(true)
      const a = partTransform(p, mv, 0)
      const e = partTransform(p, mv, 1)
      for (const v of [a.x, a.y, a.rot, e.x, e.y, e.rot]) expect(Number.isFinite(v)).toBe(true)
      // exploded state actually lifts every part except the deepest (z=0)
      if (p.z > 0) expect(Math.hypot(e.x - a.x, e.y - a.y)).toBeGreaterThan(0)
    }
  })

  it('Z order matches the physical stack: caseback → movement → dial → hands → case', () => {
    const layerRank: Record<string, number> = {
      caseback: 0,
      train: 1,
      dialside: 2,
      dial: 3,
      hands: 4,
      case: 5,
    }
    for (const a of parts)
      for (const b of parts)
        if (layerRank[a.layer] < layerRank[b.layer]) expect(a.z).toBeLessThan(b.z)
  })

  it('the four presets show exactly the intended parts and nothing else', () => {
    const byLayer = (layers: string[]) =>
      parts.filter((p) => layers.includes(p.layer)).map((p) => p.id).sort()
    expect(byLayer(PRESETS.fullCase)).toEqual(parts.map((p) => p.id).sort())
    const movementOnly = byLayer(PRESETS.movementOnly)
    expect(movementOnly).toContain('barrel')
    expect(movementOnly).toContain('balance')
    expect(movementOnly).toContain('hourSnail')
    expect(movementOnly).toContain('flyGovernor')
    expect(movementOnly).not.toContain('dial')
    expect(movementOnly).not.toContain('crown')
    expect(movementOnly).not.toContain('caseback')
    const dialSide = byLayer(PRESETS.dialSide)
    expect(dialSide).toContain('hourRack')
    expect(dialSide).toContain('quarterSnail')
    expect(dialSide).toContain('gongLow')
    expect(dialSide).not.toContain('balance')
    expect(dialSide).not.toContain('barrel')
    const trainSide = byLayer(PRESETS.trainSide)
    expect(trainSide).toContain('barrel')
    expect(trainSide).toContain('carriage')
    expect(trainSide).toContain('escapeWheel')
    expect(trainSide).not.toContain('hourRack')
    expect(trainSide).not.toContain('dial')
  })

  it('explode and reassemble are continuous and exactly reversible', () => {
    const mv = runningMovement(10, 47)
    for (const p of parts) {
      const assembled = p.assembled(mv)
      // continuity: offsets grow monotonically with depth
      let prev = 0
      for (let d = 0; d <= 1.0001; d += 0.05) {
        const t = partTransform(p, mv, Math.min(1, d))
        const off = Math.hypot(t.x - assembled.x, t.y - assembled.y)
        expect(off).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = off
      }
      // reversibility: depth 1 -> 0 returns the EXACT assembled transform
      const back = partTransform(p, mv, 0)
      expect(back.x).toBe(assembled.x)
      expect(back.y).toBe(assembled.y)
      expect(back.rot).toBe(assembled.rot)
    }
  })

  it('the simulation keeps running while exploded: rack lands on its snail in full teardown', () => {
    const mv = runningMovement(10, 47)
    const depth = 1 // fully exploded — teardown is presentation-only state
    const beatsBefore = mv.esc.beatCount
    // fire the repeater while exploded
    for (let i = 0; i < 40; i++) {
      mv.pushRepeaterSlide((i + 1) / 40)
      mv.advance(0.01)
    }
    mv.releaseRepeaterSlide()
    mv.advance(0.5)
    // the going train never stopped ticking: ~0.9 s advanced = ~7 beats
    expect(mv.esc.beatCount).toBeGreaterThanOrEqual(beatsBefore + 5)
    // ...and the hour rack has visibly fallen onto its snail step
    const rack = parts.find((p) => p.id === 'hourRack')!
    expect(mv.repeater.hourRack.state).toBe(RACK_LANDED)
    expect(mv.repeater.hourRack.teeth).toBe(10)
    const t = partTransform(rack, mv, depth)
    expect(Math.abs(t.rot)).toBeGreaterThan(0.1) // rotated off its rest position
    // while lifted well clear of its assembled position
    const a = rack.assembled(mv)
    expect(Math.hypot(t.x - a.x, t.y - a.y)).toBeGreaterThan(30)
  })
})
