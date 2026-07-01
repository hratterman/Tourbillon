import type { Movement } from '../core/movement'
import type { Renderer3D } from '../render3d/scene3d'

/**
 * Direct manipulation in the 3D stage. OrbitControls owns rotate/zoom/pan;
 * grabbing the crown or the repeater slide takes the pointer over: drag
 * vertically on the crown to wind (pushed in) or set the hands (pulled
 * out), double-click it to pull/push; drag the slide down along the case
 * flank and release to fire — let go early and the all-or-nothing piece
 * gives you silence. A clean click isolates the part under the cursor.
 */
export function setupCanvasInteraction(mv: Movement, renderer: Renderer3D): void {
  const el = renderer.renderer.domElement
  type Mode = 'none' | 'crown' | 'slide'
  let mode: Mode = 'none'
  let lastY = 0
  let downX = 0
  let downY = 0
  let moved = false

  el.addEventListener('pointerdown', (e) => {
    lastY = e.clientY
    downX = e.clientX
    downY = e.clientY
    moved = false
    const hit = renderer.pick(e.clientX, e.clientY)
    if (hit?.id === 'crown') mode = 'crown'
    else if (hit?.id === 'repeaterSlide') mode = 'slide'
    else mode = 'none'
    if (mode !== 'none') {
      renderer.controls.enabled = false
      el.setPointerCapture(e.pointerId)
    }
  })

  el.addEventListener('pointermove', (e) => {
    const dy = e.clientY - lastY
    lastY = e.clientY
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) moved = true
    if (mode === 'crown') {
      mv.turnCrown(-dy * 0.01)
      el.style.cursor = 'ns-resize'
    } else if (mode === 'slide') {
      mv.pushRepeaterSlide(mv.repeater.slideTravel + dy * 0.012)
      el.style.cursor = 'grabbing'
    } else if (e.buttons === 0) {
      renderer.hovered = renderer.pick(e.clientX, e.clientY)
      el.style.cursor = renderer.hovered ? 'pointer' : 'grab'
    }
  })

  el.addEventListener('pointerup', (e) => {
    if (mode === 'slide') mv.releaseRepeaterSlide()
    if (mode === 'none' && !moved) {
      const hit = renderer.pick(e.clientX, e.clientY)
      renderer.setIsolated(hit === renderer.isolated ? null : hit)
    }
    mode = 'none'
    renderer.controls.enabled = true
    el.style.cursor = 'grab'
  })

  el.addEventListener('dblclick', (e) => {
    const hit = renderer.pick(e.clientX, e.clientY)
    if (hit?.id === 'crown') {
      mv.setCrownPulled(!mv.crownPulled)
      const pullBtn = document.getElementById('btn-pull')
      if (pullBtn) {
        pullBtn.textContent = mv.crownPulled ? 'Push crown (run)' : 'Pull crown (set)'
        pullBtn.classList.toggle('on', mv.crownPulled)
        document.getElementById('set-row')?.classList.toggle('hidden', !mv.crownPulled)
      }
    }
  })
}
