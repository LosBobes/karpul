import { createContext, useContext } from 'react'
import { sameName } from './dates'
import type { Booking, Ride, RideRequest, WaitlistEntry } from './types'

/**
 * Who is looking at the board: the signed-in account's id and the name it goes
 * by. Rides and seats point at accounts (`driver_id`, `passenger_id`), so
 * "is this mine?" is a question about the id; only a row from before accounts
 * that nobody has claimed carries a name alone, and then the name decides, by
 * the same rule as the server (`is_person` in backend/app/services.py).
 *
 * App provides it once (`MeContext`); components read it with `useMe()`, and
 * the helpers below are plain functions so lib code and tests can use them.
 */
export interface Me {
  id: number
  name: string
}

/** Is a row with this account id and this name `me`? */
export function isMe(me: Me, personId: number | null | undefined, name: string): boolean {
  if (personId !== null && personId !== undefined) return personId === me.id
  return sameName(name, me.name)
}

export function drives(ride: Ride, me: Me): boolean {
  return isMe(me, ride.driver_id, ride.driver_name)
}

export function isMyBooking(booking: Booking, me: Me): boolean {
  return isMe(me, booking.passenger_id, booking.passenger_name)
}

export function myBooking(ride: Ride, me: Me): Booking | undefined {
  return ride.bookings.find((b) => isMyBooking(b, me))
}

export function seatedIn(ride: Ride, me: Me): boolean {
  return myBooking(ride, me) !== undefined
}

/** In the car at all: driving it or sitting in it. */
export function inRide(ride: Ride, me: Me): boolean {
  return drives(ride, me) || seatedIn(ride, me)
}

export function myWaitlistEntry(ride: Ride, me: Me): WaitlistEntry | undefined {
  return ride.waitlist.find((w) => w.user_id === me.id)
}

/** Where you stand in the queue, 1 for first; 0 when you are not in it. */
export function placeInLine(ride: Ride, me: Me): number {
  return ride.waitlist.findIndex((w) => w.user_id === me.id) + 1
}

export function isMyRequest(request: RideRequest, me: Me): boolean {
  return request.user_id === me.id
}

export const MeContext = createContext<Me>({ id: -1, name: '' })

export function useMe(): Me {
  return useContext(MeContext)
}
