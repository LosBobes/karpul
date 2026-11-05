/**
 * The fleet's arithmetic and words for the screen (backend: app/fleet.py):
 * dinars, a car's due items, an out-of-service stretch, the month summary as
 * a spreadsheet. Tested in fleet.test.ts.
 */
import { fmtDayDate, todayISO } from './dates'
import { intlTag } from './locale'
import { messages } from './i18n'
import type { CarBlock, CarCost, Due, MonthSummary, PersonMonth } from './types'

/** "12.345 din" in the app's language. */
export function fmtRsd(amount: number): string {
  return `${Math.round(amount).toLocaleString(intlTag())} din`
}

/** A price a litre: "207,00". */
export function fmtPrice(amount: number): string {
  return amount.toLocaleString(intlTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** What a due item says on its chip: "Registration in 12 days", "Service in 800 km". */
export function dueText(d: Due): string {
  const t = messages().fleet
  const what = t.dueKind[d.kind]
  if (d.kind === 'tyres') return d.level === 'overdue' ? t.tyresNow : t.tyresSoon(d.days_left ?? 0)
  const parts: string[] = []
  if (d.days_left !== null) parts.push(d.days_left < 0 ? t.overdueDays(-d.days_left) : d.days_left === 0 ? t.today : t.inDays(d.days_left))
  if (d.km_left !== null) parts.push(d.km_left < 0 ? t.overdueKm(-d.km_left) : t.inKm(d.km_left))
  return parts.length ? `${what}: ${parts.join(', ')}` : what
}

/** "6 Nov – 8 Nov", or "from 6 Nov" until further notice; one day is that day. */
export function blockSpan(b: Pick<CarBlock, 'start_date' | 'end_date'>): string {
  const t = messages().fleet
  if (b.end_date === null) return t.fromOn(fmtDayDate(b.start_date))
  if (b.end_date === b.start_date) return fmtDayDate(b.start_date)
  return `${fmtDayDate(b.start_date)} – ${fmtDayDate(b.end_date)}`
}

/** Whether the block keeps the car off the road today. */
export function blockedNow(b: Pick<CarBlock, 'start_date' | 'end_date'>, today = todayISO()): boolean {
  return b.start_date <= today && (b.end_date === null || today <= b.end_date)
}

/** What litres cost at a price, as the cost form suggests it. */
export function litresCost(litres: number, price: number | null): number | null {
  if (price === null || !Number.isFinite(litres) || litres <= 0) return null
  return Math.round(litres * price)
}

/** A cost's total by kind, for the costs list's foot. */
export function sumCosts(costs: CarCost[]): number {
  return costs.reduce((sum, c) => sum + c.amount, 0)
}

/** The month before `month` (`YYYY-MM`), and the one after. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function thisMonth(today = todayISO()): string {
  return today.slice(0, 7)
}

/** "November 2026" in the app's language. */
export function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(intlTag(), { month: 'long', year: 'numeric' })
}

/** People grouped by department, departments in the order they come (the server sorts them). */
export function byDepartment(people: PersonMonth[]): { department: string; people: PersonMonth[] }[] {
  const groups: { department: string; people: PersonMonth[] }[] = []
  for (const p of people) {
    const last = groups[groups.length - 1]
    if (last && last.department === p.department) last.people.push(p)
    else groups.push({ department: p.department, people: [p] })
  }
  return groups
}

/** One spreadsheet cell: a decimal comma, and a leading apostrophe on anything that starts like a formula. */
function cell(value: string | number): string {
  let text = typeof value === 'number' ? String(value).replace('.', ',') : value
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The month summary as a semicolon spreadsheet in the app's language (like *All rides*). */
export function summaryCsv(summary: MonthSummary): string {
  const t = messages().summary
  const head = [t.col.name, t.col.department, t.col.sharedRides, t.col.sharedKm, t.col.ownRides, t.col.ownKm, t.col.passengerRides, t.col.passengerKm, t.col.allowance]
  const rows = summary.people.map((p) => [
    p.name,
    p.department,
    p.shared_rides,
    p.shared_km,
    p.own_rides,
    p.own_km,
    p.passenger_rides,
    p.passenger_km,
    p.allowance,
  ])
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
}
