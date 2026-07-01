/**
 * All physical constants and calibration for the movement.
 *
 * Units: SI throughout the oscillator (rad, rad/s, N·m, kg·m², J, s).
 * Angles for wheels are tracked in radians of total rotation (unbounded).
 */

export const TAU = Math.PI * 2
export const DEG = Math.PI / 180

// ---------------------------------------------------------------------------
// Balance and hairspring: 28,800 vph = 8 beats/s = 4 Hz full oscillations.
// ---------------------------------------------------------------------------
export const BALANCE_FREQ_HZ = 4 // full oscillations per second
export const OMEGA_N = TAU * BALANCE_FREQ_HZ // natural angular frequency, rad/s
export const BALANCE_I = 1e-7 // moment of inertia, kg·m² (typical wristwatch balance)
export const HAIRSPRING_K = BALANCE_I * OMEGA_N * OMEGA_N // torsional stiffness, N·m/rad

// Viscous damping (air drag + pivot losses), expressed as the `c` in
// theta'' = -(k/I) theta - c omega + tau/I.  Q = OMEGA_N / c.
export const BALANCE_Q = 250
export const BALANCE_C = OMEGA_N / BALANCE_Q // 1/s
// Small Coulomb (dry) friction torque at the pivots. Gives the free decay a
// realistic tail and makes the balance actually come to rest.
export const PIVOT_FRICTION = 4e-9 // N·m

// ---------------------------------------------------------------------------
// Swiss lever escapement geometry (angles on the balance).
// ---------------------------------------------------------------------------
// Total balance rotation during which the impulse pin is engaged with the
// fork (unlocking + impulse). Classic value ~50-52 degrees.
export const LIFT_ANGLE = 52 * DEG
export const HALF_WINDOW = LIFT_ANGLE / 2
// First part of the engagement: the pin pushes the fork off the locked tooth
// against draw. Costs the balance energy.
export const UNLOCK_ARC = 8 * DEG
export const IMPULSE_ARC = LIFT_ANGLE - UNLOCK_ARC
// A deliberate tiny offset of the beat centre so the watch shows a realistic
// (non-zero) beat error on the timing machine readout.
export const BEAT_OFFSET = 0.8 * DEG

// Escape wheel: 15 teeth. One beat (half-oscillation) advances the wheel by
// half a tooth pitch; one full oscillation releases exactly one tooth.
export const ESCAPE_TEETH = 15
export const ESC_TOOTH_PITCH = TAU / ESCAPE_TEETH // 24 deg
export const ESC_ADVANCE_PER_BEAT = ESC_TOOTH_PITCH / 2 // 12 deg
// How the 12 deg per beat is composed: a slight recoil during unlocking
// (draw pulls the wheel backwards), the driven impulse rotation, and the
// free drop onto the opposite pallet.
export const ESC_RECOIL = 0.5 * DEG
export const ESC_DROP = 3 * DEG
export const ESC_IMPULSE_ROT = ESC_ADVANCE_PER_BEAT + ESC_RECOIL - ESC_DROP // 9.5 deg

// ---------------------------------------------------------------------------
// Going train: tooth counts. Barrel -> centre -> third -> carriage (seconds),
// and inside the carriage the escape pinion rolls around the fixed fourth
// wheel (the tourbillon epicyclic).
// ---------------------------------------------------------------------------
export const BARREL_TEETH = 84
export const CENTER_PINION = 12 // centre wheel = barrel * 84/12 = 7x
export const CENTER_TEETH = 80
export const THIRD_PINION = 10 // third = centre * 8x
export const THIRD_TEETH = 75
export const CARRIAGE_PINION = 10 // carriage = third * 7.5x
// Tourbillon epicyclic: escape pinion (8 leaves) rolls around the FIXED
// fourth wheel (120 teeth). Ground-frame escape wheel rate =
// carriage rate * (1 + 120/8) = 16 rev of escape wheel per carriage rev.
export const FIXED_FOURTH_TEETH = 120
export const ESCAPE_PINION = 8
export const ESC_REVS_PER_CARRIAGE_REV = 1 + FIXED_FOURTH_TEETH / ESCAPE_PINION // 16

// Derived ratios
export const CENTER_PER_BARREL = BARREL_TEETH / CENTER_PINION // 7
export const THIRD_PER_CENTER = CENTER_TEETH / THIRD_PINION // 8
export const CARRIAGE_PER_THIRD = THIRD_TEETH / CARRIAGE_PINION // 7.5
export const CARRIAGE_PER_CENTER = THIRD_PER_CENTER * CARRIAGE_PER_THIRD // 60
export const ESC_REVS_PER_BARREL_REV =
  CENTER_PER_BARREL * CARRIAGE_PER_CENTER * ESC_REVS_PER_CARRIAGE_REV // 6720

// Motion works: cannon pinion (minute hand, 1 rev/h) -> minute wheel ->
// hour wheel (1 rev/12h).
export const CANNON_TEETH = 12
export const MINUTE_WHEEL_TEETH = 36
export const MINUTE_WHEEL_PINION = 10
export const HOUR_WHEEL_TEETH = 40
export const HOUR_PER_CANNON =
  (CANNON_TEETH / MINUTE_WHEEL_TEETH) * (MINUTE_WHEEL_PINION / HOUR_WHEEL_TEETH) // 1/12

// ---------------------------------------------------------------------------
// Mainspring
// ---------------------------------------------------------------------------
export const MAINSPRING_MAX_TURNS = 5.7
export const BARREL_HOURS_PER_TURN = CENTER_PER_BARREL // centre wheel is 1 rev/h
export const POWER_RESERVE_HOURS = MAINSPRING_MAX_TURNS * BARREL_HOURS_PER_TURN // ~39.9 h
export const BARREL_TORQUE_FULL = 8e-3 // N·m at full wind

// ---------------------------------------------------------------------------
// Escapement drive calibration.
//
// The impulse torque felt by the balance is proportional to the torque at
// the escape wheel, which is the barrel torque divided down the train (times
// an efficiency), then geared up through pallet/roller leverage. We fold all
// of that into a single gain G = tau_impulse_on_balance / tau_barrel, and
// CALIBRATE G so that the steady-state amplitude at full wind is
// AMPLITUDE_TARGET. Steady state: energy in per beat = energy out per beat.
//   E_in  = tau_imp * IMPULSE_ARC - tau_unlock * UNLOCK_ARC
//   E_out = (c*I) * A^2 * omega_n * pi/2  +  2 * PIVOT_FRICTION * A
// ---------------------------------------------------------------------------
export const AMPLITUDE_TARGET = 290 * DEG // rad, fully wound
export const UNLOCK_TORQUE_RATIO = 0.3 // tau_unlock = 0.3 * tau_imp

const eOutAtTarget =
  BALANCE_C * BALANCE_I * AMPLITUDE_TARGET * AMPLITUDE_TARGET * OMEGA_N * (Math.PI / 2) +
  2 * PIVOT_FRICTION * AMPLITUDE_TARGET
const tauImpFull = eOutAtTarget / (IMPULSE_ARC - UNLOCK_TORQUE_RATIO * UNLOCK_ARC)
/** Impulse torque on the balance per unit barrel torque. */
export const IMPULSE_GAIN = tauImpFull / (BARREL_TORQUE_FULL * 1.05) // 1.05 = curve value at full wind

// ---------------------------------------------------------------------------
// Keyless works (crown/stem) ratios — realised by the physical gear chain in
// render3d/layout.ts, which asserts equality with these numbers.
//   winding: stem 12t -> crown wheel 36/36t -> ratchet 60t = 1/5 barrel turn
//   setting: castle 12t -> s2 48/8t -> minute wheel 36t -> cannon 12t = 1/6
// ---------------------------------------------------------------------------
export const KEYLESS_WIND_RATIO = (12 / 36) * (36 / 60) // 0.2 ratchet turn / crown turn
export const KEYLESS_SET_RATIO = (12 / 48) * (8 / 36) * (36 / 12) // 1/6 cannon turn / crown turn

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------
export const DT_PHYSICS = 1e-4 // s of simulated time per physics sub-step

// ---------------------------------------------------------------------------
// Ratio self-checks (spec §1.3): a wrong ratio doesn't crash, it produces a
// watch that runs fast or slow. These assertions are the only thing that
// catches it, so they run at module load.
// ---------------------------------------------------------------------------
function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Gear train assertion failed: ${msg}`)
}

// One full balance oscillation releases exactly one escape tooth, so the
// escape wheel turns once per ESCAPE_TEETH oscillations.
const secondsPerEscRev = ESCAPE_TEETH / BALANCE_FREQ_HZ // 3.75 s
const secondsPerCarriageRev = secondsPerEscRev * ESC_REVS_PER_CARRIAGE_REV
check(
  Math.abs(secondsPerCarriageRev - 60) < 1e-9,
  `carriage (seconds) revolution is ${secondsPerCarriageRev}s, expected 60s`,
)
const carriageRevsPerCenterRev = CARRIAGE_PER_CENTER
check(
  Math.abs(carriageRevsPerCenterRev - 60) < 1e-9,
  `centre wheel (minutes) makes 1 rev per ${carriageRevsPerCenterRev} carriage revs, expected 60`,
)
check(Math.abs(HOUR_PER_CANNON - 1 / 12) < 1e-12, 'motion works must reduce 12:1')
check(
  Math.abs(ESC_RECOIL * -1 + ESC_IMPULSE_ROT + ESC_DROP - ESC_ADVANCE_PER_BEAT) < 1e-12,
  'escape wheel per-beat rotation must decompose into recoil+impulse+drop',
)
