import { describe, expect, it } from 'vitest'
import { extractDetail } from './api'
import { addDays, firstName, initials, parseISODate, sameName, shortCarName, startOfWeek, toISODate } from './dates'
import { carPowertrain } from './carModels'
import { sortRequests, sortRides, upsertInRange } from './useBoard'
import type { Ride, RideRequest } from './types'

describe('dates', () => {
  it('builds local ISO dates by hand, never shifted by the zone', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(toISODate(parseISODate('2026-03-29'))).toBe('2026-03-29')
  })

  it('starts the week on Monday', () => {
    expect(toISODate(startOfWeek(parseISODate('2026-09-13')))).toBe('2026-09-07') // a Sunday
    expect(toISODate(startOfWeek(parseISODate('2026-09-07')))).toBe('2026-09-07')
    expect(toISODate(addDays(parseISODate('2026-12-31'), 1))).toBe('2027-01-01')
  })

  it('compares names the way the server does', () => {
    expect(sameName(' Ana  Petrović ', 'ana petrović')).toBe(true)
    expect(sameName('', '')).toBe(false)
    expect(sameName('Ana', 'Ana P')).toBe(false)
  })

  it('shortens names and cars for tight places', () => {
    expect(initials('Ana Marija Petrović')).toBe('AP')
    expect(initials('Ana')).toBe('A')
    expect(firstName('Ana Petrović')).toBe('Ana')
    expect(shortCarName('Octavia (FIRM-001)')).toBe('Octavia')
    expect(shortCarName('grey Golf')).toBe('grey Golf')
  })
})

describe('the board in order', () => {
  const r = (id: number, ride_date: string, departure_time: string) => ({ id, ride_date, departure_time }) as Ride

  it('sorts rides by day, departure and id, like the API', () => {
    const sorted = sortRides([r(3, '2026-09-11', '07:00'), r(2, '2026-09-10', '08:00'), r(1, '2026-09-10', '08:00')])
    expect(sorted.map((x) => x.id)).toEqual([1, 2, 3])
  })

  it('puts a live ride in its place, or takes it out when it left the range', () => {
    const list = [r(1, '2026-09-10', '08:00'), r(2, '2026-09-10', '09:00')]
    expect(upsertInRange(list, r(2, '2026-09-10', '07:00'), true, sortRides).map((x) => x.id)).toEqual([2, 1])
    expect(upsertInRange(list, r(1, '2026-10-01', '08:00'), false, sortRides).map((x) => x.id)).toEqual([2])
  })

  it('sorts requests by day and the time asked for', () => {
    const q = (id: number, request_date: string, departure_time: string) => ({ id, request_date, departure_time }) as RideRequest
    expect(sortRequests([q(1, '2026-09-11', '07:00'), q(2, '2026-09-10', '09:00'), q(3, '2026-09-10', '08:00')]).map((x) => x.id)).toEqual([3, 2, 1])
  })
})

describe('API errors', () => {
  it('turns FastAPI validation errors into field-prefixed lines', () => {
    expect(extractDetail({ detail: 'Ride not found' })).toBe('Ride not found')
    expect(
      extractDetail({
        detail: [
          { loc: ['body', 'origin'], msg: 'Value error, must not be empty' },
          { loc: ['body', 'seats'], msg: 'Input should be less than or equal to 8' },
        ],
      }),
    ).toBe('origin: must not be empty; seats: Input should be less than or equal to 8')
    expect(extractDetail(null)).toBeNull()
  })
})

describe('powertrains', () => {
  it('reads the explicit words first, hybrid before electric', () => {
    expect(carPowertrain('Plug-in hybrid electric Passat')).toBe('hybrid')
    expect(carPowertrain('Mazda 6e (FIRM-001)')).toBe('electric')
    expect(carPowertrain('Golf TDI')).toBe('diesel')
  })
})
