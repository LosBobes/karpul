import { describe, expect, it } from 'vitest'
import { blockedNow, byDepartment, dueText, litresCost, shiftMonth, summaryCsv } from './fleet'
import { MESSAGES, messages } from './i18n'
import type { MonthSummary, PersonMonth } from './types'
import { forReader, WHATS_NEW } from './whatsNew'

const person = (name: string, department: string, extra: Partial<PersonMonth> = {}): PersonMonth => ({
  user_id: null,
  name,
  department,
  shared_rides: 0,
  shared_km: 0,
  own_rides: 0,
  own_km: 0,
  passenger_rides: 0,
  passenger_km: 0,
  allowance: 0,
  over_cap: false,
  ...extra,
})

describe('dueText', () => {
  it('says how far off or how late each item is', () => {
    expect(dueText({ kind: 'registration', level: 'soon', on: '2026-11-17', days_left: 12, km_left: null })).toBe('Registration: in 12 days')
    expect(dueText({ kind: 'insurance', level: 'overdue', on: '2026-11-03', days_left: -2, km_left: null })).toBe('Insurance: 2 days overdue')
    expect(dueText({ kind: 'service', level: 'soon', on: null, days_left: null, km_left: 800 })).toBe('Service: in 800 km')
    expect(dueText({ kind: 'tyres', level: 'overdue', on: null, days_left: null, km_left: null })).toBe('Summer tyres in the winter season')
  })
})

describe('the fleet helpers', () => {
  it('knows a block that runs today, open-ended or not', () => {
    expect(blockedNow({ start_date: '2026-11-01', end_date: null }, '2026-11-05')).toBe(true)
    expect(blockedNow({ start_date: '2026-11-06', end_date: '2026-11-08' }, '2026-11-05')).toBe(false)
    expect(blockedNow({ start_date: '2026-11-01', end_date: '2026-11-04' }, '2026-11-05')).toBe(false)
  })
  it('prices litres at the official price, or says nothing', () => {
    expect(litresCost(40, 236)).toBe(9440)
    expect(litresCost(0, 236)).toBeNull()
    expect(litresCost(40, null)).toBeNull()
  })
  it('steps months across the year', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
  it('groups people by department in the order they come', () => {
    const groups = byDepartment([person('A', 'Sales'), person('B', 'Sales'), person('C', '')])
    expect(groups.map((g) => [g.department, g.people.length])).toEqual([['Sales', 2], ['', 1]])
  })
  it('writes the month as a semicolon spreadsheet with a decimal comma', () => {
    const summary: MonthSummary = {
      month: '2026-11', from: '2026-11-01', to: '2026-11-30', fuel: 'petrol', fuel_price: 207, allowance_share: 0.3, allowance_cap: 10121,
      people: [person('=Ana', 'Sales', { own_rides: 1, own_km: 182.5, allowance: 11333 })],
    }
    const [head, row] = summaryCsv(summary).replace('﻿', '').split('\r\n')
    expect(head.split(';')[0]).toBe(messages().summary.col.name)
    expect(row).toBe("'=Ana;Sales;0;0;1;182,5;0;0;11333")
  })
})

describe("What's new for whom", () => {
  it("shows each side its own entries and never the other side's", () => {
    const admin = forReader(WHATS_NEW, true).map((e) => e.id)
    const others = forReader(WHATS_NEW, false).map((e) => e.id)
    expect(admin).toContain('fleetUpkeep')
    expect(admin).not.toContain('outOfService')
    expect(others).not.toContain('fleetUpkeep')
    expect(others).toContain('outOfService')
    // An entry for everyone reaches both.
    expect(admin).toContain('consent')
    expect(others).toContain('consent')
    expect(MESSAGES.sr.whatsNew.entries.monthSummary.title).not.toBe('')
  })
})
