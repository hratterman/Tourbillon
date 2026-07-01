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
 * Per-part solid construction. Local frames use three.js conventions
 * (x right, y up, z toward the crystal). The mechanism's watch-plane
 * coordinates are y-down, so internal offsets flip y and angles negate;
 * the scene applies the same convention to whole-part transforms.
 */

export interface Fx {
  hammerFlash: { low: number; high: number }
  gongGlow: { low: number; high: number }
}

export interface Built {
  group: THREE.Group
  update?: (mv: Movement, fx: Fx) => void
}

const W = (x: number, yWatch: number): [number, number] => [x, -yWatch]

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

/** Gold chaton with a ruby jewel — the classic bearing. */
function jewel(mats: Materials, r = 4.2): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(r, 1.6, mats.gold))
  g.add(cyl(r * 0.55, 1.9, mats.ruby))
  return g
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z)
}

export function buildPartObject(id: string, mats: Materials, mv: Movement): Built {
  const group = new THREE.Group()
  group.name = id
  switch (id) {
    // ------------------------------------------------------------ case back
    case 'caseback': {
      // steel ring with a sapphire exhibition window
      const ringShape = new THREE.Shape()
      ringShape.absarc(0, 0, 190, 0, TAU, false)
      const ringHole = new THREE.Path()
      ringHole.absarc(0, 0, 148, 0, TAU, true)
      ringShape.holes.push(ringHole)
      const ring = new THREE.ExtrudeGeometry(ringShape, { depth: 7, bevelEnabled: false })
      ring.translate(0, 0, -7)
      group.add(mesh(ring, mats.caseSteel))
      // engraved flat face
      const faceShape = new THREE.Shape()
      faceShape.absarc(0, 0, 189, 0, TAU, false)
      const faceHole = new THREE.Path()
      faceHole.absarc(0, 0, 149, 0, TAU, true)
      faceShape.holes.push(faceHole)
      const face = new THREE.ShapeGeometry(faceShape, 64)
      remapPlanarUVs(face, 190)
      // engraving faces OUT of the case back; the Y-flip alone already
      // presents the canvas unmirrored to a viewer behind the watch
      face.rotateY(Math.PI)
      const faceMat = mats.casebackFace.clone()
      faceMat.map = casebackTexture()
      group.add(mesh(face, faceMat, 0, 0, -7.15))
      // sapphire window
      group.add(cyl(149, 1.6, mats.sapphire, 0, 0, -2, 64))
      // outer lip
      group.add(mesh(lathe([[190, -7], [196, -5], [197, 0], [193, 1.5], [190, 0.5]]), mats.caseSteel))
      break
    }
    case 'slideSpring': {
      // the long blade spring that returns the repeater slide
      const s = new THREE.Shape()
      s.moveTo(-20, -3)
      s.quadraticCurveTo(0, 6, 22, -1)
      s.lineTo(22, -4)
      s.quadraticCurveTo(0, 2, -20, -6)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false })
      group.add(mesh(g, mats.steelBrushed))
      group.add(cyl(2.4, 4, mats.steel, -20, 4, 1))
      break
    }
    // ----------------------------------------------------------- train side
    case 'trainBridge': {
      // sampled from the 2-D silhouette, y flipped; bores at the arbors
      const pts: Array<[number, number]> = []
      const q = (p0: [number, number], c: [number, number], p1: [number, number], n = 10) => {
        for (let i = 1; i <= n; i++) {
          const t = i / n
          const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0]
          const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]
          pts.push([x, y])
        }
      }
      pts.push(W(-120, -66))
      q(W(-120, -66), W(-30, -110), W(60, -74))
      q(W(60, -74), W(96, -58), W(92, -18))
      pts.push(W(30, 6))
      q(W(30, 6), W(-40, 26), W(-96, -6))
      const holes = [
        { x: -52, y: 36, r: 2.4 },
        { x: 10, y: 20, r: 2.4 },
        { x: 66, y: -22, r: 2.4 },
      ]
      group.add(mesh(plateGeometry(pts, 5, holes), mats.plate))
      for (const h of holes) {
        const j = jewel(mats)
        j.position.set(h.x, h.y, 2.8)
        group.add(j)
      }
      break
    }
    case 'tourbillonBridge': {
      // flying-style lower cock reaching in from the movement edge
      const pts: Array<[number, number]> = [
        [-14, -60], [14, -60], [18, -30], [10, 12], [4, 16], [-4, 16], [-10, 12], [-18, -30],
      ]
      const plate = plateGeometry(pts, 5, [{ x: 0, y: 0, r: 2.6 }])
      const m = mesh(plate, mats.plate)
      // reaches from below the carriage toward the movement edge (6 o'clock)
      m.position.set(0, -34, 0)
      group.add(m)
      const j = jewel(mats, 5)
      j.position.set(0, 0, 2.8)
      group.add(j)
      break
    }
    case 'mainplate': {
      const outline: Array<[number, number]> = []
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU
        outline.push([Math.cos(a) * 162, Math.sin(a) * 162])
      }
      const holes = [
        { x: 0, y: -88, r: 51 }, // tourbillon well
        { x: 0, y: 0, r: 7 }, // centre arbor
        { x: -62, y: 56, r: 4 }, // barrel arbor
        { x: 56, y: -42, r: 3.4 }, // third arbor
        { x: -56, y: 34, r: 3 }, // hour-star stud
        { x: -14, y: 88, r: 3 }, // strike-train arbor
        { x: -62, y: 112, r: 3 }, // governor arbor
      ]
      group.add(mesh(plateGeometry(outline, 4.5, holes), mats.plate))
      // slotted screws + a couple of jewel bearings dress the plate
      for (const [sx, sy] of [[-130, 80], [130, 78], [-96, -108], [96, -110], [10, 148]] as const) {
        const screw = new THREE.Group()
        screw.add(cyl(4, 1.6, mats.steel, 0, 0, 2.6))
        screw.add(box(6.4, 1.1, 0.7, mats.steelDark, 0, 0, 3.4))
        screw.rotation.z = (sx * 7919 + sy) % 6.28
        screw.position.set(sx, sy, 0)
        group.add(screw)
      }
      for (const [jx, jy] of [[-35, -16], [-56, 34], [-14, 88], [-62, 112]] as const) {
        const j = jewel(mats, 3.4)
        j.position.set(jx, jy, 2.6)
        group.add(j)
      }
      break
    }
    case 'barrel': {
      const r = GEO.barrel.r
      // drum wall + floor (open top so the coil shows)
      group.add(mesh(lathe([[r - 3, -5], [r, -5], [r, 5], [r - 3, 5], [r - 3, -5]]), mats.brassBrushed))
      group.add(cyl(r - 2.4, 1.2, mats.brassBrushed, 0, 0, -4.4, 48))
      // toothed rim
      group.add(mesh(gearGeometry(r + 1, 84, { thickness: 2.6, toothH: 2.6, spokes: 0, rimW: 4, holeR: r - 4 }), mats.brass, 0, 0, -3.4))
      // arbor
      group.add(cyl(4.5, 13, mats.steel))
      // ratchet wheel on the arbor, riding over the barrel bridge — the
      // classic exhibition-back centrepiece. It turns only when winding.
      const ratchet = new THREE.Group()
      ratchet.add(mesh(gearGeometry(27, 60, { thickness: 2, toothH: 2, spokes: 0, rimW: 20, holeR: 3 }), mats.brass))
      ratchet.add(cyl(5.5, 2.6, mats.steel))
      ratchet.add(box(9, 1.4, 0.8, mats.steelDark, 0, 0, 1.6))
      ratchet.position.z = -11.5
      group.add(ratchet)
      // mainspring coil variants, swapped by wind level
      const coils = new THREE.Group()
      for (let i = 0; i <= 5; i++) {
        const w = i / 5
        const coil = mesh(spiralTube(6.5, r - 5, 4.5 + 3.5 * w, 1.15, w * 2), mats.steelDark)
        coil.visible = i === 4
        coils.add(coil)
      }
      group.add(coils)
      return {
        group,
        update: (m) => {
          const idx = Math.round(m.mainspring.windFraction * 5)
          coils.children.forEach((c, i) => (c.visible = i === idx))
          // arbor-mounted: cancel the drum rotation, follow the wind state
          ratchet.rotation.z = -m.train.barrelAngle - m.mainspring.turns * TAU
        },
      }
    }
    case 'centerWheel': {
      group.add(mesh(gearGeometry(40, 80, { thickness: 2.4, spokes: 5 }), mats.brass))
      group.add(mesh(gearGeometry(6, 12, { thickness: 5, spokes: 0, toothH: 1.6, rimW: 2, holeR: 1.4 }), mats.steel, 0, 0, -4))
      group.add(cyl(1.8, 16, mats.steel))
      break
    }
    case 'thirdWheel': {
      group.add(mesh(gearGeometry(GEO.third.r, 75, { thickness: 2.2, spokes: 4 }), mats.brass))
      group.add(mesh(gearGeometry(5, 10, { thickness: 4.5, spokes: 0, toothH: 1.5, rimW: 2, holeR: 1.2 }), mats.steel, 0, 0, -3.6))
      break
    }
    case 'fixedFourth': {
      group.add(mesh(gearGeometry(24, 120, { thickness: 2, toothH: 1.2, spokes: 0, rimW: 5, holeR: 6.5 }), mats.steelBrushed))
      break
    }
    case 'carriage': {
      // rotating cage: lower ring, three curved pillars, upper hub
      const ring = new THREE.TorusGeometry(GEO.carriage.r, 2.2, 12, 72)
      group.add(mesh(ring, mats.steel, 0, 0, -8))
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5
        const p0 = new THREE.Vector3(Math.cos(a) * GEO.carriage.r, Math.sin(a) * GEO.carriage.r, -8)
        const p1 = new THREE.Vector3(Math.cos(a) * 34, Math.sin(a) * 34, 8)
        const p2 = new THREE.Vector3(Math.cos(a) * 11, Math.sin(a) * 11, 13)
        const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2)
        group.add(mesh(new THREE.TubeGeometry(curve, 24, 2.1, 10), mats.steel))
      }
      group.add(mesh(new THREE.TorusGeometry(10, 1.8, 10, 40), mats.steel, 0, 0, 13))
      // seconds marker blade on the lower ring
      const blade = box(10, 3.4, 1.8, mats.blued, GEO.carriage.r + 6, 0, -8)
      group.add(blade)
      break
    }
    case 'escapeWheel': {
      group.add(mesh(escapeWheelGeometry(12, 1.4), mats.steel))
      group.add(mesh(gearGeometry(3.2, 8, { thickness: 3, spokes: 0, toothH: 1.1, rimW: 1.4, holeR: 0.8 }), mats.steel, 0, 0, -5.5))
      group.add(cyl(1, 12, mats.steel))
      break
    }
    case 'palletFork': {
      const lever = new THREE.Group()
      // body: toward the balance is local -y (watch +y), escape wheel +y
      lever.add(box(2.6, 15, 2, mats.steel, 0, 0, 0))
      // horns at the balance end
      lever.add(box(1.4, 5, 2, mats.steel, -2.4, -8.5, 0))
      lever.add(box(1.4, 5, 2, mats.steel, 2.4, -8.5, 0))
      // pallet jewels at the escape end
      const pe = box(1.6, 4.6, 2.4, mats.ruby, -3.4, 6.4, 0)
      pe.rotation.z = 0.5
      const px = box(1.6, 4.6, 2.4, mats.ruby, 3.4, 6.4, 0)
      px.rotation.z = -0.5
      lever.add(pe, px)
      // guard pin
      lever.add(cyl(0.5, 4, mats.steel, 0, -9.5, 0))
      group.add(lever)
      group.add(cyl(1.2, 7, mats.steel))
      return {
        group,
        update: (m) => {
          const e = m.esc
          const p2 = e.theta - BEAT_OFFSET
          const bank = 9 * DEG
          const leverAngle =
            e.phase === PHASE_LOCKED
              ? e.forkSide * bank
              : Math.max(-1, Math.min(1, p2 / HALF_WINDOW)) * bank
          lever.rotation.z = -leverAngle
        },
      }
    }
    case 'balance': {
      const rim = new THREE.TorusGeometry(27, 2.5, 12, 64)
      const rimMesh = mesh(rim, mats.gold)
      rimMesh.scale.z = 0.72
      group.add(rimMesh)
      group.add(box(52, 3, 1.8, mats.gold))
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2
        group.add(cyl(1.5, 2.4, mats.gold, Math.cos(a) * 27, Math.sin(a) * 27, 0))
      }
      group.add(cyl(1.2, 14, mats.steel)) // staff
      // roller + impulse pin (watch-local (0, +5.2) -> three (0, -5.2))
      group.add(cyl(5.2, 1.5, mats.steel, 0, 0, -3.5))
      group.add(cyl(0.9, 3.2, mats.ruby, 0, -5.2, -3.5))
      const spring = mesh(spiralTube(3, 20, 5.5, 0.45, 0, 300), mats.blued)
      spring.position.z = 4.5
      group.add(spring)
      const collet = cyl(2.2, 1.6, mats.blued, 0, 0, 4.5)
      group.add(collet)
      return {
        group,
        update: (m) => {
          // outer end pinned to the carriage, inner collet on the staff:
          // the coil only partially follows the balance
          spring.rotation.z = 0.85 * m.esc.theta
        },
      }
    }
    // ------------------------------------------------------------ dial side
    case 'motionWorks': {
      group.add(mesh(gearGeometry(17, 36, { thickness: 2, spokes: 3 }), mats.steelBrushed))
      group.add(cyl(3.4, 8, mats.steel, 0, 0, 4))
      break
    }
    case 'hourStar': {
      group.add(mesh(starGeometry(17, 12, 1.8), mats.steelBrushed))
      group.add(cyl(3, 4, mats.steel))
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
      group.add(cyl(2.2, 3, mats.steel))
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
      break
    case 'quarterSnail':
      group.add(mesh(snailCamGeometry(QUARTER_SNAIL_R0, QUARTER_SNAIL_DR, 4, 1, 0, 2.6), mats.brassBrushed))
      break
    case 'minuteSnail':
      group.add(mesh(snailCamGeometry(MINUTE_SNAIL_R0, MINUTE_SNAIL_DR, 15, 4, 0, 2.4), mats.brass))
      break
    case 'hourRack':
      return buildRack(group, mats, mv, () => mv.repeater.hourRack, 42, 12, 6 * DEG, 0.55, GEO.hourRackPivot, GEO.hourStar, HOUR_SNAIL_R0, HOUR_SNAIL_DR, 'hour')
    case 'quarterRack':
      return buildRack(group, mats, mv, () => mv.repeater.quarterRack, 34, 3, 8 * DEG, 3.4, GEO.quarterRackPivot, GEO.center, QUARTER_SNAIL_R0, QUARTER_SNAIL_DR, 'quarter')
    case 'minuteRack':
      return buildRack(group, mats, mv, () => mv.repeater.minuteRack, 34, 14, 4.5 * DEG, 4.35, GEO.minuteRackPivot, GEO.center, MINUTE_SNAIL_R0, MINUTE_SNAIL_DR, 'minute')
    case 'strikeTrain': {
      group.add(mesh(gearGeometry(16, 40, { thickness: 2.2, spokes: 3 }), mats.steelBrushed))
      // gathering pallet finger
      const finger = box(18, 3, 2, mats.blued, 9, 0, 2.6)
      group.add(finger)
      group.add(cyl(1.6, 8, mats.steel))
      break
    }
    case 'flyGovernor': {
      group.add(cyl(1.4, 10, mats.steel))
      for (const s of [-1, 1]) {
        const vane = box(13, 5.5, 0.7, mats.steelBrushed, s * 8, 0, 0)
        vane.rotation.x = s * 0.5
        group.add(vane)
      }
      group.add(cyl(3, 1.6, mats.steel, 0, 0, -4))
      break
    }
    case 'allOrNothing': {
      group.add(box(24, 9, 3, mats.steelBrushed))
      const latch = box(3, 14, 2.4, mats.blued, 8, 0, 2.6)
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
      arm.add(box(15, 3.2, 2.6, isLow ? mats.steel : mats.gold, 7.5, 0, 0))
      const head = mesh(new THREE.BoxGeometry(7, 9, 5), isLow ? mats.steel : mats.gold, 16, 0, 0)
      arm.add(head)
      group.add(arm)
      group.add(cyl(2.6, 6, mats.steel))
      return {
        group,
        update: (_m, fx) => {
          const flash = isLow ? fx.hammerFlash.low : fx.hammerFlash.high
          arm.rotation.z = (1 - flash) * 0.42 // cocked; snaps to 0 on strike
        },
      }
    }
    case 'gongLow':
    case 'gongHigh': {
      const isLow = id === 'gongLow'
      const base = isLow ? mats.gongSteel : mats.gongGold
      const gm = base.clone()
      const rStart = isLow ? 156 : 149
      const a0 = -(isLow ? -0.12 : 0.18) // watch angle -> three angle
      const tube = mesh(spiralTube(rStart, rStart - 17, -1.9, 1.6, a0, 420), gm)
      group.add(tube)
      // foot block where the gong is brazed to its stud
      const foot = box(8, 12, 8, mats.steelBrushed, Math.cos(a0) * rStart, Math.sin(a0) * rStart, 0)
      group.add(foot)
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
      const hole = new THREE.Path()
      hole.absarc(0, -GEO.carriage.y, GEO.apertureR, 0, TAU, true)
      s.holes.push(hole)
      const g = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false })
      remapPlanarUVs(g, GEO.dialR)
      const dm = mats.dial.clone()
      dm.map = dialTexture()
      group.add(mesh(g, dm))
      // polished ring around the aperture
      const ring = mesh(new THREE.TorusGeometry(GEO.apertureR + 1.2, 1.4, 8, 64), mats.gold, 0, -GEO.carriage.y, 2)
      group.add(ring)
      break
    }
    case 'hourHand': {
      group.add(mesh(handGeometry(88, 7, 1.4), mats.blued, 0, 0, 0))
      group.add(cyl(5.6, 2.6, mats.blued, 0, 0, 0.2))
      break
    }
    case 'minuteHand': {
      group.add(mesh(handGeometry(132, 5.6, 1.2), mats.blued))
      group.add(cyl(4.2, 2.4, mats.blued, 0, 0, 0.2))
      group.add(cyl(2.2, 3.4, mats.gold, 0, 0, 0.6))
      break
    }
    // ----------------------------------------------------------------- case
    case 'caseband': {
      group.add(
        mesh(
          lathe([
            [178, -36], [206, -32], [216, -16], [219, 4], [216, 26], [206, 38], [178, 42],
            [176, 38], [176, -32], [178, -36],
          ]),
          mats.caseSteel,
        ),
      )
      // lugs
      for (const sy of [-1, 1])
        for (const sx of [-1, 1]) {
          const lug = box(24, 36, 12, mats.caseSteel, sx * 38, sy * 210, -14)
          lug.rotation.z = -sx * sy * 0.12
          group.add(lug)
        }
      break
    }
    case 'crown': {
      const inner = new THREE.Group()
      // knurled crown: a fine-toothed extrusion along its stem (x axis)
      const knurl = gearGeometry(15, 26, { thickness: 12, toothH: 1.6, spokes: 0, rimW: 6, holeR: 2 })
      knurl.rotateY(Math.PI / 2)
      inner.add(mesh(knurl, mats.caseSteel, 6, 0, 0))
      const cap = lathe([[0, 0], [13, 0], [15.5, 3], [15.5, 5], [12, 7], [0, 7]])
      cap.rotateY(Math.PI / 2)
      inner.add(mesh(cap, mats.caseSteel, 12, 0, 0))
      inner.add(cyl(3.2, 1, mats.gold, 12.5, 0, 0)) // decorated cap centre (visual)
      const stem = new THREE.CylinderGeometry(2.6, 2.6, 16, 16)
      stem.rotateZ(Math.PI / 2)
      inner.add(mesh(stem, mats.steel, -8, 0, 0))
      group.add(inner)
      return {
        group,
        update: (m) => {
          inner.position.x = m.crownPulled ? 12 : 0
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
      break
    }
    case 'bezelCrystal': {
      group.add(
        mesh(lathe([[164, -2], [180, 0], [187, 6], [184, 13], [172, 15], [164, 10], [164, -2]]), mats.caseSteel),
      )
      // domed sapphire: spherical cap
      const R = 1126
      const a0 = Math.asin(164 / R)
      const prof: Array<[number, number]> = []
      for (let i = 0; i <= 14; i++) {
        const t = i / 14
        const a = a0 * (1 - t)
        prof.push([R * Math.sin(a), 4 + R * (Math.cos(a) - Math.cos(a0))])
      }
      group.add(mesh(lathe(prof, 96), mats.sapphire))
      break
    }
    default:
      // safety net: never render an invisible mystery part
      group.add(cyl(6, 2, mats.steelDark))
  }
  return { group }
}

/**
 * Rack assembly: pivot hub, toothed sector, and the articulated tail whose
 * beak tip rides the snail profile — the identical radius law the core
 * uses to count teeth (R = R0 - fall/pitch · DR), so the beak visibly
 * lands on the correct drawn step.
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
): Built {
  const sector = mesh(rackSectorGeometry(r, teeth, pitch, 2.2), mats.steelBrushed)
  sector.rotation.z = -armAngleWatch
  group.add(sector)
  // arm connecting the pivot hub to the toothed sector
  const armLen = r * 0.82
  const armGeo = new THREE.BoxGeometry(armLen, 5, 2.2)
  armGeo.translate(armLen / 2, 0, 0)
  const arm = mesh(armGeo, mats.steelBrushed)
  arm.rotation.z = -armAngleWatch
  group.add(arm)
  group.add(cyl(4, 6, mats.steel))
  const jr = jewel(mats, 3)
  jr.position.z = 3.4
  group.add(jr)
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
    // tip in watch coords, un-rotated to the rack's local frame
    const twx = snailC.x + Math.cos(CONTACT[which]) * rTip - pivot.x
    const twy = snailC.y + Math.sin(CONTACT[which]) * rTip - pivot.y
    const c = Math.cos(-alpha)
    const s = Math.sin(-alpha)
    const lx = twx * c - twy * s
    const ly = twx * s + twy * c
    // to three local (flip y)
    const tx = lx
    const ty = -ly
    const len = Math.hypot(tx, ty)
    tail.rotation.z = Math.atan2(ty, tx)
    blade.scale.x = len
    foot.position.x = len
  }
  update(mv)
  return { group, update }
}
