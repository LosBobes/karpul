import { describe, expect, it } from 'vitest'
import type { Me } from './me'
import { boardRange, daySelection, upcomingSelection } from './selection'
import type { Ride } from './types'

const me: Me = { id: 1, name: 'Ana Petrović' }

function ride(id: number, overrides: Partial<Ride> = {}): Ride {
  return {
    id,
    ride_date: '2026-09-10',
    car_type: 'own',
    car_name: 'Golf',
    corporate_car_id: null,
    driver_id: 2,
    driver_name: 'Marko Jovanović',
    origin: 'Novi Sad',
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
    legs: [],
    approval: '',
    ...overrides,
  }
}

const mine = ride(7, { bookings: [{ id: 1, passenger_id: 1, passenger_name: 'Ana Petrović', pickup: '', created_at: '' }] })

describe('the open tile on a day', () => {
  it('is the pick while it exists, else your car, else the first', () => {
    expect(daySelection(3, [ride(3), mine], me)).toBe(3)
    expect(daySelection(99, [ride(3), mine], me)).toBe(7)
    expect(daySelection(null, [ride(3), ride(4)], me)).toBe(3)
    expect(daySelection(null, [], me)).toBeNull()
  })
})

describe('the open row in the upcoming list', () => {
  it('unfolds only on a tap on a phone, and never leaves a wide pane empty', () => {
    expect(upcomingSelection(null, [ride(3), mine], me, false)).toBeNull()
    expect(upcomingSelection(3, [ride(3), mine], me, false)).toBe(3)
    expect(upcomingSelection(null, [ride(3), mine], me, true)).toBe(7)
    expect(upcomingSelection(null, [ride(3), ride(4)], me, true)).toBe(3)
  })
})

describe('the loaded range', () => {
  it('is the week around the day, the day itself, or the days ahead', () => {
    expect(boardRange('week', '2026-09-10')).toEqual({ from: '2026-09-07', to: '2026-09-13' })
    expect(boardRange('day', '2026-09-10')).toEqual({ from: '2026-09-10', to: '2026-09-10' })
    const ahead = boardRange('upcoming', '2026-09-10')
    expect(ahead.from <= ahead.to).toBe(true)
  })
})
