import { describe, expect, it } from 'vitest'
import { addIssue, odoNudge, odoWheels, rangeKm, socAt, socHue, socStep } from './carReport'

describe('socAt', () => {
  it('reads the pointer across the battery as a percentage', () => {
    expect(socAt(100, 100, 200)).toBe(0)
    expect(socAt(200, 100, 200)).toBe(50)
    expect(socAt(300, 100, 200)).toBe(100)
  })
  it('holds the ends when the finger runs past them', () => {
    expect(socAt(20, 100, 200)).toBe(0)
    expect(socAt(900, 100, 200)).toBe(100)
  })
  it('survives a battery with no width yet', () => {
    expect(socAt(50, 0, 0)).toBe(0)
  })
})

describe('socStep', () => {
  it('steps from the middle when nothing is set and stays in range', () => {
    expect(socStep(null, 1)).toBe(51)
    expect(socStep(98, 10)).toBe(100)
    expect(socStep(3, -10)).toBe(0)
  })
})

describe('odoWheels', () => {
  it('pads the reading to six wheels', () => {
    expect(odoWheels(12345)).toEqual([0, 1, 2, 3, 4, 5])
    expect(odoWheels(null)).toEqual([0, 0, 0, 0, 0, 0])
  })
  it('keeps every digit of a longer reading', () => {
    expect(odoWheels(1234567)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe('odoNudge', () => {
  it('nudges from the reading, else from the last known one', () => {
    expect(odoNudge(100, 50, 10)).toBe(110)
    expect(odoNudge(null, 50, 10)).toBe(60)
    expect(odoNudge(null, null, 100)).toBe(100)
    expect(odoNudge(5, null, -10)).toBe(0)
  })
})

describe('rangeKm', () => {
  it('turns a charge into kilometres at the server rate', () => {
    expect(rangeKm(24)).toBe(100)
    expect(rangeKm(0)).toBe(0)
  })
})

describe('addIssue', () => {
  it('adds a problem once', () => {
    expect(addIssue('', 'Warning light')).toBe('Warning light')
    expect(addIssue('Warning light', 'Low tyre')).toBe('Warning light, Low tyre')
    expect(addIssue('Warning light, Low tyre', 'low tyre')).toBe('Warning light, Low tyre')
  })
})

describe('socHue', () => {
  it('runs red to amber to green', () => {
    expect(socHue(0)).toBe(0)
    expect(socHue(50)).toBe(45)
    expect(socHue(100)).toBe(140)
    expect(socHue(150)).toBe(140)
  })
  it('never goes back as the charge rises', () => {
    for (let s = 1; s <= 100; s++) expect(socHue(s)).toBeGreaterThanOrEqual(socHue(s - 1))
  })
})
