/**
 * The ride form's own arithmetic and memory (components/RideForm.tsx): which
 * depth it opens on, what it remembers from the last ride you added, and how
 * many rides a weekly repeat makes. Tested in rideForm.test.ts.
 */
import { foldName, parseISODate } from './dates'
import { messages } from './i18n'
import type { CorporateCar, Point, Ride } from './types'

export const LAST_ROUTE_KEY = 'karpul.lastRoute'
/** Simple or advanced, remembered per browser like the view and the theme. */
export const MODE_KEY = 'karpul.formMode'
/** "Repeat weekly" may reach this far (backend: schemas.MAX_REPEAT_WEEKS). */
export const MAX_REPEAT_WEEKS = 26

/**
 * Two depths of the same form. *Simple* asks only what a ride cannot be made
 * without: who drives, which car, how many seats, when, and where from and to.
 * *Advanced* adds the rest in place (the passenger-list switch under the seats,
 * repeats under the day, the pickup points inside the route, then distance,
 * chip-in and the note), so switching mode never reshuffles the fields you
 * already filled in — it only reveals or hides the ones around them.
 *
 * Nothing is dropped by going back to Simple: the values stay in state and are
 * submitted, and a one-line summary at the foot of the simple form says which
 * advanced settings are carrying a value, with a tap to go and see them.
 */
export type Mode = 'simple' | 'advanced'

export function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

/** A ride that already carries an advanced setting opens on the advanced form,
 *  so editing it never hides what is there behind a mode the driver forgot. */
export function isAdvancedRide(seed: Ride | null): boolean {
  if (!seed) return false
  return (
    seed.passengers_manage ||
    !seed.passengers_add_stops ||
    seed.stops.length > 0 ||
    seed.stops_before.length > 0 ||
    seed.distance_km != null ||
    seed.chip_in.trim() !== '' ||
    seed.coffee_please ||
    seed.notes.trim() !== ''
  )
}

/** What the form remembers from the last ride you added: the route, your own
 *  car and how many seats you offered in it, so a regular commute is two taps. */
export interface LastRoute {
  origin: string
  destination: string
  car_name: string
  seats?: number
  /** Your own car's plate, for the Beograd garage. */
  plate?: string
  /** The pins of the two, by folded name, when they had any. */
  points?: Record<string, Point>
}

/** A shared car's home as a pin, by its folded name. */
export function homePin(car: CorporateCar | undefined): Record<string, Point> {
  return car && car.home && car.home_lat != null && car.home_lng != null ? { [foldName(car.home)]: { lat: car.home_lat, lng: car.home_lng } } : {}
}

export const BLANK_ROUTE = (): LastRoute => ({ origin: '', destination: messages().form.defaultDestination, car_name: '' })

export function loadLastRoute(): LastRoute {
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return BLANK_ROUTE()
}

/** How many rides "repeat weekly until" makes: the first plus one per full week. */
export function weeklyCount(from: string, until: string): number {
  const days = Math.round((parseISODate(until).getTime() - parseISODate(from).getTime()) / 86_400_000)
  return days < 0 ? 0 : Math.floor(days / 7) + 1
}
