import { describe, expect, it } from 'vitest'
import { captionRoom, dayAxis, freeGaps, fromMinutes, planRows, rowStatus, slotTimes, toMinutes } from './dayPlan'
import type { CorporateCar, Ride } from './types'

const car = (id: number, name: string, active = true): CorporateCar => ({ id, name, plate: `P-${id}`, passenger_seats: 4, active })

let nextId = 1
function ride(over: Partial<Ride>): Ride {
  return {
    id: nextId++,
    ride_date: '2026-10-26',
    car_type: 'corporate',
    car_name: 'Mazda 6e (P-1)',
    corporate_car_id: 1,
    driver_name: 'Ana Petrović',
    origin: 'Novi Sad',
    destination: 'Office',
    departure_time: '08:00:00',
    return_time: '12:00:00',
    seats: 3,
    notes: '',
    passengers_manage: false,
    stops: [],
    distance_km: null,
    chip_in: '',
    series_id: null,
    created_at: '',
    driver_id: 1,
    driver_phone: null,
    bookings: [],
    waitlist: [],
    message_count: 0,
    free_seats: 3,
    approval: '',
    ...over,
  }
}

describe('day plan', () => {
  it('reads and writes clock times', () => {
    expect(toMinutes('08:30:00')).toBe(510)
    expect(toMinutes('17:05')).toBe(1025)
    expect(fromMinutes(510)).toBe('08:30')
    expect(fromMinutes(24 * 60)).toBe('23:59')
  })

  it('spans the working day, stretched to fit the rides', () => {
    expect(dayAxis([])).toEqual({ from: 420, to: 1140 })
    expect(dayAxis([ride({ departure_time: '05:40', return_time: '21:15' })])).toEqual({ from: 300, to: 1320 })
    // No return: the car is out to midnight, but that alone does not stretch the axis.
    expect(dayAxis([ride({ departure_time: '09:00', return_time: null })])).toEqual({ from: 420, to: 1140 })
  })

  it('gives every active pool car a row and own cars one each', () => {
    const cars = [car(1, 'Mazda 6e'), car(2, 'Octavia'), car(3, 'Old van', false)]
    const rides = [
      ride({ corporate_car_id: 1, departure_time: '13:00', return_time: '15:00' }),
      ride({ corporate_car_id: 1, departure_time: '08:00', return_time: '12:00' }),
      ride({ corporate_car_id: 3, car_name: 'Old van (P-3)', departure_time: '09:00' }),
      ride({ car_type: 'own', corporate_car_id: null, car_name: 'grey Golf', driver_id: 7, driver_name: 'Marko' }),
    ]
    const { pool, own } = planRows(rides, cars, dayAxis(rides))
    expect(pool.map((r) => r.label)).toEqual(['Mazda 6e (P-1)', 'Octavia (P-2)', 'Old van (P-3)'])
    expect(pool[0].bars.map((b) => b.start)).toEqual([480, 780])
    expect(pool[0].gaps).toEqual([
      { start: 420, end: 480 },
      { start: 720, end: 780 },
      { start: 900, end: 1140 },
    ])
    expect(pool[1].gaps).toEqual([{ start: 420, end: 1140 }])
    // A retired car still shows the ride it carries, but cannot be booked.
    expect(pool[2].car).toBeNull()
    expect(pool[2].gaps).toEqual([])
    expect(own.map((r) => r.label)).toEqual(['grey Golf'])
  })

  it('leaves no gap after a ride with no return, nor one too short to use', () => {
    const rides = [ride({ departure_time: '07:20', return_time: '09:00' }), ride({ departure_time: '14:00', return_time: null })]
    const { pool } = planRows(rides, [car(1, 'Mazda 6e')], { from: 420, to: 1140 })
    expect(freeGaps(pool[0].bars, { from: 420, to: 1140 })).toEqual([{ start: 540, end: 840 }])
  })

  it('books a tap on the half hour, back by the next ride or by five', () => {
    const axis = { from: 420, to: 1140 }
    expect(slotTimes({ start: 720, end: 780 }, 731, axis)).toEqual({ departure: 720, ret: 780 })
    expect(slotTimes({ start: 540, end: 840 }, 610, axis)).toEqual({ departure: 600, ret: 840 })
    expect(slotTimes({ start: 900, end: 1140 }, null, axis)).toEqual({ departure: 900, ret: 1020 })
    expect(slotTimes({ start: 900, end: 1140 }, 1110, axis)).toEqual({ departure: 1110, ret: 1170 })
  })
})

describe('day plan row status', () => {
  const axis = { from: 420, to: 1140 }
  it('says when a car is free', () => {
    const cars = [car(1, 'Mazda 6e'), car(2, 'Octavia'), car(3, 'Caddy')]
    const rides = [
      ride({ corporate_car_id: 1, departure_time: '08:00', return_time: '12:00' }),
      ride({ corporate_car_id: 2, departure_time: '07:00', return_time: null }),
      ride({ corporate_car_id: 1, departure_time: '13:00', return_time: '19:00' }),
    ]
    const { pool } = planRows(rides, cars, axis)
    expect(rowStatus(pool[0], axis)).toEqual({ kind: 'freeBetween', from: 420, to: 480 })
    expect(rowStatus(pool[1], axis)).toEqual({ kind: 'booked' })
    expect(rowStatus(pool[2], axis)).toEqual({ kind: 'freeAllDay' })
    expect(captionRoom(pool[0].bars, 0, axis)).toBe(300)
    expect(captionRoom(pool[0].bars, 1, axis)).toBe(360)
  })
})

describe('day plan and approvals', () => {
  it('leaves the stretch under a pending ride free to book', () => {
    const axis = { from: 420, to: 1140 }
    const rides = [
      ride({ corporate_car_id: 1, departure_time: '08:00', return_time: '12:00' }),
      ride({ corporate_car_id: 1, departure_time: '13:00', return_time: '15:00', approval: 'pending' }),
    ]
    const { pool } = planRows(rides, [car(1, 'Mazda 6e')], axis)
    expect(pool[0].bars).toHaveLength(2)
    expect(pool[0].gaps).toEqual([
      { start: 420, end: 480 },
      { start: 720, end: 1140 },
    ])
  })
})
