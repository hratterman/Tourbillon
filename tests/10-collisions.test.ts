import { describe, expect, it } from 'vitest'
import * as L from '../src/render3d/layout'

/**
 * Collision audit — a watchmaker's dry assembly check.
 *
 * Every part contributes solid volumes in assembled position (moving parts
 * contribute their swept envelope or their extreme poses); every cross-part
 * pair must either be a whitelisted DESIGNED engagement (a gear mesh, a
 * pivot in its bearing, a pallet in a tooth path — each constrained
 * elsewhere) or have genuine daylight. Nothing may interpenetrate.
 */
describe('no two parts occupy the same space', () => {
  it('the assembled movement is free of interpenetration', () => {
    const clashes = L.collisions()
    const msg = clashes.map((c) => `${c.a} ⊗ ${c.b}`).join('\n')
    expect(clashes, `interpenetrating pairs:\n${msg}`).toEqual([])
  })

  it('the whitelist names only pairs that actually exist', () => {
    const vols = L.buildVolumes()
    const names = vols.map((v) => `${v.part}/${v.name}`)
    for (const [a, b] of L.CONTACT_WHITELIST) {
      const hit = (p: string) =>
        names.some((n) => (p.endsWith('*') ? n.startsWith(p.slice(0, -1)) : n === p))
      expect(hit(a), `whitelist references unknown volume ${a}`).toBe(true)
      expect(hit(b), `whitelist references unknown volume ${b}`).toBe(true)
    }
  })

  it('whitelisted engagements really do touch (they are meshes, not gaps)', () => {
    // spot-check the load-bearing ones: if a "designed contact" has fallen
    // apart geometrically, the whitelist would silently hide it
    const vols = L.buildVolumes()
    const byName = new Map(vols.map((v) => [`${v.part}/${v.name}`, v]))
    const mustTouch: Array<[string, string]> = [
      ['barrel/rim', 'centerWheel/pinion'],
      ['centerWheel/disc', 'thirdWheel/pinion'],
      ['thirdWheel/disc', 'carriage/pinion'],
      ['keylessWorks/crownWheel', 'barrel/ratchet'],
      ['keylessWorks/s2pinion', 'motionWorks/minuteWheel'],
      ['strikeTrain/interWheel', 'flyGovernor/pinion'],
      ['fixedFourth/wheel', 'escapeWheel/pinionSwept'],
      ['keylessWorks/click', 'barrel/ratchet'],
    ]
    for (const [a, b] of mustTouch) {
      const va = byName.get(a)
      const vb = byName.get(b)
      expect(va, a).toBeDefined()
      expect(vb, b).toBeDefined()
      expect(L.volumesOverlap(va!, vb!), `${a} should engage ${b}`).toBe(true)
    }
  })
})
