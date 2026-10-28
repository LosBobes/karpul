import { addDays, parseISODate, startOfWeek, toISODate, todayISO } from './dates'
import { inRide, myBooking, type Me } from './me'
import type { Ride } from './types'

/**
 * Which ride is open, and which days are loaded (App.tsx). Plain functions
 * of the board, so the rules can be read in one place and tested.
 */

export type View = 'upcoming' | 'week' | 'day'
export const VIEWS: View[] = ['upcoming', 'week', 'day']
/** How far ahead the upcoming list looks. The API caps a range at 92 days. */
export const UPCOMING_DAYS = 90

/** The days a view needs: the next UPCOMING_DAYS, the one day, or the Mon-Sun week around `selected`. */
export function boardRange(view: View, selected: string): { from: string; to: string } {
  if (view === 'upcoming') {
    const today = parseISODate(todayISO())
    return { from: toISODate(today), to: toISODate(addDays(today, UPCOMING_DAYS)) }
  }
  if (view === 'day') return { from: selected, to: selected }
  const monday = startOfWeek(parseISODate(selected))
  return { from: toISODate(monday), to: toISODate(addDays(monday, 6)) }
}

/**
 * The open tile on a day board: an explicit pick that still exists, else
 * your own car, else the first one; null with no rides (the empty card).
 */
export function daySelection(picked: number | null, dayRides: Ride[], me: Me): number | null {
  if (picked !== null && dayRides.some((r) => r.id === picked)) return picked
  return dayRides.find((r) => myBooking(r, me) !== undefined)?.id ?? dayRides[0]?.id ?? null
}

/**
 * The open row in the upcoming list: only an explicit tap unfolds one; side by
 * side on a wide screen the pane is never empty, so with nothing picked it
 * shows your next ride, else the first.
 */
export function upcomingSelection(picked: number | null, rides: Ride[], me: Me, wide: boolean): number | null {
  if (picked !== null && rides.some((r) => r.id === picked)) return picked
  if (!wide) return null
  return rides.find((r) => inRide(r, me))?.id ?? rides[0]?.id ?? null
}
