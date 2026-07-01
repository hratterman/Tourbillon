// The modal core is inlined into the worklet module verbatim, so the
// worklet, the main thread and the headless tests share one implementation.
import modalSource from './modalcore.js?raw'
import { strikeModes } from './modalcore.js'
import { makeGong, type GongParams, DEFAULT_HIGH_F0, DEFAULT_LOW_F0 } from './gongparams'

/**
 * Real-time gong engine. An AudioWorklet synthesizes the modal sum sample
 * by sample (recursive phasor per mode: exact sinusoids, cheap), applies
 * the raised-cosine hammer contact and a tanh soft limiter. Strikes are
 * scheduled with audio-clock timestamps so the governor's cadence — not
 * message latency — controls the rhythm.
 */

// The processor shim appended after the inlined modal core; it uses the
// core's softLimit / attackGain / STRIKE_GAIN / ATTACK_S directly.
const PROCESSOR = `
class GongProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.voices = []
    this.port.onmessage = (e) => {
      const { modes, when } = e.data
      const startSample = Math.max(currentFrame, Math.round(when * sampleRate))
      const vs = []
      for (const m of modes) {
        const w = (2 * Math.PI * m.f) / sampleRate
        vs.push({
          amp: m.amp * STRIKE_GAIN,
          decay: Math.exp(-1 / (m.tau * sampleRate)),
          cos: Math.cos(w),
          sin: Math.sin(w),
          zRe: 1,
          zIm: 0,
        })
      }
      this.voices.push({ start: startSample, modes: vs, age: 0 })
      // polyphony cap: drop the quietest voices beyond 64
      if (this.voices.length > 64) {
        this.voices.sort((a, b) => peakAmp(b) - peakAmp(a))
        this.voices.length = 64
      }
      function peakAmp(v) {
        let s = 0
        for (const m of v.modes) s += m.amp
        return s
      }
    }
  }
  process(_inputs, outputs) {
    const out = outputs[0][0]
    const n = out.length
    const frame0 = currentFrame
    for (let i = 0; i < n; i++) {
      let sum = 0
      const t = frame0 + i
      for (const v of this.voices) {
        if (t < v.start) continue
        const tSec = (t - v.start) / sampleRate
        const att = attackGain(tSec, ATTACK_S)
        for (const m of v.modes) {
          sum += m.amp * att * m.zIm
          const nRe = m.zRe * m.cos - m.zIm * m.sin
          const nIm = m.zRe * m.sin + m.zIm * m.cos
          m.zRe = nRe
          m.zIm = nIm
          m.amp *= m.decay
        }
      }
      out[i] = softLimit(sum)
    }
    // cull silent voices
    this.voices = this.voices.filter((v) => {
      if (frame0 + n < v.start) return true
      let a = 0
      for (const m of v.modes) a += m.amp
      return a > 1e-5
    })
    if (outputs[0].length > 1) outputs[0][1].set(out)
    return true
  }
}
registerProcessor('gong-processor', GongProcessor)
`

export class GongEngine {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private ready = false
  lowGong: GongParams = makeGong(DEFAULT_LOW_F0)
  highGong: GongParams = makeGong(DEFAULT_HIGH_F0)

  get enabled(): boolean {
    return this.ready
  }

  /** Must be called from a user gesture. */
  async enable(): Promise<void> {
    if (this.ready) return
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    const moduleSrc = `${modalSource}\n${PROCESSOR}`
    const url = URL.createObjectURL(new Blob([moduleSrc], { type: 'text/javascript' }))
    try {
      await this.ctx.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    this.node = new AudioWorkletNode(this.ctx, 'gong-processor', {
      numberOfInputs: 0,
      outputChannelCount: [2],
    })
    const master = this.ctx.createGain()
    master.gain.value = 0.9
    this.node.connect(master).connect(this.ctx.destination)
    await this.ctx.resume()
    this.ready = true
  }

  setTuning(lowF0: number, highF0: number): void {
    this.lowGong = makeGong(lowF0)
    this.highGong = makeGong(highF0)
  }

  /** Current audio-clock time, for cadence-exact scheduling. */
  now(): number {
    return this.ctx?.currentTime ?? 0
  }

  strike(gong: 'low' | 'high', velocity: number, when: number): void {
    if (!this.ready || !this.node) return
    const params = gong === 'low' ? this.lowGong : this.highGong
    const modes = strikeModes(params, velocity) // same math as the worklet/tests
    this.node.port.postMessage({ modes, when })
  }
}
