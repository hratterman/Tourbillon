import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * PBR material set for the movement. Everything metallic is truly metallic
 * (metalness 1) and reads from a PMREM-filtered studio environment, so
 * brass looks like brass and polished steel throws highlights as the
 * camera orbits. Finishes differ by roughness: polished, brushed, matte.
 */
export interface Materials {
  brass: THREE.MeshPhysicalMaterial
  brassBrushed: THREE.MeshPhysicalMaterial
  gold: THREE.MeshPhysicalMaterial
  steel: THREE.MeshPhysicalMaterial
  steelBrushed: THREE.MeshPhysicalMaterial
  steelDark: THREE.MeshPhysicalMaterial
  blued: THREE.MeshPhysicalMaterial
  ruby: THREE.MeshPhysicalMaterial
  plate: THREE.MeshPhysicalMaterial
  caseSteel: THREE.MeshPhysicalMaterial
  gongSteel: THREE.MeshPhysicalMaterial
  gongGold: THREE.MeshPhysicalMaterial
  sapphire: THREE.MeshPhysicalMaterial
  dial: THREE.MeshStandardMaterial
  casebackFace: THREE.MeshStandardMaterial
}

export function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return env
}

function metal(color: number, roughness: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 1,
    roughness,
    envMapIntensity: 1.0,
    ...extra,
  })
}

export function makeMaterials(): Materials {
  return {
    brass: metal(0xd4a94e, 0.22),
    brassBrushed: metal(0xc39a45, 0.4),
    gold: metal(0xe8c56a, 0.16),
    steel: metal(0xd6dade, 0.12),
    steelBrushed: metal(0xb8bec6, 0.38),
    steelDark: metal(0x878e98, 0.45),
    // heat-blued steel: deep blue with a hard polish
    blued: metal(0x2c4fa3, 0.15, { clearcoat: 0.6, clearcoatRoughness: 0.15 }),
    ruby: new THREE.MeshPhysicalMaterial({
      color: 0xc21f45,
      metalness: 0,
      roughness: 0.05,
      transmission: 0.55,
      thickness: 2,
      ior: 1.76,
      envMapIntensity: 1.2,
    }),
    // rhodium-plated German-silver plates, satin finish
    plate: metal(0x878e99, 0.48),
    caseSteel: metal(0xc8cdd4, 0.18),
    gongSteel: metal(0xaeb9c8, 0.28),
    gongGold: metal(0xd8b45e, 0.28),
    sapphire: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.045,
      transmission: 1,
      thickness: 3,
      ior: 1.5,
      specularIntensity: 0.5,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    dial: new THREE.MeshStandardMaterial({ color: 0xd9d3c6, metalness: 0.04, roughness: 0.62, envMapIntensity: 0.5 }),
    casebackFace: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.42 }),
  }
}

/** Draw the dial face (minute track, numerals, aperture ring) as a texture. */
export function dialTexture(): THREE.CanvasTexture {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const cx = S / 2
  const R = S / 2
  // silvered grené base with a soft radial sheen
  const grad = g.createRadialGradient(cx * 0.8, cx * 0.8, R * 0.1, cx, cx, R)
  grad.addColorStop(0, '#f4efe4')
  grad.addColorStop(0.7, '#e9e3d5')
  grad.addColorStop(1, '#ded7c6')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  // fine graining
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(120,110,90,${Math.random() * 0.05})`
    g.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4)
  }
  const worldR = 172 // dial radius in world units
  const px = (w: number) => (w / worldR) * R * 0.985
  g.translate(cx, cx)
  // minute track
  g.fillStyle = '#2c2c34'
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2
    const big = i % 5 === 0
    const r0 = px(worldR - (big ? 17 : 11))
    g.save()
    g.translate(Math.cos(a) * r0, Math.sin(a) * r0)
    g.rotate(a + Math.PI / 2)
    g.fillRect(-(big ? 5 : 2.4), 0, big ? 10 : 4.8, big ? 34 : 20)
    g.restore()
  }
  // numerals
  g.fillStyle = '#26262e'
  g.font = `700 ${px(30)}px Georgia, serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('XII', 0, -px(126))
  g.fillText('III', px(126), 0)
  g.fillText('IX', -px(126), 0)
  g.font = `${px(11)}px Georgia, serif`
  g.fillText('MINUTE REPEATER', 0, -px(52))
  g.fillText('TOURBILLON', 0, px(88 - 54 - 11))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Brushed caseback face with rim engraving. `mirror` pre-flips the image
 * so a rotateY(π) (outward-facing) mesh shows it reading correctly. */
export function casebackTexture(mirror = false): THREE.CanvasTexture {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const cx = S / 2
  g.fillStyle = '#c5c9cf'
  g.fillRect(0, 0, S, S)
  // circular brushing
  for (let r = 30; r < cx; r += 2) {
    g.strokeStyle = `rgba(80,86,94,${0.05 + Math.random() * 0.1})`
    g.lineWidth = 1
    g.beginPath()
    g.arc(cx, cx, r, 0, Math.PI * 2)
    g.stroke()
  }
  g.translate(cx, cx)
  if (mirror) g.scale(-1, 1)
  g.fillStyle = 'rgba(40,44,52,0.85)'
  g.font = '700 34px Georgia, serif'
  g.textAlign = 'center'
  // letters march along the arc from a0 to a1 (0 = twelve o'clock);
  // `flip` turns each glyph upside-right for the bottom arc
  const arcText = (txt: string, radius: number, a0: number, a1: number, flip = false) => {
    const n = txt.length
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i + 0.5) / n) * (a1 - a0)
      g.save()
      g.rotate(a)
      g.translate(0, -radius)
      if (flip) g.rotate(Math.PI)
      g.fillText(txt[i], 0, 0)
      g.restore()
    }
  }
  arcText('· MINUTE REPEATER · TOURBILLON ·', 430, -Math.PI * 0.62, Math.PI * 0.62)
  arcText('28 800 A/h — 40 HOURS', 448, Math.PI * 1.28, Math.PI * 0.72, true)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
