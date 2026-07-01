import { BEAT_OFFSET, DEG, HALF_WINDOW, TAU } from '../core/constants'
import { PHASE_LOCKED } from '../core/escapement'
import type { Movement } from '../core/movement'
import {
  balanceWheel,
  circle,
  escapeWheel,
  flyGovernor,
  gear,
  gongCurve,
  hairspring,
  hammer,
  hand,
  mainspringCoil,
  metal,
  PAL,
  palletFork,
  rackSector,
  snailCam,
  starWheel,
} from './draw'
import {
  ALL_LAYERS,
  buildParts,
  CONTACT,
  easeInOutCubic,
  GEO,
  type LayerName,
  MAX_LIFT,
  type Part,
  partTransform,
} from './parts'
import type { Rack } from '../core/repeater'
import {
  HOUR_SNAIL_R0,
  HOUR_SNAIL_DR,
  MINUTE_SNAIL_R0,
  MINUTE_SNAIL_DR,
  QUARTER_SNAIL_R0,
  QUARTER_SNAIL_DR,
} from '../core/snails'

const LABELED_WHEN_EXPLODED = new Set([
  'caseback', 'barrel', 'centerWheel', 'carriage', 'balance', 'fixedFourth',
  'hourSnail', 'quarterSnail', 'hourRack', 'quarterRack', 'minuteRack',
  'flyGovernor', 'allOrNothing', 'surprisePiece', 'hammerLow', 'hammerHigh',
  'gongLow', 'dial', 'crown', 'repeaterSlide', 'bezelCrystal',
])

export class Renderer {
  readonly parts: Part[]
  explodeDepth = 0
  visibleLayers = new Set<LayerName>(ALL_LAYERS)
  isolated: Part | null = null
  hovered: Part | null = null
  zoom = 1
  panX = 0
  panY = 0

  private hammerFlash = { low: 0, high: 0 }
  private gongGlow = { low: 0, high: 0 }
  private lastFrame = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mv: Movement,
  ) {
    this.parts = buildParts().sort((a, b) => a.z - b.z)
  }

  notifyStrike(gong: 'low' | 'high'): void {
    this.hammerFlash[gong] = 1
    this.gongGlow[gong] = 1
  }

  setLayers(layers: LayerName[]): void {
    this.visibleLayers = new Set(layers)
  }

  /** Screen (CSS px) -> world coordinates. */
  worldFromScreen(sx: number, sy: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const s = this.baseScale(rect.width, rect.height) * this.zoom
    return {
      x: (sx - rect.width / 2 - this.panX) / s,
      y: (sy - rect.height / 2 - this.panY) / s,
    }
  }

  private baseScale(w: number, h: number): number {
    return Math.min(w, h) / 470
  }

  /** Frame the exploded stack: zoom out and recentre as depth grows. */
  autoFrame(depth: number): void {
    const e = easeInOutCubic(Math.max(0, Math.min(1, depth)))
    const lift = MAX_LIFT * e
    this.zoom = 470 / (470 + lift * 1.05)
    const rect = this.canvas.getBoundingClientRect()
    const s = this.baseScale(rect.width, rect.height) * this.zoom
    this.panY = (lift / 2) * s
    this.panX = -(0.3 * lift * 0.5) * s
  }

  /** Topmost visible part under a world point. */
  hitTest(wx: number, wy: number): Part | null {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]
      if (!this.visibleLayers.has(p.layer)) continue
      // big enclosure parts shouldn't swallow clicks aimed at the works
      const t = partTransform(p, this.mv, this.explodeDepth)
      const d = Math.hypot(wx - t.x, wy - t.y)
      const r = p.hitRadius
      if (r > 120) {
        // ring-like parts (case, dial, gongs): only near their rim
        if (Math.abs(d - r) < 14) return p
      } else if (d < r) {
        return p
      }
    }
    return null
  }

  render(nowMs: number): void {
    const dtWall = Math.min(0.1, (nowMs - this.lastFrame) / 1000) || 0.016
    this.lastFrame = nowMs
    for (const g of ['low', 'high'] as const) {
      this.hammerFlash[g] = Math.max(0, this.hammerFlash[g] - dtWall * 6)
      this.gongGlow[g] = Math.max(0, this.gongGlow[g] - dtWall * 2.2)
    }

    const ctx = this.canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    if (this.canvas.width !== Math.round(rect.width * dpr) || this.canvas.height !== Math.round(rect.height * dpr)) {
      this.canvas.width = Math.round(rect.width * dpr)
      this.canvas.height = Math.round(rect.height * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#101318'
    ctx.fillRect(0, 0, rect.width, rect.height)

    const s = this.baseScale(rect.width, rect.height) * this.zoom
    ctx.translate(rect.width / 2 + this.panX, rect.height / 2 + this.panY)
    ctx.scale(s, s)

    const dim = this.isolated !== null
    for (const p of this.parts) {
      if (!this.visibleLayers.has(p.layer)) continue
      const t = partTransform(p, this.mv, this.explodeDepth)
      ctx.save()
      ctx.translate(t.x, t.y)
      ctx.rotate(t.rot)
      ctx.globalAlpha = dim && p !== this.isolated ? 0.13 : 1
      this.drawPart(ctx, p)
      ctx.restore()
    }

    // labels + leader lines (exploded or isolated)
    ctx.save()
    ctx.scale(1 / s, 1 / s) // labels in screen px
    if (this.isolated) this.drawLabel(ctx, this.isolated, s, true)
    else if (this.hovered) this.drawLabel(ctx, this.hovered, s, true)
    else if (this.explodeDepth > 0.45)
      for (const p of this.parts)
        if (this.visibleLayers.has(p.layer) && LABELED_WHEN_EXPLODED.has(p.id))
          this.drawLabel(ctx, p, s, false)
    ctx.restore()
  }

  private drawLabel(ctx: CanvasRenderingContext2D, p: Part, s: number, withState: boolean): void {
    const t = partTransform(p, this.mv, this.explodeDepth)
    const px = t.x * s
    const py = t.y * s
    const off = Math.max(26, p.hitRadius * s * 0.55)
    const lx = px + off + 18
    const ly = py - off * 0.35 - 8
    ctx.strokeStyle = 'rgba(220,228,240,0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px + (p.hitRadius > 120 ? 0 : Math.min(p.hitRadius * s * 0.8, off * 0.6)), py)
    ctx.lineTo(lx - 4, ly + 4)
    ctx.stroke()
    ctx.font = '12px ui-monospace, monospace'
    ctx.textBaseline = 'middle'
    const lines = withState ? [p.label, ...p.liveState(this.mv)] : [p.label]
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14
    const h = lines.length * 16 + 8
    ctx.fillStyle = 'rgba(12,15,20,0.88)'
    ctx.strokeStyle = 'rgba(220,228,240,0.35)'
    ctx.beginPath()
    ctx.roundRect(lx - 7, ly - 8, w, h, 4)
    ctx.fill()
    ctx.stroke()
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? '#e8edf5' : '#9fb0c8'
      ctx.fillText(l, lx, ly + 4 + i * 16)
    })
  }

  // ------------------------------------------------------------------ //

  /**
   * Beak-tip position in the rack's local frame: the tip rides the snail
   * profile along the contact line (radius = R0 - fall/pitch * DR, the
   * exact inverse of the core's landing computation), so at landing it
   * touches the drawn cam edge on the correct step.
   */
  private rackTip(
    rack: Rack,
    pivot: { x: number; y: number },
    snailC: { x: number; y: number },
    r0: number,
    dr: number,
    which: keyof typeof CONTACT,
  ): { x: number; y: number } {
    const alpha = rack.currentAngle(this.mv.repeater.gatherProgress(rack))
    const rTip = r0 - (alpha / rack.toothPitch) * dr
    const tx = snailC.x + Math.cos(CONTACT[which]) * rTip - pivot.x
    const ty = snailC.y + Math.sin(CONTACT[which]) * rTip - pivot.y
    const c = Math.cos(-alpha)
    const s = Math.sin(-alpha)
    return { x: tx * c - ty * s, y: tx * s + ty * c }
  }

  private drawPart(ctx: CanvasRenderingContext2D, p: Part): void {
    const mv = this.mv
    switch (p.id) {
      case 'caseback': {
        circle(ctx, 186, metal(ctx, 186, '#2a2f38', '#3d444f') as unknown as string, PAL.plateEdge, 3)
        // brushed finish
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'
        ctx.lineWidth = 1
        for (let r = 30; r < 180; r += 7) {
          ctx.beginPath()
          ctx.arc(0, 0, r, 0, TAU)
          ctx.stroke()
        }
        ctx.fillStyle = 'rgba(230,236,245,0.35)'
        ctx.font = '10px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText('MINUTE REPEATER · TOURBILLON', 0, -138)
        ctx.fillText('28 800 A/h · 40 h RESERVE', 0, 144)
        ctx.textAlign = 'left'
        break
      }
      case 'slideSpring': {
        ctx.strokeStyle = PAL.steelDark
        ctx.lineWidth = 2.4
        ctx.beginPath()
        for (let i = 0; i <= 30; i++) {
          const f = i / 30
          ctx.lineTo(f * 34 - 17, Math.sin(f * Math.PI * 6) * 5)
        }
        ctx.stroke()
        break
      }
      case 'trainBridge': {
        ctx.fillStyle = 'rgba(52,60,72,0.85)'
        ctx.strokeStyle = PAL.plateEdge
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(-120, -66)
        ctx.quadraticCurveTo(-30, -110, 60, -74)
        ctx.quadraticCurveTo(96, -58, 92, -18)
        ctx.lineTo(30, 6)
        ctx.quadraticCurveTo(-40, 26, -96, -6)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        for (const [jx, jy] of [[-52, -36], [10, -20], [66, 22]] as const) {
          ctx.save()
          ctx.translate(jx, jy)
          circle(ctx, 4.5, PAL.gold, PAL.brassDark, 1)
          circle(ctx, 2.2, PAL.ruby)
          ctx.restore()
        }
        break
      }
      case 'barrel': {
        circle(ctx, GEO.barrel.r, metal(ctx, GEO.barrel.r, PAL.brass, '#e2c47e') as unknown as string, PAL.brassDark, 2)
        mainspringCoil(ctx, GEO.barrel.r, mv.mainspring.windFraction)
        gearTeethRing(ctx, GEO.barrel.r, 84)
        circle(ctx, 6, PAL.brass, PAL.brassDark, 1)
        break
      }
      case 'centerWheel':
        gear(ctx, 40, 80, { spokes: 5 })
        break
      case 'thirdWheel':
        gear(ctx, GEO.third.r, 75, { spokes: 4 })
        break
      case 'fixedFourth': {
        gear(ctx, 24, 60, { spokes: 0, color: PAL.steel, dark: PAL.steelDark, toothH: 1.6, rimW: 5 })
        break
      }
      case 'carriage': {
        // the rotating cage: rim + three polished arms
        ctx.strokeStyle = PAL.steel
        ctx.lineWidth = 3
        circle(ctx, GEO.carriage.r, undefined, PAL.steel, 3)
        ctx.lineCap = 'round'
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU
          ctx.beginPath()
          ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8)
          ctx.lineTo(Math.cos(a) * (GEO.carriage.r - 1.5), Math.sin(a) * (GEO.carriage.r - 1.5))
          ctx.strokeStyle = PAL.steel
          ctx.lineWidth = 4.5
          ctx.stroke()
        }
        break
      }
      case 'escapeWheel':
        escapeWheel(ctx, 12)
        break
      case 'palletFork': {
        const e = mv.esc
        const p2 = e.theta - BEAT_OFFSET
        const bank = 9 * DEG
        const lever =
          e.phase === PHASE_LOCKED
            ? e.forkSide * bank
            : Math.max(-1, Math.min(1, p2 / HALF_WINDOW)) * bank
        palletFork(ctx, 13, lever)
        break
      }
      case 'balance': {
        hairspring(ctx, 20, mv.esc.theta)
        balanceWheel(ctx, 27)
        // impulse pin on the roller
        ctx.save()
        ctx.rotate(0)
        circle(ctx, 5.2, undefined, PAL.steel, 1)
        ctx.translate(0, 5.2)
        circle(ctx, 1.6, PAL.ruby)
        ctx.restore()
        break
      }
      case 'tourbillonBridge': {
        ctx.strokeStyle = 'rgba(190,200,214,0.9)'
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-GEO.carriage.r - 10, 12)
        ctx.quadraticCurveTo(0, -GEO.carriage.r * 0.4, GEO.carriage.r + 10, 12)
        ctx.stroke()
        circle(ctx, 5, PAL.steel, PAL.steelDark, 1)
        circle(ctx, 2.4, PAL.ruby)
        break
      }
      case 'motionWorks':
        gear(ctx, 17, 36, { spokes: 3, color: PAL.steel, dark: PAL.steelDark })
        break
      case 'hourStar':
        starWheel(ctx, 17)
        break
      case 'surprisePiece': {
        ctx.save()
        const snap = Math.max(0, 1 - (mv.t - mv.train.lastSnapT) * 3)
        ctx.rotate(snap * 0.5)
        ctx.fillStyle = PAL.blued
        ctx.beginPath()
        ctx.moveTo(4, 0)
        ctx.quadraticCurveTo(15, -3, 19, 4)
        ctx.lineTo(12, 7)
        ctx.quadraticCurveTo(7, 3, 4, 4)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        break
      }
      case 'hourSnail':
        snailCam(ctx, HOUR_SNAIL_R0, HOUR_SNAIL_DR, 12, 1, PAL.brass, 1)
        break
      case 'quarterSnail':
        snailCam(ctx, QUARTER_SNAIL_R0, QUARTER_SNAIL_DR, 4, 1, '#b58e4a')
        break
      case 'minuteSnail':
        snailCam(ctx, MINUTE_SNAIL_R0, MINUTE_SNAIL_DR, 15, 4, '#a3803f')
        break
      case 'hourRack':
        rackSector(ctx, 42, 12, 6 * DEG, 0.55, this.rackTip(
          mv.repeater.hourRack, GEO.hourRackPivot, GEO.hourStar, HOUR_SNAIL_R0, HOUR_SNAIL_DR, 'hour'))
        break
      case 'quarterRack':
        rackSector(ctx, 34, 3, 8 * DEG, 3.4, this.rackTip(
          mv.repeater.quarterRack, GEO.quarterRackPivot, GEO.center, QUARTER_SNAIL_R0, QUARTER_SNAIL_DR, 'quarter'))
        break
      case 'minuteRack':
        rackSector(ctx, 34, 14, 4.5 * DEG, 4.35, this.rackTip(
          mv.repeater.minuteRack, GEO.minuteRackPivot, GEO.center, MINUTE_SNAIL_R0, MINUTE_SNAIL_DR, 'minute'))
        break
      case 'strikeTrain':
        gear(ctx, 16, 40, { spokes: 3, color: PAL.steel, dark: PAL.steelDark })
        // gathering pallet finger
        ctx.strokeStyle = PAL.blued
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(20, 0)
        ctx.stroke()
        break
      case 'flyGovernor':
        flyGovernor(ctx, 16, Math.min(1, mv.repeater.trainOmega / 9))
        break
      case 'allOrNothing': {
        const latched = mv.repeater.latched
        ctx.fillStyle = latched ? '#3f8f4f' : PAL.steelDark
        ctx.beginPath()
        ctx.roundRect(-12, -5, 24, 10, 3)
        ctx.fill()
        ctx.strokeStyle = PAL.steel
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(latched ? 8 : -8, -9)
        ctx.lineTo(latched ? 8 : -8, 9)
        ctx.stroke()
        break
      }
      case 'hammerLow':
        hammer(ctx, 16, 1 - this.hammerFlash.low, PAL.steel)
        break
      case 'hammerHigh':
        hammer(ctx, 16, 1 - this.hammerFlash.high, PAL.gold)
        break
      case 'gongLow':
        gongCurve(ctx, 156, -0.12, this.gongGlow.low, '#8fa3bd')
        break
      case 'gongHigh':
        gongCurve(ctx, 149, 0.18, this.gongGlow.high, '#c9b06a')
        break
      case 'dial': {
        // dial with tourbillon aperture
        ctx.beginPath()
        ctx.arc(0, 0, GEO.dialR, 0, TAU)
        ctx.arc(GEO.carriage.x, GEO.carriage.y, GEO.apertureR, 0, TAU, true)
        ctx.fillStyle = metal(ctx, GEO.dialR, '#e8e3d8', '#f6f2ea') as unknown as string
        ctx.fill()
        ctx.strokeStyle = '#b9b2a4'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(GEO.carriage.x, GEO.carriage.y, GEO.apertureR, 0, TAU)
        ctx.stroke()
        // minute track + numerals
        ctx.fillStyle = '#2c2c34'
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * TAU - Math.PI / 2
          const big = i % 5 === 0
          const r0 = GEO.dialR - (big ? 16 : 10)
          ctx.save()
          ctx.translate(Math.cos(a) * r0, Math.sin(a) * r0)
          ctx.rotate(a + Math.PI / 2)
          ctx.fillRect(-(big ? 1.6 : 0.8), 0, big ? 3.2 : 1.6, big ? 12 : 7)
          ctx.restore()
        }
        ctx.font = 'bold 26px Georgia, serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (const [num, ang] of [['XII', -90], ['III', 0], ['IX', 180]] as const) {
          const a = (ang as number) * DEG
          ctx.fillText(num as string, Math.cos(a) * 128, Math.sin(a) * 128)
        }
        ctx.font = '11px Georgia, serif'
        ctx.fillText('TOURBILLON', 0, GEO.carriage.y - GEO.apertureR - 12)
        ctx.textAlign = 'left'
        break
      }
      case 'hourHand':
        hand(ctx, 88, 7)
        break
      case 'minuteHand':
        hand(ctx, 132, 5.6)
        break
      case 'caseband': {
        ctx.beginPath()
        ctx.arc(0, 0, GEO.caseR, 0, TAU)
        ctx.arc(0, 0, GEO.dialR + 2, 0, TAU, true)
        ctx.fillStyle = metal(ctx, GEO.caseR, '#8f939c', '#c8ccd4') as unknown as string
        ctx.fill()
        ctx.strokeStyle = '#5c626c'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, GEO.caseR, 0, TAU)
        ctx.stroke()
        break
      }
      case 'crown': {
        ctx.save()
        const pulled = mv.crownPulled ? 8 : 0
        ctx.translate(pulled, 0)
        ctx.fillStyle = metal(ctx, 16, '#9aa0aa', '#d5dae2') as unknown as string
        ctx.beginPath()
        ctx.roundRect(-8, -14, 20, 28, 5)
        ctx.fill()
        ctx.strokeStyle = '#565c66'
        ctx.lineWidth = 1.4
        ctx.stroke()
        // knurling
        for (let i = -10; i <= 10; i += 4) {
          ctx.beginPath()
          ctx.moveTo(-6, i)
          ctx.lineTo(10, i)
          ctx.stroke()
        }
        ctx.restore()
        break
      }
      case 'repeaterSlide': {
        ctx.fillStyle = metal(ctx, 20, '#9aa0aa', '#d5dae2') as unknown as string
        ctx.beginPath()
        ctx.roundRect(-9, -22, 16, 44, 6)
        ctx.fill()
        ctx.strokeStyle = '#565c66'
        ctx.lineWidth = 1.4
        ctx.stroke()
        ctx.fillStyle = PAL.gold
        ctx.beginPath()
        ctx.roundRect(-5.5, -14, 9, 28, 4)
        ctx.fill()
        break
      }
      case 'bezelCrystal': {
        ctx.strokeStyle = '#aeb4bd'
        ctx.lineWidth = 9
        ctx.beginPath()
        ctx.arc(0, 0, GEO.dialR + 5, 0, TAU)
        ctx.stroke()
        // crystal glint
        const g = ctx.createLinearGradient(-140, -170, 120, 150)
        g.addColorStop(0, 'rgba(255,255,255,0.10)')
        g.addColorStop(0.28, 'rgba(255,255,255,0.015)')
        g.addColorStop(1, 'rgba(255,255,255,0.05)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(0, 0, GEO.dialR + 4, 0, TAU)
        ctx.fill()
        break
      }
    }
  }
}

/** A fine ring of teeth on an existing disc (barrel). */
function gearTeethRing(ctx: CanvasRenderingContext2D, r: number, teeth: number): void {
  ctx.strokeStyle = PAL.brassDark
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    ctx.lineTo(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3))
  }
  ctx.stroke()
}
