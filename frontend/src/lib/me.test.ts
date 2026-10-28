import { describe, expect, it } from 'vitest'
import { drives, handsOver, inRide, isMe, mayClaim, myBooking, placeInLine, seatedIn, type Me } from './me'
import { similarName } from './dates'
import type { Ride } from './types'

const ana: Me = { id: 1, name: 'Ana Petrović' }

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 10,
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
    approval: '',
    legs: [],
    ...overrides,
  }
}

describe('who is who', () => {
  it('goes by the account where the row has one', () => {
    expect(isMe(ana, 1, 'Someone Else')).toBe(true)
    // A namesake with another account is not you, however the name is written.
    expect(isMe(ana, 3, 'ana  PETROVIĆ')).toBe(false)
  })

  it('falls back to the name for a row from before accounts', () => {
    expect(isMe(ana, null, '  ana   petrović ')).toBe(true)
    expect(isMe(ana, null, 'Ana P')).toBe(false)
  })

  it('finds your seat, your drive and your place in line', () => {
    const seated = ride({
      bookings: [
        { id: 5, passenger_id: 9, passenger_name: 'Mila', pickup: '', created_at: '' },
        { id: 6, passenger_id: 1, passenger_name: 'Ana Petrović', pickup: '', created_at: '' },
      ],
    })
    expect(myBooking(seated, ana)?.id).toBe(6)
    expect(seatedIn(seated, ana)).toBe(true)
    expect(drives(seated, ana)).toBe(false)
    expect(inRide(seated, ana)).toBe(true)

    const mine = ride({ driver_id: 1, driver_name: 'Ana Petrović' })
    expect(drives(mine, ana)).toBe(true)
    expect(inRide(mine, ana)).toBe(true)

    const queued = ride({
      waitlist: [
        { id: 1, user_id: 4, name: 'Vuk', pickup: '', created_at: '' },
        { id: 2, user_id: 1, name: 'Ana Petrović', pickup: '', created_at: '' },
      ],
    })
    expect(placeInLine(queued, ana)).toBe(2)
    expect(placeInLine(ride(), ana)).toBe(0)
  })
})

describe('mayClaim', () => {
  const blazic: Me = { id: 7, name: 'Milan Blažić' }
  const logged = (driver: string, extra: Partial<Ride> = {}) => ride({ driver_id: null, driver_name: driver, ...extra })

  it('offers a ride under your name typed another way', () => {
    expect(mayClaim(logged('Milan Blazic'), blazic)).toBe(true)
    expect(mayClaim(logged('blazic  milan'), blazic)).toBe(true)
  })

  it('not under someone else, an account, or your own seat', () => {
    expect(mayClaim(logged('Milan Katanic'), blazic)).toBe(false)
    expect(mayClaim(ride({ driver_id: 3, driver_name: 'Milan Blazic' }), blazic)).toBe(false)
    const seated = logged('Milan Blazic', {
      bookings: [{ id: 1, passenger_id: 7, passenger_name: 'Milan Blažić', pickup: '', created_at: '' }],
    })
    expect(mayClaim(seated, blazic)).toBe(false)
  })

  it('mirrors similar_names on the server', () => {
    expect(similarName('Pavle Cicmil', 'Pavle Čičmil')).toBe(true)
    expect(similarName('Nikola Drobac', 'Nikola Đrobac')).toBe(true)
    expect(similarName('Sandra Kozomara', 'Sandra Kozomarra')).toBe(true)
    expect(similarName('Milan Kolacek', 'Milan Katanic')).toBe(false)
    expect(similarName('', '')).toBe(false)
  })
})

describe('a shared car the driver cancels', () => {
  const now = new Date(2026, 8, 9, 12, 0)
  const mine = (overrides: Partial<Ride> = {}) =>
    ride({
      car_type: 'corporate',
      corporate_car_id: 3,
      driver_id: 1,
      driver_name: 'Ana Petrović',
      bookings: [{ id: 5, passenger_id: 9, passenger_name: 'Mila', pickup: '', created_at: '' }],
      ...overrides,
    })

  it('is offered to its passengers while it has somewhere to go', () => {
    expect(handsOver(mine(), ana, now)).toBe(true)
    expect(handsOver(mine({ ride_date: '2026-09-09', departure_time: '11:00:00' }), ana, now)).toBe(false)
    expect(handsOver(mine({ car_type: 'own' }), ana, now)).toBe(false)
    expect(handsOver(mine({ approval: 'pending' }), ana, now)).toBe(false)
    expect(handsOver(mine({ bookings: [{ id: 5, passenger_id: null, passenger_name: 'Mila', pickup: '', created_at: '' }] }), ana, now)).toBe(false)
    // Only the driver's own cancelling asks; an admin's removes it.
    expect(handsOver(mine({ driver_id: 2 }), { ...ana, admin: true }, now)).toBe(false)
  })

  it('is no longer driven by whoever gave it up', () => {
    expect(drives(mine({ needs_driver: true }), ana)).toBe(false)
  })
})
