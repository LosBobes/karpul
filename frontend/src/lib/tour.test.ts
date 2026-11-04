import { afterEach, describe, expect, it } from 'vitest'
import { newAccount, setTourDone, TOUR_STEPS, tourDone, tourTarget } from './tour'

afterEach(() => localStorage.clear())

describe('the tour', () => {
  it('is for accounts under two weeks old', () => {
    const now = new Date('2026-11-04T12:00:00Z')
    expect(newAccount('2026-11-04T08:00:00Z', now)).toBe(true)
    expect(newAccount('2026-10-25T08:00:00Z', now)).toBe(true)
    expect(newAccount('2026-10-01T08:00:00Z', now)).toBe(false)
    expect(newAccount('', now)).toBe(false)
  })

  it('is remembered per account in this browser', () => {
    expect(tourDone(5)).toBe(false)
    setTourDone(5, true)
    expect(tourDone(5)).toBe(true)
    expect(tourDone(6)).toBe(false)
    setTourDone(5, false)
    expect(tourDone(5)).toBe(false)
  })

  it('points every step at something on both layouts', () => {
    for (const step of TOUR_STEPS) {
      expect(tourTarget(step, false)).toBeTruthy()
      expect(tourTarget(step, true)).toBeTruthy()
    }
  })
})
