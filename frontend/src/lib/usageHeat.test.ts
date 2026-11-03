import { describe, expect, it } from 'vitest'
import { dayColumns, dayLevel, monthStarts, shareLevel, weekdayCounts } from './usageHeat'

describe('levels', () => {
  it('turns hours and shares into five steps', () => {
    expect([0, 1, 3, 6, 10].map(dayLevel)).toEqual([0, 1, 2, 3, 4])
    expect([0, 0.2, 0.5, 0.7, 1].map(shareLevel)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('dayColumns', () => {
  // Wednesday 4 to Tuesday 17 November 2026.
  const weeks = dayColumns('2026-11-04', '2026-11-17', { '2026-11-05': 3.5 })

  it('lays the window out in Mon–Sun weeks, the days outside it marked', () => {
    expect(weeks).toHaveLength(3)
    expect(weeks[0][0]).toEqual({ iso: '2026-11-02', out: true, hours: 0 })
    expect(weeks[0][3]).toEqual({ iso: '2026-11-05', out: false, hours: 3.5 })
    expect(weeks[2][1].out).toBe(false)
    expect(weeks[2][2].out).toBe(true)
  })

  it('labels the first column and each month that starts later', () => {
    const long = dayColumns('2026-10-01', '2026-12-31', {})
    expect(monthStarts(long).map((m) => m.iso)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01'])
    // A 1st in the second column is too close to the first label: it takes its place.
    expect(monthStarts(dayColumns('2026-10-28', '2026-11-20', {})).map((m) => m.iso)).toEqual(['2026-11-01'])
  })
})

describe('weekdayCounts', () => {
  it('counts each weekday in the window, Monday first', () => {
    expect(weekdayCounts('2026-11-02', '2026-11-10')).toEqual([2, 2, 1, 1, 1, 1, 1])
  })
})
