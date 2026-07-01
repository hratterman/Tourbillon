import * as THREE from 'three'
import { BEAT_OFFSET, DEG, HALF_WINDOW, TAU } from '../core/constants'
import { PHASE_LOCKED } from '../core/escapement'
import type { Movement } from '../core/movement'
import type { Rack } from '../core/repeater'
import {
  HOUR_SNAIL_R0,
  HOUR_SNAIL_DR,
  QUARTER_SNAIL_R0,
  QUARTER_SNAIL_DR,
  MINUTE_SNAIL_R0,
  MINUTE_SNAIL_DR,
} from '../core/snails'
import { CONTACT, GEO } from '../render/parts'
import * as L from './layout'
import {
  escapeWheelGeometry,
  gearGeometry,
  handGeometry,
  lathe,
  plateGeometry,
  rackSectorGeometry,
  remapPlanarUVs,
  snailCamGeometry,
  spiralTube,
  starGeometry,
} from './geometry'
import { casebackTexture, dialTexture, type Materials } from './materials'

/**
 * Per-part solid construction, driven entirely by render3d/layout.ts (all
 * pitch radii, arbor positions, z tiers and mesh phases come from there).
 *
 * Frames: three.js local (x right, y up, z toward the crystal). The
 * mechanism's watch-plane is y-down with clockwise-positive angles, so
 * positions flip y and rotations negate. Each part group's origin sits at
 * (anchor, ZPOS); children are placed at (world - origin).
 */

export interface Fx {
  hammerFlash: { low: number; high: number }
  gongGlow: { low: number; high: number }
}

export interface Built {
  group: THREE.Group
  update?: (mv: Movement, fx: Fx) => void
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m)
  me.position.set(x, y, z)
  return me
}

function cyl(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, segs = 32): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, h, segs)
  g.rotateX(Math.PI / 2) // axis along z
  return mesh(g, m, x, y, z)
}

/** Cylinder whose axis runs along local X (stem parts). */
function cylX(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, segs = 24): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, len, segs)
  g.rotateZ(Math.PI / 2)
  return mesh(g, m, x, y, z)
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z)
}

/** Gold chaton with a ruby jewel — the classic bearing. */
function jewel(mats: Materials, r = 4.2): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(r, 1.6, mats.gold))
  g.add(cyl(r * 0.55, 1.9, mats.ruby))
  return g
}

/** Slotted screw head. */
function screw(mats: Materials, r = 3.2): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(r, 1.4, mats.steel))
  g.add(box(r * 1.7, r * 0.28, 0.6, mats.steelDark, 0, 0, 0.75))
  return g
}

/** A gear mesh: geometry pitch radius/teeth/thickness from a layout wheel. */
function gearOf(w: L.Wheel, mat: THREE.Material, opts: { spokes?: number; hubR?: number; rimW?: number; holeR?: number } = {}): THREE.Mesh {
  const thickness = w.z1 - w.z0
  return mesh(gearGeometry(w.r, w.teeth, { thickness, ...opts }), mat)
}

/** World z of a wheel's tier centre, relative to a part origin at zPos. */
const tierZ = (w: { z0: number; z1: number }, zPos: number): number => (w.z0 + w.z1) / 2 - zPos

export function buildPartObject(id: string, mats: Materials, mv: Movement): Built {
  const group = new THREE.Group()
  group.name = id
  switch (id) {
    // ------------------------------------------------------------ case back
    case 'caseback': {
      const ringShape = new THREE.Shape()
      ringShape.absarc(0, 0, 190, 0, TAU, false)
      const ringHole = new THREE.Path()
      ringHole.absarc(0, 0, 148, 0, TAU, true)
      ringShape.holes.push(ringHole)
      const ring = new THREE.ExtrudeGeometry(ringShape, { depth: 7, bevelEnabled: false })
      ring.translate(0, 0, -7)
      group.add(mesh(ring, mats.caseSteel))
      const faceShape = new THREE.Shape()
      faceShape.absarc(0, 0, 189, 0, TAU, false)
      const faceHole = new THREE.Path()
      faceHole.absarc(0, 0, 149, 0, TAU, true)
      faceShape.holes.push(faceHole)
      const face = new THREE.ShapeGeometry(faceShape, 64)
      remapPlanarUVs(face, 190)
      face.rotateY(Math.PI) // engraving faces OUT of the case back
      const faceMat = mats.casebackFace.clone()
      faceMat.map = casebackTexture()
      group.add(mesh(face, faceMat, 0, 0, -7.15))
      group.add(cyl(149, 1.6, mats.sapphire, 0, 0, -2, 64))
      group.add(mesh(lathe([[190, -7], [196, -5], [197, 0], [193, 1.5], [190, 0.5]]), mats.caseSteel))
      break
    }
    case 'slideSpring': {
      // blade spring that returns the repeater slide, anchored to the band
      const s = new THREE.Shape()
      s.moveTo(-22, -3)
      s.quadraticCurveTo(0, 7, 24, -1)
      s.lineTo(24, -4)
      s.quadraticCurveTo(0, 3, -22, -7)
      s.closePath()
      group.add(mesh(new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: false }), mats.steelBrushed))
      group.add(cyl(2.4, 4, mats.steel, -22, 5, 1))
      break
    }
    // ----------------------------------------------------------- bridges
    case 'trainBridge': {
      // barrel bridge: covers barrel + centre lower pivots (z 1..6)
      const pts: Array<[number, number]> = [
        [-24, -18], [-30, 6], [-20, 26], [4, 36], [30, 46], [56, 48], [70, 36],
        [74, 14], [64, -8], [42, -18], [14, -24],
      ]
      const holes = [
        { x: 0, y: 0, r: 2.6 }, // centre arbor
        { x: L.barrel.x, y: -L.barrel.y, r: 3.6 }, // barrel arbor
      ]
      group.add(mesh(plateGeometry(pts, 5, holes), mats.plate))
      for (const h of holes) {
        const j = jewel(mats, h.r + 1.6)
        j.position.set(h.x, h.y, -2.9)
        group.add(j)
      }
      for (const [sx, sy] of [[-22, 20], [66, 28]] as const) {
        const sc = screw(mats)
        sc.position.set(sx, sy, -2.9)
        sc.rotation.y = Math.PI // heads face the case back
        group.add(sc)
      }
      break
    }
    case 'tourbillonBridge': {
      // flying tourbillon cock: carries the carriage AND third-wheel lower
      // pivots, reaching in from the 6 o'clock edge (anchor = carriage axis)
      const pts: Array<[number, number]> = [
        [-16, -64], [16, -64], [20, -28], [14, 20], [9, 36], [-9, 36], [-14, 20], [-20, -28],
      ]
      const holes = [
        { x: 0, y: 0, r: 2.4 }, // carriage lower pivot
        { x: 0, y: 31.9, r: 2 }, // third-wheel lower pivot (0, 56.13 watch)
      ]
      group.add(mesh(plateGeometry(pts, 5, holes), mats.plate))
      for (const h of holes) {
        const j = jewel(mats, h.r + 1.8)
        j.position.set(h.x, h.y, -2.9)
        group.add(j)
      }
      const sc = screw(mats, 3.6)
      sc.position.set(0, -56, -2.9)
      sc.rotation.y = Math.PI
      group.add(sc)
      break
    }
    case 'mainplate': {
      const outline: Array<[number, number]> = []
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * TAU
        outline.push([Math.cos(a) * 162, Math.sin(a) * 162])
      }
      const holes = [
        { x: 0, y: -88, r: 51 }, // tourbillon well
        { x: 0, y: 0, r: 8.6 }, // centre: cannon + hour pipes
        { x: L.barrel.x, y: -L.barrel.y, r: 28.6 }, // ratchet opening
        { x: L.crownWheel.x, y: -L.crownWheel.y, r: 17.5 }, // crown-wheel recess
        { x: L.s2Wheel.x, y: -L.s2Wheel.y, r: 22.4 }, // setting-wheel recess
        { x: L.s1Idler.x, y: -L.s1Idler.y, r: 9 },
        { x: L.thirdWheel.x, y: -L.thirdWheel.y, r: 3 }, // third upper pivot
        { x: -56, y: 34, r: 3 }, // hour-star stud
        { x: L.strikeWheel.x, y: -L.strikeWheel.y, r: 2.6 },
        { x: L.strikeInterWheel.x, y: -L.strikeInterWheel.y, r: 2.4 },
        { x: L.governorPinion.x, y: -L.governorPinion.y, r: 2.4 },
      ]
      group.add(mesh(plateGeometry(outline, 4.5, holes), mats.plate))
      // movement pillars down to the bridges + fixing screws
      for (const az of [60, 150, 250]) {
        const a = (az * Math.PI) / 180
        const px = Math.cos(a) * 152
        const py = -Math.sin(a) * 152
        group.add(cyl(4, 11, mats.brassBrushed, px, py, -7.75))
        const sc = screw(mats)
        sc.position.set(px, py, 2.9)
        group.add(sc)
      }
      for (const [jx, jy] of [
        [L.thirdWheel.x, -L.thirdWheel.y],
        [L.strikeWheel.x, -L.strikeWheel.y],
        [L.governorPinion.x, -L.governorPinion.y],
      ] as const) {
        const j = jewel(mats, 3.2)
        j.position.set(jx, jy, 2.5)
        group.add(j)
      }
      break
    }
    // ----------------------------------------------------------- barrel
    case 'barrel': {
      const zp = 8
      const drum = L.BARREL_DRUM
      // drum wall + floor (open top so the coil shows)
      group.add(
        mesh(
          lathe([
            [drum.r - 2.6, drum.z0 - zp], [drum.r, drum.z0 - zp], [drum.r, drum.z1 - zp],
            [drum.r - 2.6, drum.z1 - zp], [drum.r - 2.6, drum.z0 - zp],
          ]),
          mats.brassBrushed,
        ),
      )
      group.add(cyl(drum.r - 2.2, 1.2, mats.brassBrushed, 0, 0, drum.z0 - zp + 0.7, 48))
      // toothed rim at the layout mesh tier
      const rim = gearOf(L.barrel, mats.brass, { spokes: 0, rimW: 4, holeR: drum.r - 5 })
      rim.position.z = tierZ(L.barrel, zp)
      group.add(rim)
      // arbor with its square, through the bridge below and ratchet above
      const arbor = new THREE.Group()
      arbor.add(cyl(3.2, 19, mats.steel, 0, 0, -0.5))
      arbor.add(box(4.6, 4.6, 3.4, mats.steel, 0, 0, tierZ(L.ratchet, zp)))
      group.add(arbor)
      // ratchet wheel keyed to the arbor square + retaining screw
      const ratchetG = new THREE.Group()
      ratchetG.add(gearOf(L.ratchet, mats.brass, { spokes: 0, rimW: 20, holeR: 3.4 }))
      const rs = screw(mats, 4)
      rs.position.z = 1.6
      ratchetG.add(rs)
      ratchetG.position.z = tierZ(L.ratchet, zp)
      group.add(ratchetG)
      // mainspring coil, anchored to the arbor
      const coils = new THREE.Group()
      for (let i = 0; i <= 5; i++) {
        const w = i / 5
        const coil = mesh(spiralTube(6.5, drum.r - 5, 4.5 + 3.5 * w, 1.1, w * 2), mats.steelDark)
        coil.visible = i === 4
        coils.add(coil)
      }
      group.add(coils)
      return {
        group,
        update: (m) => {
          const idx = Math.round(m.mainspring.windFraction * 5)
          coils.children.forEach((c, i) => (c.visible = i === idx))
          // the drum (group) turns as the watch runs; arbor + ratchet +
          // coil-inner turn only with winding: counter-rotate the children
          const angles = L.renderedAngles(m)
          const rel = angles.ratchet - angles.barrel
          ratchetG.rotation.z = -rel
          arbor.rotation.z = -rel
          coils.rotation.z = -rel
        },
      }
    }
    // --------------------------------------------------------- going train
    case 'centerWheel': {
      const zp = 10.25
      group.add(gearOf(L.centerWheel, mats.brass, { spokes: 5 }))
      const pin = gearOf(L.centerPinion, mats.steel, { spokes: 0, rimW: 2, holeR: 1.4 })
      pin.position.z = tierZ(L.centerPinion, zp)
      group.add(pin)
      // centre arbor rises through the plate into the cannon pinion
      group.add(cyl(2.1, 24, mats.steel, 0, 0, (1 + 25 / 2 + 6) / 2 - zp + 3))
      break
    }
    case 'thirdWheel': {
      const zp = 8.5
      group.add(gearOf(L.thirdWheel, mats.brass, { spokes: 4 }))
      const pin = gearOf(L.thirdPinion, mats.steel, { spokes: 0, rimW: 2, holeR: 1.2 })
      pin.position.z = tierZ(L.thirdPinion, zp)
      group.add(pin)
      group.add(cyl(1.8, 15, mats.steel, 0, 0, 0.75)) // pivots: cock jewel to plate
      break
    }
    case 'fixedFourth': {
      group.add(gearOf(L.fixedFourth, mats.steelBrushed, { spokes: 0, rimW: 5, holeR: 6.5 }))
      // three feet up into the mainplate: this wheel is bolted, not pivoted
      for (const az of [30, 150, 270]) {
        const a = (az * Math.PI) / 180
        group.add(cyl(1.8, 2.4, mats.steel, Math.cos(a) * 14, Math.sin(a) * 14, 1.4))
      }
      break
    }
    case 'keylessWorks': {
      const zp = 20
      const kz = L.STEM_Z - zp // stem axis in local z
      // --- stem, from inside the winding pinion out through the case tube
      const stem = new THREE.Group()
      stem.add(cylX(L.STEM_R, 152, mats.steel, L.WINDING_PINION.x + 76 - 2, 0, kz))
      stem.add(box(3.6, 3.6, 3.6, mats.steel, L.WINDING_PINION.x + 3, 0, kz)) // castle square
      group.add(stem)
      // --- winding pinion (free on the stem; driven only via the dogs)
      const wpG = new THREE.Group()
      const wpGear = gearGeometry(L.WINDING_PINION.r, L.WINDING_PINION.teeth, { thickness: L.WINDING_PINION.w, spokes: 0, rimW: 3, holeR: 2.8 })
      wpGear.rotateY(Math.PI / 2)
      wpG.add(mesh(wpGear, mats.steel))
      for (let i = 0; i < 4; i++) {
        // dog teeth on the castle-facing side
        const d = box(1.8, 1.6, 2.4, mats.steel, L.WINDING_PINION.w / 2 + 0.9, 0, 0)
        const hold = new THREE.Group()
        hold.rotation.x = (i / 4) * TAU
        d.position.y = 3.4
        hold.add(d)
        wpG.add(hold)
      }
      wpG.position.set(L.WINDING_PINION.x, 0, kz)
      group.add(wpG)
      // --- sliding castle wheel (dog face toward the winding pinion,
      //     spur ring at the outer end for the setting wheels)
      const castle = new THREE.Group()
      castle.add(cylX(4.2, L.CASTLE.w, mats.steel, 0, 0, 0))
      const spur = gearGeometry(L.CASTLE.r, L.CASTLE.teeth, { thickness: 3, spokes: 0, rimW: 2.4, holeR: 2.8 })
      spur.rotateY(Math.PI / 2)
      castle.add(mesh(spur, mats.steel, L.CASTLE.w / 2 - 1.5, 0, 0))
      for (let i = 0; i < 4; i++) {
        const d = box(1.8, 1.6, 2.4, mats.steel, -L.CASTLE.w / 2 - 0.9, 0, 0)
        const hold = new THREE.Group()
        hold.rotation.x = (i / 4) * TAU + Math.PI / 4
        d.position.y = 3.4
        hold.add(d)
        castle.add(hold)
      }
      castle.position.set(L.CASTLE.xRest, 0, kz)
      group.add(castle)
      // --- crown wheel: spur tier to the ratchet + contrate ring up to the
      //     winding pinion (this is the 90° turn of the winding chain)
      const cwG = new THREE.Group()
      cwG.add(gearOf(L.crownWheel, mats.brass, { spokes: 0, rimW: 12, holeR: 3 }))
      const ring = new THREE.Group()
      for (let i = 0; i < L.CROWN_CONTRATE.teeth; i++) {
        const a = (i / L.CROWN_CONTRATE.teeth) * TAU
        ring.add(box(1.3, 1.8, 1.6, mats.brass, Math.cos(a) * L.CROWN_CONTRATE.r, Math.sin(a) * L.CROWN_CONTRATE.r, 0))
      }
      ring.position.z = (L.CROWN_CONTRATE_Z.z0 + L.CROWN_CONTRATE_Z.z1) / 2 - (L.crownWheel.z0 + L.crownWheel.z1) / 2
      cwG.add(ring)
      const cwScrew = screw(mats, 3.4)
      cwScrew.position.z = 1.8
      cwG.add(cwScrew)
      cwG.position.set(L.crownWheel.x, -L.crownWheel.y, tierZ(L.crownWheel, zp))
      group.add(cwG)
      // --- click (pawl) + click spring on the ratchet rim
      const click = new THREE.Group()
      const pawl = new THREE.Shape()
      pawl.moveTo(0, 0)
      pawl.lineTo(9, 2.4)
      pawl.lineTo(9.5, -1)
      pawl.lineTo(2, -3)
      pawl.closePath()
      click.add(mesh(new THREE.ExtrudeGeometry(pawl, { depth: 2, bevelEnabled: false }), mats.steel))
      click.add(cyl(1.6, 3.4, mats.steel, 0, 0, 1))
      click.position.set(58, 54, tierZ(L.ratchet, zp))
      click.rotation.z = 2.2
      group.add(click)
      const clickSpring = mesh(spiralTube(4, 12, 0.8, 0.7, 1.2, 60), mats.blued)
      clickSpring.position.set(66, 62, tierZ(L.ratchet, zp))
      group.add(clickSpring)
      // --- setting wheels
      const s1G = new THREE.Group()
      s1G.add(gearOf(L.s1Idler, mats.steelBrushed, { spokes: 0, rimW: 3, holeR: 1.8 }))
      s1G.position.set(L.s1Idler.x, -L.s1Idler.y, tierZ(L.s1Idler, zp))
      group.add(s1G)
      const s2G = new THREE.Group()
      s2G.add(gearOf(L.s2Wheel, mats.steelBrushed, { spokes: 0, rimW: 5, holeR: 2 }))
      const s2p = gearOf(L.s2Pinion, mats.steel, { spokes: 0, rimW: 2, holeR: 1.6 })
      s2p.position.z = (L.s2Pinion.z0 + L.s2Pinion.z1) / 2 - (L.s2Wheel.z0 + L.s2Wheel.z1) / 2
      s2G.add(s2p)
      s2G.position.set(L.s2Wheel.x, -L.s2Wheel.y, tierZ(L.s2Wheel, zp))
      group.add(s2G)

      let wpAngle = 0
      return {
        group,
        update: (m) => {
          const a = L.renderedAngles(m)
          // stem + castle always turn with the crown
          stem.rotation.x = -m.crownAngle
          castle.rotation.x = -m.crownAngle
          // castle slides out when the crown is pulled
          const targetX = L.CASTLE.xRest + (m.crownPulled ? L.CASTLE.pull : 0)
          castle.position.x += (targetX - castle.position.x) * 0.25
          // winding pinion turns only while the dogs are engaged (pushed in)
          if (!m.crownPulled) wpAngle = -m.crownAngle
          wpG.rotation.x = wpAngle
          cwG.rotation.z = -a.crownWheel
          s1G.rotation.z = -a.s1
          s2G.rotation.z = -a.s2
        },
      }
    }
    // ----------------------------------------------------------- carriage
    case 'carriage': {
      const zp = 20
      // lower arbor + the pinion the third wheel drives (phase-aligned)
      group.add(cyl(3, 11, mats.steel, 0, 0, 7.5 - zp))
      const pinion = gearOf(L.carriagePinion, mats.steel, { spokes: 0, rimW: 1.8, holeR: 1.2 })
      pinion.position.z = tierZ(L.carriagePinion, zp)
      group.add(pinion)
      // cage: lower ring, three pillars, top hub
      group.add(mesh(new THREE.TorusGeometry(GEO.carriage.r, 2, 12, 72), mats.steel, 0, 0, L.Z.cageRing - zp))
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5
        const p0 = new THREE.Vector3(Math.cos(a) * GEO.carriage.r, Math.sin(a) * GEO.carriage.r, L.Z.cageRing - zp)
        const p1 = new THREE.Vector3(Math.cos(a) * 32, Math.sin(a) * 32, 10)
        const p2 = new THREE.Vector3(Math.cos(a) * 11, Math.sin(a) * 11, L.Z.cageTop - zp - 1)
        group.add(mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 24, 2, 10), mats.steel))
      }
      group.add(mesh(new THREE.TorusGeometry(10, 1.7, 10, 40), mats.steel, 0, 0, L.Z.cageTop - zp))
      // seconds marker on the lower ring
      group.add(box(10, 3.2, 1.8, mats.blued, GEO.carriage.r + 6, 0, L.Z.cageRing - zp))
      // hairspring stud pillar (the spring's outer end is pinned here)
      group.add(cyl(1.5, 5, mats.steel, 20.5, 0, (L.Z.hairspring.z0 + L.Z.hairspring.z1) / 2 - zp))
      group.add(box(3.4, 3.4, 3, mats.steel, 20.5, 0, L.Z.hairspring.z1 - zp + 1))
      // regulator index over the hairspring, with curb pins
      const regulator = new THREE.Group()
      regulator.add(box(16, 2.4, 1.2, mats.blued, 12, 0, 0))
      regulator.add(cyl(0.55, 3, mats.blued, 19, 0.9, -1.4))
      regulator.add(cyl(0.55, 3, mats.blued, 19, -0.9, -1.4))
      regulator.position.z = L.Z.cageTop - zp - 1.4
      group.add(regulator)
      return {
        group,
        update: (m) => {
          const a = L.renderedAngles(m)
          // pinion is splined to the cage but tooth-phased to the third wheel
          pinion.rotation.z = -a.carriagePinion + m.train.carriageAngle
          regulator.rotation.z = m.regulator * 0.35
        },
      }
    }
    case 'escapeWheel': {
      const zp = 19.75
      group.add(mesh(escapeWheelGeometry(12, 1.5), mats.steel))
      const pin = gearOf(L.escPinion, mats.steel, { spokes: 0, rimW: 0.9, holeR: 0.7 })
      pin.position.z = tierZ(L.escPinion, zp)
      group.add(pin)
      group.add(cyl(1, 12, mats.steel, 0, 0, 0.25))
      return {
        group,
        update: (m) => {
          // pinion phase: rolls the fixed fourth wheel as the cage orbits
          const ground = L.escapePinionAngle(m.train.carriageAngle)
          pin.rotation.z = -ground + m.esc.escAngle
        },
      }
    }
    case 'palletFork': {
      const lever = new THREE.Group()
      lever.add(box(2.6, 15, 2.2, mats.steel))
      lever.add(box(1.4, 5, 2.2, mats.steel, -2.4, -8.5, 0))
      lever.add(box(1.4, 5, 2.2, mats.steel, 2.4, -8.5, 0))
      const pe = box(1.6, 4.6, 2.6, mats.ruby, -3.4, 6.4, -1.4)
      pe.rotation.z = 0.5
      const px = box(1.6, 4.6, 2.6, mats.ruby, 3.4, 6.4, -1.4)
      px.rotation.z = -0.5
      lever.add(pe, px)
      lever.add(cyl(0.5, 4, mats.steel, 0, -9.5, 1))
      group.add(lever)
      group.add(cyl(1.2, 7, mats.steel))
      return {
        group,
        update: (m) => {
          const e = m.esc
          const p2 = e.theta - BEAT_OFFSET
          const bank = 9 * DEG
          const leverAngle =
            e.phase === PHASE_LOCKED ? e.forkSide * bank : Math.max(-1, Math.min(1, p2 / HALF_WINDOW)) * bank
          lever.rotation.z = -leverAngle
        },
      }
    }
    case 'balance': {
      const rimMesh = mesh(new THREE.TorusGeometry(27, 2.5, 12, 64), mats.gold)
      rimMesh.scale.z = 0.72
      group.add(rimMesh)
      group.add(box(52, 3, 1.8, mats.gold))
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2
        group.add(cyl(1.5, 2.4, mats.gold, Math.cos(a) * 27, Math.sin(a) * 27, 0))
      }
      group.add(cyl(1.2, 14, mats.steel)) // staff
      group.add(cyl(5.2, 1.5, mats.steel, 0, 0, L.Z.roller - 30))
      group.add(cyl(0.9, 3.2, mats.ruby, 0, -5.2, L.Z.roller - 30))
      const spring = mesh(spiralTube(3, 20, 5.5, 0.45, 0, 300), mats.blued)
      spring.position.z = (L.Z.hairspring.z0 + L.Z.hairspring.z1) / 2 - 30
      group.add(spring)
      group.add(cyl(2.2, 1.6, mats.blued, 0, 0, spring.position.z))
      return {
        group,
        update: (m) => {
          // outer end pinned to the carriage stud; inner collet on the staff
          spring.rotation.z = 0.85 * m.esc.theta
        },
      }
    }
    // ------------------------------------------------------------ dial side
    case 'motionWorks': {
      const zp = 25
      // cannon pinion + its pipe up through the dial to the minute hand
      const cannon = new THREE.Group()
      cannon.add(gearOf(L.cannonPinion, mats.steel, { spokes: 0, rimW: 3.4, holeR: 2.3 }))
      cannon.add(cyl(L.Z.cannonPipe.r, L.Z.cannonPipe.z1 - L.Z.cannonPipe.z0, mats.steel, 0, 0, (L.Z.cannonPipe.z0 + L.Z.cannonPipe.z1) / 2 - L.STEM_Z + 1))
      cannon.position.z = tierZ(L.cannonPinion, zp)
      group.add(cannon)
      // minute wheel + its pinion
      const mwG = new THREE.Group()
      mwG.add(gearOf(L.minuteWheel, mats.brassBrushed, { spokes: 3 }))
      const mwp = gearOf(L.minuteWheelPinion, mats.steel, { spokes: 0, rimW: 2.4, holeR: 1.6 })
      mwp.position.z = (L.minuteWheelPinion.z0 + L.minuteWheelPinion.z1) / 2 - (L.minuteWheel.z0 + L.minuteWheel.z1) / 2
      mwG.add(mwp)
      mwG.add(cyl(1.6, 8, mats.steel, 0, 0, 1))
      mwG.position.set(L.minuteWheel.x, -L.minuteWheel.y, tierZ(L.minuteWheel, zp))
      group.add(mwG)
      // hour wheel + its pipe (the hour hand presses onto this pipe)
      const hourG = new THREE.Group()
      hourG.add(gearOf(L.hourWheel, mats.brass, { spokes: 0, rimW: 6, holeR: L.Z.hourPipe.r + 0.4 }))
      hourG.add(
        cyl(L.Z.hourPipe.r, L.Z.hourPipe.z1 - L.Z.hourPipe.z0, mats.brass, 0, 0, (L.Z.hourPipe.z0 + L.Z.hourPipe.z1) / 2 - (L.hourWheel.z0 + L.hourWheel.z1) / 2, 24),
      )
      hourG.position.set(0, 0, tierZ(L.hourWheel, zp))
      group.add(hourG)
      return {
        group,
        update: (m) => {
          const a = L.renderedAngles(m)
          cannon.rotation.z = -a.cannon
          mwG.rotation.z = -a.minuteWheel
          hourG.rotation.z = -a.hourWheel
        },
      }
    }
    case 'hourStar': {
      group.add(mesh(starGeometry(17, 12, 1.8), mats.steelBrushed))
      group.add(cyl(3, 5.5, mats.steel, 0, 0, 0.4)) // stud up into the snail
      group.add(cyl(3.8, 2, mats.steel, 0, 0, -1.6)) // shoulder into the plate
      // jumper: sprung blade whose roller drops between the star's teeth
      const jumper = new THREE.Group()
      const blade = new THREE.Shape()
      blade.moveTo(0, 0)
      blade.quadraticCurveTo(10, 6, 21, 2.6)
      blade.lineTo(21, 0.2)
      blade.quadraticCurveTo(10, 3.4, 1.2, -2.4)
      blade.closePath()
      jumper.add(mesh(new THREE.ExtrudeGeometry(blade, { depth: 1.6, bevelEnabled: false }), mats.blued, 0, 0, -0.8))
      jumper.add(cyl(2, 1.8, mats.steel, 21.5, 2.6, 0))
      jumper.position.set(-24, -8, 0)
      jumper.rotation.z = 0.35
      group.add(jumper)
      break
    }
    case 'surprisePiece': {
      const flag = new THREE.Group()
      const s = new THREE.Shape()
      s.moveTo(4, 0)
      s.quadraticCurveTo(15, 3, 19, -4)
      s.lineTo(12, -7)
      s.quadraticCurveTo(7, -3, 4, -4)
      s.closePath()
      flag.add(mesh(new THREE.ExtrudeGeometry(s, { depth: 1.4, bevelEnabled: false }), mats.blued))
      group.add(flag)
      group.add(cyl(2.2, 2.6, mats.steel))
      return {
        group,
        update: (m) => {
          const snap = Math.max(0, 1 - (m.t - m.train.lastSnapT) * 3)
          flag.rotation.z = -snap * 0.5
        },
      }
    }
    case 'hourSnail':
      group.add(mesh(snailCamGeometry(HOUR_SNAIL_R0, HOUR_SNAIL_DR, 12, 1, 1, 2.8), mats.brass))
      group.add(cyl(4.6, 3.4, mats.brass, 0, 0, 0)) // collet on the star stud
      break
    case 'quarterSnail':
      group.add(mesh(snailCamGeometry(QUARTER_SNAIL_R0, QUARTER_SNAIL_DR, 4, 1, 0, 2.5), mats.brassBrushed))
      group.add(cyl(6.4, 2.9, mats.brassBrushed, 0, 0, 0, 24)) // hub on the cannon pipe
      break
    case 'minuteSnail':
      group.add(mesh(snailCamGeometry(MINUTE_SNAIL_R0, MINUTE_SNAIL_DR, 15, 4, 0, 2.4), mats.brass))
      group.add(cyl(6.4, 2.8, mats.brass, 0, 0, 0, 24))
      break
    case 'hourRack':
      return buildRack(group, mats, mv, () => mv.repeater.hourRack, 42, 12, 6 * DEG, 0.55,
        GEO.hourRackPivot, GEO.hourStar, HOUR_SNAIL_R0, HOUR_SNAIL_DR, 'hour', 26.6)
    case 'quarterRack':
      return buildRack(group, mats, mv, () => mv.repeater.quarterRack, 34, 3, 8 * DEG, 3.565,
        GEO.quarterRackPivot, GEO.center, QUARTER_SNAIL_R0, QUARTER_SNAIL_DR, 'quarter', 30.1)
    case 'minuteRack':
      return buildRack(group, mats, mv, () => mv.repeater.minuteRack, 34, 14, 4.5 * DEG, 4.35,
        GEO.minuteRackPivot, GEO.center, MINUTE_SNAIL_R0, MINUTE_SNAIL_DR, 'minute', 33.1)
    case 'strikeTrain': {
      const zp = 28
      // strike wheel with the gathering pallet, tooth-phased to its chain
      const sw = new THREE.Group()
      sw.add(gearOf(L.strikeWheel, mats.steelBrushed, { spokes: 3 }))
      const finger = box(12, 3, 2, mats.blued, 6, 0, 0)
      const fingerTip = cyl(1.6, 2, mats.blued, 12.6, 0, 0)
      const fingerG = new THREE.Group()
      fingerG.add(finger, fingerTip)
      fingerG.position.z = (L.Z.gatherFinger.z0 + L.Z.gatherFinger.z1) / 2 - zp
      sw.add(fingerG)
      sw.add(cyl(2, 9.5, mats.steel, 0, 0, -2))
      group.add(sw)
      // intermediate two-tier wheel toward the governor
      const inter = new THREE.Group()
      inter.add(gearOf(L.strikeInterPinion, mats.steel, { spokes: 0, rimW: 2.4, holeR: 1.4 }))
      const iw = gearOf(L.strikeInterWheel, mats.steelBrushed, { spokes: 0, rimW: 4, holeR: 1.8 })
      iw.position.z = (L.strikeInterWheel.z0 + L.strikeInterWheel.z1) / 2 - (L.strikeInterPinion.z0 + L.strikeInterPinion.z1) / 2
      inter.add(iw)
      inter.add(cyl(1.6, 9, mats.steel, 0, 0, 1))
      inter.position.set(L.strikeInterWheel.x - L.strikeWheel.x, -(L.strikeInterWheel.y - L.strikeWheel.y), tierZ(L.strikeInterPinion, zp))
      group.add(inter)
      return {
        group,
        update: (m) => {
          const a = L.renderedAngles(m)
          sw.rotation.z = -a.strike
          inter.rotation.z = -a.strikeInter
        },
      }
    }
    case 'flyGovernor': {
      group.add(gearOf(L.governorPinion, mats.steel, { spokes: 0, rimW: 3, holeR: 1.4 }))
      group.add(cyl(1.3, 11, mats.steel, 0, 0, 3))
      for (const s of [-1, 1]) {
        const vane = box(12, 5.5, 0.7, mats.steelBrushed, s * 7.5, 0, 5.4)
        vane.rotation.x = s * 0.5
        group.add(vane)
      }
      break
    }
    case 'allOrNothing': {
      group.add(box(24, 9, 3, mats.steelBrushed))
      group.add(cyl(2.2, 9, mats.steel, -8, 0, -3)) // stud into the plate
      const latch = box(3, 14, 2.4, mats.blued, 8, 0, 2.8)
      group.add(latch)
      return {
        group,
        update: (m) => {
          latch.rotation.z = m.repeater.latched ? -0.5 : 0.12
        },
      }
    }
    case 'hammerLow':
    case 'hammerHigh': {
      const isLow = id === 'hammerLow'
      const arm = new THREE.Group()
      arm.add(box(12, 3.2, 2.4, isLow ? mats.steel : mats.gold, 6, 0, 0))
      arm.add(mesh(new THREE.BoxGeometry(6.5, 8.5, 4.6), isLow ? mats.steel : mats.gold, 13, 0, 0))
      group.add(arm)
      group.add(cyl(2.4, 5.4, mats.steel))
      group.add(cyl(2, 8.5 - (isLow ? 0 : 2), mats.steel, 0, 0, -(isLow ? 4.2 : 3.2))) // stud to the plate
      // hammer return spring: a small blade pressing the arm tail
      const hs = mesh(spiralTube(3, 9, 0.8, 0.6, 2.4, 50), mats.blued)
      hs.position.set(-7, isLow ? 6 : -6, 0)
      group.add(hs)
      return {
        group,
        update: (_m, fx) => {
          const flash = isLow ? fx.hammerFlash.low : fx.hammerFlash.high
          arm.rotation.z = (isLow ? 1 : -1) * (1 - flash) * 0.42
        },
      }
    }
    case 'gongLow':
    case 'gongHigh': {
      const isLow = id === 'gongLow'
      const base = isLow ? mats.gongSteel : mats.gongGold
      const gm = base.clone()
      const rStart = isLow ? 156 : 149
      const a0 = -(isLow ? -0.12 : 0.18)
      group.add(mesh(spiralTube(rStart, rStart - 17, -1.9, 1.6, a0, 420), gm))
      if (isLow) {
        // the shared gong block, screwed to the plate: both gongs' feet
        // are brazed into it
        const block = box(10, 16, 8, mats.steelBrushed, Math.cos(0.12) * 152, Math.sin(0.12) * 152 * -1 + 5, 1)
        block.position.set(148, 4, 1)
        group.add(block)
        const bs = screw(mats, 2.6)
        bs.position.set(148, 4, 5.4)
        group.add(bs)
      }
      return {
        group,
        update: (_m, fx) => {
          const glow = isLow ? fx.gongGlow.low : fx.gongGlow.high
          gm.emissive.setHex(isLow ? 0x6688cc : 0xcc9933)
          gm.emissiveIntensity = glow * 0.7
        },
      }
    }
    // ------------------------------------------------------------- dial etc
    case 'dial': {
      const s = new THREE.Shape()
      s.absarc(0, 0, GEO.dialR, 0, TAU, false)
      const aperture = new THREE.Path()
      aperture.absarc(0, -GEO.carriage.y, GEO.apertureR, 0, TAU, true)
      s.holes.push(aperture)
      const centre = new THREE.Path()
      centre.absarc(0, 0, 11.5, 0, TAU, true)
      s.holes.push(centre)
      const g = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false })
      remapPlanarUVs(g, GEO.dialR)
      g.translate(0, 0, -1)
      const dm = mats.dial.clone()
      dm.map = dialTexture()
      group.add(mesh(g, dm))
      group.add(mesh(new THREE.TorusGeometry(GEO.apertureR + 1.2, 1.4, 8, 64), mats.gold, 0, -GEO.carriage.y, 1))
      group.add(mesh(new THREE.TorusGeometry(12.2, 1.1, 8, 40), mats.gold, 0, 0, 1))
      // dial feet down to the mainplate
      for (const az of [45, 135, 225, 315]) {
        const a = (az * Math.PI) / 180
        group.add(cyl(1.6, 20.5, mats.brass, Math.cos(a) * 150, Math.sin(a) * 150, -11.25))
      }
      break
    }
    case 'hourHand': {
      // hub sleeve pressed onto the hour-wheel pipe
      group.add(mesh(lathe([[7.7, -1.4], [10, -1.2], [10, 1], [7.7, 1.2], [7.7, -1.4]]), mats.blued))
      group.add(mesh(handGeometry(88, 7, 1.3), mats.blued, 0, 0, 0.5))
      break
    }
    case 'minuteHand': {
      // hub pressed onto the cannon pipe + gold cap over the pipe's top
      group.add(mesh(lathe([[5.3, -1.2], [7.2, -1], [7.2, 0.9], [5.3, 1.1], [5.3, -1.2]]), mats.blued))
      group.add(mesh(handGeometry(132, 5.6, 1.2), mats.blued, 0, 0, 0.4))
      group.add(mesh(lathe([[0, 1.9], [2.6, 1.6], [3.3, 0.6], [3.3, -0.4], [0, -0.4]]), mats.gold))
      break
    }
    // ----------------------------------------------------------------- case
    case 'caseband': {
      group.add(
        mesh(
          lathe([
            [178, -33], [206, -29], [216, -14], [219, 5], [216, 24], [206, 35],
            [178, 33], [176, 29], [176, -29], [178, -33],
          ]),
          mats.caseSteel,
        ),
      )
      for (const sy of [-1, 1])
        for (const sx of [-1, 1]) {
          const lug = box(24, 36, 12, mats.caseSteel, sx * 38, sy * 210, -20)
          lug.rotation.z = -sx * sy * 0.12
          group.add(lug)
        }
      // case tube the stem passes through
      const tube = new THREE.CylinderGeometry(4.6, 4.6, 16, 20)
      tube.rotateZ(Math.PI / 2)
      group.add(mesh(tube, mats.caseSteel, 223, 0, L.STEM_Z - 17))
      break
    }
    case 'crown': {
      const inner = new THREE.Group()
      const knurl = gearGeometry(15, 26, { thickness: 12, spokes: 0, rimW: 6, holeR: 2 })
      knurl.rotateY(Math.PI / 2)
      inner.add(mesh(knurl, mats.caseSteel, 6, 0, 0))
      const cap = lathe([[0, 0], [13, 0], [15.5, 3], [15.5, 5], [12, 7], [0, 7]])
      cap.rotateY(Math.PI / 2)
      inner.add(mesh(cap, mats.caseSteel, 12, 0, 0))
      inner.add(cyl(3.2, 1, mats.gold, 12.5, 0, 0))
      const stem = new THREE.CylinderGeometry(L.STEM_R, L.STEM_R, 14, 16)
      stem.rotateZ(Math.PI / 2)
      inner.add(mesh(stem, mats.steel, -7, 0, 0))
      group.add(inner)
      return {
        group,
        update: (m) => {
          inner.position.x = m.crownPulled ? L.CASTLE.pull : 0
          inner.rotation.x = -m.crownAngle // the crown physically turns
        },
      }
    }
    case 'repeaterSlide': {
      const s = new THREE.Shape()
      const w = 8
      const h = 22
      s.moveTo(-w, -h + 6)
      s.quadraticCurveTo(-w, -h, 0, -h)
      s.quadraticCurveTo(w, -h, w, -h + 6)
      s.lineTo(w, h - 6)
      s.quadraticCurveTo(w, h, 0, h)
      s.quadraticCurveTo(-w, h, -w, h - 6)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: 7, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2 })
      g.translate(0, 0, -3.5)
      group.add(mesh(g, mats.caseSteel))
      group.add(box(6, 26, 3, mats.gold, 0, 0, 4))
      // the lever arm reaching through the band to the all-or-nothing piece
      group.add(box(52, 6, 4, mats.steelBrushed, 30, -5, 3))
      group.add(cyl(2.2, 8, mats.steel, 56, -8, 6))
      break
    }
    case 'bezelCrystal': {
      group.add(mesh(lathe([[164, -6], [180, -4], [187, 2], [184, 9], [172, 11], [164, 6], [164, -6]]), mats.caseSteel))
      const R = 848.5
      const a0 = Math.asin(164 / R)
      const prof: Array<[number, number]> = []
      for (let i = 0; i <= 14; i++) {
        const t = i / 14
        const a = a0 * (1 - t)
        prof.push([R * Math.sin(a), -4 + R * (Math.cos(a) - Math.cos(a0))])
      }
      group.add(mesh(lathe(prof, 96), mats.sapphire))
      break
    }
    default:
      group.add(cyl(6, 2, mats.steelDark))
  }
  return { group }
}

/**
 * Rack assembly: pivot stud planted in the mainplate, shoulder screw,
 * return spring, toothed sector and the articulated tail whose beak tip
 * rides the snail profile (R = R0 - fall/pitch · DR — the identical law
 * the core counts teeth with, so the beak lands on the drawn step).
 */
function buildRack(
  group: THREE.Group,
  mats: Materials,
  mv: Movement,
  getRack: () => Rack,
  r: number,
  teeth: number,
  pitch: number,
  armAngleWatch: number,
  pivot: { x: number; y: number },
  snailC: { x: number; y: number },
  r0: number,
  dr: number,
  which: keyof typeof CONTACT,
  zPos: number,
): Built {
  const sector = mesh(rackSectorGeometry(r, teeth, pitch, 2.2), mats.steelBrushed)
  sector.rotation.z = -armAngleWatch
  group.add(sector)
  const armLen = r * 0.82
  const armGeo = new THREE.BoxGeometry(armLen, 5, 2.2)
  armGeo.translate(armLen / 2, 0, 0)
  const arm = mesh(armGeo, mats.steelBrushed)
  arm.rotation.z = -armAngleWatch
  group.add(arm)
  // pivot: stud from the mainplate + shoulder screw holding the rack
  const studLen = zPos - 1.1 - L.Z.plate.z1
  group.add(cyl(3, studLen, mats.steel, 0, 0, -1.1 - studLen / 2))
  group.add(cyl(4, 2.2, mats.steel, 0, 0, 0))
  const sc = screw(mats, 2.8)
  sc.position.z = 1.5
  group.add(sc)
  // return spring: blade from a plate foot, pressing the arm
  const springDir = -armAngleWatch + 2.4
  const spring = mesh(spiralTube(5, 15, 1.1, 0.7, springDir, 60), mats.blued)
  group.add(spring)
  // tail: unit blade scaled to the live tip distance + beak foot
  const tail = new THREE.Group()
  const bladeGeo = new THREE.BoxGeometry(1, 1.9, 1.6)
  bladeGeo.translate(0.5, 0, 0)
  const blade = mesh(bladeGeo, mats.blued)
  const foot = box(2.6, 5, 2.6, mats.blued)
  tail.add(blade, foot)
  group.add(tail)
  const update = (m: Movement) => {
    const rack = getRack()
    const alpha = rack.currentAngle(m.repeater.gatherProgress(rack))
    const rTip = r0 - (alpha / rack.toothPitch) * dr
    const twx = snailC.x + Math.cos(CONTACT[which]) * rTip - pivot.x
    const twy = snailC.y + Math.sin(CONTACT[which]) * rTip - pivot.y
    const c = Math.cos(-alpha)
    const s = Math.sin(-alpha)
    const tx = twx * c - twy * s
    const ty = -(twx * s + twy * c)
    const len = Math.hypot(tx, ty)
    tail.rotation.z = Math.atan2(ty, tx)
    blade.scale.x = len
    foot.position.x = len
  }
  update(mv)
  return { group, update }
}
