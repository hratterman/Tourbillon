import { KEYLESS_SET_RATIO, KEYLESS_WIND_RATIO, TAU } from '../core/constants'
import { ALL_OR_NOTHING_TRAVEL } from '../core/repeater'

/**
 * The mechanical layout of the calibre: the single source of truth for
 * every arbor position, pitch radius, tooth count, z-tier and gear-mesh
 * relationship in the 3-D model.
 *
 * Rules enforced here (and asserted, both at module load and in the
 * acceptance tests):
 *   - pitch radius r = module × teeth / 2, per wheel;
 *   - for every spur mesh, centre distance = r_A + r_B (exact);
 *   - meshing tooth tiers overlap in z;
 *   - driven wheels render at the tooth-phase dictated by their driver
 *     (meshedAngle), so teeth genuinely interleave at any zoom.
 *
 * Coordinates are watch-plane (x toward the crown, y toward 6 o'clock),
 * angles clockwise-positive as displayed; z runs caseback → crystal.
 */

export interface Wheel {
  teeth: number
  module: number
  /** pitch radius */
  r: number
  /** arbor position, watch coords */
  x: number
  y: number
  /** tooth tier along the watch axis */
  z0: number
  z1: number
}

function wheel(teeth: number, module: number, x: number, y: number, z0: number, z1: number): Wheel {
  return { teeth, module, r: (module * teeth) / 2, x, y, z0, z1 }
}

const unit = (dx: number, dy: number) => {
  const l = Math.hypot(dx, dy)
  return { x: dx / l, y: dy / l }
}

// --------------------------------------------------------------------- //
// Going train
// --------------------------------------------------------------------- //

export const CARRIAGE_POS = { x: 0, y: 88 }

// tourbillon epicyclic: fixed fourth 120t, escape pinion 8t, module 0.4
export const fixedFourth = wheel(120, 0.4, CARRIAGE_POS.x, CARRIAGE_POS.y, 15, 17)
export const escPinion = wheel(8, 0.4, NaN, NaN, 15, 17) // orbits; plan pos dynamic
export const ESC_ORBIT_R = fixedFourth.r + escPinion.r // 25.6

// third wheel 75t ⇄ carriage pinion 10t, module 0.75
export const carriagePinion = wheel(10, 0.75, CARRIAGE_POS.x, CARRIAGE_POS.y, 5.5, 8)
export const thirdWheel = wheel(75, 0.75, 0, CARRIAGE_POS.y - (0.75 * 85) / 2, 5.5, 8)

// centre wheel 80t ⇄ third pinion 10t: distance fixed by |third - centre|
const D_CT = Math.hypot(thirdWheel.x, thirdWheel.y) // 56.125
const M_CT = (2 * D_CT) / (80 + 10)
export const centerWheel = wheel(80, M_CT, 0, 0, 9, 11.5)
export const thirdPinion = wheel(10, M_CT, thirdWheel.x, thirdWheel.y, 9, 11.5)

// barrel 84t ⇄ centre pinion 12t, module 1.15 — the module is chosen so
// the barrel ARBOR clears the centre wheel's tooth circle (r_tip 51):
// centre distance 55.2 leaves 4.2 - 3.2 of daylight, audited below
const M_BC = 1.15
const BARREL_DIR = unit(0.743, -0.669)
const D_BC = (M_BC * (84 + 12)) / 2
export const centerPinion = wheel(12, M_BC, 0, 0, 4, 7)
export const barrel = wheel(84, M_BC, BARREL_DIR.x * D_BC, BARREL_DIR.y * D_BC, 4, 7)
// drum wall inside the tooth roots, thin enough that the centre wheel
// (z 9..11.5) passes OVER it
export const BARREL_DRUM = { r: 46, z0: 3, z1: 8.5 }

// --------------------------------------------------------------------- //
// Motion works (dial side)
// --------------------------------------------------------------------- //

// module chosen so the minute-wheel pinion's tall shaft clears the quarter
// snail, and the stem's tip pivot clears the minute wheel's teeth
const M_MW = 1.35
const MW_DIR = unit(0.94, 0.342) // toward the crown, clear of the well
export const cannonPinion = wheel(12, M_MW, 0, 0, 22, 25)
export const minuteWheel = wheel(36, M_MW, MW_DIR.x * ((M_MW * 48) / 2), MW_DIR.y * ((M_MW * 48) / 2), 22, 24.4)
// minute-wheel pinion 10t ⇄ hour wheel 40t over the same centre distance.
// The hour wheel rides ABOVE the quarter/minute snail stack (a real
// repeater constraint: the snails own the cannon between the motion works
// and the hour wheel), so the pinion is tall and the hour pipe starts high.
const D_MH = Math.hypot(minuteWheel.x, minuteWheel.y)
const M_MH = (2 * D_MH) / 50
export const minuteWheelPinion = wheel(10, M_MH, minuteWheel.x, minuteWheel.y, 24.4, 37)
export const hourWheel = wheel(40, M_MH, 0, 0, 35, 37)

// --------------------------------------------------------------------- //
// Keyless works.
//
// Winding, exactly as an open caseback shows it: the RATCHET wheel sits on
// the BACK face of the barrel bridge, keyed to the barrel-arbor square
// through the bridge, held by the click; beside it the CROWN WHEEL, on its
// core screwed to the bridge. The stem, far up at the dial side, drives
// them through an intermediate TRANSFER wheel: winding pinion (12 crown
// teeth) ⇄ transfer contrate ring (36t) under the stem, down a tall arbor
// to the transfer spur (36t) ⇄ crown wheel (36t) ⇄ ratchet (60t).
//   1 stem turn = 12/36 × 36/36 × 36/60 = 1/5 barrel turn.
// Setting: castle → s1 idler → s2 (two-tier) → minute wheel.
// Stem axis: y = 0, z = STEM_Z.
// --------------------------------------------------------------------- //

export const STEM_Z = 24.5
export const STEM_R = 2.6

/** Back-side winding tier: on the barrel bridge's caseback face. */
export const BACK_TIER = { z0: -5, z1: -2.6 }

// ratchet on the barrel arbor square, over the bridge
export const ratchet = wheel(60, 0.9, barrel.x, barrel.y, BACK_TIER.z0, BACK_TIER.z1)

// transfer wheel: contrate ring tangent under the stem; plan position far
// enough out that its tall arbor clears the barrel drum
export const TRANSFER_RING = { teeth: 36, r: 15, z0: 16.5, z1: 18 }
export const transferWheel = wheel(36, 0.9, 88, -TRANSFER_RING.r, BACK_TIER.z0, BACK_TIER.z1)

// crown wheel: meshes the transfer spur AND the ratchet (solved position)
export const crownWheel = wheel(36, 0.9, NaN, NaN, BACK_TIER.z0, BACK_TIER.z1)
{
  const dA = crownWheel.r + ratchet.r // to the barrel arbor
  const dB = crownWheel.r + transferWheel.r // to the transfer arbor
  const D = Math.hypot(transferWheel.x - barrel.x, transferWheel.y - barrel.y)
  const a = (D * D + dA * dA - dB * dB) / (2 * D)
  const h = Math.sqrt(Math.max(0, dA * dA - a * a))
  const u = unit(transferWheel.x - barrel.x, transferWheel.y - barrel.y)
  // pick the solution on the caseband side (larger |y|), clear of the train
  crownWheel.x = barrel.x + a * u.x + h * u.y
  crownWheel.y = barrel.y + a * u.y - h * u.x
}

// click (pawl) on the bridge, holding the ratchet against the mainspring
export const CLICK = { pivot: { x: 10, y: -55 }, z0: BACK_TIER.z0, z1: BACK_TIER.z1 }

// winding pinion on the stem — the OUTERMOST piece of the keyless works,
// as in a real calibre (12 crown-form teeth), dog-clutch face inboard (x−)
export const WINDING_PINION = { teeth: 12, r: 6.5, x: transferWheel.x, w: 5 }
// sliding castle wheel INBOARD of the winding pinion: dog face outboard
// toward the pinion; 12t spur ring at its inboard end reaches the setting
// idler when the crown is pulled and the yoke slides the castle INWARD
export const CASTLE = { teeth: 12, r: 5.4, xRest: 80.5, pull: 6.1, w: 8 }
/** Spur-ring offset from the castle centre (at its inboard end). */
export const CASTLE_SPUR_OFF = -(CASTLE.w / 2 - 1.5)

// setting wheels (in plate recesses, z tier just under the motion works)
export const s1Idler = wheel(18, 0.75, NaN, NaN, 19, 21.5)
s1Idler.y = -(s1Idler.r + CASTLE.r) // tips reach the castle's spur circle
// directly under the castle's spur ring in the PULLED (inboard) position
s1Idler.x = CASTLE.xRest - CASTLE.pull + CASTLE_SPUR_OFF
export const s2Wheel = wheel(48, 0.75, NaN, NaN, 19, 21.4)
export const s2Pinion = wheel(8, M_MW, NaN, NaN, 21.4, 25.5)
{
  // s2 must mesh s1 (r + r) and the minute wheel (via its pinion)
  const dA = s1Idler.r + s2Wheel.r
  const dB = s2Pinion.r + minuteWheel.r
  const D = Math.hypot(minuteWheel.x - s1Idler.x, minuteWheel.y - s1Idler.y)
  const a = (D * D + dA * dA - dB * dB) / (2 * D)
  const h = Math.sqrt(Math.max(0, dA * dA - a * a))
  const u = unit(minuteWheel.x - s1Idler.x, minuteWheel.y - s1Idler.y)
  // the southern solution: clear of the stem, the winding pinion above and
  // the barrel arbor below (all margins audited by the collision volumes)
  s2Wheel.x = s1Idler.x + a * u.x - h * u.y
  s2Wheel.y = s1Idler.y + a * u.y + h * u.x
  s2Pinion.x = s2Wheel.x
  s2Pinion.y = s2Wheel.y
}

/** Exact keyless ratios (asserted): winding 12/36 × 36/36 × 36/60 = 1/5
 * turn of ratchet per stem turn; setting (12/48)(8/36)(36/12) = 1/6 cannon
 * turn per stem turn = 10 minutes per crown revolution. */
export const WIND_RATIO = (12 / 36) * (36 / 36) * (36 / 60) // 0.2
export const SET_RATIO = (12 / 48) * (8 / 36) * (36 / 12) // 1/6

// --------------------------------------------------------------------- //
// The stem and the levers that make pulling the crown DO something.
//
// Stem anatomy, inboard → outboard, exactly as cut on a real stem: tip
// pivot (seated in a plate boss) → square section (the castle rides it) →
// round winding-pinion seat → setting-lever groove → hub → case tube →
// crown. Pulling the crown slides the whole stem out by CASTLE.pull; the
// SETTING LEVER's pin, riding in the groove, rotates the lever; its finger
// throws the YOKE, whose fork (riding the castle's waist groove) slides
// the castle INBOARD off the winding pinion's dogs and onto the setting
// idler. Both lever angles are solved exactly from these constraints for
// each crown position — the drawn linkage realises the same travel the
// core's crownPulled state switches on.
// --------------------------------------------------------------------- //

export const STEM_TIP = { x0: 62.6, x1: 67.9, r: 1.5 }
export const STEM_SQUARE = { x0: 67.9, x1: 85, half: 1.9 }
export const STEM_GROOVE = { x: 93, halfW: 1.4, rootR: 1.6 }
export const CASTLE_GROOVE = { off: 0.8, halfW: 1.2, rootR: 2.9 }
/** Stem-tip support: a pierced block on the plate's dial face — the stem's
 * tip pivot runs in its horizontal bore. */
export const STEM_BOSS = { x: 65.5, hw: 2.4, boreHalf: 1.7, wallW: 0.9, z0: 21.5, z1: 27.6 }

export const SETTING_LEVER = {
  // pivot x = the groove's mid-travel → the pin's arc stays under the stem
  pivot: { x: STEM_GROOVE.x + CASTLE.pull / 2, y: -34 },
  pinR: 1.2,
}
export const YOKE = {
  // pivot x = the castle's mid-travel → the fork's arc stays on the groove
  pivot: { x: CASTLE.xRest - CASTLE.pull / 2, y: -27 },
  tipY: -4.8,
  tailPin: { x: 79.5, y: -37 },
}

const leverLen = Math.hypot(STEM_GROOVE.x - SETTING_LEVER.pivot.x, SETTING_LEVER.pivot.y)
/** Setting-lever pin position for a crown state (rides the stem groove). */
export function settingLeverPin(pulled: boolean): { x: number; y: number } {
  const gx = STEM_GROOVE.x + (pulled ? CASTLE.pull : 0)
  const dx = gx - SETTING_LEVER.pivot.x
  return { x: gx, y: SETTING_LEVER.pivot.y + Math.sqrt(leverLen * leverLen - dx * dx) }
}
/** Setting-lever rotation (watch rad, about its pivot) for a crown state. */
export function settingLeverAngle(pulled: boolean): number {
  const p = settingLeverPin(pulled)
  const p0 = settingLeverPin(false)
  return (
    Math.atan2(p.y - SETTING_LEVER.pivot.y, p.x - SETTING_LEVER.pivot.x) -
    Math.atan2(p0.y - SETTING_LEVER.pivot.y, p0.x - SETTING_LEVER.pivot.x)
  )
}
/** Castle centre x for a crown state (the yoke's throw). */
export function castleX(pulled: boolean): number {
  return CASTLE.xRest - (pulled ? CASTLE.pull : 0)
}
const yokeLen = Math.hypot(castleX(false) + CASTLE_GROOVE.off - YOKE.pivot.x, YOKE.tipY - YOKE.pivot.y)
/** Yoke rotation (watch rad) for a crown state — fork stays in the groove. */
export function yokeAngle(pulled: boolean): number {
  const fx = castleX(pulled) + CASTLE_GROOVE.off
  const dx = fx - YOKE.pivot.x
  const fy = YOKE.pivot.y + Math.sqrt(yokeLen * yokeLen - dx * dx)
  const f0x = castleX(false) + CASTLE_GROOVE.off
  const f0y = YOKE.pivot.y + Math.sqrt(yokeLen * yokeLen - (f0x - YOKE.pivot.x) ** 2)
  return Math.atan2(fy - YOKE.pivot.y, fx - YOKE.pivot.x) - Math.atan2(f0y - YOKE.pivot.y, f0x - YOKE.pivot.x)
}

// --------------------------------------------------------------------- //
// Strike train (dial side): strike wheel (gathering pallet) → intermediate
// two-tier → governor pinion.  ω_gov = 40/10 × 36/24 = 6 × ω_strike.
// --------------------------------------------------------------------- //

// strike wheel low over the plate, under all three rack tiers — only its
// gathering pallets rise into the racks' tooth paths. The intermediate
// sits radially OUTSIDE the hour rack's swept sector; the governor tucks
// back inside it (through the sector's inner clear circle), keeping the
// fly's vanes inside the gong coils.
export const strikeWheel = wheel(40, 1.0, 72, -72, 22, 24)
export const strikeInterPinion = wheel(10, 1.0, NaN, NaN, 22, 24)
export const strikeInterWheel = wheel(36, 0.7, NaN, NaN, 29.8, 32)
export const governorPinion = wheel(24, 0.7, NaN, NaN, 29.8, 32)
{
  const dir1 = unit(0.05, -0.999)
  const d1 = strikeWheel.r + strikeInterPinion.r
  strikeInterPinion.x = strikeWheel.x + dir1.x * d1
  strikeInterPinion.y = strikeWheel.y + dir1.y * d1
  strikeInterWheel.x = strikeInterPinion.x
  strikeInterWheel.y = strikeInterPinion.y
  const dir2 = unit(-0.85, -0.527)
  const d2 = strikeInterWheel.r + governorPinion.r
  governorPinion.x = strikeInterWheel.x + dir2.x * d2
  governorPinion.y = strikeInterWheel.y + dir2.y * d2
}
export const GOV_RATIO = (40 / 10) * (36 / 24) // 6

// --------------------------------------------------------------------- //
// Repeater cluster geometry: the racks' toothed sectors converge on the
// strike wheel's three-tier gathering pallet staff (one pallet per rack
// tier, like a real repeater's stacked racks), and the hammers pivot
// between the cluster and the gongs — long arms out to the gong band,
// tall tail pallets back into the racks' tooth paths, which is what
// lifts them.
// --------------------------------------------------------------------- //

/** Reach of each gathering pallet from the strike-wheel arbor. */
export const GATHER_R = 12.8

export interface RackGeo {
  pivot: { x: number; y: number }
  sectorR: number // tooth root arc radius about the pivot
  toothTipH: number
  z0: number
  z1: number
  armAngle: number // sector centre-line azimuth (watch rad): aims at the staff
}

const aim = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  Math.atan2(to.y - from.y, to.x - from.x)

export const RACK_GEO: Record<'hour' | 'quarter' | 'minute', RackGeo> = {
  hour: {
    pivot: { x: 25, y: -100 },
    sectorR: 42,
    toothTipH: 2.5,
    z0: 25,
    z1: 27.2,
    armAngle: aim({ x: 25, y: -100 }, strikeWheel),
  },
  quarter: {
    pivot: { x: 118, y: -58 },
    sectorR: 34,
    toothTipH: 2.4,
    z0: 29,
    z1: 31.2,
    armAngle: aim({ x: 118, y: -58 }, strikeWheel),
  },
  minute: {
    pivot: { x: 111, y: -46 },
    sectorR: 34,
    toothTipH: 2.4,
    z0: 32,
    z1: 34.2,
    armAngle: aim({ x: 111, y: -46 }, strikeWheel),
  },
}

// --------------------------------------------------------------------- //
// Gongs: Archimedean coils wound 1.9 turns inward around the movement,
// both feet brazed into one block. All coil positions below are EXACT —
// the same function places the drawn tube, aims the hammer heads and
// audits the clearances.
// --------------------------------------------------------------------- //

export interface GongSpec {
  rStart: number
  drop: number
  turns: number
  tubeR: number
  a0: number // foot azimuth, watch rad; the coil advances +θ as it drops
  z: number // coil plane
}

export const GONG_LOW: GongSpec = { rStart: 156, drop: 17, turns: 1.9, tubeR: 1.6, a0: 0.47, z: 29 }
export const GONG_HIGH: GongSpec = { rStart: 151.5, drop: 17, turns: 1.9, tubeR: 1.6, a0: 0.56, z: 35.9 }

/** Centre-line radii of every coil pass at watch azimuth θ. */
export function gongCoilRadii(g: GongSpec, theta: number): number[] {
  const radii: number[] = []
  let d = theta - g.a0
  d -= TAU * Math.floor(d / TAU)
  for (let k = 0; ; k++) {
    const t = (d + k * TAU) / (g.turns * TAU)
    if (t > 1) break
    radii.push(g.rStart - g.drop * t)
  }
  return radii
}

/** The innermost coil at θ — the one the hammer strikes from inside. */
export function gongInnerCoil(g: GongSpec, theta: number): number {
  return Math.min(...gongCoilRadii(g, theta))
}

export interface HammerGeo {
  pivot: { x: number; y: number }
  elbow?: { x: number; y: number } // dog-leg knee (high hammer skirts the racks)
  headAz: number // strike azimuth (watch rad, from the movement centre)
  headTip: { x: number; y: number } // striking-face contact point, at rest gap
  z: number // arm/head plane = its gong plane
  tailAzimuth: number // toward the strike-wheel arbor
  tailLen: number // pivot -> lifting pallet (just clear of the staff)
  tailZ0: number
  tailZ1: number // the tall lifting pallet spans its racks' tooth tiers
}

/** Rest gap between the hammer's striking face and its coil. */
export const HAMMER_GAP = 0.5
/** Cocking swing of a hammer arm (watch rad, away from the gong). */
export const HAMMER_SWING = 0.14

function hammerGeo(pivot: { x: number; y: number }, headAz: number, gong: GongSpec, tailZ0: number, tailZ1: number, elbow?: { x: number; y: number }): HammerGeo {
  const faceR = gongInnerCoil(gong, headAz) - gong.tubeR - HAMMER_GAP
  const d = Math.hypot(strikeWheel.x - pivot.x, strikeWheel.y - pivot.y)
  return {
    pivot,
    elbow,
    headAz,
    headTip: { x: Math.cos(headAz) * faceR, y: Math.sin(headAz) * faceR },
    z: gong.z,
    tailAzimuth: aim(pivot, strikeWheel),
    tailLen: d - GATHER_R,
    tailZ0,
    tailZ1,
  }
}

// low hammer: pivots north-east, clear of both racks' sweeps; its short
// arm strikes the low gong's single coil pass near the block. Lifted by
// hour-rack AND quarter-rack teeth (tall pallet).
export const HAMMER_LOW = hammerGeo({ x: 104, y: -33 }, -0.28, GONG_LOW, 25, 31.2)
export const HAMMER_LOW_ARM_T = 1.8
// high hammer: lifted by quarter-rack AND minute-rack teeth; its arm is a
// dog-leg that clears the racks' hubs and swings (the legs live ABOVE the
// quarter tier; only its stud descends, off the quarter tail's line)
export const HAMMER_HIGH = hammerGeo({ x: 70, y: -40 }, -0.35, GONG_HIGH, 29, 34.2, { x: 105, y: -30 })
export const HAMMER_HIGH_ARM_T = 2.4

/** Both gong feet are brazed into one block on the plate (azimuth sector,
 * radially OUTSIDE every inner coil pass). */
export const GONG_BLOCK = { a0: 0.42, a1: 0.61, rIn: 149, rOut: 159, z0: 27.3, z1: 37.7 }

// --------------------------------------------------------------------- //
// Strike bridge: the dial-side cock giving the strike wheel, intermediate
// and governor their UPPER pivots (their lower ones are jewelled in the
// mainplate). Sits over the fly's vanes, under the dial.
// --------------------------------------------------------------------- //
export const STRIKE_BRIDGE = { z0: 38, z1: 39.6 }


// --------------------------------------------------------------------- //
// Z tiers for the rest of the stack (kept here so clashes are auditable)
// --------------------------------------------------------------------- //
export const Z = {
  casebackFace: -9,
  bridges: { z0: -2, z1: 2 },
  plate: { z0: 17, z1: 21.5 },
  cageRing: 13.7,
  cageBar: { z0: 17.4, z1: 19.8 }, // escapement lower bearings, over the fixed wheel
  cageTop: 37,
  escapeWheel: { z0: 20.2, z1: 21.7 },
  fork: { z0: 22, z1: 24.5 },
  roller: 26,
  balance: { z0: 28, z1: 32 },
  hairspring: { z0: 33.5, z1: 35.5 },
  hourStar: { z0: 23, z1: 25 },
  hourSnail: { z0: 25.5, z1: 28.3 },
  quarterSnail: { z0: 29, z1: 31.5 },
  minuteSnail: { z0: 32, z1: 34.4 },
  hourRack: { z0: 25, z1: 27.2 },
  quarterRack: { z0: 29, z1: 31.2 },
  minuteRack: { z0: 32, z1: 34.2 },
  dial: { z0: 42, z1: 44 },
  hourPipe: { r: 7.5, z0: 37.3, z1: 46.8 },
  cannonPipe: { r: 5, z0: 25, z1: 48 },
  hourHand: 45.3,
  minuteHand: 47.4,
  bezel: 50,
}

// --------------------------------------------------------------------- //
// Tooth-phase locking.
//
// gearShape() draws tooth 0 centred at local angle (0.175 × pitch). For an
// external spur mesh, when a tooth-centre of the DRIVER points along the
// centre line ψ, a gap-centre of the DRIVEN wheel must point along ψ + π.
// meshedAngle() returns the driven wheel's rendered angle as a pure
// function of the driver's angle — kinematically exact (dθ_B = -dθ_A N_A/N_B)
// and phase-correct at every instant, so the teeth always interleave.
// --------------------------------------------------------------------- //

export const TOOTH_CENTER = (teeth: number): number => (0.175 * TAU) / teeth

function wrapTo(x: number, period: number): number {
  return x - period * Math.round(x / period)
}

export function meshedAngle(
  thetaDriver: number,
  driver: { teeth: number; x: number; y: number },
  driven: { teeth: number; x: number; y: number },
): number {
  const psi = Math.atan2(driven.y - driver.y, driven.x - driver.x)
  const pA = TAU / driver.teeth
  const pB = TAU / driven.teeth
  // driver tooth-centre offset from the centre line
  const a = wrapTo(thetaDriver + TOOTH_CENTER(driver.teeth) - psi, pA)
  // driven: place a gap-centre on the line (ψ+π), rolled back by a·N_A/N_B
  return psi + Math.PI - TOOTH_CENTER(driven.teeth) - pB / 2 - (a * driver.teeth) / driven.teeth
}

/** Angular alignment residual of a mesh (0 = perfectly interleaved). */
export function meshResidual(
  thetaA: number,
  A: { teeth: number; x: number; y: number },
  thetaB: number,
  B: { teeth: number; x: number; y: number },
): number {
  const ideal = meshedAngle(thetaA, A, B)
  return Math.abs(wrapTo(thetaB - ideal, TAU / B.teeth))
}

// --------------------------------------------------------------------- //
// The declared mesh list (audited by tests/09-geometry.test.ts)
// --------------------------------------------------------------------- //
export interface MeshSpec {
  name: string
  a: Wheel
  b: Wheel
}

export const SPUR_MESHES: MeshSpec[] = [
  { name: 'barrel ⇄ centre pinion', a: barrel, b: centerPinion },
  { name: 'centre wheel ⇄ third pinion', a: centerWheel, b: thirdPinion },
  { name: 'third wheel ⇄ carriage pinion', a: thirdWheel, b: carriagePinion },
  { name: 'cannon pinion ⇄ minute wheel', a: cannonPinion, b: minuteWheel },
  { name: 'minute-wheel pinion ⇄ hour wheel', a: minuteWheelPinion, b: hourWheel },
  { name: 'transfer wheel ⇄ crown wheel', a: transferWheel, b: crownWheel },
  { name: 'crown wheel ⇄ ratchet', a: crownWheel, b: ratchet },
  { name: 's1 idler ⇄ s2 wheel', a: s1Idler, b: s2Wheel },
  { name: 's2 pinion ⇄ minute wheel', a: s2Pinion, b: minuteWheel },
  { name: 'strike wheel ⇄ intermediate pinion', a: strikeWheel, b: strikeInterPinion },
  { name: 'intermediate wheel ⇄ governor pinion', a: strikeInterWheel, b: governorPinion },
]

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Layout assertion failed: ${msg}`)
}

for (const m of SPUR_MESHES) {
  const d = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y)
  check(Math.abs(d - (m.a.r + m.b.r)) < 0.05, `${m.name}: distance ${d.toFixed(3)} != ${(m.a.r + m.b.r).toFixed(3)}`)
  check(Math.min(m.a.z1, m.b.z1) - Math.max(m.a.z0, m.b.z0) > 0.8, `${m.name}: tooth tiers do not overlap in z`)
}
// epicyclic: escape pinion orbit radius
check(Math.abs(ESC_ORBIT_R - 25.6) < 1e-9, 'escape pinion orbit')
// keyless ratios are exactly the ones the Movement's physics uses
check(Math.abs(WIND_RATIO - KEYLESS_WIND_RATIO) < 1e-12, 'winding chain must match KEYLESS_WIND_RATIO')
check(Math.abs(SET_RATIO - KEYLESS_SET_RATIO) < 1e-12, 'setting chain must match KEYLESS_SET_RATIO')
// the setting cluster stays clear of the tourbillon well
check(
  Math.hypot(s2Wheel.x - CARRIAGE_POS.x, s2Wheel.y - CARRIAGE_POS.y) > 51 + s2Wheel.r,
  's2 clears the tourbillon well',
)
// every rack's tooth tips pass within reach of its gathering pallet tier
for (const key of ['hour', 'quarter', 'minute'] as const) {
  const rg = RACK_GEO[key]
  const d = Math.hypot(strikeWheel.x - rg.pivot.x, strikeWheel.y - rg.pivot.y)
  const gap = d - (rg.sectorR + rg.toothTipH)
  check(gap > 8 && gap < GATHER_R + 1.2, `${key} rack teeth reach the gathering pallet (gap ${gap.toFixed(1)})`)
}
// hammer tails end just clear of the gathering staff, inside the tooth paths
for (const [name, h] of [['low', HAMMER_LOW], ['high', HAMMER_HIGH]] as const) {
  const tip = {
    x: h.pivot.x + Math.cos(h.tailAzimuth) * h.tailLen,
    y: h.pivot.y + Math.sin(h.tailAzimuth) * h.tailLen,
  }
  const toStaff = Math.hypot(strikeWheel.x - tip.x, strikeWheel.y - tip.y)
  check(Math.abs(toStaff - GATHER_R) < 0.5, `${name} hammer tail meets the staff circle`)
}
// hammer striking faces sit at the strike gap off their gong's inner coil,
// and the arm on the way out never crosses ANY coil of either gong
for (const [name, h, g] of [['low', HAMMER_LOW, GONG_LOW], ['high', HAMMER_HIGH, GONG_HIGH]] as const) {
  const faceR = Math.hypot(h.headTip.x, h.headTip.y)
  check(
    Math.abs(faceR - (gongInnerCoil(g, h.headAz) - g.tubeR - HAMMER_GAP)) < 1e-9,
    `${name} hammer face at the strike gap`,
  )
  // walk the arm's centre line (through the elbow if dog-legged), at rest
  // and fully cocked, sampling every point against every coil in-plane
  const legs: Array<[{ x: number; y: number }, { x: number; y: number }]> = h.elbow
    ? [[h.pivot, h.elbow], [h.elbow, h.headTip]]
    : [[h.pivot, h.headTip]]
  for (const cock of [0, HAMMER_SWING / 2, HAMMER_SWING]) {
    const rot = (p: { x: number; y: number }) => {
      const dx = p.x - h.pivot.x
      const dy = p.y - h.pivot.y
      return {
        x: h.pivot.x + dx * Math.cos(cock) - dy * Math.sin(cock),
        y: h.pivot.y + dx * Math.sin(cock) + dy * Math.cos(cock),
      }
    }
    for (const [a, b] of legs) {
      for (let i = 0; i <= 30; i++) {
        // spare the head itself on the final leg (it strikes by design)
        const t = (i / 30) * (b === h.headTip ? 0.9 : 1)
        const p = rot({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
        const r = Math.hypot(p.x, p.y)
        const th = Math.atan2(p.y, p.x)
        for (const spec of [GONG_LOW, GONG_HIGH]) {
          if (spec !== g && Math.abs(spec.z - g.z) > 3.4) continue // z-clear plane
          for (const c of gongCoilRadii(spec, th)) {
            // tube radius + the arm's own half-width + daylight
            check(r < c - spec.tubeR - 1.7, `${name} hammer arm clears the ${spec === GONG_LOW ? 'low' : 'high'} gong coil (r ${r.toFixed(1)} vs ${c.toFixed(1)} @ t ${t.toFixed(2)} cock ${cock})`)
          }
        }
      }
    }
  }
}
// the two gongs interleave: every pair of coils at the same azimuth keeps
// tube-to-tube daylight even where their z bands approach
{
  for (let i = 0; i < 180; i++) {
    const th = (i / 180) * TAU
    for (const cl of gongCoilRadii(GONG_LOW, th))
      for (const ch of gongCoilRadii(GONG_HIGH, th))
        check(Math.abs(cl - ch) > GONG_LOW.tubeR + GONG_HIGH.tubeR + 0.6, `gongs interleave @ ${th.toFixed(2)}`)
  }
}
// keyless linkage: the setting-lever pin stays inside the stem groove's
// shadow, and the yoke's fork stays on the castle groove, in BOTH states
for (const pulled of [false, true]) {
  const pin = settingLeverPin(pulled)
  check(Math.abs(pin.y) < 1.2, 'setting-lever pin rides under the stem')
  check(Math.abs(pin.x - (STEM_GROOVE.x + (pulled ? CASTLE.pull : 0))) < 1e-9, 'pin tracks the groove')
  void yokeAngle(pulled) // throws (NaN sqrt) if the fork cannot reach
}
check(STEM_SQUARE.x0 < castleX(true) - CASTLE.w / 2, 'square spans the castle sweep (inboard)')
check(STEM_SQUARE.x1 > castleX(false) + CASTLE.w / 2, 'square spans the castle sweep (outboard)')
check(STEM_GROOVE.x - STEM_GROOVE.halfW > WINDING_PINION.x + WINDING_PINION.w / 2 + 1, 'groove clear of the winding pinion')
check(STEM_TIP.x1 <= STEM_SQUARE.x0 + 0.2, 'tip pivot inboard of the square')

// --------------------------------------------------------------------- //
// Rendered wheel angles (watch-plane, clockwise-positive), phase-locked
// through the mesh chain. Consumed by the part builders AND by the
// geometry acceptance tests, so what is verified is what is drawn.
// Hands render from the train's true angles; wheels render meshed — the
// difference is the free assembly orientation of a hand pressed on its
// pipe, exactly as in a real watch.
// --------------------------------------------------------------------- //
export interface RenderedAngles {
  center: number
  cannon: number
  barrel: number
  third: number
  carriagePinion: number
  minuteWheel: number
  hourWheel: number
  s2: number
  s1: number
  ratchet: number
  crownWheel: number
  transfer: number
  strike: number
  strikeInter: number
  governor: number
}

export function renderedAngles(mv: {
  train: { centerAngle: number; cannonAngle: number; carriageAngle: number }
  mainspring: { turns: number }
  repeater: { trainPhi: number }
}): RenderedAngles {
  const center = mv.train.centerAngle
  const cannon = mv.train.cannonAngle
  const third = meshedAngle(center, centerWheel, thirdPinion)
  const mw = meshedAngle(cannon, cannonPinion, minuteWheel)
  const s2 = meshedAngle(mw, minuteWheel, s2Pinion)
  // sense: the ratchet turns + with winding — through crown wheel and
  // transfer this leaves the contrate ring phase-locked to the pinion
  const ratchetAngle = mv.mainspring.turns * TAU
  const cw = meshedAngle(ratchetAngle, ratchet, crownWheel)
  const strike = mv.repeater.trainPhi
  const inter = meshedAngle(strike, strikeWheel, strikeInterPinion)
  return {
    center,
    cannon,
    barrel: meshedAngle(center, centerPinion, barrel),
    third,
    carriagePinion: meshedAngle(third, thirdWheel, carriagePinion),
    minuteWheel: mw,
    hourWheel: meshedAngle(mw, minuteWheelPinion, hourWheel),
    s2,
    s1: meshedAngle(s2, s2Wheel, s1Idler),
    ratchet: ratchetAngle,
    crownWheel: cw,
    transfer: meshedAngle(cw, crownWheel, transferWheel),
    strike,
    strikeInter: inter,
    governor: meshedAngle(inter, strikeInterWheel, governorPinion),
  }
}

/**
 * Escape-pinion phase: the pinion rolls around the fixed fourth wheel as
 * the carriage orbits. Computed in the carriage frame (where the mesh
 * line is fixed at the pinion's local azimuth, straight up), then mapped
 * back to ground. Returns the pinion's rendered ground angle.
 */
export function escapePinionAngle(carriageAngle: number): number {
  const sunRel = -carriageAngle // fixed wheel, seen from the carriage
  const rel = meshedAngle(
    sunRel,
    { teeth: 120, x: 0, y: 0 },
    { teeth: 8, x: 0, y: -ESC_ORBIT_R },
  )
  return rel + carriageAngle
}

// --------------------------------------------------------------------- //
// Winding pinion & contrate mesh phase.
//
// The winding pinion is rigidly geared to the ratchet (5 pinion turns per
// barrel turn through the transfer and crown wheels), so its rotation is a
// pure function of the wind state. Because one unit of mainspring wind
// advances BOTH the pinion and the transfer's contrate ring by exactly 60
// of their own tooth pitches, their relative pitch fraction is a constant
// of assembly: the ring's mounting offset below sets it to a half pitch,
// so a pinion tooth always dips into a ring gap at the mesh zone (plan
// x = transferWheel.x).
// --------------------------------------------------------------------- //

/** Winding-pinion rotation about the stem axis (rad) for a wind state. */
export function windingPinionAngle(turns: number): number {
  return (turns / KEYLESS_WIND_RATIO) * TAU
}

const P12 = TAU / 12
const P36 = TAU / 36

/** Pitch fraction of the pinion tooth nearest its bottom (mesh) point. */
export function windingPinionPitchFrac(turns: number): number {
  const rotX = -windingPinionAngle(turns) // three.js rotation.x applied
  const f = (rotX + TOOTH_CENTER(12) + Math.PI / 2) / P12
  return f - Math.floor(f)
}

/** Pitch fraction of the contrate face tooth nearest the mesh zone, for a
 * given ring mounting offset (rad, in the transfer wheel's local frame). */
export function contrateRingPitchFrac(turns: number, ringOffset: number): number {
  const ratchetAngle = turns * TAU
  const cw = meshedAngle(ratchetAngle, ratchet, crownWheel)
  const tRot3 = -meshedAngle(cw, crownWheel, transferWheel)
  const f = (tRot3 + ringOffset + Math.PI / 2) / P36
  return f - Math.floor(f)
}

/** Ring mounting offset putting a ring GAP under every bottoming pinion
 * tooth — computed once; exact for all wind states (see note above). */
export function contrateRingOffset(): number {
  const want = windingPinionPitchFrac(0) + 0.5
  const raw = contrateRingPitchFrac(0, 0)
  return ((want - raw) % 1) * P36
}

// --------------------------------------------------------------------- //
// Repeater slide latch: the slide's lever carries a pin travelling +y as
// the slide is pushed; the all-or-nothing hook's notch face sits at the
// pin's position at EXACTLY the latch travel, so the drawn geometry and
// the core's interlock threshold are one and the same number.
// --------------------------------------------------------------------- //
export const SLIDE_TRAVEL_UNITS = 34 // world units of slide movement, travel 0..1
export { ALL_OR_NOTHING_TRAVEL } // the core's own latch threshold
export const SLIDE_PIN = { x: -152, y0: 8 } // pin path: (x, y0 + travel*units)
export const AON_PIVOT = { x: -136, y: 34 }
/** The hook's notch face, where the pin arrives at latch travel. */
export const AON_NOTCH_Y = SLIDE_PIN.y0 + ALL_OR_NOTHING_TRAVEL * SLIDE_TRAVEL_UNITS

check(
  Math.abs(AON_NOTCH_Y - (SLIDE_PIN.y0 + 0.85 * SLIDE_TRAVEL_UNITS)) < 1e-9,
  'all-or-nothing notch sits at exactly 85% slide travel',
)
check(Math.hypot(AON_PIVOT.x - SLIDE_PIN.x, AON_PIVOT.y - AON_NOTCH_Y) < 22, 'hook reaches the pin path')

// --------------------------------------------------------------------- //
// Bridge outlines (watch coords, absolute). Shared verbatim by the part
// builders and by the collision volumes below, so the audited shape IS the
// drawn shape.
// --------------------------------------------------------------------- //

export interface BridgeSpec {
  outline: Array<[number, number]>
  holes: Array<{ x: number; y: number; r: number }>
  feet: Array<{ x: number; y: number }>
  z0: number
  z1: number
  /** feet/pillar z span (up to the plate for back bridges, down from the
   * plate for the dial-side strike bridge) */
  footZ: [number, number]
}

/** Barrel bridge: carries the barrel arbor, centre and transfer lower
 * bearings; the ratchet, crown wheel and click sit on its back face. */
export const BARREL_BRIDGE: BridgeSpec = {
  outline: [
    [-14, 10], [-16, -10], [-8, -28], [0, -46], [10, -62], [28, -68],
    [46, -66], [66, -64], [84, -62], [92, -58], [96, -50], [98, -34],
    [94, -12], [88, 2], [76, 12], [58, 16], [36, 12], [8, 12],
  ],
  holes: [
    { x: 0, y: 0, r: 2.6 }, // centre arbor
    { x: barrel.x, y: barrel.y, r: 3.4 }, // barrel arbor bushing
    { x: transferWheel.x, y: transferWheel.y, r: 1.4 }, // transfer pivot
    { x: CLICK.pivot.x, y: CLICK.pivot.y, r: 1.8 }, // click stud
  ],
  feet: [
    { x: 93, y: -49 },
    { x: 64, y: 14 },
  ],
  z0: Z.bridges.z0,
  z1: Z.bridges.z1,
  footZ: [Z.bridges.z1, Z.plate.z0],
}

/** Tourbillon cock: reaches in from 6 o'clock, carries the carriage and
 * third-wheel lower pivots (the tourbillon flies — no upper bridge). */
export const TOURB_BRIDGE: BridgeSpec = {
  outline: [
    [-16, 152], [16, 152], [20, 116], [14, 68], [9, 52], [-9, 52], [-14, 68], [-20, 116],
  ],
  holes: [
    { x: CARRIAGE_POS.x, y: CARRIAGE_POS.y, r: 2.4 },
    { x: thirdWheel.x, y: thirdWheel.y, r: 2 },
  ],
  feet: [{ x: 0, y: 144 }],
  z0: Z.bridges.z0,
  z1: Z.bridges.z1,
  footZ: [Z.bridges.z1, Z.plate.z0],
}

/** Strike bridge (dial side): upper pivots for the strike wheel staff,
 * intermediate wheel and governor. One pillar rises from the plate in the
 * only column of free air in the strike quarter (everything else is swept
 * by a rack, a hammer or a gong coil — audited below). */
export const STRIKE_BRIDGE_SPEC: BridgeSpec = {
  outline: [
    [64, -58], [80, -64], [82, -84], [80, -100], [68, -110], [56, -116],
    [48, -128], [34, -130], [28, -118], [36, -106], [46, -94], [56, -78],
  ],
  holes: [
    { x: strikeWheel.x, y: strikeWheel.y, r: 1.6 },
    { x: strikeInterWheel.x, y: strikeInterWheel.y, r: 1.4 },
    { x: governorPinion.x, y: governorPinion.y, r: 1.4 },
  ],
  feet: [{ x: 40, y: -122 }],
  z0: STRIKE_BRIDGE.z0,
  z1: STRIKE_BRIDGE.z1,
  footZ: [Z.plate.z1, STRIKE_BRIDGE.z0], // pillar rises from the plate
}

/** Keyless slot: the milled channel in the plate's dial face where the
 * castle wheel and winding pinion ride the stem (their teeth dip below
 * the plate's top surface — a real plate is relieved exactly here). */
export const KEYLESS_SLOT: Array<{ x: number; y: number; r: number }> = [
  { x: 69, y: 0, r: 7.6 },
  { x: 76, y: 0, r: 7.6 },
  { x: 83, y: 0, r: 7.6 },
  { x: 89.5, y: 0, r: 7.6 },
]
/** Recess in the plate's LOWER half where the transfer's contrate ring
 * spins (its teeth rise just proud of it to meet the winding pinion). */
export const TRANSFER_RECESS = { x: transferWheel.x, y: transferWheel.y, r: 18 }
export const PLATE_SPLIT_Z = 18.6

/** Mainplate bores, watch coords (each one is a real bearing or recess —
 * anything passing through the plate must pass through one of these). */
export const MAINPLATE_HOLES: Array<{ x: number; y: number; r: number }> = [
  { x: CARRIAGE_POS.x, y: CARRIAGE_POS.y, r: 51 }, // tourbillon well
  { x: 0, y: 0, r: 8.6 }, // centre: cannon + hour pipes
  { x: s2Wheel.x, y: s2Wheel.y, r: s2Wheel.r + 1.8 }, // setting recess
  { x: s1Idler.x, y: s1Idler.y, r: s1Idler.r + 1.8 },
  { x: transferWheel.x, y: transferWheel.y, r: 2.4 }, // transfer upper pivot
  { x: minuteWheel.x, y: minuteWheel.y, r: 1.8 }, // minute-wheel arbor
  { x: thirdWheel.x, y: thirdWheel.y, r: 2 }, // third upper pivot
  { x: -56, y: -34, r: 3.2 }, // hour-star stud
  { x: strikeWheel.x, y: strikeWheel.y, r: 2.2 },
  { x: strikeInterWheel.x, y: strikeInterWheel.y, r: 1.8 },
  { x: governorPinion.x, y: governorPinion.y, r: 1.5 },
  { x: AON_PIVOT.x, y: AON_PIVOT.y, r: 2.6 }, // all-or-nothing stud
  ...[45, 135, 225, 315].map((az) => ({
    x: Math.cos((az * Math.PI) / 180) * 160,
    y: Math.sin((az * Math.PI) / 180) * 160,
    r: 1.8, // dial feet
  })),
]


// --------------------------------------------------------------------- //
// Collision audit.
//
// Every part contributes solid volumes (annular prisms, oriented boxes,
// outline prisms, x-axis cylinders) in ASSEMBLED position; parts that move
// contribute their swept envelope. collisions() tests every cross-part
// pair not on the engagement whitelist and returns the interpenetrating
// pairs — the acceptance test requires the list to be empty. The whitelist
// names only DESIGNED contacts (gear meshes, pivots in bearings, pallets
// in tooth paths, the fork on the castle...), each of which is separately
// constrained above or in tests/09.
// --------------------------------------------------------------------- //

export type Vol =
  | { kind: 'ann'; part: string; name: string; x: number; y: number; rIn: number; rOut: number; z0: number; z1: number; a0?: number; a1?: number }
  | { kind: 'obb'; part: string; name: string; x: number; y: number; hw: number; hh: number; rot: number; z0: number; z1: number }
  | { kind: 'poly'; part: string; name: string; pts: Array<[number, number]>; holes: Array<{ x: number; y: number; r: number }>; z0: number; z1: number }
  | { kind: 'cylx'; part: string; name: string; x0: number; x1: number; y: number; z: number; r: number }

const wrapAngle = (a: number): number => a - TAU * Math.floor(a / TAU)

function planContains(v: Vol, px: number, py: number, pz: number): boolean {
  switch (v.kind) {
    case 'ann': {
      if (pz < v.z0 || pz > v.z1) return false
      const dx = px - v.x
      const dy = py - v.y
      const r = Math.hypot(dx, dy)
      if (r < v.rIn || r > v.rOut) return false
      if (v.a0 === undefined || v.a1 === undefined) return true
      return wrapAngle(Math.atan2(dy, dx) - v.a0) <= wrapAngle(v.a1 - v.a0)
    }
    case 'obb': {
      if (pz < v.z0 || pz > v.z1) return false
      const c = Math.cos(v.rot)
      const s = Math.sin(v.rot)
      const dx = px - v.x
      const dy = py - v.y
      const lx = dx * c + dy * s
      const ly = -dx * s + dy * c
      return Math.abs(lx) <= v.hw && Math.abs(ly) <= v.hh
    }
    case 'poly': {
      if (pz < v.z0 || pz > v.z1) return false
      for (const h of v.holes) if (Math.hypot(px - h.x, py - h.y) < h.r) return false
      let inside = false
      const n = v.pts.length
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = v.pts[i]
        const [xj, yj] = v.pts[j]
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }
    case 'cylx':
      return px >= v.x0 && px <= v.x1 && Math.hypot(py - v.y, pz - v.z) <= v.r
  }
}

function zRange(v: Vol): [number, number] {
  return v.kind === 'cylx' ? [v.z - v.r, v.z + v.r] : [v.z0, v.z1]
}

/** Sample points spread through a volume's solid interior (3D). */
function samplePoints(v: Vol, step: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = []
  const [vz0, vz1] = zRange(v)
  const zs: number[] = []
  const nz = Math.max(1, Math.round((vz1 - vz0) / Math.max(step, 1.2)))
  for (let i = 0; i <= nz; i++) zs.push(vz0 + ((vz1 - vz0) * i) / nz)
  const push2d = (x: number, y: number) => {
    for (const z of zs) if (planContains(v, x, y, z)) pts.push([x, y, z])
  }
  switch (v.kind) {
    case 'ann': {
      const nr = Math.max(1, Math.ceil((v.rOut - v.rIn) / step))
      for (let i = 0; i <= nr; i++) {
        const r = v.rIn + ((v.rOut - v.rIn) * i) / nr
        const span = v.a0 !== undefined && v.a1 !== undefined ? wrapAngle(v.a1 - v.a0) : TAU
        const na = Math.max(6, Math.ceil((span * Math.max(r, 1)) / step))
        for (let k = 0; k <= na; k++) {
          const a = (v.a0 ?? 0) + (span * k) / na
          push2d(v.x + Math.cos(a) * r, v.y + Math.sin(a) * r)
        }
      }
      break
    }
    case 'obb': {
      const c = Math.cos(v.rot)
      const s = Math.sin(v.rot)
      const nx = Math.max(1, Math.ceil((2 * v.hw) / step))
      const ny = Math.max(1, Math.ceil((2 * v.hh) / step))
      for (let i = 0; i <= nx; i++)
        for (let k = 0; k <= ny; k++) {
          const lx = -v.hw + (2 * v.hw * i) / nx
          const ly = -v.hh + (2 * v.hh * k) / ny
          push2d(v.x + lx * c - ly * s, v.y + lx * s + ly * c)
        }
      break
    }
    case 'poly': {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const [x, y] of v.pts) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x)
        y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      }
      for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) push2d(x, y)
      break
    }
    case 'cylx': {
      const nx = Math.max(1, Math.ceil((v.x1 - v.x0) / step))
      const nr = Math.max(1, Math.ceil(v.r / step))
      for (let i = 0; i <= nx; i++) {
        const x = v.x0 + ((v.x1 - v.x0) * i) / nx
        for (let k = 0; k <= nr; k++) {
          const r = (v.r * k) / nr
          const na = Math.max(4, Math.ceil((TAU * Math.max(r, 0.5)) / step))
          for (let m = 0; m < na; m++) {
            const a = (TAU * m) / na
            pts.push([x, v.y + Math.cos(a) * r, v.z + Math.sin(a) * r])
          }
        }
      }
      break
    }
  }
  return pts
}

function boundingCircle(v: Vol): { x: number; y: number; r: number } {
  switch (v.kind) {
    case 'ann':
      return { x: v.x, y: v.y, r: v.rOut }
    case 'obb':
      return { x: v.x, y: v.y, r: Math.hypot(v.hw, v.hh) }
    case 'poly': {
      let cx = 0, cy = 0
      for (const [x, y] of v.pts) { cx += x; cy += y }
      cx /= v.pts.length
      cy /= v.pts.length
      let r = 0
      for (const [x, y] of v.pts) r = Math.max(r, Math.hypot(x - cx, y - cy))
      return { x: cx, y: cy, r }
    }
    case 'cylx':
      return { x: (v.x0 + v.x1) / 2, y: v.y, r: (v.x1 - v.x0) / 2 + v.r }
  }
}

export function volumesOverlap(a: Vol, b: Vol, step = 1.1): boolean {
  const [az0, az1] = zRange(a)
  const [bz0, bz1] = zRange(b)
  if (Math.min(az1, bz1) - Math.max(az0, bz0) <= 0.01) return false
  const ca = boundingCircle(a)
  const cb = boundingCircle(b)
  if (Math.hypot(ca.x - cb.x, ca.y - cb.y) > ca.r + cb.r) return false
  for (const [x, y, z] of samplePoints(a, step)) if (planContains(b, x, y, z)) return true
  for (const [x, y, z] of samplePoints(b, step)) if (planContains(a, x, y, z)) return true
  return false
}

/** Tip radius of a layout wheel (teeth included). */
const tipR = (w: Wheel): number => w.r + 0.9 * w.module

export function buildVolumes(): Vol[] {
  const vols: Vol[] = []
  const ann = (part: string, name: string, x: number, y: number, rIn: number, rOut: number, z0: number, z1: number, a0?: number, a1?: number) =>
    vols.push({ kind: 'ann', part, name, x, y, rIn, rOut, z0, z1, a0, a1 })
  const obb = (part: string, name: string, x: number, y: number, hw: number, hh: number, rot: number, z0: number, z1: number) =>
    vols.push({ kind: 'obb', part, name, x, y, hw, hh, rot, z0, z1 })
  const poly = (part: string, name: string, pts: Array<[number, number]>, holes: Array<{ x: number; y: number; r: number }>, z0: number, z1: number) =>
    vols.push({ kind: 'poly', part, name, pts, holes, z0, z1 })
  const cylx = (part: string, name: string, x0: number, x1: number, y: number, z: number, r: number) =>
    vols.push({ kind: 'cylx', part, name, x0, x1, y, z, r })
  const wheelAnn = (part: string, name: string, w: Wheel) => ann(part, name, w.x, w.y, 0, tipR(w), w.z0, w.z1)
  const seg = (part: string, name: string, a: { x: number; y: number }, b: { x: number; y: number }, hh: number, z0: number, z1: number) =>
    obb(part, name, (a.x + b.x) / 2, (a.y + b.y) / 2, Math.hypot(b.x - a.x, b.y - a.y) / 2 + hh * 0.4, hh, Math.atan2(b.y - a.y, b.x - a.x), z0, z1)
  const bridge = (part: string, spec: BridgeSpec) => {
    poly(part, 'plate', spec.outline, spec.holes, spec.z0, spec.z1)
    for (const [i, f] of spec.feet.entries()) ann(part, `foot${i}`, f.x, f.y, 0, 3, spec.footZ[0], spec.footZ[1])
  }

  // case & back
  ann('caseback', 'ring', 0, 0, 148, 197, -16, -9)
  ann('caseback', 'glass', 0, 0, 0, 149, -11.8, -10.2)
  ann('caseband', 'band', 0, 0, 176, 219, -33, 35)
  cylx('caseband', 'tube', 215, 231, 0, STEM_Z, 4.6)
  ann('bezelCrystal', 'ring', 0, 0, 164, 187, 50, 67)
  cylx('crown', 'body', 232, 252, 0, STEM_Z, 16.5)
  cylx('crown', 'stub', 219, 233, 0, STEM_Z, 2.7)

  // bridges & plate
  bridge('trainBridge', BARREL_BRIDGE)
  ann('trainBridge', 'crownPost', crownWheel.x, crownWheel.y, 0, 2.6, BACK_TIER.z0, Z.bridges.z0)
  ann('trainBridge', 'crownScrew', crownWheel.x, crownWheel.y, 0, 3.4, BACK_TIER.z0 - 1.4, BACK_TIER.z0)
  bridge('tourbillonBridge', TOURB_BRIDGE)
  bridge('strikeBridge', STRIKE_BRIDGE_SPEC)
  {
    const circle: Array<[number, number]> = []
    for (let i = 0; i < 96; i++) circle.push([Math.cos((i / 96) * TAU) * 162, Math.sin((i / 96) * TAU) * 162])
    // two z-slabs: the lower one also carries the transfer-ring recess;
    // both carry the milled keyless slot under the castle & winding pinion
    poly('mainplate', 'plateLower', circle, [...MAINPLATE_HOLES, ...KEYLESS_SLOT, TRANSFER_RECESS], Z.plate.z0, PLATE_SPLIT_Z)
    poly('mainplate', 'plateUpper', circle, [...MAINPLATE_HOLES, ...KEYLESS_SLOT], PLATE_SPLIT_Z, Z.plate.z1)
    // stem-tip block: top slab, bottom slab, two cheeks around the bore
    const B = STEM_BOSS
    obb('mainplate', 'bossTop', B.x, 0, B.hw, B.boreHalf + B.wallW, 0, STEM_Z + B.boreHalf, B.z1)
    obb('mainplate', 'bossBottom', B.x, 0, B.hw, B.boreHalf + B.wallW, 0, B.z0, STEM_Z - B.boreHalf)
    for (const s of [-1, 1])
      obb('mainplate', `bossCheek${s > 0 ? 'L' : 'R'}`, B.x, s * (B.boreHalf + B.wallW / 2), B.hw, B.wallW / 2, 0, STEM_Z - B.boreHalf, STEM_Z + B.boreHalf)
    ann('mainplate', 'leverStud', SETTING_LEVER.pivot.x, SETTING_LEVER.pivot.y, 0, 1.9, Z.plate.z1, 23.6)
    ann('mainplate', 'yokeStud', YOKE.pivot.x, YOKE.pivot.y, 0, 1.9, Z.plate.z1, 23.6)
  }

  // barrel assembly (drum, rim, arbor, ratchet + screw)
  ann('barrel', 'drum', barrel.x, barrel.y, 0, BARREL_DRUM.r, BARREL_DRUM.z0, BARREL_DRUM.z1)
  ann('barrel', 'rim', barrel.x, barrel.y, BARREL_DRUM.r - 5.5, tipR(barrel), barrel.z0, barrel.z1)
  ann('barrel', 'arbor', barrel.x, barrel.y, 0, 3.2, -5.6, 14)
  ann('barrel', 'ratchet', ratchet.x, ratchet.y, 0, tipR(ratchet), ratchet.z0, ratchet.z1)
  ann('barrel', 'ratchetScrew', barrel.x, barrel.y, 0, 4.2, -6.8, -5.4)

  // going train
  wheelAnn('centerWheel', 'disc', centerWheel)
  wheelAnn('centerWheel', 'pinion', centerPinion)
  ann('centerWheel', 'arbor', 0, 0, 0, 2.1, -1, 24.75)
  wheelAnn('thirdWheel', 'disc', thirdWheel)
  wheelAnn('thirdWheel', 'pinion', thirdPinion)
  ann('thirdWheel', 'arbor', thirdWheel.x, thirdWheel.y, 0, 1.8, -1, 16.75)
  ann('fixedFourth', 'wheel', fixedFourth.x, fixedFourth.y, 6.5, tipR(fixedFourth), fixedFourth.z0, fixedFourth.z1)

  // tourbillon cluster — swept envelopes (all co-rotating; the designed
  // internal contacts are whitelisted, real internal clearances are
  // asserted where the sweep model cannot see them)
  const C = CARRIAGE_POS
  wheelAnn('carriage', 'pinion', carriagePinion)
  ann('carriage', 'arbor', C.x, C.y, 0, 3, 2.2, 13)
  ann('carriage', 'pivot', C.x, C.y, 0, 1.1, -2.4, 2.2)
  ann('carriage', 'ring', C.x, C.y, 43, 49, Z.cageRing - 2, Z.cageRing + 2)
  ann('carriage', 'lowerBar', C.x, C.y, 0, 29.4, Z.cageBar.z0, Z.cageBar.z1)
  ann('carriage', 'pillarsLo', C.x, C.y, 40, 49, Z.cageRing, 20)
  ann('carriage', 'pillarsMid', C.x, C.y, 35.6, 45.2, 20, 28.2)
  ann('carriage', 'pillarsBal', C.x, C.y, 30.6, 38.8, 28.2, 31.8)
  ann('carriage', 'pillarsSpring', C.x, C.y, 21, 33.8, 31.8, 35.5)
  ann('carriage', 'pillarsTop', C.x, C.y, 9.4, 24.3, 35.5, 37)
  ann('carriage', 'upperBar', C.x, C.y, 19, 34.2, 26.2, 28)
  ann('carriage', 'topHub', C.x, C.y, 0, 12, 35.3, 39)
  ann('escapeWheel', 'wheelSwept', C.x, C.y, ESC_ORBIT_R - 13.5, ESC_ORBIT_R + 13.5, Z.escapeWheel.z0, Z.escapeWheel.z1)
  ann('escapeWheel', 'pinionSwept', C.x, C.y, ESC_ORBIT_R - 4.2, ESC_ORBIT_R + 4.2, escPinion.z0, escPinion.z1)
  ann('escapeWheel', 'arborSwept', C.x, C.y, ESC_ORBIT_R - 1, ESC_ORBIT_R + 1, escPinion.z0, 25.9)
  ann('palletFork', 'swept', C.x, C.y, 3.5, 21.5, 20.5, 24.35)
  ann('palletFork', 'pivotSwept', C.x, C.y, ESC_ORBIT_R * 0.52 - 1.3, ESC_ORBIT_R * 0.52 + 1.3, Z.cageBar.z0 + 0.4, 26.75)
  ann('balance', 'rimSwept', C.x, C.y, 24.5, 29.5, 28.2, 31.8)
  ann('balance', 'spokes', C.x, C.y, 0, 27, 29.1, 30.9)
  ann('balance', 'staff', C.x, C.y, 0, 1.3, Z.cageBar.z0 + 0.4, 37.4)
  ann('balance', 'rollerSwept', C.x, C.y, 0, 6.2, 24.3, 27.5)
  ann('balance', 'springSwept', C.x, C.y, 2, 18.6, 33.2, 35.8)

  // keyless works
  cylx('keylessWorks', 'stemTip', STEM_TIP.x0, STEM_TIP.x1, 0, STEM_Z, STEM_TIP.r)
  cylx('keylessWorks', 'stem', STEM_TIP.x1, 234, 0, STEM_Z, STEM_R)
  cylx('keylessWorks', 'castleSwept', castleX(true) - CASTLE.w / 2, castleX(false) + CASTLE.w / 2 + 2.4, 0, STEM_Z, 6.7)
  cylx('keylessWorks', 'windingPinion', WINDING_PINION.x - WINDING_PINION.w / 2, WINDING_PINION.x + WINDING_PINION.w / 2, 0, STEM_Z, 7.4)
  wheelAnn('keylessWorks', 'transferSpur', transferWheel)
  ann('keylessWorks', 'transferArbor', transferWheel.x, transferWheel.y, 0, 2.2, 2.2, 19)
  ann('keylessWorks', 'transferPivot', transferWheel.x, transferWheel.y, 0, 1.2, BACK_TIER.z0, 2.2)
  ann('keylessWorks', 'transferRing', transferWheel.x, transferWheel.y, TRANSFER_RING.r - 2, TRANSFER_RING.r + 1.6, TRANSFER_RING.z0, TRANSFER_RING.z1 + 0.4)
  wheelAnn('keylessWorks', 'crownWheel', crownWheel)
  obb('keylessWorks', 'click', CLICK.pivot.x + 4.5, CLICK.pivot.y + 1.5, 6.5, 3.5, 2.2, CLICK.z0, CLICK.z1)
  ann('keylessWorks', 'clickStud', CLICK.pivot.x, CLICK.pivot.y, 0, 1.6, CLICK.z0, Z.bridges.z1)
  wheelAnn('keylessWorks', 's1', s1Idler)
  wheelAnn('keylessWorks', 's2', s2Wheel)
  wheelAnn('keylessWorks', 's2pinion', s2Pinion)
  {
    const lv = SETTING_LEVER
    const off = (from: { x: number; y: number }, to: { x: number; y: number }, d: number) => {
      const az = Math.atan2(to.y - from.y, to.x - from.x)
      return { x: from.x + Math.cos(az) * d, y: from.y + Math.sin(az) * d }
    }
    ann('keylessWorks', 'leverHub', lv.pivot.x, lv.pivot.y, 2, 3.6, 21.7, 23.4)
    seg('keylessWorks', 'leverArm', off(lv.pivot, settingLeverPin(false), 4), settingLeverPin(false), 2.2, 21.7, 23.4)
    ann('keylessWorks', 'leverPin', settingLeverPin(false).x, settingLeverPin(false).y, 0, lv.pinR, 23.4, 26)
    seg('keylessWorks', 'leverFinger', off(lv.pivot, YOKE.tailPin, 4), YOKE.tailPin, 2, 21.7, 23.4)
    ann('keylessWorks', 'yokeHub', YOKE.pivot.x, YOKE.pivot.y, 2, 3.6, 21.7, 23.4)
    seg('keylessWorks', 'yokeArm', off(YOKE.pivot, { x: castleX(false) + CASTLE_GROOVE.off, y: YOKE.tipY }, 4), { x: castleX(false) + CASTLE_GROOVE.off, y: YOKE.tipY }, 2, 21.7, 23.4)
    seg('keylessWorks', 'yokeTail', off(YOKE.pivot, YOKE.tailPin, 4), YOKE.tailPin, 2, 21.7, 23.4)
  }

  // motion works & dial-side wheels
  wheelAnn('motionWorks', 'cannon', cannonPinion)
  ann('motionWorks', 'cannonPipe', 0, 0, 0, Z.cannonPipe.r, Z.cannonPipe.z0, Z.cannonPipe.z1)
  wheelAnn('motionWorks', 'minuteWheel', minuteWheel)
  wheelAnn('motionWorks', 'minuteWheelPinion', minuteWheelPinion)
  ann('motionWorks', 'mwArbor', minuteWheel.x, minuteWheel.y, 0, 1.6, 20.2, 28.2)
  wheelAnn('motionWorks', 'hourWheel', hourWheel)
  ann('motionWorks', 'hourPipe', 0, 0, Z.cannonPipe.r + 0.2, Z.hourPipe.r, Z.hourPipe.z0, Z.hourPipe.z1)

  // repeater reading works
  const star = { x: -56, y: -34 }
  ann('hourStar', 'star', star.x, star.y, 0, 17, Z.hourStar.z0, Z.hourStar.z1)
  ann('hourStar', 'stud', star.x, star.y, 0, 2.9, 19, 28.4)
  seg('hourStar', 'jumper', { x: star.x - 22, y: star.y - 9 }, { x: star.x - 3, y: star.y - 4 }, 2.6, Z.hourStar.z0, Z.hourStar.z1)
  ann('hourSnail', 'cam', star.x, star.y, 0, 30.3, Z.hourSnail.z0, Z.hourSnail.z1)
  ann('surprisePiece', 'flag', star.x, star.y, 0, 19.5, 28.45, 29.85)
  ann('quarterSnail', 'cam', 0, 0, 0, 24.6, Z.quarterSnail.z0, Z.quarterSnail.z1)
  ann('minuteSnail', 'cam', 0, 0, 0, 20.6, Z.minuteSnail.z0, Z.minuteSnail.z1)

  const rackVol = (part: string, rg: RackGeo, teeth: number, pitch: number, tailTo: { x: number; y: number }) => {
    const halfArc = (teeth * pitch) / 2
    const fall = teeth * pitch + 0.12
    // the toothed sector spans its half-arc AND its fall
    ann(part, 'sector', rg.pivot.x, rg.pivot.y, rg.sectorR * 0.78, rg.sectorR + rg.toothTipH + 0.2, rg.z0, rg.z1, rg.armAngle - halfArc - 0.06, rg.armAngle + halfArc + fall + 0.06)
    // the arm is a single spoke: it sweeps only from rest through the fall
    ann(part, 'armSwept', rg.pivot.x, rg.pivot.y, 3, rg.sectorR * 0.84, rg.z0, rg.z1, rg.armAngle - 0.06, rg.armAngle + fall + 0.06)
    ann(part, 'hub', rg.pivot.x, rg.pivot.y, 0, 4.2, rg.z0 - 0.6, rg.z1)
    ann(part, 'stud', rg.pivot.x, rg.pivot.y, 0, 3, Z.plate.z1, rg.z0)
    // the articulated tail re-aims at the snail as the rack falls: in
    // world space it stays on the contact line (±small wobble)
    seg(part, 'tail', rg.pivot, tailTo, 1.3, rg.z0, rg.z1)
  }
  // tail target: the snail contact point — snail centre + contact-line
  // direction (toward the rack pivot) at a mid-profile radius
  const contactPt = (c: { x: number; y: number }, pivot: { x: number; y: number }, r: number) => {
    const az = Math.atan2(pivot.y - c.y, pivot.x - c.x)
    return { x: c.x + Math.cos(az) * r, y: c.y + Math.sin(az) * r }
  }
  rackVol('hourRack', RACK_GEO.hour, 12, 6 * DEG_, contactPt(star, RACK_GEO.hour.pivot, 24))
  rackVol('quarterRack', RACK_GEO.quarter, 3, 8 * DEG_, contactPt({ x: 0, y: 0 }, RACK_GEO.quarter.pivot, 21))
  rackVol('minuteRack', RACK_GEO.minute, 14, 4.5 * DEG_, contactPt({ x: 0, y: 0 }, RACK_GEO.minute.pivot, 12))

  // strike train, governor, bridgework contacts (arbors neck down to slim
  // pivots where they enter the strike bridge's bearing holes)
  wheelAnn('strikeTrain', 'wheel', strikeWheel)
  ann('strikeTrain', 'staff', strikeWheel.x, strikeWheel.y, 0, 2, Z.plate.z1, STRIKE_BRIDGE.z0)
  ann('strikeTrain', 'staffPivot', strikeWheel.x, strikeWheel.y, 0, 1.4, STRIKE_BRIDGE.z0, STRIKE_BRIDGE.z0 + 0.9)
  for (const [nm, tier] of [['palletH', RACK_GEO.hour], ['palletQ', RACK_GEO.quarter], ['palletM', RACK_GEO.minute]] as const)
    ann('strikeTrain', nm, strikeWheel.x, strikeWheel.y, 0, GATHER_R + 1, tier.z0, tier.z1)
  wheelAnn('strikeTrain', 'interPinion', strikeInterPinion)
  wheelAnn('strikeTrain', 'interWheel', strikeInterWheel)
  ann('strikeTrain', 'interArbor', strikeInterWheel.x, strikeInterWheel.y, 0, 1.6, Z.plate.z1, STRIKE_BRIDGE.z0)
  ann('strikeTrain', 'interPivot', strikeInterWheel.x, strikeInterWheel.y, 0, 1.2, STRIKE_BRIDGE.z0, STRIKE_BRIDGE.z0 + 0.9)
  wheelAnn('flyGovernor', 'pinion', governorPinion)
  ann('flyGovernor', 'arbor', governorPinion.x, governorPinion.y, 0, 1.4, Z.plate.z1, STRIKE_BRIDGE.z0)
  ann('flyGovernor', 'arborPivot', governorPinion.x, governorPinion.y, 0, 1.2, STRIKE_BRIDGE.z0, STRIKE_BRIDGE.z0 + 0.9)
  ann('flyGovernor', 'vanes', governorPinion.x, governorPinion.y, 0, 14, 22.3, 24.7)

  // repeater slide, all-or-nothing, hammers, gongs
  obb('repeaterSlide', 'slide', -208, 17, 9.5, 24, 0, 21, 28.5)
  seg('repeaterSlide', 'lever', { x: -204, y: -5 }, { x: -152, y: -5 }, 3.2, 22, 24.5)
  obb('repeaterSlide', 'pinSwept', SLIDE_PIN.x, (SLIDE_PIN.y0 + SLIDE_PIN.y0 + SLIDE_TRAVEL_UNITS) / 2, 2.3, SLIDE_TRAVEL_UNITS / 2 + 2.3, 0, 22.5, 27.2)
  ann('allOrNothing', 'hub', AON_PIVOT.x, AON_PIVOT.y, 0, 3.5, 24.2, 26.8)
  ann('allOrNothing', 'stud', AON_PIVOT.x, AON_PIVOT.y, 0, 2.4, 19, 24.2)
  seg('allOrNothing', 'hook', AON_PIVOT, { x: SLIDE_PIN.x - 2, y: AON_NOTCH_Y + 3 }, 3.2, 24.2, 26.8)
  ann('slideSpring', 'blade', -194, 24, 0, 25, 24.3, 26.9)

  // hammers: every solid at REST and at FULL COCK (plus midway) — the
  // swing envelope is covered pose-by-pose rather than by one fat sector.
  // Tail blades hang BELOW the arm plane (out of their racks' tooth tiers,
  // which only the tall pallet enters); the high hammer's hub stops above
  // the quarter tier and only its slim stud continues to the plate.
  const hammerVol = (part: string, h: HammerGeo, armT: number, hubZ0: number, bladeZ: [number, number]) => {
    ann(part, 'hub', h.pivot.x, h.pivot.y, 0, 4.7, hubZ0, h.z + 2.8)
    ann(part, 'stud', h.pivot.x, h.pivot.y, 0, 2.1, Z.plate.z1, hubZ0)
    const poses = [0, HAMMER_SWING / 2, HAMMER_SWING]
    for (const [pi, cock] of poses.entries()) {
      const rot = (p: { x: number; y: number }) => {
        const dx = p.x - h.pivot.x
        const dy = p.y - h.pivot.y
        return {
          x: h.pivot.x + dx * Math.cos(cock) - dy * Math.sin(cock),
          y: h.pivot.y + dx * Math.sin(cock) + dy * Math.cos(cock),
        }
      }
      const elbow = h.elbow ? rot(h.elbow) : undefined
      const head = rot(h.headTip)
      if (elbow) {
        seg(part, `arm1p${pi}`, h.pivot, elbow, 1.7, h.z - armT / 2, h.z + armT / 2)
        seg(part, `arm2p${pi}`, elbow, head, 1.7, h.z - armT / 2, h.z + armT / 2)
      } else {
        seg(part, `arm1p${pi}`, h.pivot, head, 1.7, h.z - armT / 2, h.z + armT / 2)
      }
      const az = h.headAz + cock
      obb(part, `headp${pi}`, head.x - Math.cos(az) * 3.5, head.y - Math.sin(az) * 3.5, 3.6, 4.6, az, h.z - 1.6, h.z + 1.6)
      const ttip = rot({ x: h.pivot.x + Math.cos(h.tailAzimuth) * h.tailLen, y: h.pivot.y + Math.sin(h.tailAzimuth) * h.tailLen })
      const bladeEnd = rot({
        x: h.pivot.x + Math.cos(h.tailAzimuth) * (h.tailLen - 3),
        y: h.pivot.y + Math.sin(h.tailAzimuth) * (h.tailLen - 3),
      })
      seg(part, `tailp${pi}`, h.pivot, bladeEnd, 1.6, bladeZ[0], bladeZ[1])
      obb(part, `palletp${pi}`, ttip.x, ttip.y, 1.6, 2.2, h.tailAzimuth + cock, h.tailZ0, h.tailZ1)
    }
  }
  hammerVol('hammerLow', HAMMER_LOW, HAMMER_LOW_ARM_T, HAMMER_LOW.z - 2.8, [HAMMER_LOW.z - 2.6, HAMMER_LOW.z - 0.4])
  hammerVol('hammerHigh', HAMMER_HIGH, HAMMER_HIGH_ARM_T, 33.5, [HAMMER_HIGH.z - 2.6, HAMMER_HIGH.z - 0.6])

  for (const [part, g] of [['gongLow', GONG_LOW], ['gongHigh', GONG_HIGH]] as const)
    ann(part, 'coil', 0, 0, g.rStart - g.drop - g.tubeR, g.rStart + g.tubeR, g.z - g.tubeR, g.z + g.tubeR)
  ann('gongLow', 'block', 0, 0, GONG_BLOCK.rIn, GONG_BLOCK.rOut, GONG_BLOCK.z0, GONG_BLOCK.z1, GONG_BLOCK.a0, GONG_BLOCK.a1)
  {
    const az = (GONG_BLOCK.a0 + GONG_BLOCK.a1) / 2
    ann('gongLow', 'blockPost', Math.cos(az) * 160, Math.sin(az) * 160, 0, 2.2, Z.plate.z1, GONG_BLOCK.z0)
  }

  // dial & hands & case front
  {
    const circle: Array<[number, number]> = []
    for (let i = 0; i < 96; i++) circle.push([Math.cos((i / 96) * TAU) * 172, Math.sin((i / 96) * TAU) * 172])
    poly('dial', 'face', circle, [
      { x: 0, y: 0, r: 11.5 },
      { x: CARRIAGE_POS.x, y: CARRIAGE_POS.y, r: 54 },
    ], Z.dial.z0, Z.dial.z1)
    for (const az of [45, 135, 225, 315])
      ann('dial', `foot${az}`, Math.cos((az * Math.PI) / 180) * 160, Math.sin((az * Math.PI) / 180) * 160, 0, 1.6, Z.plate.z1, Z.dial.z0)
  }
  ann('hourHand', 'hub', 0, 0, 7.7, 10, 44.6, 47.2)
  ann('hourHand', 'blade', 0, 0, 7.7, 93.3, 45.85, 47.15)
  ann('minuteHand', 'hub', 0, 0, 5.3, 7.2, 47.5, 49.8)
  ann('minuteHand', 'blade', 0, 0, 0, 140, 48.3, 49.9)
  ann('minuteHand', 'cap', 0, 0, 0, 3.3, 48.3, 50.6)

  return vols
}

const DEG_ = Math.PI / 180

/** Designed contacts: each pair is a real engagement, separately
 * constrained (mesh laws, bearing fits, pallet paths). Volumes within one
 * part are never tested against each other. */
export const CONTACT_WHITELIST: Array<[string, string]> = [
  // gear meshes crossing part boundaries
  ['barrel/rim', 'centerWheel/pinion'],
  ['centerWheel/disc', 'thirdWheel/pinion'],
  ['thirdWheel/disc', 'carriage/pinion'],
  ['keylessWorks/crownWheel', 'barrel/ratchet'],
  ['keylessWorks/s2pinion', 'motionWorks/minuteWheel'],
  ['strikeTrain/interWheel', 'flyGovernor/pinion'],
  ['fixedFourth/wheel', 'escapeWheel/pinionSwept'],
  // click holds the ratchet; crown-wheel core + screw retain the wheel
  ['keylessWorks/click', 'barrel/ratchet'],
  ['trainBridge/crownPost', 'keylessWorks/crownWheel'],
  ['trainBridge/crownScrew', 'keylessWorks/crownWheel'],
  // the cannon pinion friction-fits the centre arbor (that IS the joint)
  ['centerWheel/arbor', 'motionWorks/cannon'],
  // pivots in bearings the sweep model cannot see through
  ['fixedFourth/wheel', 'mainplate/plateLower'],
  ['carriage/lowerBar', 'palletFork/pivotSwept'],
  ['carriage/lowerBar', 'escapeWheel/arborSwept'],
  ['carriage/lowerBar', 'balance/staff'],
  ['carriage/upperBar', 'escapeWheel/arborSwept'],
  ['carriage/topHub', 'balance/staff'],
  // co-rotating tourbillon cluster (azimuth-separated in the cage frame,
  // clearances audited or whole-cluster visual)
  ['carriage/pillarsLo', 'escapeWheel/wheelSwept'],
  ['carriage/pillarsMid', 'escapeWheel/wheelSwept'],
  ['carriage/pillarsMid', 'escapeWheel/arborSwept'],
  ['carriage/pillarsMid', 'palletFork/swept'],
  ['carriage/pillarsTop', 'balance/springSwept'],
  ['carriage/upperBar', 'balance/rollerSwept'],
  ['escapeWheel/wheelSwept', 'palletFork/pivotSwept'], // 0.3 apart in-frame
  ['escapeWheel/wheelSwept', 'palletFork/swept'], // pallet stones in the teeth
  ['balance/rollerSwept', 'palletFork/swept'], // impulse pin in the fork
  ['balance/springSwept', 'carriage/topHub'], // stud + regulator pins
  // the case back screws onto the band; the slide's lever rides the case
  // slot; the stem passes the band into its tube
  ['caseback/ring', 'caseband/band'],
  ['keylessWorks/stem', 'caseband/band'],
  ['repeaterSlide/lever', 'caseband/band'],
  // racks read their snails; pallets gather their racks; hammers lift
  ['hourRack/tail', 'hourSnail/cam'],
  ['quarterRack/tail', 'quarterSnail/cam'],
  ['minuteRack/tail', 'minuteSnail/cam'],
  ['hourRack/sector', 'strikeTrain/palletH'],
  ['quarterRack/sector', 'strikeTrain/palletQ'],
  ['minuteRack/sector', 'strikeTrain/palletM'],
  ['hammerLow/pallet*', 'strikeTrain/palletH'],
  ['hammerLow/pallet*', 'strikeTrain/palletQ'],
  ['hammerHigh/pallet*', 'strikeTrain/palletQ'],
  ['hammerHigh/pallet*', 'strikeTrain/palletM'],
  ['hammerLow/pallet*', 'hourRack/sector'],
  ['hammerLow/pallet*', 'quarterRack/sector'],
  ['hammerHigh/pallet*', 'quarterRack/sector'],
  ['hammerHigh/pallet*', 'minuteRack/sector'],
  // hammer tail blades meet the gathering pallets' sweep at the staff
  ['hammerLow/tail*', 'strikeTrain/palletH'],
  ['hammerLow/tail*', 'strikeTrain/palletQ'],
  ['hammerHigh/tail*', 'strikeTrain/palletQ'],
  ['hammerHigh/tail*', 'strikeTrain/palletM'],
  // hammers strike their gongs; the arm's exact coil clearance is walked
  // point-by-point at module load, so the coarse coil BAND is excused for
  // the arm and head of its own hammer
  ['hammerLow/head*', 'gongLow/coil'],
  ['hammerLow/arm*', 'gongLow/coil'],
  ['hammerHigh/head*', 'gongHigh/coil'],
  ['hammerHigh/arm*', 'gongHigh/coil'],
  ['gongLow/coil', 'gongHigh/coil'],
  ['gongLow/block', 'gongHigh/coil'],
  // snails ride the star stud / cannon pipe stack
  ['hourSnail/cam', 'hourStar/stud'],
  ['surprisePiece/flag', 'hourStar/stud'],
  ['quarterSnail/cam', 'motionWorks/cannonPipe'],
  ['minuteSnail/cam', 'motionWorks/cannonPipe'],
  // the slide's pin arms the hook; the slide rides in the case slot
  ['repeaterSlide/pinSwept', 'allOrNothing/hook'],
  ['repeaterSlide/slide', 'caseband/band'],
  ['slideSpring/blade', 'repeaterSlide/slide'],
  ['slideSpring/blade', 'caseband/band'],
  // crown & stem through the case tube
  ['keylessWorks/stem', 'caseband/tube'],
  ['keylessWorks/stem', 'crown/*'],
  ['crown/*', 'caseband/tube'],
  ['crown/stub', 'caseband/band'],
]

export interface Clash {
  a: string
  b: string
}

const matches = (pattern: string, name: string): boolean =>
  pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern

function isAllowed(an: string, bn: string): boolean {
  for (const [p, q] of CONTACT_WHITELIST)
    if ((matches(p, an) && matches(q, bn)) || (matches(p, bn) && matches(q, an))) return true
  return false
}

/** Every interpenetrating cross-part volume pair not on the whitelist. */
export function collisions(): Clash[] {
  const vols = buildVolumes()
  // sample each volume once (the pairwise loop only tests containment)
  const samples = vols.map((v) => samplePoints(v, 1.1))
  const bounds = vols.map(boundingCircle)
  const zs = vols.map(zRange)
  const out: Clash[] = []
  for (let i = 0; i < vols.length; i++)
    for (let j = i + 1; j < vols.length; j++) {
      const a = vols[i]
      const b = vols[j]
      if (a.part === b.part) continue
      if (Math.min(zs[i][1], zs[j][1]) - Math.max(zs[i][0], zs[j][0]) <= 0.01) continue
      if (Math.hypot(bounds[i].x - bounds[j].x, bounds[i].y - bounds[j].y) > bounds[i].r + bounds[j].r) continue
      const an = `${a.part}/${a.name}`
      const bn = `${b.part}/${b.name}`
      if (isAllowed(an, bn)) continue
      let hit = false
      for (const [x, y, z] of samples[i]) if (planContains(b, x, y, z)) { hit = true; break }
      if (!hit) for (const [x, y, z] of samples[j]) if (planContains(a, x, y, z)) { hit = true; break }
      if (hit) out.push({ a: an, b: bn })
    }
  return out
}
