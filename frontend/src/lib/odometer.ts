import { isMe, runs, type Me } from './me'
import type { DriveLeg, Ride } from './types'

/**
 * A shared car's odometer (backend: DriveLeg, the `/legs` routes in
 * routers/rides.py), read the same way by the ride card, the admin's table and
 * its spreadsheet. The legs follow each other: a handover ends one stretch at
 * the reading the next one starts from, and the last one ends when the car is
 * back.
 */

/** The stretch being driven right now, if the car is out. */
export function openLeg(ride: Ride): DriveLeg | undefined {
  const last = ride.legs.at(-1)
  return last && last.end_km === null ? last : undefined
}

/** Out and back: every stretch has its end reading. */
export function isBack(ride: Ride): boolean {
  return ride.legs.length > 0 && openLeg(ride) === undefined
}

/** The reading the car was taken at, and the one it came back at (null while out). */
export function odometerSpan(ride: Ride): { start: number | null; end: number | null } {
  if (!ride.legs.length) return { start: null, end: null }
  return { start: ride.legs[0].start_km, end: isBack(ride) ? ride.legs.at(-1)!.end_km : null }
}

/** Kilometres driven so far: the finished stretches; null when nothing is noted. */
export function kmDriven(ride: Ride): number | null {
  if (!ride.legs.length) return null
  return ride.legs.reduce((n, l) => n + (l.end_km === null ? 0 : l.end_km - l.start_km), 0)
}

/** Who drove how far, in the order they first took the wheel; one line per person. */
export function kmByDriver(ride: Ride): { name: string; km: number }[] {
  const out: { name: string; km: number }[] = []
  for (const leg of ride.legs) {
    const km = leg.end_km === null ? 0 : leg.end_km - leg.start_km
    const seen = out.find((d) => d.name === leg.driver_name)
    if (seen) seen.km += km
    else out.push({ name: leg.driver_name, km })
  }
  return out
}

/** May `me` note a reading: the ride's driver or an admin, or whoever is at the wheel (backend: _may_note_km). */
export function canNoteKm(ride: Ride, me: Me): boolean {
  const leg = openLeg(ride)
  return runs(ride, me) || (leg !== undefined && isMe(me, leg.driver_id, leg.driver_name))
}

/** Does this ride keep an odometer at all: a shared car, let through by the admins. */
export function keepsKm(ride: Ride): boolean {
  return ride.car_type === 'corporate' && ride.approval !== 'pending'
}
