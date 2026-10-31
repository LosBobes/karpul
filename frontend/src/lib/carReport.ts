/**
 * The arithmetic behind the car report's pictures (components/CarReportSheet.tsx):
 * where a finger on the battery lands as a charge, what colour that charge
 * reads in, and the odometer's digits as wheels.
 */

/** How many wheels the odometer shows: a pool car never reaches a million km. */
export const ODO_WHEELS = 6

/** A charge from a pointer at `x` over a battery drawn from `left`, `width` wide (the cap not counted). */
export function socAt(x: number, left: number, width: number): number {
  if (width <= 0) return 0
  const raw = ((x - left) / width) * 100
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export type SocTone = 'low' | 'mid' | 'high'

/** Under 20 % wants a charger before the next ride; under 50 % is worth a word. */
export function socTone(soc: number): SocTone {
  if (soc < 20) return 'low'
  if (soc < 50) return 'mid'
  return 'high'
}

/** A step of the battery under the keyboard, kept in 0..100. */
export function socStep(soc: number | null, by: number): number {
  return Math.max(0, Math.min(100, (soc ?? 50) + by))
}

/**
 * The odometer's wheels, most significant first, each 0..9: the reading
 * padded with zeros to `ODO_WHEELS` (a longer one keeps all its digits).
 */
export function odoWheels(km: number | null): number[] {
  const text = km === null ? '' : String(Math.max(0, Math.floor(km)))
  return text.padStart(ODO_WHEELS, '0').split('').map(Number)
}

/** The reading after a nudge of `by` km, never below zero; empty starts from `base`. */
export function odoNudge(km: number | null, base: number | null, by: number): number {
  return Math.max(0, (km ?? base ?? 0) + by)
}

/** The battery spent per km, as the server guesses it (backend: carstate.SOC_PER_KM). */
export const SOC_PER_KM = 0.24

/** About how far a charge takes the car, by the same figure. */
export function rangeKm(soc: number): number {
  return Math.round(soc / SOC_PER_KM)
}

/** A quick problem added to the issues text after a comma, never twice. */
export function addIssue(text: string, issue: string): string {
  const lines = text.split(/\n|, /).map((s) => s.trim()).filter(Boolean)
  if (lines.some((l) => l.toLowerCase() === issue.toLowerCase())) return text
  return text.trim() === '' ? issue : `${text.trimEnd()}, ${issue}`
}
