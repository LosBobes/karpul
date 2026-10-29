import { foldName } from './dates'
import { drives, myBooking, type Me } from './me'
import { allStops, stopSlots, type NewStop } from './stops'
import type { Point, Points, Ride, RideRequest } from './types'

/**
 * Places on the map (backend: app/geo.py). A place is still the words someone
 * typed; a pin is extra, kept on the ride by the place's folded name
 * (`foldName`), so any spelling of a place finds it. Nothing has to be pinned:
 * a place without one is opened in the maps app by its words.
 */

/** A request starts "where a ride passes" this close to one of its pickup points
 * (backend: geo.NEAR_KM). */
export const NEAR_KM = 2

/** The pin of `place` on a ride (or a request), or null. */
export function pointOf(owner: { points?: Points } | null | undefined, place: string): Point | null {
  if (!owner?.points || !place) return null
  return owner.points[foldName(place)] ?? null
}

/** One place of a ride's route, in the order the car reaches it. */
export interface RouteStop {
  place: string
  point: Point | null
  role: 'start' | 'stop' | 'end'
  /** 1-based, along the whole route. */
  n: number
}

export function routeStops(ride: Pick<Ride, 'origin' | 'destination' | 'stops' | 'stops_before' | 'points'>): RouteStop[] {
  const before = ride.stops_before ?? []
  const places = [...before, ride.origin, ...ride.stops, ride.destination]
  return places.map((place, i) => ({
    place,
    point: pointOf(ride, place),
    role: i === before.length ? 'start' : i === places.length - 1 ? 'end' : 'stop',
    n: i + 1,
  }))
}

/** Whether any place of the ride is pinned (then it has a map to show). */
export function hasPins(ride: Pick<Ride, 'points'>): boolean {
  return Object.keys(ride.points ?? {}).length > 0
}

/** Pins on a route as the given payload carries them, by the place as written:
 * only the places of the route, a place with no pin left out. */
export function pinsFor(places: string[], pins: Record<string, Point | null | undefined>): Record<string, Point> {
  const out: Record<string, Point> = {}
  for (const place of places) {
    const point = pins[foldName(place)]
    if (place.trim() && point) out[place] = point
  }
  return out
}

function where(place: string, point: Point | null): string {
  return point ? `${point.lat},${point.lng}` : place
}

/** Google Maps on a phone opens the app; elsewhere the web page. */
const MAPS = 'https://www.google.com/maps'

/** The place in the maps app: its pin when it has one, else a search for its words. */
export function mapsSearchUrl(place: string, point: Point | null = null): string {
  return `${MAPS}/search/?${new URLSearchParams({ api: '1', query: where(place, point) })}`
}

/** Directions to one place (a passenger's pickup point). */
export function directionsUrl(place: string, point: Point | null = null): string {
  return `${MAPS}/dir/?${new URLSearchParams({ api: '1', destination: where(place, point), travelmode: 'driving' })}`
}

/** The whole route in the maps app, every pickup point a waypoint in order. */
export function routeUrl(ride: Pick<Ride, 'origin' | 'destination' | 'stops' | 'stops_before' | 'points'>): string {
  const stops = routeStops(ride)
  const first = stops[0]
  const last = stops[stops.length - 1]
  const params = new URLSearchParams({
    api: '1',
    origin: where(first.place, first.point),
    destination: where(last.place, last.point),
    travelmode: 'driving',
  })
  const middle = stops.slice(1, -1)
  if (middle.length) params.set('waypoints', middle.map((s) => where(s.place, s.point)).join('|'))
  return `${MAPS}/dir/?${params}`
}

/** As the crow flies (haversine), in kilometres. */
export function kmBetween(a: Point, b: Point): number {
  const r = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dla = rad(b.lat - a.lat)
  const dln = rad(b.lng - a.lng)
  const h = Math.sin(dla / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dln / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function near(a: Point | null | undefined, b: Point | null | undefined, km = NEAR_KM): boolean {
  return !!a && !!b && kmBetween(a, b) <= km
}

/** The box round some points: [[south, west], [north, east]], or null for none. */
export function bounds(points: Point[]): [[number, number], [number, number]] | null {
  if (!points.length) return null
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ]
}

/** The middle of some points, for a map to open on. */
export function centre(points: Point[]): Point | null {
  const box = bounds(points)
  if (!box) return null
  return { lat: (box[0][0] + box[1][0]) / 2, lng: (box[0][1] + box[1][1]) / 2 }
}

/** What the "on your way" hint offers: your own request's start as a new
 * pickup point on a ride that passes near it. */
export interface StopHint {
  place: string
  point: Point
  where: NewStop
  /** The ride's pickup point it is near. */
  near: string
}

/**
 * Your open request that day starts near this ride's route but not on it: the
 * ride's pickup point nearest the start of the request, within `NEAR_KM`, and
 * the new place goes just after it (backend: requests.drivers_for matches the
 * same way). Null when nothing fits: no pinned start, the place already on the
 * route, the ride going elsewhere, the route full or closed to new places.
 */
export function stopHint(ride: Ride, request: RideRequest | undefined, maxStops = 6): StopHint | null {
  if (!request || request.ride_id !== null || request.request_date !== ride.ride_date) return null
  const start = pointOf(request, request.origin)
  if (!start || !ride.passengers_add_stops || allStops(ride).length >= maxStops) return null
  const places = [ride.origin, ...allStops(ride), ride.destination].map(foldName)
  if (places.includes(foldName(request.origin))) return null
  const endPin = pointOf(request, request.destination)
  const goes = foldName(ride.destination) === foldName(request.destination) || near(endPin, pointOf(ride, ride.destination))
  if (!goes) return null
  let best: { stop: string; km: number } | null = null
  for (const stop of routeStops(ride).slice(0, -1)) {
    if (!stop.point) continue
    const km = kmBetween(stop.point, start)
    if (km <= NEAR_KM && (!best || km < best.km)) best = { stop: stop.place, km }
  }
  if (!best) return null
  const slots = stopSlots(ride)
  const slot = slots.find((s) => s.after !== null && foldName(s.after) === foldName(best.stop)) ?? slots[slots.length - 1]
  return { place: request.origin, point: start, where: { before: slot.before, index: slot.index }, near: best.stop }
}

/** Where a map with nothing on it opens: Novi Sad, where most rides start. */
export const HOME_VIEW: Point = { lat: 45.2551, lng: 19.8452 }

/** Where *Navigate* goes: the whole route for the driver, your own pickup point for a passenger. */
export function navigateUrl(ride: Ride, me: Me): string {
  const mine = myBooking(ride, me)
  if (mine && !drives(ride, me)) {
    const place = mine.pickup || ride.origin
    return directionsUrl(place, pointOf(ride, place))
  }
  return routeUrl(ride)
}

/** Kilometres in the app's words: one decimal under 10, whole above. */
export function fmtKm(km: number): string {
  return km < 10 ? km.toFixed(1) : String(Math.round(km))
}
