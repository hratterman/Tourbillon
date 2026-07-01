/**
 * Gong tuning. Two cathedral gongs (curved steel rods wrapping nearly twice
 * around the movement), classically tuned roughly a third apart. The
 * fundamentals are user-tunable (Section 4); these are the defaults.
 *
 * Overtone ratios are inharmonic (a steel rod, not a string); higher modes
 * decay faster. The paired near-unison modes give the slow beating shimmer
 * of a real gong.
 */

export interface GongMode {
  ratio: number
  amp: number
  tau: number // seconds
}

export interface GongParams {
  f0: number
  modes: GongMode[]
}

const CATHEDRAL_MODES: GongMode[] = [
  { ratio: 1.0, amp: 1.0, tau: 2.4 },
  { ratio: 1.004, amp: 0.55, tau: 2.0 }, // near-unison pair -> beating shimmer
  { ratio: 2.32, amp: 0.42, tau: 1.05 },
  { ratio: 3.85, amp: 0.26, tau: 0.55 },
  { ratio: 5.41, amp: 0.14, tau: 0.32 },
  { ratio: 7.16, amp: 0.08, tau: 0.18 },
  { ratio: 9.42, amp: 0.05, tau: 0.1 },
]

export const DEFAULT_LOW_F0 = 1568 // G6
export const DEFAULT_HIGH_F0 = 1976 // B6, a major third above

export function makeGong(f0: number): GongParams {
  return { f0, modes: CATHEDRAL_MODES }
}
