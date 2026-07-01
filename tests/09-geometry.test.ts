import { describe, expect, it } from 'vitest'
import { TAU } from '../src/core/constants'
import { Movement } from '../src/core/movement'
import * as L from '../src/render3d/layout'

/**
 * Acceptance test 9 — mechanical truth of the 3-D model.
 * A watchmaker measuring the model must find real gearing:
 *  (a) every declared spur mesh has centre distance = sum of pitch radii;
 *  (b) meshing tooth tiers overlap along the watch axis;
 *  (c) rendered wheel angles stay tooth-phase-locked through the whole
 *      chain at arbitrary mechanism states (teeth interleave, never clash);
 *  (d) the keyless ratios realised by the chain equal the ratios the
 *      physics uses (winding 1/5, setting 1/6 per crown turn).
 */
describe('gear layout is mechanically true', () => {
  it('every spur mesh: centre distance == r_A + r_B (within 0.05)', () => {
    for (const m of L.SPUR_MESHES) {
      const d = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y)
      expect(Math.abs(d - (m.a.r + m.b.r)), m.name).toBeLessThan(0.05)
    }
  })

  it('every spur mesh: tooth tiers overlap in z by at least 0.8', () => {
    for (const m of L.SPUR_MESHES) {
      const overlap = Math.min(m.a.z1, m.b.z1) - Math.max(m.a.z0, m.b.z0)
      expect(overlap, m.name).toBeGreaterThan(0.8)
    }
  })

  it('pitch radius always equals module x teeth / 2', () => {
    for (const m of L.SPUR_MESHES) {
      for (const w of [m.a, m.b]) {
        expect(Math.abs(w.r - (w.module * w.teeth) / 2)).toBeLessThan(1e-9)
      }
    }
  })

  it('tooth phases stay locked through the chain at arbitrary states', () => {
    const mv = new Movement({ h: 10, m: 47 })
    // sample wildly different mechanism states (escape angle forged directly
    // — rendering reads the train kinematics, which are pure ratios)
    const states = [0, 12.34, 987.65, 12345.6, 999999.9]
    for (const esc of states) {
      mv.esc.escAngle = esc
      mv.train.sync(esc, 0)
      mv.mainspring.turns = (esc % 5.7 + 5.7) % 5.7
      mv.repeater.trainPhi = esc * 0.37
      const a = L.renderedAngles(mv)
      const pairs: Array<[string, number, L.Wheel, number, L.Wheel]> = [
        ['barrel/centre pinion', a.center, L.centerPinion, a.barrel, L.barrel],
        ['centre/third', a.center, L.centerWheel, a.third, L.thirdPinion],
        ['third/carriage pinion', a.third, L.thirdWheel, a.carriagePinion, L.carriagePinion],
        ['cannon/minute wheel', a.cannon, L.cannonPinion, a.minuteWheel, L.minuteWheel],
        ['minute pinion/hour wheel', a.minuteWheel, L.minuteWheelPinion, a.hourWheel, L.hourWheel],
        ['minute wheel/s2', a.minuteWheel, L.minuteWheel, a.s2, L.s2Pinion],
        ['s2/s1', a.s2, L.s2Wheel, a.s1, L.s1Idler],
        ['ratchet/crown wheel', a.ratchet, L.ratchet, a.crownWheel, L.crownWheel],
        ['strike/intermediate', a.strike, L.strikeWheel, a.strikeInter, L.strikeInterPinion],
        ['intermediate/governor', a.strikeInter, L.strikeInterWheel, a.governor, L.governorPinion],
      ]
      for (const [name, tA, wA, tB, wB] of pairs) {
        const residual = L.meshResidual(tA, wA, tB, wB)
        const pitchB = TAU / wB.teeth
        expect(residual, `${name} @ esc=${esc}`).toBeLessThan(pitchB * 0.02)
      }
    }
  })

  it('epicyclic: escape pinion rolls the fixed fourth without slip', () => {
    // in the carriage frame, pinion angle must be exactly -(120/8) x sun
    // angle (plus mesh phase); check the phase lock at several positions
    for (const ca of [0, 1.1, 3.7, 42.42]) {
      const rel = L.escapePinionAngle(ca) - ca
      const sunRel = -ca
      const residual = L.meshResidual(
        sunRel,
        { teeth: 120, x: 0, y: 0 },
        rel,
        { teeth: 8, x: 0, y: -L.ESC_ORBIT_R },
      )
      expect(residual).toBeLessThan((TAU / 8) * 0.02)
    }
  })

  it('winding: 5 crown turns wind the barrel exactly one turn, via 12t->36/36t->60t', () => {
    expect(L.WIND_RATIO).toBeCloseTo(0.2, 12)
    const mv = new Movement({ h: 12, m: 0 })
    mv.mainspring.turns = 2
    mv.turnCrown(5)
    expect(mv.mainspring.turns).toBeCloseTo(3, 10)
    expect(mv.crownAngle).toBeCloseTo(5 * TAU, 10)
  })

  it('setting: one crown turn moves the minute hand exactly 10 minutes', () => {
    expect(L.SET_RATIO).toBeCloseTo(1 / 6, 12)
    const mv = new Movement({ h: 3, m: 0 })
    mv.setCrownPulled(true)
    mv.turnCrown(1)
    const t = mv.displayedTime()
    expect(t.h).toBe(3)
    expect(t.m).toBe(10)
  })

  it('castle wheel geometry: dogs engaged at rest, spur over s1 when pulled', () => {
    // dog faces adjacent at rest
    const castleDogFace = L.CASTLE.xRest - L.CASTLE.w / 2
    const wpDogFace = L.WINDING_PINION.x + L.WINDING_PINION.w / 2
    expect(castleDogFace - wpDogFace).toBeGreaterThan(0)
    expect(castleDogFace - wpDogFace).toBeLessThan(2.5)
    // pulled: spur ring sits over the setting idler
    const pulledOuterEnd = L.CASTLE.xRest + L.CASTLE.pull
    expect(Math.abs(pulledOuterEnd - L.s1Idler.x)).toBeLessThan(1)
    // and the idler's tooth tips just reach the castle's spur circle
    expect(Math.abs(Math.abs(L.s1Idler.y) - (L.s1Idler.r + L.CASTLE.r))).toBeLessThan(0.05)
  })

  it('the stem line is clear of every wheel it passes over', () => {
    // stem: y=0, z=24.5, from x=74 outward. No wheel tier may intersect it.
    for (const m of L.SPUR_MESHES) {
      for (const w of [m.a, m.b]) {
        if (w.z1 < L.STEM_Z - L.STEM_R || w.z0 > L.STEM_Z + L.STEM_R) continue // clear in z
        // wheel tier crosses the stem plane: it must not reach the stem line
        const nearestX = w.x + Math.sqrt(Math.max(0, w.r * w.r - w.y * w.y))
        expect(Math.abs(w.y) > w.r || nearestX < 74, `stem clashes ${w.teeth}t wheel`).toBe(true)
      }
    }
  })
})
