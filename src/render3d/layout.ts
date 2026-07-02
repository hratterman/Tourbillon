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

// barrel 84t ⇄ centre pinion 12t, module 1.06; barrel toward the crown side
const M_BC = 1.06
const BARREL_DIR = unit(0.743, -0.669)
const D_BC = (M_BC * (84 + 12)) / 2
export const centerPinion = wheel(12, M_BC, 0, 0, 4, 7)
export const barrel = wheel(84, M_BC, BARREL_DIR.x * D_BC, BARREL_DIR.y * D_BC, 4, 7)
export const BARREL_DRUM = { r: 44.5, z0: 3, z1: 13 }

// --------------------------------------------------------------------- //
// Motion works (dial side)
// --------------------------------------------------------------------- //

const M_MW = 1.6
const MW_DIR = unit(0.94, 0.342) // toward the crown, clear of the well
export const cannonPinion = wheel(12, M_MW, 0, 0, 22, 25)
export const minuteWheel = wheel(36, M_MW, MW_DIR.x * ((M_MW * 48) / 2), MW_DIR.y * ((M_MW * 48) / 2), 22, 24.4)
// minute-wheel pinion 10t ⇄ hour wheel 40t over the same centre distance
const D_MH = Math.hypot(minuteWheel.x, minuteWheel.y)
const M_MH = (2 * D_MH) / 50
export const minuteWheelPinion = wheel(10, M_MH, minuteWheel.x, minuteWheel.y, 24.4, 27.6)
export const hourWheel = wheel(40, M_MH, 0, 0, 26.2, 28.2)

// --------------------------------------------------------------------- //
// Keyless works: winding  stem → winding pinion ⇄ castle → crown wheel →
// ratchet;  setting  castle → s1 idler → s2 (two-tier) → minute wheel.
// Stem axis: y = 0, z = STEM_Z.
// --------------------------------------------------------------------- //

export const STEM_Z = 24.5
export const STEM_R = 2.6

// ratchet on the barrel arbor, above the drum, recessed under the plate
export const ratchet = wheel(60, 0.9, barrel.x, barrel.y, 13.5, 16)
// crown wheel: lower spur tier meshes the ratchet; upper contrate ring (36t,
// r 15) faces the winding pinion under the stem
export const CROWN_CONTRATE = { teeth: 36, r: 15 }
const crownWheelY = -CROWN_CONTRATE.r // contrate ring tangent to the stem line
const crownWheelX =
  barrel.x + Math.sqrt(((0.9 * 96) / 2) ** 2 - (crownWheelY - barrel.y) ** 2)
export const crownWheel = wheel(36, 0.9, crownWheelX, crownWheelY, 13.5, 16)
export const CROWN_CONTRATE_Z = { z0: 16.5, z1: 18 }

// winding pinion on the stem (12 crown-form teeth), dog-clutch face x+
export const WINDING_PINION = { teeth: 12, r: 6.5, x: crownWheel.x, w: 5 }
// sliding castle wheel: dog face toward the winding pinion; 12t spur ring
// at its outer end engages the setting idler when the crown is pulled
export const CASTLE = { teeth: 12, r: 5.4, xRest: 84, pull: 6.1, w: 8 }

// setting wheels (in plate recesses, z tier just under the motion works)
export const s1Idler = wheel(18, 0.9, NaN, -13.5, 19, 21.5)
s1Idler.x = CASTLE.xRest + CASTLE.pull // directly under the pulled spur ring
export const s2Wheel = wheel(48, 0.9, NaN, NaN, 19, 21.4)
export const s2Pinion = wheel(8, M_MW, NaN, NaN, 21.4, 25.5)
{
  // s2 must mesh s1 (r + r) and the minute wheel (via its pinion)
  const dA = s1Idler.r + s2Wheel.r
  const dB = s2Pinion.r + minuteWheel.r
  const D = Math.hypot(minuteWheel.x - s1Idler.x, minuteWheel.y - s1Idler.y)
  const a = (D * D + dA * dA - dB * dB) / (2 * D)
  const h = Math.sqrt(Math.max(0, dA * dA - a * a))
  const u = unit(minuteWheel.x - s1Idler.x, minuteWheel.y - s1Idler.y)
  // choose the solution on the caseband side (negative y), clear of the stem
  s2Wheel.x = s1Idler.x + a * u.x + h * u.y
  s2Wheel.y = s1Idler.y + a * u.y - h * u.x
  s2Pinion.x = s2Wheel.x
  s2Pinion.y = s2Wheel.y
}

/** Exact keyless ratios (asserted): winding 12/36 × 36/60 = 1/5 turn of
 * ratchet per stem turn; setting (12/48)(8/36)(36/12) = 1/6 cannon turn
 * per stem turn = 10 minutes per crown revolution. */
export const WIND_RATIO = (12 / 36) * (36 / 60) // 0.2
export const SET_RATIO = (12 / 48) * (8 / 36) * (36 / 12) // 1/6

// --------------------------------------------------------------------- //
// Strike train (dial side): strike wheel (gathering pallet) → intermediate
// two-tier → governor pinion.  ω_gov = 40/10 × 36/24 = 6 × ω_strike.
// --------------------------------------------------------------------- //

export const strikeWheel = wheel(40, 1.0, 72, -72, 27, 29)
export const strikeInterPinion = wheel(10, 1.0, NaN, NaN, 27.6, 29.6)
export const strikeInterWheel = wheel(36, 0.7, NaN, NaN, 29.8, 32)
export const governorPinion = wheel(24, 0.7, NaN, NaN, 29.8, 32)
{
  const dir = unit(-0.524, -0.852)
  const d1 = strikeWheel.r + strikeInterPinion.r
  strikeInterPinion.x = strikeWheel.x + dir.x * d1
  strikeInterPinion.y = strikeWheel.y + dir.y * d1
  strikeInterWheel.x = strikeInterPinion.x
  strikeInterWheel.y = strikeInterPinion.y
  const d2 = strikeInterWheel.r + governorPinion.r
  governorPinion.x = strikeInterWheel.x + dir.x * d2
  governorPinion.y = strikeInterWheel.y + dir.y * d2
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

export interface HammerGeo {
  pivot: { x: number; y: number }
  headTip: { x: number; y: number } // where the head meets its gong
  tailAzimuth: number // toward the strike-wheel arbor
  tailLen: number // pivot -> lifting pallet (just clear of the staff)
  tailZ0: number
  tailZ1: number // the tall lifting pallet spans its racks' tooth tiers
  z: number // arm/head plane = its gong plane
}

function hammerGeo(pivot: { x: number; y: number }, headTip: { x: number; y: number }, z: number, tailZ0: number, tailZ1: number): HammerGeo {
  const d = Math.hypot(strikeWheel.x - pivot.x, strikeWheel.y - pivot.y)
  return {
    pivot,
    headTip,
    tailAzimuth: aim(pivot, strikeWheel),
    tailLen: d - GATHER_R,
    tailZ0,
    tailZ1,
    z,
  }
}

// low hammer: lifted by hour-rack AND quarter-rack teeth (tall pallet).
// Its arm is thinned so it passes between the two gong tubes.
export const HAMMER_LOW = hammerGeo({ x: 108, y: -52 }, { x: 147, y: -28 }, 29, 25, 31.2)
export const HAMMER_LOW_ARM_T = 1.8
// high hammer: lifted by quarter-rack AND minute-rack teeth
export const HAMMER_HIGH = hammerGeo({ x: 94, y: -64 }, { x: 140, y: -42 }, 31.5, 29, 34.2)
export const HAMMER_HIGH_ARM_T = 2.4

/** Gong bands (start radius spirals inward 17 units over 1.9 wraps).
 * The high gong rides half a tier above the low one so the low hammer's
 * arm passes beneath it on the way to the outer gong. */
export const GONG_LOW = { rStart: 156, z: 29 }
export const GONG_HIGH = { rStart: 149, z: 31.5 }


// --------------------------------------------------------------------- //
// Z tiers for the rest of the stack (kept here so clashes are auditable)
// --------------------------------------------------------------------- //
export const Z = {
  casebackFace: -9,
  bridges: { z0: 1, z1: 6 },
  plate: { z0: 17, z1: 21.5 },
  cageRing: 13,
  cageTop: 37,
  escapeWheel: { z0: 19, z1: 20.5 },
  fork: { z0: 22, z1: 24.5 },
  roller: 26,
  balance: { z0: 28, z1: 32 },
  hairspring: { z0: 33.5, z1: 35.5 },
  hourStar: { z0: 23, z1: 25 },
  hourSnail: { z0: 25.5, z1: 28.3 },
  quarterSnail: { z0: 29, z1: 31.5 },
  minuteSnail: { z0: 32, z1: 34.4 },
  hourRack: { z0: 25.5, z1: 27.7 },
  quarterRack: { z0: 29, z1: 31.2 },
  minuteRack: { z0: 32, z1: 34.2 },
  gatherFinger: { z0: 29.3, z1: 31.3 },
  gongLow: 26.5,
  gongHigh: 28.5,
  hammers: 32,
  dial: { z0: 42, z1: 44 },
  hourPipe: { r: 7.5, z0: 28.5, z1: 44.6 },
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
// hammer heads land in their gong's radial band
for (const [name, h, g] of [['low', HAMMER_LOW, GONG_LOW], ['high', HAMMER_HIGH, GONG_HIGH]] as const) {
  const r = Math.hypot(h.headTip.x, h.headTip.y)
  check(r > g.rStart - 17 && r < g.rStart + 1, `${name} hammer head reaches its gong (r ${r.toFixed(1)})`)
}

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
  const ratchetAngle = -mv.mainspring.turns * TAU
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
    crownWheel: meshedAngle(ratchetAngle, ratchet, crownWheel),
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
// barrel turn through the crown wheel), so its rotation is a pure function
// of the wind state. Because one unit of mainspring wind advances BOTH the
// pinion and the contrate ring by exactly 60 of their own tooth pitches,
// their relative pitch fraction is a constant of assembly: the ring's
// mounting offset below sets it to a half pitch, so a pinion tooth always
// dips into a ring gap at the mesh zone (plan x = crownWheel.x).
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
 * given ring mounting offset (rad, in the crown wheel's local frame). */
export function contrateRingPitchFrac(turns: number, ringOffset: number): number {
  const ratchetAngle = -turns * TAU
  const cwRot3 = -meshedAngle(ratchetAngle, ratchet, crownWheel)
  const f = (cwRot3 + ringOffset + Math.PI / 2) / P36
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
