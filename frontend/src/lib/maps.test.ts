import { describe, expect, it } from 'vitest'
import {
  bounds,
  centre,
  directionsUrl,
  fmtKm,
  hasPins,
  kmBetween,
  mapsSearchUrl,
  navigateUrl,
  near,
  pinsFor,
  pointOf,
  routeStops,
  routeUrl,
  stopHint,
} from './maps'
import type { Me } from './me'
import type { Ride, RideRequest } from './types'

const LIMAN = { lat: 45.244, lng: 19.842 }
const FUTOG = { lat: 45.239, lng: 19.711 }
const HQ = { lat: 45.26, lng: 19.83 }

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 10,
    ride_date: '2026-09-10',
    car_type: 'own',
    car_name: 'Golf',
    corporate_car_id: null,
    driver_id: 2,
    driver_name: 'Marko Jovanović',
    origin: 'Liman',
    destination: 'HQ',
    departure_time: '07:30:00',
    return_time: null,
    seats: 2,
    notes: '',
    passengers_manage: false,
    stops: [],
    stops_before: [],
    passengers_add_stops: true,
    needs_driver: false,
    coffee_please: false,
    distance_km: null,
    chip_in: '',
    series_id: null,
    created_at: '2026-09-01T10:00:00',
    driver_phone: null,
    bookings: [],
    waitlist: [],
    message_count: 0,
    free_seats: 2,
    approval: '',
    legs: [],
    points: {},
    ...overrides,
  }
}

function request(overrides: Partial<RideRequest> = {}): RideRequest {
  return {
    id: 1,
    request_date: '2026-09-10',
    user_id: 1,
    name: 'Ana Petrović',
    origin: 'Kod pumpe',
    destination: 'HQ',
    departure_time: '07:30:00',
    note: '',
    ride_id: null,
    created_at: '2026-09-01T10:00:00',
    points: { 'kod pumpe': { lat: 45.2445, lng: 19.845 } },
    ...overrides,
  }
}

describe('pins on a route', () => {
  it('finds a pin under any spelling of the place', () => {
    const r = ride({ points: { 'novi sad': LIMAN } })
    expect(pointOf(r, 'Novi  Sad')).toEqual(LIMAN)
    expect(pointOf(r, 'NOVI SAD')).toEqual(LIMAN)
    expect(pointOf(r, 'Futog')).toBeNull()
    expect(pointOf(null, 'Futog')).toBeNull()
  })

  it('walks the route in the order the car reaches it', () => {
    const r = ride({ stops_before: ['Futog'], stops: ['Sajam'], points: { futog: FUTOG, liman: LIMAN } })
    expect(routeStops(r).map((s) => [s.place, s.role, s.n, s.point !== null])).toEqual([
      ['Futog', 'stop', 1, true],
      ['Liman', 'start', 2, true],
      ['Sajam', 'stop', 3, false],
      ['HQ', 'end', 4, false],
    ])
    expect(hasPins(r)).toBe(true)
    expect(hasPins(ride())).toBe(false)
  })

  it('sends only the pins of the places on the route, by the place as written', () => {
    expect(pinsFor(['Liman', ' ', 'HQ', 'Futog'], { liman: LIMAN, hq: HQ, elsewhere: FUTOG })).toEqual({ Liman: LIMAN, HQ: HQ })
  })
})

describe('the maps app', () => {
  it('opens a place by its pin, else by its words', () => {
    expect(mapsSearchUrl('Liman', LIMAN)).toBe('https://www.google.com/maps/search/?api=1&query=45.244%2C19.842')
    expect(mapsSearchUrl('Kod Spensa | ulaz')).toBe('https://www.google.com/maps/search/?api=1&query=Kod+Spensa+%7C+ulaz')
    expect(directionsUrl('Futog', FUTOG)).toContain('destination=45.239%2C19.711')
  })

  it('opens the whole route with every pickup point a waypoint in order', () => {
    const r = ride({ stops_before: ['Futog'], stops: ['Sajam'], points: { futog: FUTOG, hq: HQ } })
    const url = new URL(routeUrl(r))
    expect(url.searchParams.get('origin')).toBe('45.239,19.711')
    expect(url.searchParams.get('destination')).toBe('45.26,19.83')
    expect(url.searchParams.get('waypoints')).toBe('Liman|Sajam')
    expect(new URL(routeUrl(ride())).searchParams.get('waypoints')).toBeNull()
  })

  it('takes a passenger to their own pickup and the driver along the route', () => {
    const ana: Me = { id: 1, name: 'Ana Petrović' }
    const r = ride({
      stops: ['Sajam'],
      points: { sajam: FUTOG },
      bookings: [{ id: 5, passenger_id: 1, passenger_name: 'Ana Petrović', pickup: 'Sajam', created_at: '' }],
    })
    expect(new URL(navigateUrl(r, ana)).searchParams.get('destination')).toBe('45.239,19.711')
    expect(new URL(navigateUrl(r, { id: 2, name: 'Marko Jovanović' })).searchParams.get('origin')).toBe('Liman')
  })
})

describe('distances', () => {
  it('measures as the crow flies', () => {
    expect(kmBetween({ lat: 44.8125, lng: 20.4612 }, { lat: 45.2551, lng: 19.8452 })).toBeCloseTo(69, 0)
    expect(near(LIMAN, { lat: 45.25, lng: 19.842 })).toBe(true)
    expect(near(LIMAN, FUTOG)).toBe(false)
    expect(near(null, LIMAN)).toBe(false)
  })

  it('boxes and centres points', () => {
    expect(bounds([])).toBeNull()
    expect(bounds([LIMAN, FUTOG])).toEqual([
      [45.239, 19.711],
      [45.244, 19.842],
    ])
    expect(centre([LIMAN, FUTOG])).toEqual({ lat: 45.2415, lng: 19.7765 })
  })

  it('writes kilometres the way the app does', () => {
    expect(fmtKm(4.26)).toBe('4.3')
    expect(fmtKm(91.6)).toBe('92')
  })
})

describe('the "on your way" hint', () => {
  const pinned = ride({ stops: ['Sajam'], points: { liman: LIMAN, sajam: { lat: 45.26, lng: 19.82 }, hq: HQ } })

  it('offers your request start as a stop right after the nearest pickup point', () => {
    const hint = stopHint(pinned, request())
    expect(hint).toEqual({ place: 'Kod pumpe', point: { lat: 45.2445, lng: 19.845 }, where: { before: false, index: 0 }, near: 'Liman' })
  })

  it('stays quiet when nothing fits', () => {
    expect(stopHint(pinned, undefined)).toBeNull()
    expect(stopHint(pinned, request({ ride_id: 3 }))).toBeNull()
    expect(stopHint(pinned, request({ request_date: '2026-09-11' }))).toBeNull()
    expect(stopHint(pinned, request({ points: {} }))).toBeNull()
    expect(stopHint(pinned, request({ destination: 'Airport' }))).toBeNull()
    expect(stopHint(pinned, request({ origin: 'Sajam', points: { sajam: LIMAN } }))).toBeNull()
    expect(stopHint({ ...pinned, passengers_add_stops: false }, request())).toBeNull()
    expect(stopHint(pinned, request({ points: { 'kod pumpe': FUTOG } }))).toBeNull()
    expect(stopHint({ ...pinned, stops: ['a', 'b', 'c', 'd', 'e', 'f'] }, request())).toBeNull()
  })
})
