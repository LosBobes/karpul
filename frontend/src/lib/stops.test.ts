import { describe, expect, it } from 'vitest'
import { allStops, defaultSlot, stopSlots } from './stops'

const ride = (stops_before: string[], stops: string[]) => ({ origin: 'Novi Sad', destination: 'HQ', stops_before, stops })

describe('stopSlots', () => {
  it('offers every gap of the route up to the destination', () => {
    const slots = stopSlots(ride(['Futog'], ['Liman']))
    expect(slots.map((s) => [s.after, s.next, s.before, s.index])).toEqual([
      [null, 'Futog', true, 0],
      ['Futog', 'Novi Sad', true, 1],
      ['Novi Sad', 'Liman', false, 0],
      ['Liman', 'HQ', false, 1],
    ])
    expect(defaultSlot(slots)).toBe(2)
  })

  it('has a gap before the start and one on the way on a bare route', () => {
    const slots = stopSlots(ride([], []))
    expect(slots.map((s) => [s.before, s.index, s.next])).toEqual([
      [true, 0, 'Novi Sad'],
      [false, 0, 'HQ'],
    ])
    expect(defaultSlot(slots)).toBe(1)
  })

  it('lists the stops in the order the car reaches them', () => {
    expect(allStops(ride(['Futog', 'Veternik'], ['Liman']))).toEqual(['Futog', 'Veternik', 'Liman'])
  })
})
