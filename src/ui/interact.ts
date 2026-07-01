import type { Movement } from '../core/movement'
import type { Renderer } from '../render/renderer'
import { GEO } from '../render/parts'

/**
 * Direct manipulation on the canvas: the crown and slide behave like the
 * real parts. Drag vertically on the crown to wind (pushed in) or set the
 * hands (pulled out); double-click it to pull/push. Drag the repeater
 * slide down along the case flank and let go to fire. Scroll to zoom,
 * drag empty space to pan, click a part to isolate it.
 */
export function setupCanvasInteraction(
  canvas: HTMLCanvasElement,
  mv: Movement,
  renderer: Renderer,
): void {
  type Mode = 'none' | 'pan' | 'crown' | 'slide'
  let mode: Mode = 'none'
  let lastX = 0
  let lastY = 0
  let downX = 0
  let downY = 0
  let moved = false

  const near = (wx: number, wy: number, px: number, py: number, r: number) =>
    Math.hypot(wx - px, wy - py) < r

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    const w = renderer.worldFromScreen(e.clientX, e.clientY)
    lastX = e.clientX
    lastY = e.clientY
    downX = e.clientX
    downY = e.clientY
    moved = false
    if (near(w.x, w.y, GEO.crown.x, GEO.crown.y, 30)) mode = 'crown'
    else if (near(w.x, w.y, GEO.slide.x, GEO.slide.y + mv.repeater.slideTravel * 34, 34)) mode = 'slide'
    else mode = 'pan'
  })

  canvas.addEventListener('pointermove', (e) => {
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true
    if (mode === 'crown') {
      // rolling the crown: vertical drag = rotation
      mv.turnCrown(-dy * 0.01)
      canvas.style.cursor = 'ns-resize'
    } else if (mode === 'slide') {
      const rect = canvas.getBoundingClientRect()
      const scale = (Math.min(rect.width, rect.height) / 470) * renderer.zoom
      mv.pushRepeaterSlide(mv.repeater.slideTravel + dy / (34 * scale))
      canvas.style.cursor = 'grabbing'
    } else if (mode === 'pan') {
      renderer.panX += dx
      renderer.panY += dy
    } else {
      // hover feedback
      const w = renderer.worldFromScreen(e.clientX, e.clientY)
      renderer.hovered = renderer.hitTest(w.x, w.y)
      canvas.style.cursor = renderer.hovered ? 'pointer' : 'crosshair'
    }
  })

  canvas.addEventListener('pointerup', (e) => {
    if (mode === 'slide') {
      mv.releaseRepeaterSlide()
    } else if (!moved) {
      // a clean click: isolate the part under the cursor (or clear)
      const w = renderer.worldFromScreen(e.clientX, e.clientY)
      const hit = renderer.hitTest(w.x, w.y)
      renderer.isolated = hit === renderer.isolated ? null : hit
    }
    if (mode === 'pan' && moved) renderer.isolated = renderer.isolated // pan keeps isolation
    mode = 'none'
    canvas.style.cursor = 'crosshair'
  })

  canvas.addEventListener('dblclick', (e) => {
    const w = renderer.worldFromScreen(e.clientX, e.clientY)
    if (near(w.x, w.y, GEO.crown.x, GEO.crown.y, 34)) {
      mv.setCrownPulled(!mv.crownPulled)
      const pullBtn = document.getElementById('btn-pull')
      if (pullBtn) {
        pullBtn.textContent = mv.crownPulled ? 'Push crown (run)' : 'Pull crown (set)'
        pullBtn.classList.toggle('on', mv.crownPulled)
        document.getElementById('set-row')?.classList.toggle('hidden', !mv.crownPulled)
      }
    }
  })

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const w = renderer.worldFromScreen(e.clientX, e.clientY)
      // crown-roll shortcut: wheel over the crown winds/sets
      if (near(w.x, w.y, GEO.crown.x, GEO.crown.y, 30)) {
        mv.turnCrown(e.deltaY < 0 ? 0.08 : mv.crownPulled ? -0.08 : 0)
        return
      }
      const f = Math.exp(-e.deltaY * 0.0012)
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.width / 2
      const cy = e.clientY - rect.height / 2
      renderer.panX = cx - (cx - renderer.panX) * f
      renderer.panY = cy - (cy - renderer.panY) * f
      renderer.zoom = Math.max(0.4, Math.min(14, renderer.zoom * f))
    },
    { passive: false },
  )
}
