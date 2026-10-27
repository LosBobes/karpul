import { describe, expect, it } from 'vitest'
import { messages } from './i18n'
import { filterLog, logCsv, logTotals, sortLog } from './rideLog'
import type { Ride } from './types'

const ride = (id: number, over: Partial<Ride> = {}): Ride =>
  ({
    id,
    ride_date: '2026-10-20',
    departure_time: '07:30:00',
    return_time: '16:00:00',
    car_type: 'own',
    car_name: 'Blue Golf',
    driver_name: 'Marko',
    driver_phone: null,
    origin: 'Novi Sad',
    destination: 'HQ',
    stops: [],
    seats: 3,
    bookings: [],
    waitlist: [],
    legs: [],
    distance_km: null,
    chip_in: '',
    notes: '',
    ...over,
  }) as Ride

const pax = (...names: string[]) => names.map((passenger_name, i) => ({ id: i, passenger_id: null, passenger_name, pickup: '', created_at: '' }))

describe('the rides table', () => {
  const rides = [
    ride(1, { driver_name: 'Ana', car_type: 'corporate', car_name: 'Octavia (FIRM-001)', bookings: pax('Mila Đorđević'), distance_km: 80 }),
    ride(2, { ride_date: '2026-10-19', distance_km: 12.5 }),
    ride(3, { departure_time: '06:00:00', bookings: pax('Ivo', 'Ana') }),
  ]

  it('filters by car type and by every word, accents aside', () => {
    expect(filterLog(rides, 'corporate', '').map((r) => r.id)).toEqual([1])
    expect(filterLog(rides, 'all', 'dordevic').map((r) => r.id)).toEqual([1])
    expect(filterLog(rides, 'all', 'Djordjević').map((r) => r.id)).toEqual([1])
    expect(filterLog(rides, 'all', 'ana octavia').map((r) => r.id)).toEqual([1])
    expect(filterLog(rides, 'own', 'ana').map((r) => r.id)).toEqual([3])
  })

  it('sorts by a column and keeps the board order between equals', () => {
    expect(sortLog(rides, { key: 'date', dir: 1 }).map((r) => r.id)).toEqual([2, 3, 1])
    expect(sortLog(rides, { key: 'date', dir: -1 }).map((r) => r.id)).toEqual([1, 3, 2])
    expect(sortLog(rides, { key: 'driver', dir: 1 }).map((r) => r.id)).toEqual([1, 2, 3])
    expect(sortLog(rides, { key: 'taken', dir: -1 }).map((r) => r.id)).toEqual([3, 1, 2])
    expect(sortLog(rides, { key: 'km', dir: 1 }).map((r) => r.id)).toEqual([3, 2, 1])
  })

  it('adds up rides, passengers and km', () => {
    expect(logTotals(rides)).toEqual({ rides: 3, pax: 3, km: 93, driven: 0 })
  })

  it('writes a spreadsheet an office in Germany or Serbia opens as is', () => {
    const csv = logCsv([rides[0], ride(4, { distance_km: 12.5, notes: '=HYPERLINK("x"); call me', driver_phone: '+381 64 123' })], messages())
    const [head, first, second] = csv.split('\r\n')
    expect(head.startsWith('﻿Date;Leaves;Back;Driver;Driver phone;Car;Type')).toBe(true)
    expect(first).toBe('2026-10-20;07:30;16:00;Ana;;Octavia (FIRM-001);Company;Novi Sad;;HQ;3;1;Mila Đorđević;;80;;;;;;')
    expect(second).toContain(";'+381 64 123;")
    expect(second).toContain(';12,5;')
    expect(second.endsWith(`;"'=HYPERLINK(""x""); call me"`)).toBe(true)
  })
})
