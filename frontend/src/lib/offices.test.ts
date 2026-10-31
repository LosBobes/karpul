import { describe, expect, it } from 'vitest'
import { officeDistance, officeOf, rideKm } from './offices'

describe('the road between the offices', () => {
  it('knows both directions', () => {
    expect(officeDistance('Beograd', 'Novi Sad')).toBe(90)
    expect(officeDistance('Novi Sad', 'Beograd')).toBe(92)
    expect(officeDistance('belgrade', 'NS')).toBe(90)
  })
  it('knows nothing about other roads', () => {
    expect(officeDistance('Novi Sad', 'Niš')).toBeNull()
    expect(officeDistance('Office', 'Novi Sad')).toBeNull()
    expect(officeOf('Zrenjanin')).toBeNull()
  })
})

describe('rideKm', () => {
  it('counts the office road each way and doubles any other', () => {
    expect(rideKm('Beograd', 'Novi Sad', null, false)).toBe(90)
    expect(rideKm('Beograd', 'Novi Sad', null, true)).toBe(182)
    expect(rideKm('Beograd', 'Niš', 240, true)).toBe(480)
    expect(rideKm('Beograd', 'Niš', null, true)).toBeNull()
  })
})
