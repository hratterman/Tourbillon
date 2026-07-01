import type { Movement } from '../core/movement'
import type { GongEngine } from '../audio/gongs'
import type { Renderer3D } from '../render3d/scene3d'
import { ALL_LAYERS, PRESETS, type LayerName } from '../render/parts'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

/** Wire the side panel: controls in, readouts out. */
export function setupPanel(
  mv: Movement,
  renderer: Renderer3D,
  gongs: GongEngine,
  state: { timeScale: number },
): void {
  // ---- repeater slide (hold to push, release to fire) ----
  const chimeBtn = $('btn-chime')
  const travelBar = $<HTMLProgressElement>('slide-travel')
  let pushing = false
  const startPush = (e: Event) => {
    e.preventDefault()
    pushing = true
    chimeBtn.classList.add('held')
  }
  const endPush = () => {
    if (!pushing) return
    pushing = false
    chimeBtn.classList.remove('held')
    mv.releaseRepeaterSlide()
  }
  chimeBtn.addEventListener('pointerdown', startPush)
  window.addEventListener('pointerup', endPush)
  // travel grows while held — the main loop advances it
  state && Object.assign(state, {})
  setInterval(() => {
    if (pushing) mv.pushRepeaterSlide(mv.repeater.slideTravel + 0.045)
    travelBar.value = mv.repeater.slideTravel
  }, 16)

  $('btn-halfpush').addEventListener('click', () => {
    // a lazy thumb: push to 50% and let go — the interlock stays silent
    let travel = 0
    const iv = setInterval(() => {
      travel += 0.05
      if (travel >= 0.5) {
        clearInterval(iv)
        mv.releaseRepeaterSlide()
        return
      }
      mv.pushRepeaterSlide(travel)
    }, 16)
  })

  // ---- audio ----
  const audioBtn = $('btn-audio')
  audioBtn.addEventListener('click', async () => {
    await gongs.enable()
    audioBtn.textContent = '🔊 Sound on'
    audioBtn.classList.add('on')
  })

  // ---- crown ----
  const windBtn = $('btn-wind')
  let winding = false
  windBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    winding = true
    windBtn.classList.add('held')
  })
  window.addEventListener('pointerup', () => {
    winding = false
    windBtn.classList.remove('held')
  })
  setInterval(() => {
    if (winding && !mv.crownPulled) mv.turnCrown(0.12)
  }, 40)

  const pullBtn = $('btn-pull')
  const setRow = $('set-row')
  pullBtn.addEventListener('click', () => {
    mv.setCrownPulled(!mv.crownPulled)
    pullBtn.textContent = mv.crownPulled ? 'Push crown (run)' : 'Pull crown (set)'
    pullBtn.classList.toggle('on', mv.crownPulled)
    setRow.classList.toggle('hidden', !mv.crownPulled)
  })
  holdRepeat($('btn-set-fwd'), () => mv.crownPulled && mv.turnCrown(0.1))
  holdRepeat($('btn-set-back'), () => mv.crownPulled && mv.turnCrown(-0.1))

  // ---- time scale ----
  const tsSlider = $<HTMLInputElement>('timescale')
  const tsLabel = $('ts-label')
  const applyTs = (ts: number) => {
    state.timeScale = ts
    tsSlider.value = String(Math.log10(ts))
    tsLabel.textContent = ts >= 10 ? `${Math.round(ts)}×` : `${ts.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`
    // coarsen the fixed step at extreme scales (documented tuning, §0)
    mv.dtPhysics = ts > 50 ? 1e-3 : 1e-4
  }
  tsSlider.addEventListener('input', () => applyTs(Math.pow(10, Number(tsSlider.value))))
  document.querySelectorAll<HTMLButtonElement>('[data-ts]').forEach((b) =>
    b.addEventListener('click', () => applyTs(Number(b.dataset.ts))),
  )

  // ---- regulator ----
  const reg = $<HTMLInputElement>('regulator')
  reg.addEventListener('input', () => {
    mv.setRegulator(Number(reg.value))
    $('reg-label').textContent = Number(reg.value).toFixed(2)
  })

  // ---- teardown ----
  const explode = $<HTMLInputElement>('explode')
  const depthLabel = $('depth-label')
  explode.addEventListener('input', () => {
    renderer.explodeDepth = Number(explode.value)
    renderer.autoFrame(renderer.explodeDepth)
    depthLabel.textContent =
      renderer.explodeDepth === 0 ? 'assembled' : renderer.explodeDepth >= 1 ? 'exploded' : `${Math.round(renderer.explodeDepth * 100)}%`
  })

  const presetBtns = document.querySelectorAll<HTMLButtonElement>('[data-preset]')
  const layerBox = $('layer-toggles')
  const checkboxes = new Map<LayerName, HTMLInputElement>()
  for (const layer of ALL_LAYERS) {
    const label = document.createElement('label')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = true
    cb.addEventListener('change', () => {
      const layers = ALL_LAYERS.filter((l) => checkboxes.get(l)!.checked)
      renderer.setLayers(layers)
      presetBtns.forEach((b) => b.classList.remove('on'))
    })
    checkboxes.set(layer, cb)
    label.append(cb, layer)
    layerBox.append(label)
  }
  presetBtns.forEach((b) =>
    b.addEventListener('click', () => {
      const layers = PRESETS[b.dataset.preset!]
      renderer.setLayers(layers)
      for (const [l, cb] of checkboxes) cb.checked = layers.includes(l)
      presetBtns.forEach((x) => x.classList.remove('on'))
      b.classList.add('on')
    }),
  )

  // ---- gong tuning ----
  const tuneLow = $<HTMLInputElement>('tune-low')
  const tuneHigh = $<HTMLInputElement>('tune-high')
  const retune = () => {
    gongs.setTuning(Number(tuneLow.value), Number(tuneHigh.value))
    $('tune-low-v').textContent = tuneLow.value
    $('tune-high-v').textContent = tuneHigh.value
  }
  tuneLow.addEventListener('input', retune)
  tuneHigh.addEventListener('input', retune)

  applyTs(1)
}

function holdRepeat(btn: HTMLElement, fn: () => unknown): void {
  let iv: ReturnType<typeof setInterval> | null = null
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    fn()
    iv = setInterval(fn, 60)
  })
  const stop = () => {
    if (iv) clearInterval(iv)
    iv = null
  }
  btn.addEventListener('pointerup', stop)
  btn.addEventListener('pointerleave', stop)
}

/** Refresh the timing-machine readouts (called a few times per second). */
export function updateReadouts(mv: Movement): void {
  const r = mv.readouts()
  const rate = $('ro-rate')
  rate.textContent = r.rateSecPerDay === null ? (r.running ? '…' : 'STOPPED') : `${r.rateSecPerDay >= 0 ? '+' : ''}${r.rateSecPerDay.toFixed(1)} s/d`
  rate.classList.toggle('bad', !r.running)
  const amp = $('ro-amp')
  amp.textContent = r.amplitudeDeg === null ? '—' : `${r.amplitudeDeg.toFixed(0)}°`
  amp.classList.toggle('warn', (r.amplitudeDeg ?? 300) < 220)
  $('ro-beat').textContent = r.beatErrorMs === null ? '—' : `${r.beatErrorMs.toFixed(2)} ms`
  const res = $('ro-reserve')
  res.textContent = `${r.reserveHours.toFixed(1)} h`
  res.classList.toggle('warn', r.reserveHours < 8)
  const t = mv.displayedTime()
  $('ro-time').textContent = `${t.h}:${String(t.m).padStart(2, '0')}:${String(Math.floor(t.s)).padStart(2, '0')}`
}
