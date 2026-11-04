import { describe, expect, it } from 'vitest'
import { aRide } from '../test/render'
import { homePin, isAdvancedRide, weeklyCount } from './rideForm'

describe('weeklyCount', () => {
  it('counts the first ride and one per full week after it', () => {
    expect(weeklyCount('2026-11-02', '2026-11-02')).toBe(1)
    expect(weeklyCount('2026-11-02', '2026-11-08')).toBe(1)
    expect(weeklyCount('2026-11-02', '2026-11-09')).toBe(2)
    expect(weeklyCount('2026-11-02', '2026-11-30')).toBe(5)
  })

  it('is none when the end is before the start', () => {
    expect(weeklyCount('2026-11-09', '2026-11-02')).toBe(0)
  })
})

describe('isAdvancedRide', () => {
  it('is false for a plain ride and for none', () => {
    expect(isAdvancedRide(null)).toBe(false)
    expect(isAdvancedRide(aRide())).toBe(false)
  })

  it('is true once any advanced setting carries a value', () => {
    expect(isAdvancedRide(aRide({ stops: ['Liman'] }))).toBe(true)
    expect(isAdvancedRide(aRide({ passengers_add_stops: false }))).toBe(true)
    expect(isAdvancedRide(aRide({ notes: 'Meet at the fountain' }))).toBe(true)
    expect(isAdvancedRide(aRide({ notes: '   ' }))).toBe(false)
    expect(isAdvancedRide(aRide({ distance_km: 0 }))).toBe(true)
  })
})

describe('homePin', () => {
  const car = { id: 1, name: 'Mazda', plate: 'NS-1', passenger_seats: 4, active: true, home: 'Novi Sad office', home_lat: 45.25, home_lng: 19.84 }
  it('is the home as a pin under its folded name', () => {
    expect(homePin(car as never)).toEqual({ 'novi sad office': { lat: 45.25, lng: 19.84 } })
  })
  it('is nothing for a car with no pinned home', () => {
    expect(homePin({ ...car, home_lat: null } as never)).toEqual({})
    expect(homePin(undefined)).toEqual({})
  })
})
