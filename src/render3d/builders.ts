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

/** Flat lever arm from the local origin to `end` (three local coords). */
function armTo(mats: Materials, end: { x: number; y: number }, w: number, t: number): THREE.Mesh {
  const len = Math.hypot(end.x, end.y)
  const g = new THREE.BoxGeometry(len, w, t)
  g.translate(len / 2, 0, 0)
  const m = mesh(g, mats.steelBrushed)
  m.rotation.z = Math.atan2(end.y, end.x)
  return m
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
      // barrel bridge, exactly the audited outline: carries the barrel
      // arbor bushing, the centre and transfer lower bearings, the click
      // stud and the crown-wheel core. Anchor (0,0), zPos = bridge centre.
      buildBridge(group, mats, L.BARREL_BRIDGE, { x: 0, y: 0 }, 0)
      for (const h of [L.BARREL_BRIDGE.holes[0], L.BARREL_BRIDGE.holes[2]]) {
        const j = jewel(mats, h.r + 1.6)
        j.position.set(h.x, -h.y, -L.Z.bridges.z1 + 1.2)
        group.add(j)
      }
      // crown-wheel core: post down to the back tier + retaining screw
      const post = cyl(2.5, L.Z.bridges.z0 - L.BACK_TIER.z0, mats.steel, L.crownWheel.x, -L.crownWheel.y, (L.Z.bridges.z0 + L.BACK_TIER.z0) / 2)
      group.add(post)
      const cs = screw(mats, 3.3)
      cs.position.set(L.crownWheel.x, -L.crownWheel.y, L.BACK_TIER.z0 - 0.7)
      cs.rotation.y = Math.PI
      group.add(cs)
      break
    }
    case 'tourbillonBridge': {
      // tourbillon cock: carries the carriage AND third-wheel lower
      // pivots, reaching in from the 6 o'clock edge (anchor = carriage axis)
      buildBridge(group, mats, L.TOURB_BRIDGE, L.CARRIAGE_POS, 0)
      for (const h of L.TOURB_BRIDGE.holes) {
        const j = jewel(mats, h.r + 1.8)
        j.position.set(h.x - L.CARRIAGE_POS.x, -(h.y - L.CARRIAGE_POS.y), -L.Z.bridges.z1 + 1.2)
        group.add(j)
      }
      break
    }
    case 'strikeBridge': {
      // dial-side cock over the strike train: upper pivots for the
      // gathering staff, intermediate wheel and fly governor
      buildBridge(group, mats, L.STRIKE_BRIDGE_SPEC, { x: L.strikeWheel.x, y: L.strikeWheel.y }, 1)
      for (const h of L.STRIKE_BRIDGE_SPEC.holes) {
        const j = jewel(mats, h.r + 1.5)
        j.position.set(h.x - L.strikeWheel.x, -(h.y - L.strikeWheel.y), L.STRIKE_BRIDGE.z1 - L.STRIKE_BRIDGE.z0 - 0.4)
        group.add(j)
      }
      break
    }
    case 'mainplate': {
      const outline: Array<[number, number]> = []
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * TAU
        outline.push([Math.cos(a) * 162, Math.sin(a) * 162])
      }
      // every bore from the audited list (watch coords -> three: flip y),
      // as two slabs: the lower also carries the transfer-ring recess,
      // both carry the milled keyless slot under the castle & pinion
      const flip = (h: { x: number; y: number; r: number }) => ({ x: h.x, y: -h.y, r: h.r })
      const lowHoles = [...L.MAINPLATE_HOLES, ...L.KEYLESS_SLOT, L.TRANSFER_RECESS].map(flip)
      const upHoles = [...L.MAINPLATE_HOLES, ...L.KEYLESS_SLOT].map(flip)
      const lower = mesh(plateGeometry(outline, L.PLATE_SPLIT_Z - L.Z.plate.z0, lowHoles), mats.plate)
      lower.position.z = (L.Z.plate.z0 + L.PLATE_SPLIT_Z) / 2 - 19.25
      group.add(lower)
      const upper = mesh(plateGeometry(outline, L.Z.plate.z1 - L.PLATE_SPLIT_Z, upHoles), mats.plate)
      upper.position.z = (L.PLATE_SPLIT_Z + L.Z.plate.z1) / 2 - 19.25
      group.add(upper)
      // stem-tip support: pierced block on the dial face — the stem's tip
      // pivot runs in its horizontal bore
      const B = L.STEM_BOSS
      const kz = L.STEM_Z - 19.25
      group.add(box(2 * B.hw, 2 * (B.boreHalf + B.wallW), B.z1 - (L.STEM_Z + B.boreHalf), mats.plate, B.x, 0, (L.STEM_Z + B.boreHalf + B.z1) / 2 - 19.25))
      group.add(box(2 * B.hw, 2 * (B.boreHalf + B.wallW), L.STEM_Z - B.boreHalf - B.z0, mats.plate, B.x, 0, (B.z0 + L.STEM_Z - B.boreHalf) / 2 - 19.25))
      for (const s of [-1, 1]) group.add(box(2 * B.hw, B.wallW, 2 * B.boreHalf, mats.plate, B.x, s * (B.boreHalf + B.wallW / 2), kz))
      // studs for the setting lever and the yoke (dial side)
      group.add(cyl(1.9, 2.1, mats.steel, L.SETTING_LEVER.pivot.x, -L.SETTING_LEVER.pivot.y, 2.25 + 1.05))
      group.add(cyl(1.9, 2.1, mats.steel, L.YOKE.pivot.x, -L.YOKE.pivot.y, 2.25 + 1.05))
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
      // arbor: down through the barrel bridge to the ratchet's square,
      // up to the drum's top bearing
      const arbor = new THREE.Group()
      arbor.add(cyl(3.2, 19.6, mats.steel, 0, 0, (-5.6 + 14) / 2 - zp))
      arbor.add(box(4.6, 4.6, 2.6, mats.steel, 0, 0, tierZ(L.ratchet, zp)))
      group.add(arbor)
      // ratchet wheel keyed to the arbor square on the BRIDGE'S BACK FACE
      // (what the open caseback shows) + retaining screw behind
      const ratchetG = new THREE.Group()
      ratchetG.add(gearOf(L.ratchet, mats.brass, { spokes: 0, rimW: 20, holeR: 3.4 }))
      const rs = screw(mats, 4)
      rs.position.z = -1.9
      rs.rotation.y = Math.PI
      ratchetG.add(rs)
      ratchetG.position.z = tierZ(L.ratchet, zp)
      group.add(ratchetG)
      // mainspring coil, anchored to the arbor
      const coils = new THREE.Group()
      coils.position.z = (drum.z0 + drum.z1) / 2 - zp
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
      // --- stem, cut like a real stem: tip pivot (in the plate boss) →
      //     square (castle) → round winding-pinion seat → setting-lever
      //     groove → hub, out through the case tube to the crown
      const stem = new THREE.Group()
      stem.position.z = kz // spin axis = the stem's own axis
      const sq = L.STEM_SQUARE
      stem.add(cylX(L.STEM_TIP.r, L.STEM_TIP.x1 - L.STEM_TIP.x0, mats.steel, (L.STEM_TIP.x0 + L.STEM_TIP.x1) / 2, 0, 0, 12))
      stem.add(box(sq.x1 - sq.x0, 2 * sq.half, 2 * sq.half, mats.steel, (sq.x0 + sq.x1) / 2, 0, 0))
      const seatLen = L.STEM_GROOVE.x - L.STEM_GROOVE.halfW - sq.x1
      stem.add(cylX(2.3, seatLen, mats.steel, sq.x1 + seatLen / 2, 0, 0, 16)) // pinion seat
      stem.add(cylX(L.STEM_GROOVE.rootR, 2 * L.STEM_GROOVE.halfW, mats.steel, L.STEM_GROOVE.x, 0, 0, 12)) // groove root
      stem.add(cylX(L.STEM_R, 234 - (L.STEM_GROOVE.x + L.STEM_GROOVE.halfW), mats.steel, (L.STEM_GROOVE.x + L.STEM_GROOVE.halfW + 234) / 2, 0, 0))
      group.add(stem)
      // --- winding pinion, the OUTERMOST piece (free on its seat; driven
      //     only via the dogs on its inboard face)
      const wpG = new THREE.Group()
      const wpGear = gearGeometry(L.WINDING_PINION.r, L.WINDING_PINION.teeth, { thickness: L.WINDING_PINION.w, spokes: 0, rimW: 3, holeR: 2.4 })
      wpGear.rotateY(Math.PI / 2)
      wpG.add(mesh(wpGear, mats.steel))
      for (let i = 0; i < 4; i++) {
        const d = box(1.8, 1.6, 2.4, mats.steel, -L.WINDING_PINION.w / 2 - 0.9, 0, 0)
        const hold = new THREE.Group()
        hold.rotation.x = (i / 4) * TAU
        d.position.y = 3.4
        hold.add(d)
        wpG.add(hold)
      }
      wpG.position.set(L.WINDING_PINION.x, 0, kz)
      group.add(wpG)
      // --- sliding castle wheel INBOARD: dogs face outboard toward the
      //     pinion; spur ring at the inboard end; waist groove for the yoke
      const castle = new THREE.Group()
      castle.add(cylX(4.2, L.CASTLE.w, mats.steel, 0, 0, 0))
      castle.add(cylX(L.CASTLE_GROOVE.rootR, 2 * L.CASTLE_GROOVE.halfW + 0.2, mats.steelDark, L.CASTLE_GROOVE.off, 0, 0, 16))
      const spur = gearGeometry(L.CASTLE.r, L.CASTLE.teeth, { thickness: 3, spokes: 0, rimW: 2.4, holeR: 2.8 })
      spur.rotateY(Math.PI / 2)
      castle.add(mesh(spur, mats.steel, L.CASTLE_SPUR_OFF, 0, 0))
      for (let i = 0; i < 4; i++) {
        const d = box(1.8, 1.6, 2.4, mats.steel, L.CASTLE.w / 2 + 0.9, 0, 0)
        const hold = new THREE.Group()
        hold.rotation.x = (i / 4) * TAU + Math.PI / 4
        d.position.y = 3.4
        hold.add(d)
        castle.add(hold)
      }
      castle.position.set(L.castleX(false), 0, kz)
      group.add(castle)
      // --- transfer wheel: contrate ring under the stem, tall arbor down
      //     the side of the barrel, spur at the bridge's back face
      const transferG = new THREE.Group()
      const ring = new THREE.Group()
      for (let i = 0; i < L.TRANSFER_RING.teeth; i++) {
        const a = (i / L.TRANSFER_RING.teeth) * TAU
        ring.add(box(1.3, 1.8, 1.6, mats.brass, Math.cos(a) * L.TRANSFER_RING.r, Math.sin(a) * L.TRANSFER_RING.r, 0))
      }
      // mounting offset phase-locks the face teeth to the winding pinion:
      // a ring gap always sits under a bottoming pinion tooth
      ring.rotation.z = L.contrateRingOffset()
      ring.position.z = (L.TRANSFER_RING.z0 + L.TRANSFER_RING.z1) / 2 - L.STEM_Z + kz
      transferG.add(ring)
      const ringDisc = cyl(L.TRANSFER_RING.r - 1, 1.6, mats.brass, 0, 0, ring.position.z - 1.4, 40)
      transferG.add(ringDisc)
      transferG.add(cyl(2.2, 19 - 2.2, mats.steel, 0, 0, (2.2 + 19) / 2 - L.STEM_Z + kz)) // arbor
      transferG.add(cyl(1.2, 7.4, mats.steel, 0, 0, (L.BACK_TIER.z0 + 2.2) / 2 - L.STEM_Z + kz)) // lower pivot
      const tSpur = gearOf(L.transferWheel, mats.brass, { spokes: 0, rimW: 12, holeR: 1.6 })
      tSpur.position.z = tierZ(L.transferWheel, L.STEM_Z - kz)
      transferG.add(tSpur)
      transferG.position.set(L.transferWheel.x, -L.transferWheel.y, kz)
      group.add(transferG)
      // --- crown wheel on the bridge's back face (core post + screw live
      //     on the barrel bridge part)
      const cwG = new THREE.Group()
      cwG.add(gearOf(L.crownWheel, mats.brass, { spokes: 0, rimW: 12, holeR: 3 }))
      cwG.position.set(L.crownWheel.x, -L.crownWheel.y, tierZ(L.crownWheel, zp))
      group.add(cwG)
      // --- click (pawl) + click spring beside the ratchet, on the bridge
      const click = new THREE.Group()
      const pawl = new THREE.Shape()
      pawl.moveTo(0, 0)
      pawl.lineTo(9, 2.4)
      pawl.lineTo(9.5, -1)
      pawl.lineTo(2, -3)
      pawl.closePath()
      const pawlMesh = mesh(new THREE.ExtrudeGeometry(pawl, { depth: 2, bevelEnabled: false }), mats.steel)
      pawlMesh.position.z = -1
      click.add(pawlMesh)
      click.add(cyl(1.5, 4.5, mats.steel, 0, 0, 1.2)) // stud up into the bridge
      click.position.set(L.CLICK.pivot.x, -L.CLICK.pivot.y, tierZ(L.ratchet, zp))
      click.rotation.z = -Math.atan2(-(L.barrel.y - L.CLICK.pivot.y), L.barrel.x - L.CLICK.pivot.x) + 0.5
      group.add(click)
      const clickSpring = mesh(spiralTube(3.6, 10, 0.8, 0.7, 1.9, 60), mats.blued)
      clickSpring.position.set(L.CLICK.pivot.x - 8, -L.CLICK.pivot.y - 7, tierZ(L.ratchet, zp))
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
      // --- setting lever: hub on its stud, arm to the pin riding the stem
      //     groove, finger to the yoke's tail pin
      const lever = new THREE.Group()
      const lv = L.SETTING_LEVER
      lever.position.set(lv.pivot.x, -lv.pivot.y, 22.55 - zp)
      lever.add(cyl(3.6, 1.7, mats.steelBrushed, 0, 0, 0))
      const pinRest = L.settingLeverPin(false)
      const leverArm = armTo(mats, { x: pinRest.x - lv.pivot.x, y: -(pinRest.y - lv.pivot.y) }, 4.4, 1.7)
      lever.add(leverArm)
      const leverPin = cyl(lv.pinR, 2.6, mats.steel, pinRest.x - lv.pivot.x, -(pinRest.y - lv.pivot.y), 2.1)
      lever.add(leverPin)
      const leverFinger = armTo(mats, { x: L.YOKE.tailPin.x - lv.pivot.x, y: -(L.YOKE.tailPin.y - lv.pivot.y) }, 4, 1.7)
      lever.add(leverFinger)
      group.add(lever)
      const leverScrew = screw(mats, 2.4)
      leverScrew.position.set(lv.pivot.x, -lv.pivot.y, 23.75 - zp)
      group.add(leverScrew)
      // --- yoke (bascule): fork riding the castle's waist groove, tail
      //     pushed by the lever, return spring holding it home
      const yoke = new THREE.Group()
      yoke.position.set(L.YOKE.pivot.x, -L.YOKE.pivot.y, 22.55 - zp)
      yoke.add(cyl(3.6, 1.7, mats.steelBrushed, 0, 0, 0))
      const forkRest = { x: L.castleX(false) + L.CASTLE_GROOVE.off - L.YOKE.pivot.x, y: -(L.YOKE.tipY - L.YOKE.pivot.y) }
      yoke.add(armTo(mats, forkRest, 4, 1.7))
      // fork prongs flanking the groove, rising to the stem plane
      for (const s of [-1, 1]) {
        const prong = cyl(1, 2.6, mats.steelBrushed, forkRest.x + s * (L.CASTLE_GROOVE.halfW + 1), forkRest.y - 0.6, 1.7)
        yoke.add(prong)
      }
      const tailRest = { x: L.YOKE.tailPin.x - L.YOKE.pivot.x, y: -(L.YOKE.tailPin.y - L.YOKE.pivot.y) }
      yoke.add(armTo(mats, tailRest, 4, 1.7))
      yoke.add(cyl(1.1, 2.4, mats.steel, tailRest.x, tailRest.y, 1.4)) // tail pin
      group.add(yoke)
      const yokeScrew = screw(mats, 2.4)
      yokeScrew.position.set(L.YOKE.pivot.x, -L.YOKE.pivot.y, 23.75 - zp)
      group.add(yokeScrew)
      const yokeSpring = mesh(spiralTube(3, 8.5, 0.9, 0.6, 2.4, 50), mats.blued)
      yokeSpring.position.set(L.YOKE.pivot.x - 9, -L.YOKE.pivot.y - 8, 22.55 - zp)
      group.add(yokeSpring)

      let prevCrown = mv.crownAngle
      let pullEase = mv.crownPulled ? 1 : 0
      return {
        group,
        update: (m) => {
          const a = L.renderedAngles(m)
          // stem + castle always turn with the crown; the stem also slides
          // out with it (the crown part carries the visible travel)
          pullEase += ((m.crownPulled ? 1 : 0) - pullEase) * 0.5
          stem.rotation.x = -m.crownAngle
          stem.position.x = pullEase * L.CASTLE.pull
          castle.rotation.x = -m.crownAngle
          // backward turns (pushed in): the castle's saw dogs ride up and
          // over the held winding pinion — the classic ratcheting zip
          const dCrown = m.crownAngle - prevCrown
          prevCrown = m.crownAngle
          const ratcheting = !m.crownPulled && dCrown < -1e-6
          const hop = ratcheting ? 1.1 * Math.abs(Math.sin(m.crownAngle * 6)) : 0
          // the yoke's fork places the castle; the lever throws the yoke —
          // both at their exactly-solved angles for the crown state
          const targetX = L.castleX(false) - pullEase * L.CASTLE.pull - hop
          castle.position.x += (targetX - castle.position.x) * 0.5
          lever.rotation.z = -(L.settingLeverAngle(true) * pullEase)
          yoke.rotation.z = -(L.yokeAngle(true) * pullEase)
          // winding pinion is rigidly geared to the ratchet through the
          // transfer and crown wheels: a pure function of the wind state
          wpG.rotation.x = -L.windingPinionAngle(m.mainspring.turns)
          transferG.rotation.z = -a.transfer
          cwG.rotation.z = -a.crownWheel
          s1G.rotation.z = -a.s1
          s2G.rotation.z = -a.s2
        },
      }
    }
    // ----------------------------------------------------------- carriage
    case 'carriage': {
      const zp = 20
      // lower arbor (necked pivot into the tourbillon cock's jewel) + the
      // pinion the third wheel drives (phase-aligned)
      group.add(cyl(3, 10.8, mats.steel, 0, 0, 7.6 - zp))
      group.add(cyl(1.1, 4.6, mats.steel, 0, 0, -0.1 - zp))
      const pinion = gearOf(L.carriagePinion, mats.steel, { spokes: 0, rimW: 1.8, holeR: 1.2 })
      pinion.position.z = tierZ(L.carriagePinion, zp)
      group.add(pinion)
      // cage: lower ring, three pillars (arched OUTSIDE the balance rim
      // and the breathing hairspring — clearances audited in layout), top hub
      group.add(mesh(new THREE.TorusGeometry(GEO.carriage.r, 2, 12, 72), mats.steel, 0, 0, L.Z.cageRing - zp))
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5
        const p0 = new THREE.Vector3(Math.cos(a) * GEO.carriage.r, Math.sin(a) * GEO.carriage.r, L.Z.cageRing - zp)
        const p1 = new THREE.Vector3(Math.cos(a) * 40, Math.sin(a) * 40, 36 - zp)
        const p2 = new THREE.Vector3(Math.cos(a) * 11, Math.sin(a) * 11, L.Z.cageTop - zp)
        group.add(mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 24, 1.6, 10), mats.steel))
      }
      group.add(mesh(new THREE.TorusGeometry(10, 1.7, 10, 40), mats.steel, 0, 0, L.Z.cageTop - zp))
      // balance upper pivot: cap jewel in a gold chaton under a three-armed
      // anti-shock spring, seated in the cage's top hub
      group.add(cyl(4.4, 1.4, mats.gold, 0, 0, L.Z.cageTop - zp + 0.4))
      group.add(cyl(2.3, 1.1, mats.ruby, 0, 0, L.Z.cageTop - zp + 0.9))
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.4
        const armBox = box(6.4, 1.1, 0.6, mats.gold, 0, 0, 0)
        armBox.position.set(Math.cos(a) * 3.6, Math.sin(a) * 3.6, L.Z.cageTop - zp + 1.5)
        armBox.rotation.z = a
        group.add(armBox)
      }
      // seconds marker on the lower ring
      group.add(box(10, 3.2, 1.8, mats.blued, GEO.carriage.r + 6, 0, L.Z.cageRing - zp))
      // escapement bearings carried by the cage itself: a lower bar OVER
      // the fixed fourth wheel (balance staff, fork and escape arbors run
      // down into its jewels; short of the third-wheel arbor it sweeps
      // past), and a slim upper bar over the escape arbor
      const barZ = (L.Z.cageBar.z0 + L.Z.cageBar.z1) / 2 - zp
      const lowerBar = box(9, 33, L.Z.cageBar.z1 - L.Z.cageBar.z0, mats.steel, 0, 12.5, barZ)
      group.add(lowerBar)
      for (const [jy, jr] of [[0, 2.6], [13.3, 2.6], [25.6, 2.6]] as const) {
        const j = jewel(mats, jr)
        j.position.set(0, jy, L.Z.cageBar.z1 - zp - 0.6)
        group.add(j)
      }
      const upperBar = box(6, 15.2, 1.8, mats.steel, 0, 26.6, 27.1 - zp)
      group.add(upperBar)
      const jU = jewel(mats, 2.1)
      jU.position.set(0, 25.6, 25.85 - zp)
      group.add(jU)
      // hairspring stud pillar (the spring's outer end is pinned here)
      group.add(cyl(1.5, 5, mats.steel, 18.8, 0, (L.Z.hairspring.z0 + L.Z.hairspring.z1) / 2 - zp))
      group.add(box(3.4, 3.4, 3, mats.steel, 18.8, 0, L.Z.hairspring.z1 - zp + 1))
      // regulator index over the hairspring, with curb pins straddling the
      // outer coil
      const regulator = new THREE.Group()
      regulator.add(box(14.5, 2.4, 1.2, mats.blued, 11, 0, 0))
      regulator.add(cyl(0.55, 3, mats.blued, 18, 0.9, -1.4))
      regulator.add(cyl(0.55, 3, mats.blued, 18, -0.9, -1.4))
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
      const zp = 20.95
      group.add(mesh(escapeWheelGeometry(12, 1.5), mats.steel))
      const pin = gearOf(L.escPinion, mats.steel, { spokes: 0, rimW: 0.9, holeR: 0.7 })
      pin.position.z = tierZ(L.escPinion, zp)
      group.add(pin)
      group.add(cyl(1, 11.8, mats.steel, 0, 0, 0.15)) // pivots: cage jewels below + above
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
      group.add(cyl(1.2, 18.2, mats.steel, 0, 0, -1.9)) // staff, down into the cage bar jewel
      group.add(cyl(5.2, 1.5, mats.steel, 0, 0, L.Z.roller - 30))
      group.add(cyl(0.9, 3.2, mats.ruby, 0, -5.2, L.Z.roller - 30))
      // Breathing hairspring: the OUTER end stays pinned to the carriage
      // stud while the INNER end follows the staff through ±300°. The coil
      // is precomputed at 0.15 rad steps of inner-end angle; the container
      // counter-rotates the balance so the whole child lives in the
      // carriage frame, exactly like the real spring.
      const springZ = (L.Z.hairspring.z0 + L.Z.hairspring.z1) / 2 - 30
      const springBox = new THREE.Group()
      springBox.position.z = springZ
      const OUTER_END = 5.5 * TAU // outer terminal: local +x, at the stud
      const DELTA_STEP = 0.15
      const DELTA_MAX = 5.6
      const variants: THREE.Mesh[] = []
      for (let dlt = -DELTA_MAX; dlt <= DELTA_MAX + 1e-9; dlt += DELTA_STEP) {
        const turns = (OUTER_END - dlt) / TAU
        const v = mesh(spiralTube(3, 18, turns, 0.45, dlt, 260), mats.blued)
        v.visible = false
        variants.push(v)
        springBox.add(v)
      }
      group.add(springBox)
      const collet = cyl(2.2, 1.6, mats.blued, 0, 0, springZ)
      group.add(collet)
      let lastVisible: THREE.Mesh | null = null
      return {
        group,
        update: (m) => {
          // container is carriage-fixed: cancel the balance rotation
          springBox.rotation.z = m.esc.theta
          const delta = Math.max(-DELTA_MAX, Math.min(DELTA_MAX, -m.esc.theta))
          const idx = Math.round((delta + DELTA_MAX) / DELTA_STEP)
          const v = variants[Math.max(0, Math.min(variants.length - 1, idx))]
          if (v !== lastVisible) {
            if (lastVisible) lastVisible.visible = false
            v.visible = true
            lastVisible = v
          }
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
      return buildRack(group, mats, mv, () => mv.repeater.hourRack, L.RACK_GEO.hour, 12, 6 * DEG,
        GEO.hourStar, HOUR_SNAIL_R0, HOUR_SNAIL_DR, 'hour', 26.1)
    case 'quarterRack':
      return buildRack(group, mats, mv, () => mv.repeater.quarterRack, L.RACK_GEO.quarter, 3, 8 * DEG,
        GEO.center, QUARTER_SNAIL_R0, QUARTER_SNAIL_DR, 'quarter', 30.1)
    case 'minuteRack':
      return buildRack(group, mats, mv, () => mv.repeater.minuteRack, L.RACK_GEO.minute, 14, 4.5 * DEG,
        GEO.center, MINUTE_SNAIL_R0, MINUTE_SNAIL_DR, 'minute', 33.1)
    case 'strikeTrain': {
      const zp = 28
      // strike wheel with the gathering pallet, tooth-phased to its chain
      const sw = new THREE.Group()
      sw.add(gearOf(L.strikeWheel, mats.steelBrushed, { spokes: 3 }))
      // gathering pallet staff: one pallet per rack tier (hour / quarter /
      // minute), angularly staggered like a real stacked-rack repeater
      const tiers: Array<[{ z0: number; z1: number }, number]> = [
        [L.RACK_GEO.hour, 0],
        [L.RACK_GEO.quarter, 2.1],
        [L.RACK_GEO.minute, 4.2],
      ]
      for (const [tier, az] of tiers) {
        const fingerG = new THREE.Group()
        fingerG.add(box(L.GATHER_R - 0.8, 3, tier.z1 - tier.z0 - 0.2, mats.blued, (L.GATHER_R - 0.8) / 2, 0, 0))
        fingerG.add(cyl(1.6, tier.z1 - tier.z0 - 0.2, mats.blued, L.GATHER_R - 0.6, 0, 0))
        fingerG.position.z = (tier.z0 + tier.z1) / 2 - zp
        fingerG.rotation.z = az
        sw.add(fingerG)
      }
      // staff runs from the plate jewel up into the strike bridge
      sw.add(cyl(2, L.STRIKE_BRIDGE.z0 + 0.6 - L.Z.plate.z1, mats.steel, 0, 0, (L.STRIKE_BRIDGE.z0 + 0.6 + L.Z.plate.z1) / 2 - zp))
      group.add(sw)
      // intermediate two-tier wheel toward the governor
      const inter = new THREE.Group()
      inter.add(gearOf(L.strikeInterPinion, mats.steel, { spokes: 0, rimW: 2.4, holeR: 1.4 }))
      const iw = gearOf(L.strikeInterWheel, mats.steelBrushed, { spokes: 0, rimW: 4, holeR: 1.8 })
      iw.position.z = (L.strikeInterWheel.z0 + L.strikeInterWheel.z1) / 2 - (L.strikeInterPinion.z0 + L.strikeInterPinion.z1) / 2
      inter.add(iw)
      inter.add(cyl(1.6, L.STRIKE_BRIDGE.z0 + 0.6 - L.Z.plate.z1, mats.steel, 0, 0, (L.STRIKE_BRIDGE.z0 + 0.6 + L.Z.plate.z1) / 2 - (L.strikeInterPinion.z0 + L.strikeInterPinion.z1) / 2))
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
      // arbor from the plate jewel up into the strike bridge
      group.add(cyl(1.3, L.STRIKE_BRIDGE.z0 + 0.6 - L.Z.plate.z1, mats.steel, 0, 0, (L.STRIKE_BRIDGE.z0 + 0.6 + L.Z.plate.z1) / 2 - 30.9))
      for (const s of [-1, 1]) {
        const vane = box(12, 5.5, 0.7, mats.steelBrushed, s * 7.5, 0, -7.4)
        vane.rotation.x = s * 0.35
        group.add(vane)
      }
      break
    }
    case 'allOrNothing': {
      // Anchor = hook pivot (layout.AON_PIVOT). The slide's pin travels the
      // line x = SLIDE_PIN.x; the hook's notch face sits at the pin's
      // position at EXACTLY the latch travel — drawn geometry and the
      // core's interlock threshold are the same number, asserted in layout.
      const notchLocal = {
        x: L.SLIDE_PIN.x - L.AON_PIVOT.x, // -16
        y: -(L.AON_NOTCH_Y - L.AON_PIVOT.y), // three local (y flip)
      }
      group.add(cyl(2.4, 6.5, mats.steel, 0, 0, -3.25)) // pivot stud into the plate
      group.add(cyl(3.4, 2.6, mats.steel, 0, 0, 0))
      const hook = new THREE.Group()
      // arm out to the pin line
      const hookAz = Math.atan2(notchLocal.y, notchLocal.x)
      const hookLen = Math.hypot(notchLocal.x, notchLocal.y)
      const armGeo = new THREE.BoxGeometry(hookLen, 4.2, 2.6)
      armGeo.translate(hookLen / 2, 0, 0)
      const hookArm = mesh(armGeo, mats.steelBrushed)
      hookArm.rotation.z = hookAz
      hook.add(hookArm)
      // the notch: two teeth forming the catch the pin drops behind
      const notch = new THREE.Group()
      notch.add(box(3, 5.5, 2.6, mats.blued, 0, 2.2, 0))
      notch.add(box(5.5, 2.4, 2.6, mats.blued, -1.2, -1.4, 0))
      notch.position.set(notchLocal.x, notchLocal.y, 0)
      hook.add(notch)
      group.add(hook)
      // hook spring: presses the hook toward the pin path
      group.add(mesh(spiralTube(3.4, 10, 0.9, 0.65, hookAz + 2.6, 50), mats.blued))
      return {
        group,
        update: (m) => {
          // hook held clear until the pin arrives at the notch; snaps over
          // it at the latch point, lifts again when the strike releases
          const target = m.repeater.latched ? 0 : 0.3
          hook.rotation.z += (target - hook.rotation.z) * 0.3
        },
      }
    }
    case 'hammerLow':
    case 'hammerHigh': {
      const isLow = id === 'hammerLow'
      const hg = isLow ? L.HAMMER_LOW : L.HAMMER_HIGH
      const zp = hg.z
      const mat = isLow ? mats.steel : mats.gold
      const arm = new THREE.Group()
      // arm out to the striking face (dog-legged through the elbow when
      // the straight line would cross a rack) — three local: flip y
      const armT = isLow ? L.HAMMER_LOW_ARM_T : L.HAMMER_HIGH_ARM_T
      const pts = [hg.pivot, ...(hg.elbow ? [hg.elbow] : []), hg.headTip]
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = { x: pts[i].x - hg.pivot.x, y: -(pts[i].y - hg.pivot.y) }
        const b = { x: pts[i + 1].x - hg.pivot.x, y: -(pts[i + 1].y - hg.pivot.y) }
        const legLen = Math.hypot(b.x - a.x, b.y - a.y) - (i + 2 === pts.length ? 4 : 0)
        const legGeo = new THREE.BoxGeometry(legLen + 1, 3.2, armT)
        legGeo.translate((legLen + 1) / 2 - 0.5, 0, 0)
        const leg = mesh(legGeo, mat, a.x, a.y, 0)
        leg.rotation.z = Math.atan2(b.y - a.y, b.x - a.x)
        arm.add(leg)
      }
      // head: striking face AT the layout contact point (rest gap included)
      const headAz3 = -hg.headAz
      const head = mesh(new THREE.BoxGeometry(7, 9, 3.2), mat)
      head.position.set(
        hg.headTip.x - hg.pivot.x - Math.cos(headAz3) * 3.5,
        -(hg.headTip.y - hg.pivot.y) - Math.sin(headAz3) * 3.5,
        0,
      )
      head.rotation.z = headAz3
      arm.add(head)
      // tail: TALL lifting pallet reaching into the racks' tooth paths at
      // the gathering staff — this is what the returning rack teeth lift
      const tailAz = Math.atan2(-Math.sin(hg.tailAzimuth), Math.cos(hg.tailAzimuth))
      const bladeZ = isLow ? -1.5 : -1.6 // blade ducks under its racks' tiers
      const tailGeo = new THREE.BoxGeometry(hg.tailLen - 3, 3, 2.2)
      tailGeo.translate((hg.tailLen - 3) / 2, 0, 0)
      const tail = mesh(tailGeo, mat, 0, 0, bladeZ)
      tail.rotation.z = tailAz
      arm.add(tail)
      const palletH = hg.tailZ1 - hg.tailZ0
      const pallet = mesh(
        new THREE.BoxGeometry(3, 4.2, palletH),
        mats.blued,
        Math.cos(tailAz) * hg.tailLen,
        Math.sin(tailAz) * hg.tailLen,
        (hg.tailZ0 + hg.tailZ1) / 2 - zp,
      )
      arm.add(pallet)
      group.add(arm)
      const hubZ0 = isLow ? zp - 2.8 : 33.5
      group.add(cyl(2.4, zp + 2.8 - hubZ0, mats.steel, 0, 0, (hubZ0 + zp + 2.8) / 2 - zp))
      group.add(cyl(2, hubZ0 - L.Z.plate.z1, mats.steel, 0, 0, (L.Z.plate.z1 + hubZ0) / 2 - zp)) // stud
      // hammer return spring
      const hs = mesh(spiralTube(3, 9, 0.8, 0.6, tailAz + 2.2, 50), mats.blued)
      group.add(hs)
      return {
        group,
        update: (m, fx) => {
          // geometric lift: the hammer cocks as the gathering approaches its
          // next strike (rack tooth riding the pallet), drops at the strike
          const d = m.repeater.phaseToNextStrike(isLow ? 'low' : 'high')
          const LIFT_SPAN = 0.55 * TAU
          const lift = Number.isFinite(d) && d < LIFT_SPAN ? 1 - d / LIFT_SPAN : 0
          const flash = isLow ? fx.hammerFlash.low : fx.hammerFlash.high
          // cocks away from the gong (three rot = -watch); the flash closes
          // the rest gap into the coil for one frame
          arm.rotation.z = -(lift * L.HAMMER_SWING) + flash * 0.014
        },
      }
    }
    case 'gongLow':
    case 'gongHigh': {
      const isLow = id === 'gongLow'
      const base = isLow ? mats.gongSteel : mats.gongGold
      const gm = base.clone()
      const spec = isLow ? L.GONG_LOW : L.GONG_HIGH
      // exactly the audited spiral: watch a0 -> three a0 is negated, and
      // the coil advances clockwise (negative three turns)
      group.add(mesh(spiralTube(spec.rStart, spec.rStart - spec.drop, -spec.turns, spec.tubeR, -spec.a0, 420), gm))
      if (isLow) {
        // the shared gong block on the plate, radially outside every inner
        // coil pass; both gongs' feet are brazed into it
        const midAz = (L.GONG_BLOCK.a0 + L.GONG_BLOCK.a1) / 2
        const rMid = (L.GONG_BLOCK.rIn + L.GONG_BLOCK.rOut) / 2
        const block = box(
          L.GONG_BLOCK.rOut - L.GONG_BLOCK.rIn,
          rMid * (L.GONG_BLOCK.a1 - L.GONG_BLOCK.a0),
          L.GONG_BLOCK.z1 - L.GONG_BLOCK.z0,
          mats.steelBrushed,
          Math.cos(midAz) * rMid,
          -Math.sin(midAz) * rMid,
          (L.GONG_BLOCK.z0 + L.GONG_BLOCK.z1) / 2 - spec.z,
        )
        block.rotation.z = -midAz
        group.add(block)
        const bs = screw(mats, 2.6)
        bs.position.set(Math.cos(midAz) * rMid, -Math.sin(midAz) * rMid, L.GONG_BLOCK.z1 - spec.z + 0.5)
        group.add(bs)
        // anchor post down to the plate, outside the outermost coil
        group.add(cyl(2.2, L.GONG_BLOCK.z0 - L.Z.plate.z1, mats.steelBrushed, Math.cos(midAz) * 160, -Math.sin(midAz) * 160, (L.GONG_BLOCK.z0 + L.Z.plate.z1) / 2 - spec.z))
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
      // dial feet down into their plate bores, outside the gong coils
      for (const az of [45, 135, 225, 315]) {
        const a = (az * Math.PI) / 180
        group.add(cyl(1.6, 20.5, mats.brass, Math.cos(a) * 160, Math.sin(a) * 160, -11.25))
      }
      break
    }
    case 'hourHand': {
      // hub sleeve pressed onto the hour-wheel pipe; the blade's centre
      // hole clears the pipes continuing up to the minute hand
      group.add(mesh(lathe([[7.7, -1.4], [10, -1.2], [10, 1], [7.7, 1.2], [7.7, -1.4]]), mats.blued))
      group.add(mesh(handGeometry(88, 7, 1.3, 7.8), mats.blued, 0, 0, 0.5))
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
      // case tube the stem passes through, on the stem axis
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
      // the lever arm reaching over the plate rim to the all-or-nothing
      // piece — it passes UNDER the gong coils (z audited)
      group.add(box(52, 6, 2.5, mats.steelBrushed, 30, -5, -1.25))
      group.add(cyl(2.2, 4.7, mats.steel, 56, -8, 0.35)) // latch pin, into the hook plane
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
 * Bridge/cock from its audited layout spec: outline plate with every bore,
 * feet to the plate, fixing screws. side 0 = movement back (screw heads
 * face the caseback), side 1 = dial side (heads face the dial).
 */
function buildBridge(
  group: THREE.Group,
  mats: Materials,
  spec: L.BridgeSpec,
  anchor: { x: number; y: number },
  side: 0 | 1,
): void {
  const zPos = (spec.z0 + spec.z1) / 2
  const pts: Array<[number, number]> = spec.outline.map(([x, y]) => [x - anchor.x, -(y - anchor.y)])
  const holes = spec.holes.map((h) => ({ x: h.x - anchor.x, y: -(h.y - anchor.y), r: h.r }))
  group.add(mesh(plateGeometry(pts, spec.z1 - spec.z0, holes), mats.plate))
  for (const f of spec.feet) {
    const fx = f.x - anchor.x
    const fy = -(f.y - anchor.y)
    const [fz0, fz1] = spec.footZ
    group.add(cyl(3, fz1 - fz0, mats.plate, fx, fy, (fz0 + fz1) / 2 - zPos, 20))
    const sc = screw(mats, 2.9)
    if (side === 0) {
      sc.position.set(fx, fy, spec.z0 - zPos - 0.5)
      sc.rotation.y = Math.PI
    } else {
      sc.position.set(fx, fy, spec.z1 - zPos + 0.5)
    }
    group.add(sc)
  }
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
  geo: L.RackGeo,
  teeth: number,
  pitch: number,
  snailC: { x: number; y: number },
  r0: number,
  dr: number,
  which: keyof typeof CONTACT,
  zPos: number,
): Built {
  const r = geo.sectorR
  const pivot = geo.pivot
  const armAngleWatch = geo.armAngle
  const sector = mesh(rackSectorGeometry(r, teeth, pitch, geo.z1 - geo.z0), mats.steelBrushed)
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
