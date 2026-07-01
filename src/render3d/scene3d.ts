import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { Movement } from '../core/movement'
import {
  ALL_LAYERS,
  buildParts,
  easeInOutCubic,
  type LayerName,
  MAX_LIFT,
  type Part,
  partTransform,
} from '../render/parts'
import { buildPartObject, type Built, type Fx } from './builders'
import { makeEnvironment, makeMaterials, type Materials } from './materials'

const LABELED_WHEN_EXPLODED = new Set([
  'caseback', 'barrel', 'centerWheel', 'carriage', 'balance', 'fixedFourth', 'keylessWorks',
  'mainplate', 'trainBridge', 'hourSnail', 'quarterSnail', 'hourRack',
  'quarterRack', 'minuteRack', 'flyGovernor', 'allOrNothing', 'surprisePiece',
  'hammerLow', 'gongLow', 'dial', 'crown', 'repeaterSlide', 'bezelCrystal',
])

interface PartObj {
  part: Part
  built: Built
  label: CSS2DObject
  labelEl: HTMLDivElement
}

/**
 * The 3D stage: PBR metal under a studio environment, orbitable from any
 * angle, with the assembly stack exploding along the true watch axis. The
 * renderer is a read-only consumer of the Movement — it sets transforms
 * from the same partTransform() the acceptance tests exercise.
 */
export class Renderer3D {
  readonly parts: Part[]
  explodeDepth = 0
  visibleLayers = new Set<LayerName>(ALL_LAYERS)
  isolated: Part | null = null
  hovered: Part | null = null

  readonly renderer: THREE.WebGLRenderer
  readonly labelRenderer: CSS2DRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  readonly mats: Materials

  private objs = new Map<string, PartObj>()
  private fx: Fx = { hammerFlash: { low: 0, high: 0 }, gongGlow: { low: 0, high: 0 } }
  private dimMat = new THREE.MeshStandardMaterial({
    color: 0x8a93a2,
    metalness: 0.4,
    roughness: 0.7,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  })
  private raycaster = new THREE.Raycaster()
  private lastFrame = 0
  private detailEl: HTMLDivElement

  constructor(
    readonly container: HTMLElement,
    private readonly mv: Movement,
  ) {
    this.parts = buildParts()

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    container.appendChild(this.renderer.domElement)

    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.domElement.className = 'label-layer'
    container.appendChild(this.labelRenderer.domElement)

    this.scene.background = new THREE.Color(0x101318)
    this.scene.environment = makeEnvironment(this.renderer)
    this.mats = makeMaterials()

    // key + fill lights on top of the environment, for crisp speculars
    const key = new THREE.DirectionalLight(0xfff2dd, 1.35)
    key.position.set(300, 400, 500)
    const fill = new THREE.DirectionalLight(0xbdd2ff, 0.5)
    fill.position.set(-400, -200, 300)
    const back = new THREE.DirectionalLight(0xffffff, 0.7)
    back.position.set(0, 150, -500)
    this.scene.add(key, fill, back, new THREE.AmbientLight(0x404650, 0.5))

    this.camera = new THREE.PerspectiveCamera(36, 1, 1, 8000)
    this.camera.position.set(170, -150, 520)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, 25)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 60
    this.controls.maxDistance = 4000

    // build all parts
    for (const part of this.parts) {
      const built = buildPartObject(part.id, this.mats, mv)
      built.group.userData.partId = part.id
      built.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh
          m.userData.origMat = m.material
        }
      })
      this.scene.add(built.group)
      const labelEl = document.createElement('div')
      labelEl.className = 'part-label'
      const label = new CSS2DObject(labelEl)
      label.visible = false
      this.scene.add(label)
      this.objs.set(part.id, { part, built, label, labelEl })
    }

    this.detailEl = document.createElement('div')
    this.detailEl.className = 'part-detail'
    this.detailEl.style.display = 'none'
    container.appendChild(this.detailEl)
  }

  notifyStrike(gong: 'low' | 'high'): void {
    this.fx.hammerFlash[gong] = 1
    this.fx.gongGlow[gong] = 1
  }

  setLayers(layers: LayerName[]): void {
    this.visibleLayers = new Set(layers)
    if (this.isolated && !this.visibleLayers.has(this.isolated.layer)) this.setIsolated(null)
  }

  setIsolated(part: Part | null): void {
    this.isolated = part
    for (const { built } of this.objs.values()) {
      const dim = part !== null && built.group.userData.partId !== part.id
      built.group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.material = dim ? this.dimMat : (m.userData.origMat as THREE.Material)
      })
    }
  }

  /** Frame the exploded stack: pull the camera back and recentre. */
  autoFrame(depth: number): void {
    const e = easeInOutCubic(Math.max(0, Math.min(1, depth)))
    const lift = MAX_LIFT * e
    const target = new THREE.Vector3(0, 0, 25 + lift * 0.42)
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    const dist = 520 + lift * 0.75
    this.controls.target.copy(target)
    this.camera.position.copy(target.clone().add(dir.multiplyScalar(dist)))
  }

  /** Topmost part under a client-space pointer position. */
  pick(clientX: number, clientY: number): Part | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.scene.children, true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o && o.userData.partId === undefined) o = o.parent
      if (!o) continue
      const part = this.objs.get(o.userData.partId as string)?.part
      if (!part || !this.visibleLayers.has(part.layer)) continue
      // the crystal shouldn't swallow every click on the dial
      if (part.id === 'bezelCrystal' && hits.length > 1) continue
      return part
    }
    return null
  }

  render(nowMs: number): void {
    const dtWall = Math.min(0.1, (nowMs - this.lastFrame) / 1000) || 0.016
    this.lastFrame = nowMs
    for (const g of ['low', 'high'] as const) {
      this.fx.hammerFlash[g] = Math.max(0, this.fx.hammerFlash[g] - dtWall * 6)
      this.fx.gongGlow[g] = Math.max(0, this.fx.gongGlow[g] - dtWall * 2.2)
    }

    // resize
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const canvas = this.renderer.domElement
    if (canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || canvas.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      this.labelRenderer.setSize(w, h)
      this.camera.aspect = w / Math.max(1, h)
      this.camera.updateProjectionMatrix()
    }

    // sync every part from the mechanism (watch coords -> three coords)
    const showTags = this.explodeDepth > 0.45 && !this.isolated
    for (const { part, built, label, labelEl } of this.objs.values()) {
      const visible = this.visibleLayers.has(part.layer)
      built.group.visible = visible
      if (!visible) {
        label.visible = false
        continue
      }
      const t = partTransform(part, this.mv, this.explodeDepth)
      built.group.position.set(t.x, -t.y, t.z)
      built.group.rotation.z = -t.rot
      built.update?.(this.mv, this.fx)
      const tag = showTags && LABELED_WHEN_EXPLODED.has(part.id)
      label.visible = tag
      if (tag) {
        label.position.set(t.x, -t.y, t.z + 14)
        if (labelEl.textContent !== part.label) labelEl.textContent = part.label
      }
    }

    // detail card for isolated / hovered part
    const detail = this.isolated ?? this.hovered
    if (detail) {
      const t = partTransform(detail, this.mv, this.explodeDepth)
      const pos = new THREE.Vector3(t.x, -t.y, t.z).project(this.camera)
      const x = ((pos.x + 1) / 2) * w
      const y = ((1 - pos.y) / 2) * h
      this.detailEl.style.display = 'block'
      this.detailEl.style.left = `${Math.min(w - 240, Math.max(8, x + 24))}px`
      this.detailEl.style.top = `${Math.max(8, y - 30)}px`
      const lines = [detail.label, ...detail.liveState(this.mv)]
      this.detailEl.innerHTML = lines
        .map((l, i) => `<div class="${i === 0 ? 'title' : 'line'}">${l}</div>`)
        .join('')
    } else {
      this.detailEl.style.display = 'none'
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.labelRenderer.render(this.scene, this.camera)
  }
}
