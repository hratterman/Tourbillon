/**
 * Canvas 2D drawing helpers: gears, spirals, cams, racks, hands. All
 * functions draw around the local origin; the renderer applies the part
 * transform first. Stroke-and-shade work does the heavy lifting here.
 */

export interface Palette {
  brass: string
  brassDark: string
  steel: string
  steelDark: string
  blued: string
  ruby: string
  plate: string
  plateEdge: string
  gold: string
}

export const PAL: Palette = {
  brass: '#c9a35c',
  brassDark: '#8a6d35',
  steel: '#b9c2cc',
  steelDark: '#6f7883',
  blued: '#3a5fa8',
  ruby: '#c22a4a',
  plate: '#20242b',
  plateEdge: '#3a4250',
  gold: '#d4af37',
}

export function circle(ctx: CanvasRenderingContext2D, r: number, fill?: string, stroke?: string, lw = 1): void {
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw
    ctx.stroke()
  }
}

/** Radial metallic gradient for plates and wheels. */
export function metal(ctx: CanvasRenderingContext2D, r: number, base: string, hi: string): CanvasGradient {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.2)
  g.addColorStop(0, hi)
  g.addColorStop(1, base)
  return g
}

/**
 * A gear wheel: rim, involute-ish teeth (drawn as trapezoids), spokes.
 * Teeth count is visual; rotation must be applied by the caller.
 */
export function gear(
  ctx: CanvasRenderingContext2D,
  r: number,
  teeth: number,
  opts: { spokes?: number; hub?: number; color?: string; dark?: string; toothH?: number; rimW?: number } = {},
): void {
  const { spokes = 5, hub = r * 0.14, color = PAL.brass, dark = PAL.brassDark, toothH = Math.max(2, r * 0.07), rimW = Math.max(2.5, r * 0.13) } = opts
  ctx.save()
  // teeth
  ctx.beginPath()
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2
    const a1 = ((i + 0.35) / teeth) * Math.PI * 2
    const a2 = ((i + 0.5) / teeth) * Math.PI * 2
    ctx.arc(0, 0, r + toothH, a0, a1)
    ctx.arc(0, 0, r, a2, ((i + 0.85) / teeth) * Math.PI * 2)
  }
  ctx.closePath()
  ctx.fillStyle = dark
  ctx.fill()
  // rim
  circle(ctx, r, metal(ctx, r, color, lighten(color)) as unknown as string)
  circle(ctx, r - rimW, PAL.plate)
  // spokes
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(2, r * 0.09)
  ctx.lineCap = 'round'
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * hub, Math.sin(a) * hub)
    ctx.lineTo(Math.cos(a) * (r - rimW + 1), Math.sin(a) * (r - rimW + 1))
    ctx.stroke()
  }
  circle(ctx, hub, color, dark, 1)
  circle(ctx, hub * 0.45, PAL.ruby) // jewel
  ctx.restore()
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) + 46)
  const g = Math.min(255, ((n >> 8) & 255) + 46)
  const b = Math.min(255, (n & 255) + 46)
  return `rgb(${r},${g},${b})`
}

/** Escape wheel: 15 pointed club teeth. */
export function escapeWheel(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.save()
  ctx.beginPath()
  const teeth = 15
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2
    const tip = a
    const heel = a + 0.16
    const root = a + 0.3
    ctx.lineTo(Math.cos(tip) * r, Math.sin(tip) * r)
    ctx.lineTo(Math.cos(heel) * r * 0.97, Math.sin(heel) * r * 0.97)
    ctx.lineTo(Math.cos(root) * r * 0.62, Math.sin(root) * r * 0.62)
  }
  ctx.closePath()
  ctx.fillStyle = metal(ctx, r, PAL.steel, '#e8edf2') as unknown as string
  ctx.fill()
  ctx.strokeStyle = PAL.steelDark
  ctx.lineWidth = 0.8
  ctx.stroke()
  circle(ctx, r * 0.16, PAL.steel, PAL.steelDark, 0.8)
  circle(ctx, r * 0.07, PAL.ruby)
  ctx.restore()
}

/** Balance wheel with two arms and rim screws; rotation applied by caller. */
export function balanceWheel(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.save()
  ctx.strokeStyle = PAL.gold
  ctx.lineWidth = Math.max(2.4, r * 0.12)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()
  // rim screws
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2
    ctx.save()
    ctx.translate(Math.cos(a) * r, Math.sin(a) * r)
    circle(ctx, r * 0.055, PAL.gold, PAL.brassDark, 0.6)
    ctx.restore()
  }
  // arms
  ctx.lineWidth = Math.max(1.8, r * 0.09)
  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.lineTo(r, 0)
  ctx.stroke()
  circle(ctx, r * 0.12, PAL.gold, PAL.brassDark, 0.8)
  circle(ctx, r * 0.05, PAL.ruby)
  ctx.restore()
}

/** Archimedean hairspring; `breath` (rad) winds/unwinds the coil visually. */
export function hairspring(ctx: CanvasRenderingContext2D, rOuter: number, breath: number): void {
  ctx.save()
  ctx.strokeStyle = PAL.blued
  ctx.lineWidth = 0.9
  ctx.beginPath()
  const turns = 5.5
  const steps = 160
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const a = f * turns * Math.PI * 2 + breath * f * 0.35
    const r = rOuter * (0.12 + 0.88 * f) * (1 + 0.02 * Math.sin(breath) * f)
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

/** Pallet fork: body, two jewels, guard pin. `angle` = fork lever angle. */
export function palletFork(ctx: CanvasRenderingContext2D, len: number, angle: number): void {
  ctx.save()
  ctx.rotate(angle)
  ctx.strokeStyle = PAL.steel
  ctx.lineWidth = len * 0.16
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -len * 0.55) // toward escape wheel
  ctx.lineTo(0, len * 0.55) // toward balance (horns)
  ctx.stroke()
  // horns
  ctx.lineWidth = len * 0.1
  ctx.beginPath()
  ctx.moveTo(-len * 0.16, len * 0.72)
  ctx.lineTo(0, len * 0.52)
  ctx.lineTo(len * 0.16, len * 0.72)
  ctx.stroke()
  // pallet jewels
  ctx.fillStyle = PAL.ruby
  ctx.save()
  ctx.translate(-len * 0.2, -len * 0.5)
  ctx.rotate(0.5)
  ctx.fillRect(-len * 0.05, -len * 0.14, len * 0.1, len * 0.28)
  ctx.restore()
  ctx.save()
  ctx.translate(len * 0.2, -len * 0.5)
  ctx.rotate(-0.5)
  ctx.fillRect(-len * 0.05, -len * 0.14, len * 0.1, len * 0.28)
  ctx.restore()
  circle(ctx, len * 0.08, PAL.steel, PAL.steelDark, 0.6)
  ctx.restore()
}

/**
 * A snail cam: `steps` descending radius steps over `sweep` radians
 * (repeated `sectors` times). Step 0 is the largest radius. The profile
 * matches the radius functions in core/snails.ts.
 */
export function snailCam(
  ctx: CanvasRenderingContext2D,
  r0: number,
  dr: number,
  steps: number,
  sectors = 1,
  color = PAL.brass,
  startStep = 0, // hour snail: step i encodes (i+1) strikes
): void {
  ctx.save()
  ctx.beginPath()
  const sweep = (Math.PI * 2) / sectors
  for (let s = 0; s < sectors; s++) {
    for (let i = 0; i < steps; i++) {
      const r = r0 - (i + startStep) * dr
      const a0 = s * sweep + (i / steps) * sweep
      const a1 = s * sweep + ((i + 1) / steps) * sweep
      if (s === 0 && i === 0) ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r)
      ctx.arc(0, 0, r, a0, a1)
      const rNext = i + 1 < steps ? r0 - (i + 1 + startStep) * dr : r0 - startStep * dr
      ctx.lineTo(Math.cos(a1) * rNext, Math.sin(a1) * rNext) // the step cliff
    }
  }
  ctx.closePath()
  ctx.fillStyle = metal(ctx, r0, color, lighten(color)) as unknown as string
  ctx.fill()
  ctx.strokeStyle = PAL.brassDark
  ctx.lineWidth = 0.8
  ctx.stroke()
  circle(ctx, r0 * 0.16, color, PAL.brassDark, 0.8)
  ctx.restore()
}

/**
 * A repeater rack: a toothed sector and a tail whose beak tip is supplied
 * by the renderer in the rack's LOCAL frame — computed so that it rides
 * the snail profile and lands exactly on the drawn step (the beak of a
 * real rack is an adjustable feeler for precisely this reason).
 */
export function rackSector(
  ctx: CanvasRenderingContext2D,
  r: number,
  teeth: number,
  toothPitch: number, // rad of rack rotation per tooth
  armAngle: number, // direction of the toothed sector, rad
  tip: { x: number; y: number }, // beak tip, local coords
): void {
  ctx.save()
  // toothed sector arm
  ctx.save()
  ctx.rotate(armAngle)
  ctx.strokeStyle = PAL.steel
  ctx.lineWidth = Math.max(2.5, r * 0.09)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(r * 0.93, 0)
  ctx.stroke()
  ctx.fillStyle = PAL.steel
  ctx.strokeStyle = PAL.steelDark
  ctx.lineWidth = 0.7
  const arc = teeth * toothPitch
  ctx.beginPath()
  ctx.arc(0, 0, r, -arc / 2, arc / 2)
  ctx.arc(0, 0, r * 0.82, arc / 2, -arc / 2, true)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  for (let i = 0; i <= teeth; i++) {
    const a = -arc / 2 + i * toothPitch
    ctx.save()
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(r + Math.max(2.2, r * 0.055), 0)
    ctx.strokeStyle = PAL.steelDark
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
  // tail: pivot -> beak tip (the tip is what lands on the snail step)
  ctx.strokeStyle = PAL.blued
  ctx.lineWidth = Math.max(2.2, r * 0.08)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()
  // beak foot, square to the tail
  const tl = Math.hypot(tip.x, tip.y) || 1
  const nx = -tip.y / tl
  const ny = tip.x / tl
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(tip.x - nx * 4, tip.y - ny * 4)
  ctx.lineTo(tip.x + nx * 4, tip.y + ny * 4)
  ctx.stroke()
  circle(ctx, Math.max(3, r * 0.1), PAL.steel, PAL.steelDark, 1)
  circle(ctx, Math.max(1.4, r * 0.045), PAL.ruby)
  ctx.restore()
}

/** Sword hand (hours/minutes). Points along -y; rotation by caller. */
export function hand(ctx: CanvasRenderingContext2D, len: number, w: number, color = PAL.blued): void {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, len * 0.14)
  ctx.lineTo(-w, 0)
  ctx.lineTo(-w * 0.35, -len)
  ctx.lineTo(w * 0.35, -len)
  ctx.lineTo(w, 0)
  ctx.closePath()
  ctx.fill()
  circle(ctx, w * 1.35, color)
  circle(ctx, w * 0.6, PAL.gold)
  ctx.restore()
}

/** A coiled mainspring inside the barrel, tighter when wound. */
export function mainspringCoil(ctx: CanvasRenderingContext2D, r: number, windFraction: number): void {
  ctx.save()
  ctx.strokeStyle = PAL.steelDark
  ctx.lineWidth = 1.6
  ctx.beginPath()
  const turns = 4 + windFraction * 4
  const steps = 220
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const a = f * turns * Math.PI * 2
    const rr = r * (0.18 + (0.78 - 0.28 * windFraction) * f + 0.1 * windFraction)
    const x = Math.cos(a) * Math.min(rr, r * 0.94)
    const y = Math.sin(a) * Math.min(rr, r * 0.94)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

/** Fly governor: two pivoting vanes that blur with speed. */
export function flyGovernor(ctx: CanvasRenderingContext2D, r: number, speed01: number): void {
  ctx.save()
  ctx.globalAlpha = 1
  ctx.strokeStyle = PAL.steel
  ctx.lineWidth = 2
  for (const s of [-1, 1]) {
    ctx.save()
    ctx.scale(s, s)
    ctx.fillStyle = `rgba(185,194,204,${1 - speed01 * 0.55})`
    ctx.beginPath()
    ctx.ellipse(r * 0.55, 0, r * 0.45, r * 0.16 + speed01 * r * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.moveTo(-r * 0.15, 0)
  ctx.lineTo(r * 0.15, 0)
  ctx.stroke()
  circle(ctx, r * 0.12, PAL.steel, PAL.steelDark, 0.8)
  ctx.restore()
}

/** Gong: an open spiral arc wrapping nearly twice around the movement. */
export function gongCurve(
  ctx: CanvasRenderingContext2D,
  rStart: number,
  anchorAngle: number,
  glow: number, // 0..1 strike flash
  color: string,
): void {
  ctx.save()
  ctx.lineCap = 'round'
  const wraps = 1.9
  const steps = 200
  if (glow > 0.01) {
    ctx.strokeStyle = color
    ctx.lineWidth = 6
    ctx.globalAlpha = glow * 0.5
    strokeGongPath(ctx, rStart, anchorAngle, wraps, steps)
    ctx.globalAlpha = 1
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 2.2
  strokeGongPath(ctx, rStart, anchorAngle, wraps, steps)
  // the foot block where the gong is brazed
  ctx.translate(Math.cos(anchorAngle) * rStart, Math.sin(anchorAngle) * rStart)
  ctx.fillStyle = PAL.steelDark
  ctx.fillRect(-4, -6, 8, 12)
  ctx.restore()
}

function strokeGongPath(
  ctx: CanvasRenderingContext2D,
  rStart: number,
  anchorAngle: number,
  wraps: number,
  steps: number,
): void {
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const a = anchorAngle + f * wraps * Math.PI * 2
    const r = rStart - f * 9
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

/** Hammer: pivoted mallet. `cock` 0..1 pulls it back; snaps to 0 on strike. */
export function hammer(ctx: CanvasRenderingContext2D, len: number, cock: number, color: string): void {
  ctx.save()
  ctx.rotate(-cock * 0.5)
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(len, 0)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(len - 3, -6, 9, 12, 2)
  ctx.fill()
  circle(ctx, 3.4, PAL.steel, PAL.steelDark, 1)
  ctx.restore()
}

/** Star wheel with 12 points (hour star). */
export function starWheel(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.save()
  ctx.beginPath()
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2
    const a1 = ((i + 0.5) / 12) * Math.PI * 2
    ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r)
    ctx.lineTo(Math.cos(a1) * r * 0.7, Math.sin(a1) * r * 0.7)
  }
  ctx.closePath()
  ctx.fillStyle = PAL.steel
  ctx.fill()
  ctx.strokeStyle = PAL.steelDark
  ctx.lineWidth = 0.8
  ctx.stroke()
  circle(ctx, r * 0.18, PAL.steel, PAL.steelDark, 0.8)
  ctx.restore()
}
