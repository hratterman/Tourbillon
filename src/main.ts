import { GongEngine } from './audio/gongs'
import { Movement } from './core/movement'
import { Renderer3D } from './render3d/scene3d'
import { setupCanvasInteraction } from './ui/interact'
import { setupPanel, updateReadouts } from './ui/panel'

/**
 * Loop architecture (spec §0): the physics runs on a fixed timestep inside
 * `Movement.advance` (accumulator pattern), fed here with wall-clock time
 * multiplied by the global timeScale and clamped by a per-frame budget so
 * a 1000× run-down cannot freeze the tab. Rendering runs on rAF and reads
 * the freshest state; strikes are scheduled onto the audio clock with the
 * exact simulated-time offsets so the governor — not frame timing — sets
 * the audible cadence.
 */

const stage = document.getElementById('stage') as HTMLElement
const mv = new Movement({ h: 10, m: 47, s: 20 }) // the canonical demo time
mv.advance(5) // settle to steady amplitude before first paint

const renderer = new Renderer3D(stage, mv)
const gongs = new GongEngine()
const state = { timeScale: 1 }

setupPanel(mv, renderer, gongs, state)
setupCanvasInteraction(mv, renderer)

// expose for automation / debugging / screenshots
;(window as unknown as Record<string, unknown>).__watch = { mv, renderer, state }

let lastMs = performance.now()
let readoutTimer = 0

function frame(nowMs: number): void {
  // the first rAF timestamp can precede the performance.now() captured
  // after the (slow) WebGL init — never let the clock run backwards
  const wallDt = Math.max(0, Math.min(0.1, (nowMs - lastMs) / 1000))
  lastMs = nowMs

  // physics: wall time × timeScale, budgeted
  const t0 = performance.now()
  const simT0 = mv.t
  const want = wallDt * state.timeScale
  let advanced = 0
  const chunk = Math.max(mv.dtPhysics * 16, want / 8)
  while (advanced < want && performance.now() - t0 < 9) {
    const step = Math.min(chunk, want - advanced)
    mv.advance(step)
    advanced += step
  }

  // audio: map simulated strike times onto the audio clock
  const strikes = mv.drainStrikes()
  if (strikes.length > 0) {
    const audioNow = gongs.now() + 0.04
    for (const s of strikes) {
      const when = audioNow + Math.max(0, (s.t - simT0) / Math.max(1e-9, state.timeScale))
      gongs.strike(s.gong, s.velocity, when)
      renderer.notifyStrike(s.gong)
    }
  }

  renderer.render(nowMs)

  readoutTimer -= wallDt
  if (readoutTimer <= 0) {
    readoutTimer = 0.2
    updateReadouts(mv)
  }
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
