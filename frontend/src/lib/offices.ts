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

/**
 * How far a ride takes a car (backend: offices.ride_km): the way there, and
 * the way back when it returns. Between the offices each direction is its own
 * figure; any other route is the driver's one-way distance, doubled.
 */
export function rideKm(origin: string, destination: string, distanceKm: number | null, withReturn: boolean): number | null {
  const there = officeDistance(origin, destination) ?? distanceKm
  if (there === null) return null
  if (!withReturn) return there
  return there + (officeDistance(destination, origin) ?? there)
}

/** The trips between the offices as the car report offers them (components/CarReportSheet.tsx). */
export const OFFICE_TRIPS: { from: string; to: string; km: number }[] = [
  { from: 'Beograd', to: 'Novi Sad', km: DISTANCES['beograd>novi sad'] },
  { from: 'Novi Sad', to: 'Beograd', km: DISTANCES['novi sad>beograd'] },
]

/**
 * The office whose garage lets in only the cars on its list (backend:
 * offices.GARAGE_OFFICE / needs_garage): an own car driven there asks for its
 * plate, and an admin puts it on the list (components/GarageList.tsx).
 */
export const GARAGE_OFFICE = 'beograd'

/** Whether a ride to `destination` in an own car asks for the plate. */
export function goesToGarage(carType: string, destination: string): boolean {
  return carType === 'own' && officeOf(destination) === GARAGE_OFFICE
}

/** Whether a ride is still waiting for an admin to put its plate on the list. */
export function garageTask(ride: { car_type: string; plate: string; destination: string; plate_registered: boolean }): boolean {
  return !!ride.plate && goesToGarage(ride.car_type, ride.destination) && !ride.plate_registered
}
