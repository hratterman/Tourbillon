import * as THREE from 'three'

/**
 * Parametric solid geometry for the movement. Everything is built from
 * profiles extruded along the watch axis (local +Z) or lathed around it,
 * in the same world units the mechanism uses.
 */

const TAU = Math.PI * 2

/**
 * Gear tooth outline cut about the PITCH radius r: tips at r + 0.9m, roots
 * at r - 1.1m (m = 2r/teeth). Two gears whose centre distance equals the
 * sum of their pitch radii therefore interleave with realistic clearance —
 * this is what makes every mesh in layout.ts read as genuinely engaged.
 * Tooth 0 is centred at local angle 0.175 x pitch (see layout.TOOTH_CENTER).
 */
export function gearShape(r: number, teeth: number): THREE.Shape {
  const m = (2 * r) / teeth
  const tipR = r + 0.9 * m
  const rootR = r - 1.1 * m
  const s = new THREE.Shape()
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU
    const step = TAU / teeth
    const p = (f: number, rr: number) =>
      new THREE.Vector2(Math.cos(a + f * step) * rr, Math.sin(a + f * step) * rr)
    if (i === 0) s.moveTo(p(0, rootR).x, p(0, rootR).y)
    else s.lineTo(p(0, rootR).x, p(0, rootR).y)
    s.lineTo(p(0.06, tipR).x, p(0.06, tipR).y)
    s.lineTo(p(0.29, tipR).x, p(0.29, tipR).y)
    s.lineTo(p(0.35, rootR).x, p(0.35, rootR).y)
    const segs = 3
    for (let k = 1; k <= segs; k++) {
      const f = 0.35 + (0.65 * k) / segs
      s.lineTo(p(f, rootR).x, p(f, rootR).y)
    }
  }
  s.closePath()
  return s
}

/** Annular-sector hole path (for spoked wheels), wound clockwise. */
function sectorHole(rIn: number, rOut: number, a0: number, a1: number): THREE.Path {
  const h = new THREE.Path()
  const segs = 12
  h.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn)
  for (let k = 0; k <= segs; k++) {
    const a = a0 + ((a1 - a0) * k) / segs
    h.lineTo(Math.cos(a) * rIn, Math.sin(a) * rIn)
  }
  for (let k = segs; k >= 0; k--) {
    const a = a0 + ((a1 - a0) * k) / segs
    h.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut)
  }
  h.closePath()
  return h
}

export interface GearOpts {
  thickness?: number
  spokes?: number
  hubR?: number
  rimW?: number
  holeR?: number
}

/** r is the PITCH radius; tooth size follows from the tooth count. */
export function gearGeometry(r: number, teeth: number, opts: GearOpts = {}): THREE.ExtrudeGeometry {
  const {
    thickness = 3,
    spokes = 5,
    hubR = Math.max(4, r * 0.16),
    rimW = Math.max(3, r * 0.14),
    holeR = 1.6,
  } = opts
  const shape = gearShape(r, teeth)
  const hole = new THREE.Path()
  hole.absarc(0, 0, holeR, 0, TAU, true)
  shape.holes.push(hole)
  const rootR = r - (2.2 * r) / teeth
  if (spokes > 0 && rootR - rimW > hubR + 3) {
    const gap = 0.16 // spoke angular half-width
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * TAU + gap
      const a1 = ((i + 1) / spokes) * TAU - gap
      shape.holes.push(sectorHole(hubR + 2, rootR - rimW, a0, a1))
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.3,
    bevelSize: 0.3,
    bevelSegments: 1,
  })
  g.translate(0, 0, -thickness / 2)
  return g
}

/** Escape wheel: pointed club teeth. */
export function escapeWheelGeometry(r: number, thickness = 1.6): THREE.ExtrudeGeometry {
  const s = new THREE.Shape()
  const teeth = 15
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU
    const tip = (f: number, rr: number) =>
      new THREE.Vector2(Math.cos(a + (f * TAU) / teeth) * rr, Math.sin(a + (f * TAU) / teeth) * rr)
    if (i === 0) s.moveTo(tip(0, r).x, tip(0, r).y)
    else s.lineTo(tip(0, r).x, tip(0, r).y)
    s.lineTo(tip(0.12, r * 0.94).x, tip(0.12, r * 0.94).y)
    s.lineTo(tip(0.4, r * 0.6).x, tip(0.4, r * 0.6).y)
    s.lineTo(tip(0.85, r * 0.62).x, tip(0.85, r * 0.62).y)
  }
  s.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, 1.2, 0, TAU, true)
  s.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false })
  g.translate(0, 0, -thickness / 2)
  return g
}

/**
 * Snail cam solid: `steps` descending radii over each of `sectors` turns —
 * the exact profile the core reads (see core/snails.ts).
 */
export function snailCamGeometry(
  r0: number,
  dr: number,
  steps: number,
  sectors = 1,
  startStep = 0,
  thickness = 2.6,
): THREE.ExtrudeGeometry {
  const s = new THREE.Shape()
  const sweep = TAU / sectors
  let first = true
  for (let sec = 0; sec < sectors; sec++) {
    for (let i = 0; i < steps; i++) {
      const r = r0 - (i + startStep) * dr
      const a0 = sec * sweep + (i / steps) * sweep
      const a1 = sec * sweep + ((i + 1) / steps) * sweep
      const segs = Math.max(2, Math.ceil(((a1 - a0) / TAU) * 64))
      if (first) {
        s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r)
        first = false
      } else {
        s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r)
      }
      for (let k = 1; k <= segs; k++) {
        const a = a0 + ((a1 - a0) * k) / segs
        s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      }
    }
  }
  s.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, Math.max(2.2, r0 * 0.14), 0, TAU, true)
  s.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.25,
    bevelSize: 0.25,
    bevelSegments: 1,
  })
  g.translate(0, 0, -thickness / 2)
  return g
}

/** Toothed rack sector (real triangular teeth on the outer arc). */
export function rackSectorGeometry(
  r: number,
  teeth: number,
  pitch: number,
  thickness = 2.2,
): THREE.ExtrudeGeometry {
  const arc = teeth * pitch
  const s = new THREE.Shape()
  const toothH = Math.max(2.4, r * 0.06)
  s.moveTo(Math.cos(-arc / 2) * r * 0.8, Math.sin(-arc / 2) * r * 0.8)
  s.lineTo(Math.cos(-arc / 2) * r, Math.sin(-arc / 2) * r)
  for (let i = 0; i < teeth; i++) {
    const a0 = -arc / 2 + i * pitch
    const aMid = a0 + pitch * 0.5
    const a1 = a0 + pitch
    s.lineTo(Math.cos(aMid) * (r + toothH), Math.sin(aMid) * (r + toothH))
    s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r)
  }
  s.lineTo(Math.cos(arc / 2) * r * 0.8, Math.sin(arc / 2) * r * 0.8)
  const segs = 24
  for (let k = segs; k >= 0; k--) {
    const a = -arc / 2 + (arc * k) / segs
    s.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8)
  }
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false })
  g.translate(0, 0, -thickness / 2)
  return g
}

/** Archimedean spiral tube (hairspring, gongs, mainspring coil). */
export function spiralTube(
  rStart: number,
  rEnd: number,
  turns: number,
  tubeR: number,
  a0 = 0,
  tubularSegs = 240,
): THREE.TubeGeometry {
  class Spiral extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super()
    }
    getPoint(t: number): THREE.Vector3 {
      const a = a0 + t * turns * TAU
      const r = rStart + (rEnd - rStart) * t
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)
    }
  }
  return new THREE.TubeGeometry(new Spiral(), tubularSegs, tubeR, 8, false)
}

/** 12-point star wheel. */
export function starGeometry(r: number, points = 12, thickness = 1.8): THREE.ExtrudeGeometry {
  const s = new THREE.Shape()
  for (let i = 0; i < points; i++) {
    const a0 = (i / points) * TAU
    const a1 = ((i + 0.5) / points) * TAU
    if (i === 0) s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r)
    else s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r)
    s.lineTo(Math.cos(a1) * r * 0.66, Math.sin(a1) * r * 0.66)
  }
  s.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, 2, 0, TAU, true)
  s.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false })
  g.translate(0, 0, -thickness / 2)
  return g
}

/** Sword hand pointing along local +Y. `holeR` must clear whatever pipe
 * continues up through the hand's plane. */
export function handGeometry(len: number, w: number, thickness = 1.2, holeR = w * 0.4): THREE.ExtrudeGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, -len * 0.16)
  s.lineTo(-w, 0)
  s.lineTo(-w * 0.34, len)
  s.lineTo(0, len * 1.06)
  s.lineTo(w * 0.34, len)
  s.lineTo(w, 0)
  s.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, holeR, 0, TAU, true)
  s.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.25,
    bevelSize: 0.25,
    bevelSegments: 1,
  })
  g.translate(0, 0, -thickness / 2)
  return g
}

/** Freeform cock/bridge plate from a polyline outline, with jewel bores. */
export function plateGeometry(
  outline: Array<[number, number]>,
  thickness: number,
  holes: Array<{ x: number; y: number; r: number }> = [],
): THREE.ExtrudeGeometry {
  const s = new THREE.Shape()
  outline.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)))
  s.closePath()
  for (const h of holes) {
    const hp = new THREE.Path()
    hp.absarc(h.x, h.y, h.r, 0, TAU, true)
    s.holes.push(hp)
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.5,
    bevelSegments: 2,
  })
  g.translate(0, 0, -thickness / 2)
  return g
}

/** Remap a planar geometry's UVs from [-R, R]² to [0,1]² (for face textures). */
export function remapPlanarUVs(geom: THREE.BufferGeometry, R: number): void {
  const pos = geom.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + R) / (2 * R)
    uv[i * 2 + 1] = (pos.getY(i) + R) / (2 * R)
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** Lathe profile helper: points are [radius, z]. Lathes around local +Z. */
export function lathe(points: Array<[number, number]>, segments = 96): THREE.LatheGeometry {
  const pts = points.map(([r, z]) => new THREE.Vector2(r, z))
  const g = new THREE.LatheGeometry(pts, segments)
  g.rotateX(Math.PI / 2) // lathe axis Y -> Z (profile z becomes world z)
  return g
}
