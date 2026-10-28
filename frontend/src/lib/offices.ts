import { foldName } from './dates'

/**
 * The two offices and the road between them (backend: app/offices.py; keep
 * the names and the figures in step). Beograd to Novi Sad is 90 km, the way
 * back 92: a ride on that road never needs the driver to type a distance,
 * the form shows the known one and the server fills it in when left blank.
 */
const OFFICES: Record<string, string[]> = {
  beograd: ['beograd', 'belgrade', 'bg', 'beograd office', 'kancelarija beograd', 'beograd kancelarija'],
  'novi sad': ['novi sad', 'ns', 'novi sad office', 'kancelarija novi sad', 'novi sad kancelarija'],
}

const DISTANCES: Record<string, number> = {
  'beograd>novi sad': 90,
  'novi sad>beograd': 92,
}

/** Which office a place name means, or null for anywhere else. */
export function officeOf(place: string): string | null {
  const key = foldName(place)
  for (const [office, names] of Object.entries(OFFICES)) if (names.includes(key)) return office
  return null
}

/** The kilometres from `origin` to `destination` when both are offices. */
export function officeDistance(origin: string, destination: string): number | null {
  const a = officeOf(origin)
  const b = officeOf(destination)
  if (a === null || b === null) return null
  return DISTANCES[`${a}>${b}`] ?? null
}
