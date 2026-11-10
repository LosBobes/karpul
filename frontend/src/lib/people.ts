import type { Ride } from './types'
import { sameName } from './dates'

/** Someone with an account, as anyone signed in may see them (backend: routers/people.py). */
export interface Person {
  id: number
  display_name: string
  /** An admin (by the flag or by `KARPUL_ADMINS`): shared-car mails go to them. */
  is_admin?: boolean
}

/** Lower case without the accents, so "jovic" finds "Jović". */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Who can still be put in `ride`: everyone with an account but the driver and
 * whoever already has a seat, matching `query` anywhere in the name.
 */
export function addable(people: Person[], ride: Ride, query: string): Person[] {
  const q = fold(query.trim())
  const taken = (p: Person) =>
    p.id === ride.driver_id ||
    sameName(p.display_name, ride.driver_name) ||
    ride.bookings.some((b) => b.passenger_id === p.id || (b.passenger_id === null && sameName(b.passenger_name, p.display_name)))
  return people.filter((p) => !taken(p) && (!q || fold(p.display_name).includes(q)))
}
