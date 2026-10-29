import type { Point, Ride } from './types'

/** Pickup points on one ride, before the start and on the way together (backend: schemas.MAX_STOPS). */
export const MAX_STOPS = 6

/** Where a pickup point that is not on the route yet goes (backend: schemas.NewStop):
 * into the stops before the origin (`before`) or the ones after it, at `index`. */
export interface NewStop {
  before: boolean
  index: number
  /** Where the new place is on the map, when it was pinned. */
  point?: Point | null
}

/** One place a new pickup point can go, between two points of the route. */
export interface StopSlot extends NewStop {
  /** The route point it comes after, null when it is the very first. */
  after: string | null
  /** The route point it comes before. */
  next: string
}

/** Every pickup point besides the origin, in the order the car reaches them. */
export function allStops(ride: Pick<Ride, 'stops' | 'stops_before'>): string[] {
  return [...(ride.stops_before ?? []), ...ride.stops]
}

/**
 * The gaps of the route a new pickup point can go into, in route order: ahead
 * of the first point, then between each two, never past the destination.
 */
export function stopSlots(ride: Pick<Ride, 'stops' | 'stops_before' | 'origin' | 'destination'>): StopSlot[] {
  const before = ride.stops_before ?? []
  const route = [...before, ride.origin, ...ride.stops, ride.destination]
  // Gap i is just ahead of route[i]: up to the origin it goes in the stops
  // before it, after that in the ones on the way.
  return route.map((next, i) => ({
    before: i <= before.length,
    index: i <= before.length ? i : i - before.length - 1,
    after: i === 0 ? null : route[i - 1],
    next,
  }))
}

/** The slot a passenger is offered first: just after the origin. */
export function defaultSlot(slots: StopSlot[]): number {
  const i = slots.findIndex((s) => !s.before)
  return i < 0 ? 0 : i
}
