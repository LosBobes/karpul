import { describe, expect, it } from 'vitest'
import { canNoteKm, isBack, kmByDriver, kmDriven, odometerSpan, openLeg } from './odometer'
import { atWheel, logCsv } from './rideLog'
import { messages } from './i18n'
import type { DriveLeg, Ride } from './types'

const leg = (id: number, driver_name: string, start_km: number, end_km: number | null, driver_id: number | null = id): DriveLeg => ({
  id,
  driver_id,
  driver_name,
  start_km,
  end_km,
  created_at: '',
})

const ride = (legs: DriveLeg[], over: Partial<Ride> = {}): Ride =>
  ({
    id: 1,
    ride_date: '2026-10-27',
    departure_time: '08:00:00',
    return_time: '18:00:00',
    car_type: 'corporate',
    car_name: 'Mazda 6e (BG-123-XY)',
    driver_id: 1,
    driver_name: 'Ana Petrović',
    driver_phone: null,
    origin: 'Beograd',
    destination: 'Novi Sad',
    stops: [],
    stops_before: [],
    passengers_add_stops: true,
    needs_driver: false,
    coffee_please: false,
    seats: 3,
    bookings: [],
    waitlist: [],
    legs,
    distance_km: null,
    chip_in: '',
    notes: '',
    approval: '',
    ...over,
  }) as Ride

describe('the odometer', () => {
  const out = ride([leg(1, 'Ana Petrović', 12340, 12460), leg(2, 'Marko Marković', 12460, null)])
  const done = ride([leg(1, 'Ana Petrović', 12340, 12460), leg(2, 'Marko Marković', 12460, 12500), leg(3, 'Ana Petrović', 12500, 12580, 1)])

  it('knows whether the car is out and who has it', () => {
    expect(openLeg(out)?.driver_name).toBe('Marko Marković')
    expect(isBack(out)).toBe(false)
    expect(isBack(done)).toBe(true)
    expect(isBack(ride([]))).toBe(false)
  })

  it('adds up the finished stretches, per driver too', () => {
    expect(kmDriven(out)).toBe(120)
    expect(kmDriven(done)).toBe(240)
    expect(kmDriven(ride([]))).toBeNull()
    expect(kmByDriver(done)).toEqual([
      { name: 'Ana Petrović', km: 200 },
      { name: 'Marko Marković', km: 40 },
    ])
    expect(odometerSpan(out)).toEqual({ start: 12340, end: null })
    expect(odometerSpan(done)).toEqual({ start: 12340, end: 12580 })
  })

  it('lets the driver, an admin or whoever is at the wheel note it', () => {
    expect(canNoteKm(out, { id: 1, name: 'Ana Petrović' })).toBe(true)
    expect(canNoteKm(out, { id: 2, name: 'Marko Marković' })).toBe(true)
    expect(canNoteKm(out, { id: 9, name: 'Vuk' })).toBe(false)
    expect(canNoteKm(out, { id: 9, name: 'Vuk', admin: true })).toBe(true)
    expect(canNoteKm(done, { id: 2, name: 'Marko Marković' })).toBe(false)
  })

  it('goes into the table and the spreadsheet', () => {
    expect(atWheel(done, 'en')).toBe('Ana Petrović 200 km, Marko Marković 40 km')
    const [header, row] = logCsv([done], messages()).replace('﻿', '').split('\r\n')
    const cells = (line: string) => line.split(';')
    const at = (name: string) => cells(header).indexOf(name)
    const c = messages().rideLog.col
    expect(cells(row)[at(c.odoStart)]).toBe('12340')
    expect(cells(row)[at(c.odoEnd)]).toBe('12580')
    expect(cells(row)[at(c.driven)]).toBe('240')
    expect(cells(row)[at(c.atWheel)]).toBe('Ana Petrović 200 km, Marko Marković 40 km')
  })
})
