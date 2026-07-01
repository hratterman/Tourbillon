import { DEG, ESC_REVS_PER_CARRIAGE_REV, TAU } from '../core/constants'
import type { Movement } from '../core/movement'
import { RACK_IDLE } from '../core/repeater'
import { hourSnailSteps, quarterSnailRadius } from '../core/snails'

/**
 * The watch is authored as a depth-ordered assembly stack (spec §5.5).
 * Every part carries a layer, a Z-depth, an assembled transform (which may
 * follow the mechanism: wheels turn, the carriage orbits) and an exploded
 * offset. The renderer composes the stack back-to-front; the teardown
 * depth slider lifts each part along the explode axis proportional to its
 * Z. At depth 0 every part is at its exact assembled transform.
 */

export type LayerName = 'caseback' | 'train' | 'dialside' | 'dial' | 'hands' | 'case'

/** Full 3D transform: x/y in the watch plane (y toward 6 o'clock), z along
 * the watch axis (toward the crystal), rot about the watch axis. */
export interface Transform {
  x: number
  y: number
  z: number
  rot: number
}

/** In-plane transform produced by the mechanism (z comes from the stack). */
export interface PlanarTransform {
  x: number
  y: number
  rot: number
}

export interface Part {
  id: string
  label: string
  layer: LayerName
  z: number
  /** Assembled in-plane transform, following the live mechanism state. */
  assembled(mv: Movement): PlanarTransform
  /** Assembled position along the watch axis (world units, 0 = caseback seat). */
  zPos: number
  /** Unit-ish 3D direction the part lifts along when exploding. */
  explodeDir: { x: number; y: number; z: number }
  /** Approximate visual radius, for hit-testing / labels. */
  hitRadius: number
  /** Live state readout for click-to-isolate. */
  liveState(mv: Movement): string[]
}

const DIR_UP = { x: 0, y: 0, z: 1 } // straight off the stack, like a real teardown

/** Layer separation when fully exploded (world units) + intra-layer step. */
const LAYER_RANK: Record<LayerName, number> = {
  caseback: 0,
  train: 1,
  dialside: 2,
  dial: 3,
  hands: 4,
  case: 5,
}
const LAYER_BASE_Z: Record<LayerName, number> = {
  caseback: 0,
  train: 10,
  dialside: 30,
  dial: 60,
  hands: 70,
  case: 80,
}
export const LAYER_SPREAD = 235
export const INTRA_SPREAD = 9
export const MAX_LIFT = 5 * LAYER_SPREAD + 3 * INTRA_SPREAD

/** Lift magnitude along the explode axis at depth 1. */
export function explodeMag(p: Part): number {
  return LAYER_RANK[p.layer] * LAYER_SPREAD + (p.z - LAYER_BASE_Z[p.layer]) * INTRA_SPREAD
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/** Transform at teardown depth d (0 assembled .. 1 fully exploded). */
export function partTransform(p: Part, mv: Movement, depth: number): Transform {
  const a = p.assembled(mv)
  if (depth === 0) return { x: a.x, y: a.y, z: p.zPos, rot: a.rot }
  const e = easeInOutCubic(Math.max(0, Math.min(1, depth))) * explodeMag(p)
  return {
    x: a.x + p.explodeDir.x * e,
    y: a.y + p.explodeDir.y * e,
    z: p.zPos + p.explodeDir.z * e,
    rot: a.rot,
  }
}

// --- fixed geometry of the calibre (world units, movement centre at 0,0) ---
export const GEO = {
  movementR: 162,
  caseR: 212,
  carriage: { x: 0, y: 88, r: 46 },
  escOrbitR: 25.5, // escape wheel arbor distance from carriage centre
  barrel: { x: -62, y: -56, r: 46 },
  center: { x: 0, y: 0 },
  third: { x: 56, y: 42, r: 28 },
  hourStar: { x: -56, y: -34 },
  minuteWheel: { x: -35, y: 16 },
  strikeTrain: { x: -14, y: -88 },
  governor: { x: -62, y: -112 },
  hourRackPivot: { x: -122, y: 40 },
  quarterRackPivot: { x: 112, y: -54 },
  minuteRackPivot: { x: 98, y: 66 },
  hammerLow: { x: 141, y: -20 },
  hammerHigh: { x: 141, y: 10 },
  gongAnchor: { x: 150, y: -5 },
  allOrNothing: { x: -146, y: -14 },
  crown: { x: 233, y: 0 },
  slide: { x: -208, y: 0 },
  dialR: 172,
  apertureR: 54,
}

function fixed(x: number, y: number, rot: (mv: Movement) => number = () => 0) {
  return (mv: Movement): PlanarTransform => ({ x, y, rot: rot(mv) })
}

/**
 * Contact-line angles: the direction from each snail's centre to its rack
 * pivot. The cams are rotated so that the step the CORE reads is exactly
 * the step drawn under this line — the rack tail visibly lands on the
 * correct snail step because both read the same geometry.
 */
export const CONTACT = {
  hour: Math.atan2(GEO.hourRackPivot.y - GEO.hourStar.y, GEO.hourRackPivot.x - GEO.hourStar.x),
  quarter: Math.atan2(GEO.quarterRackPivot.y - GEO.center.y, GEO.quarterRackPivot.x - GEO.center.x),
  minute: Math.atan2(GEO.minuteRackPivot.y - GEO.center.y, GEO.minuteRackPivot.x - GEO.center.x),
}

const fmt = (x: number, digits = 1) => x.toFixed(digits)

/** Assembled height of each part along the watch axis (world units). */
const ZPOS: Record<string, number> = {
  caseback: -6,
  slideSpring: 0,
  fixedFourth: 10,
  barrel: 14,
  centerWheel: 16,
  thirdWheel: 16,
  palletFork: 16,
  carriage: 18,
  escapeWheel: 18,
  trainBridge: 8,
  balance: 26,
  tourbillonBridge: 6,
  mainplate: 33,
  motionWorks: 36,
  hourStar: 38,
  quarterSnail: 39,
  surprisePiece: 40,
  hourSnail: 41,
  allOrNothing: 42,
  minuteSnail: 43,
  strikeTrain: 43,
  flyGovernor: 43,
  gongLow: 38,
  gongHigh: 40,
  hourRack: 45,
  quarterRack: 45,
  minuteRack: 45,
  hammerLow: 45,
  hammerHigh: 45,
  dial: 52,
  hourHand: 56,
  minuteHand: 59,
  caseband: 24,
  crown: 26,
  repeaterSlide: 26,
  bezelCrystal: 66,
}

export function buildParts(): Part[] {
  const g = GEO
  const parts: Omit<Part, 'zPos'>[] = [
    // ----------------------------------------------------- caseback (z 0+)
    {
      id: 'caseback',
      label: 'Case back',
      layer: 'caseback',
      z: 0,
      assembled: fixed(0, 0),
      explodeDir: { x: 0, y: 0, z: -1 }, // drops away behind
      hitRadius: 185,
      liveState: (mv) => [`sapphire exhibition back`, `movement running: ${mv.running ? 'yes' : 'no'}`],
    },
    {
      id: 'slideSpring',
      label: 'Repeater slide spring',
      layer: 'caseback',
      z: 2,
      assembled: fixed(g.slide.x + 14, g.slide.y + 26),
      explodeDir: { x: 0, y: 0, z: -1 },
      hitRadius: 22,
      liveState: (mv) => [`preload: ${fmt(mv.repeater.slideTravel * 100, 0)}% travel`],
    },
    // ------------------------------------------------- train side (z 10+)
    {
      id: 'barrel',
      label: 'Mainspring barrel',
      layer: 'train',
      z: 10,
      assembled: (mv) => ({ x: g.barrel.x, y: g.barrel.y, rot: mv.train.barrelAngle }),
      explodeDir: DIR_UP,
      hitRadius: g.barrel.r,
      liveState: (mv) => [
        `torque: ${(mv.mainspring.torque() * 1e3).toFixed(2)} mN·m`,
        `wind: ${fmt(mv.mainspring.windFraction * 100, 0)}%  (${fmt(mv.reserveHours())} h reserve)`,
        `${fmt(mv.mainspring.turns, 2)} of 5.7 turns`,
      ],
    },
    {
      id: 'centerWheel',
      label: 'Centre wheel (1 rev/h)',
      layer: 'train',
      z: 11,
      assembled: (mv) => ({ x: g.center.x, y: g.center.y, rot: mv.train.centerAngle }),
      explodeDir: DIR_UP,
      hitRadius: 40,
      liveState: (mv) => [`angle: ${fmt(((mv.train.centerAngle / TAU) % 1) * 360)}°`],
    },
    {
      id: 'thirdWheel',
      label: 'Third wheel',
      layer: 'train',
      z: 12,
      assembled: (mv) => ({ x: g.third.x, y: g.third.y, rot: -mv.train.thirdAngle }),
      explodeDir: DIR_UP,
      hitRadius: g.third.r,
      liveState: (mv) => [`8 rev/h`, `angle: ${fmt(((mv.train.thirdAngle / TAU) % 1) * 360)}°`],
    },
    {
      id: 'fixedFourth',
      label: 'Fixed fourth wheel',
      layer: 'train',
      z: 13,
      assembled: fixed(g.carriage.x, g.carriage.y),
      explodeDir: DIR_UP,
      hitRadius: 26,
      liveState: () => [`stationary — mounted to the mainplate`, `120 teeth; the escape pinion rolls around it`],
    },
    {
      id: 'carriage',
      label: 'Tourbillon carriage (seconds)',
      layer: 'train',
      z: 15,
      assembled: (mv) => ({ x: g.carriage.x, y: g.carriage.y, rot: mv.train.carriageAngle }),
      explodeDir: DIR_UP,
      hitRadius: g.carriage.r,
      liveState: (mv) => [
        `angle: ${fmt(((mv.train.carriageAngle / TAU) % 1) * 360)}° (1 rev/min)`,
        `driven by the train: esc ÷ ${ESC_REVS_PER_CARRIAGE_REV}`,
      ],
    },
    {
      id: 'escapeWheel',
      label: 'Escape wheel (15 teeth)',
      layer: 'train',
      z: 16,
      assembled: (mv) => {
        const ca = mv.train.carriageAngle
        return {
          x: g.carriage.x + Math.sin(ca) * g.escOrbitR,
          y: g.carriage.y - Math.cos(ca) * g.escOrbitR,
          rot: mv.esc.escAngle,
        }
      },
      explodeDir: DIR_UP,
      hitRadius: 13,
      liveState: (mv) => [
        `phase: ${['locked (draw holds it)', 'unlocking', 'impulse'][mv.esc.phase]}`,
        `total: ${fmt(mv.esc.escAngle / TAU, 2)} rev`,
      ],
    },
    {
      id: 'palletFork',
      label: 'Pallet fork',
      layer: 'train',
      z: 17,
      assembled: (mv) => {
        const ca = mv.train.carriageAngle
        const r = g.escOrbitR * 0.52
        return {
          x: g.carriage.x + Math.sin(ca) * r,
          y: g.carriage.y - Math.cos(ca) * r,
          rot: ca,
        }
      },
      explodeDir: DIR_UP,
      hitRadius: 12,
      liveState: (mv) => [
        `banked ${mv.esc.forkSide > 0 ? 'entry' : 'exit'} side`,
        `state: ${['locked', 'unlocking', 'impulse'][mv.esc.phase]}`,
      ],
    },
    {
      id: 'balance',
      label: 'Balance & hairspring (4 Hz)',
      layer: 'train',
      z: 18,
      assembled: (mv) => ({
        x: g.carriage.x,
        y: g.carriage.y,
        rot: mv.train.carriageAngle + mv.esc.theta,
      }),
      explodeDir: DIR_UP,
      hitRadius: 30,
      liveState: (mv) => [
        `θ = ${fmt(mv.esc.theta / DEG)}°   ω = ${fmt(mv.esc.omega)} rad/s`,
        `amplitude: ${fmt(mv.timing.amplitudeDeg() ?? 0, 0)}°`,
        `28,800 vph`,
      ],
    },
    {
      id: 'tourbillonBridge',
      label: 'Tourbillon bridge',
      layer: 'train',
      z: 19,
      assembled: fixed(g.carriage.x, g.carriage.y),
      explodeDir: DIR_UP,
      hitRadius: 50,
      liveState: () => ['upper pivot for the carriage'],
    },
    {
      id: 'mainplate',
      label: 'Mainplate',
      layer: 'train',
      z: 19.5,
      assembled: fixed(0, 0),
      explodeDir: DIR_UP,
      hitRadius: 162,
      liveState: () => ['carries the dial-side works', 'tourbillon aperture at 6'],
    },
    {
      id: 'trainBridge',
      label: 'Train bridge',
      layer: 'train',
      z: 14,
      assembled: fixed(-10, -20),
      explodeDir: DIR_UP,
      hitRadius: 80,
      liveState: () => ['jewelled upper pivots for barrel, centre and third wheels'],
    },
    // -------------------------------------------------- dial side (z 30+)
    {
      id: 'motionWorks',
      label: 'Motion works',
      layer: 'dialside',
      z: 30,
      assembled: (mv) => ({ x: g.minuteWheel.x, y: g.minuteWheel.y, rot: mv.train.minuteWheelAngle }),
      explodeDir: DIR_UP,
      hitRadius: 20,
      liveState: (mv) => {
        const t = mv.displayedTime()
        return [`cannon 1 rev/h, hour wheel 1 rev/12 h`, `hands: ${t.h}:${String(t.m).padStart(2, '0')}`]
      },
    },
    {
      id: 'hourStar',
      label: 'Hour star & jumper',
      layer: 'dialside',
      z: 31,
      assembled: (mv) => ({ x: g.hourStar.x, y: g.hourStar.y, rot: (mv.train.hourStar * TAU) / 12 }),
      explodeDir: DIR_UP,
      hitRadius: 20,
      liveState: (mv) => [`position: ${mv.train.hourStar} (hour ${mv.train.hourStar === 0 ? 12 : mv.train.hourStar})`],
    },
    {
      id: 'surprisePiece',
      label: 'Surprise piece',
      layer: 'dialside',
      z: 32,
      assembled: (mv) => ({ x: g.hourStar.x, y: g.hourStar.y, rot: (mv.train.hourStar * TAU) / 12 }),
      explodeDir: DIR_UP,
      hitRadius: 12,
      liveState: (mv) => [
        `snaps the star at the top of the hour`,
        `last snap: ${mv.t - mv.train.lastSnapT < 1e8 ? fmt(mv.t - mv.train.lastSnapT, 0) + ' s ago' : 'never'}`,
      ],
    },
    {
      id: 'hourSnail',
      label: 'Hour snail (12 steps)',
      layer: 'dialside',
      z: 33,
      // rotated so the star's current step sits under the hour-rack tail
      assembled: (mv) => ({
        x: g.hourStar.x,
        y: g.hourStar.y,
        rot: CONTACT.hour - ((hourSnailSteps(mv.train.hourStar) - 0.5) / 12) * TAU,
      }),
      explodeDir: DIR_UP,
      hitRadius: 30,
      liveState: (mv) => [
        `step: ${hourSnailSteps(mv.train.hourStar)} strikes worth of fall`,
      ],
    },
    {
      id: 'quarterSnail',
      label: 'Quarter snail (4 steps)',
      layer: 'dialside',
      z: 34,
      // deeper steps rotate under the quarter-rack contact line as the hour
      // progresses (drawn profile matches quarterSnailRadius exactly)
      assembled: (mv) => ({ x: g.center.x, y: g.center.y, rot: CONTACT.quarter - mv.train.cannonAngle }),
      explodeDir: DIR_UP,
      hitRadius: 24,
      liveState: (mv) => [
        `on the cannon pinion (1 rev/h)`,
        `radius under rack tail: ${fmt(quarterSnailRadius(mv.train.cannonAngle))}`,
      ],
    },
    {
      id: 'minuteSnail',
      label: 'Minute snail (4×15 steps)',
      layer: 'dialside',
      z: 35,
      assembled: (mv) => ({ x: g.center.x, y: g.center.y, rot: CONTACT.minute - mv.train.cannonAngle }),
      explodeDir: DIR_UP,
      hitRadius: 18,
      liveState: () => [`reads minutes within the quarter (0–14)`],
    },
    {
      id: 'hourRack',
      label: 'Hour rack',
      layer: 'dialside',
      z: 36,
      assembled: (mv) => ({ x: g.hourRackPivot.x, y: g.hourRackPivot.y, rot: rackAngle(mv, 'hour') }),
      explodeDir: DIR_UP,
      hitRadius: 34,
      liveState: (mv) => rackState(mv, 'hour'),
    },
    {
      id: 'quarterRack',
      label: 'Quarter rack',
      layer: 'dialside',
      z: 37,
      assembled: (mv) => ({ x: g.quarterRackPivot.x, y: g.quarterRackPivot.y, rot: rackAngle(mv, 'quarter') }),
      explodeDir: DIR_UP,
      hitRadius: 30,
      liveState: (mv) => rackState(mv, 'quarter'),
    },
    {
      id: 'minuteRack',
      label: 'Minute rack',
      layer: 'dialside',
      z: 38,
      assembled: (mv) => ({ x: g.minuteRackPivot.x, y: g.minuteRackPivot.y, rot: rackAngle(mv, 'minute') }),
      explodeDir: DIR_UP,
      hitRadius: 30,
      liveState: (mv) => rackState(mv, 'minute'),
    },
    {
      id: 'strikeTrain',
      label: 'Strike train & gathering pallet',
      layer: 'dialside',
      z: 39,
      assembled: (mv) => ({ x: g.strikeTrain.x, y: g.strikeTrain.y, rot: mv.repeater.trainPhi }),
      explodeDir: DIR_UP,
      hitRadius: 20,
      liveState: (mv) => [
        `φ = ${fmt(mv.repeater.trainPhi / TAU, 1)} rev,  ω = ${fmt(mv.repeater.trainOmega)} rad/s`,
        `powered by the strike spring, not the mainspring`,
      ],
    },
    {
      id: 'flyGovernor',
      label: 'Fly governor',
      layer: 'dialside',
      z: 40,
      assembled: (mv) => ({ x: g.governor.x, y: g.governor.y, rot: mv.repeater.trainPhi * 6 }),
      explodeDir: DIR_UP,
      hitRadius: 18,
      liveState: (mv) => [
        `air-brake: cadence = √(τ/drag)`,
        `cadence: ${fmt(mv.repeater.trainOmega / TAU, 2)} strikes/s`,
      ],
    },
    {
      id: 'allOrNothing',
      label: 'All-or-nothing piece',
      layer: 'dialside',
      z: 41,
      assembled: fixed(g.allOrNothing.x, g.allOrNothing.y),
      explodeDir: DIR_UP,
      hitRadius: 16,
      liveState: (mv) => [
        mv.repeater.latched ? 'LATCHED — strike committed' : 'not latched',
        `slide travel: ${fmt(mv.repeater.slideTravel * 100, 0)}% (needs ≥ 85%)`,
      ],
    },
    {
      id: 'hammerLow',
      label: 'Low-gong hammer',
      layer: 'dialside',
      z: 42,
      assembled: fixed(g.hammerLow.x, g.hammerLow.y),
      explodeDir: DIR_UP,
      hitRadius: 14,
      liveState: () => ['strikes the hours and the first note of each ding-dong'],
    },
    {
      id: 'hammerHigh',
      label: 'High-gong hammer',
      layer: 'dialside',
      z: 43,
      assembled: fixed(g.hammerHigh.x, g.hammerHigh.y),
      explodeDir: DIR_UP,
      hitRadius: 14,
      liveState: () => ['strikes the minutes and the second note of each ding-dong'],
    },
    {
      id: 'gongLow',
      label: 'Low gong',
      layer: 'dialside',
      z: 44,
      assembled: fixed(0, 0),
      explodeDir: DIR_UP,
      hitRadius: 156,
      liveState: () => ['cathedral gong: wraps nearly twice around the movement'],
    },
    {
      id: 'gongHigh',
      label: 'High gong',
      layer: 'dialside',
      z: 45,
      assembled: fixed(0, 0),
      explodeDir: DIR_UP,
      hitRadius: 150,
      liveState: () => ['tuned roughly a third above the low gong'],
    },
    // -------------------------------------------------------- dial (z 60)
    {
      id: 'dial',
      label: 'Dial',
      layer: 'dial',
      z: 60,
      assembled: fixed(0, 0),
      explodeDir: DIR_UP,
      hitRadius: GEO.dialR,
      liveState: () => ['tourbillon aperture at 6 o’clock'],
    },
    // ------------------------------------------------------- hands (z 70)
    {
      id: 'hourHand',
      label: 'Hour hand',
      layer: 'hands',
      z: 70,
      assembled: (mv) => ({ x: 0, y: 0, rot: mv.train.hourWheelAngle }),
      explodeDir: DIR_UP,
      hitRadius: 60,
      liveState: (mv) => [`${fmt((((mv.train.hourWheelAngle / TAU) % 1) + 1) % 1 * 360)}°`],
    },
    {
      id: 'minuteHand',
      label: 'Minute hand',
      layer: 'hands',
      z: 71,
      assembled: (mv) => ({ x: 0, y: 0, rot: mv.train.cannonAngle }),
      explodeDir: DIR_UP,
      hitRadius: 90,
      liveState: (mv) => [`${fmt((((mv.train.cannonAngle / TAU) % 1) + 1) % 1 * 360)}°`],
    },
    // -------------------------------------------------------- case (z 80+)
    {
      id: 'caseband',
      label: 'Case band & lugs',
      layer: 'case',
      z: 80,
      assembled: fixed(0, 0),
      explodeDir: DIR_UP,
      hitRadius: GEO.caseR,
      liveState: () => ['carries the crown and the repeater slide'],
    },
    {
      id: 'crown',
      label: 'Crown',
      layer: 'case',
      z: 81,
      assembled: fixed(GEO.crown.x, GEO.crown.y),
      explodeDir: { x: 1, y: 0, z: 0.12 }, // pulls out along its stem
      hitRadius: 18,
      liveState: (mv) => [
        mv.crownPulled ? 'position 1: SETTING (drag to move the hands)' : 'position 0: WINDING',
        'double-click to pull/push',
      ],
    },
    {
      id: 'repeaterSlide',
      label: 'Repeater slide',
      layer: 'case',
      z: 82,
      assembled: (mv) => ({
        x: GEO.slide.x,
        y: GEO.slide.y + mv.repeater.slideTravel * 34,
        rot: 0,
      }),
      explodeDir: { x: -1, y: 0, z: 0.12 },
      hitRadius: 20,
      liveState: (mv) => [
        `travel: ${fmt(mv.repeater.slideTravel * 100, 0)}%`,
        mv.repeater.latched ? 'all-or-nothing: LATCHED' : 'all-or-nothing: open',
      ],
    },
    {
      id: 'bezelCrystal',
      label: 'Bezel & crystal',
      layer: 'case',
      z: 83,
      assembled: fixed(0, 0),
      explodeDir: DIR_UP,
      hitRadius: 200,
      liveState: () => ['sapphire, AR-coated (honest)'],
    },
  ]
  return parts.map((p) => ({ ...p, zPos: ZPOS[p.id] ?? 0 }))
}

function rackAngle(mv: Movement, which: 'hour' | 'quarter' | 'minute'): number {
  const r =
    which === 'hour' ? mv.repeater.hourRack : which === 'quarter' ? mv.repeater.quarterRack : mv.repeater.minuteRack
  return r.currentAngle(mv.repeater.gatherProgress(r))
}

function rackState(mv: Movement, which: 'hour' | 'quarter' | 'minute'): string[] {
  const r =
    which === 'hour' ? mv.repeater.hourRack : which === 'quarter' ? mv.repeater.quarterRack : mv.repeater.minuteRack
  if (r.state === RACK_IDLE) return ['at rest (fully gathered)']
  return [
    `fallen: ${fmt(r.currentAngle(mv.repeater.gatherProgress(r)) / DEG)}°`,
    `teeth exposed by the snail step: ${r.teeth}`,
    `gathered so far: ${r.gathered} of ${r.teeth}`,
  ]
}

// ------------------------------------------------------------------ //
// Layer presets (spec §5.5): each shows exactly the intended parts.
// ------------------------------------------------------------------ //
export const ALL_LAYERS: LayerName[] = ['caseback', 'train', 'dialside', 'dial', 'hands', 'case']

export const PRESETS: Record<string, LayerName[]> = {
  fullCase: ALL_LAYERS,
  movementOnly: ['train', 'dialside'],
  dialSide: ['dialside'],
  trainSide: ['train'],
}
