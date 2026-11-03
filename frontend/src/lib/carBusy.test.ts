import { describe, expect, it } from 'vitest'
import { clashOn, clashText, monthGrid } from './carBusy'
import type { CarBusy } from './types'

const ride = (day: string, dep: string, ret: string | null, id = 1): CarBusy => ({
  ride_id: id,
  ride_date: day,
  departure_time: `${dep}:00`,
  return_time: ret ? `${ret}:00` : null,
  driver_name: 'Ana Petrović',
})

describe('clashOn', () => {
  const busy = [ride('2026-11-10', '08:00', '12:00')]

  it('finds a ride holding the car in the hours asked for', () => {
    expect(clashOn(busy, '2026-11-10', '10:00', '14:00')).toBe(busy[0])
    expect(clashOn(busy, '2026-11-10', '07:00', '08:30')).toBe(busy[0])
  })

  it('lets the car be handed over back to back, and other days are free', () => {
    expect(clashOn(busy, '2026-11-10', '12:00', '15:00')).toBeNull()
    expect(clashOn(busy, '2026-11-10', '06:00', '08:00')).toBeNull()
    expect(clashOn(busy, '2026-11-11', '10:00', '14:00')).toBeNull()
  })

  it('holds the car to midnight when there is no return', () => {
    expect(clashOn(busy, '2026-11-10', '06:00', null)).toBe(busy[0])
    const open = [ride('2026-11-10', '15:00', null)]
    expect(clashOn(open, '2026-11-10', '20:00', '21:00')).toBe(open[0])
    expect(clashOn(open, '2026-11-10', '09:00', '15:00')).toBeNull()
  })
})

describe('clashText', () => {
  it('is the server’s own wording', () => {
    expect(clashText(ride('2026-11-10', '08:00', '12:00'))).toBe('That corporate car is already booked by Ana Petrović from 08:00 to 12:00 that day')
    expect(clashText(ride('2026-11-10', '08:00', null))).toBe('That corporate car is already booked by Ana Petrović from 08:00 that day')
  })
})

describe('monthGrid', () => {
  it('is the six weeks from the Monday on or before the 1st', () => {
    // 1 November 2026 is a Sunday.
    expect(monthGrid('2026-11-20')).toEqual({ from: '2026-10-26', to: '2026-12-06' })
  })
})
