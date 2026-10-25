import { describe, expect, it } from 'vitest'
import { drives, inRide, isMe, myBooking, placeInLine, seatedIn, type Me } from './me'
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
