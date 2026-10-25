import type { CorporateCar, Ride } from './types'

/** Minutes since midnight from "HH:MM[:SS]". */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** "HH:MM" from minutes since midnight (24:00 and later is written as 23:59). */
export function fromMinutes(min: number): string {
  const m = Math.max(0, Math.min(min, 23 * 60 + 59))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const DAY_END = 24 * 60

export interface Axis {
  /** Minutes since midnight at the left edge and the right edge, on the hour. */
  from: number
  to: number
}

/**
 * The hours the timeline spans: the whole day, midnight to midnight, so a car
 * can be booked for any time. The board scrolls sideways to the part of the
 * day that matters (DayPlan) rather than squeezing the hours to fit.
 */
export const DAY_AXIS: Axis = { from: 0, to: DAY_END }

/** Where a ride sits on a row: from departure to return, or to the end of the day. */
export interface Bar {
  ride: Ride
  start: number
  end: number
  /** No return time: the car is out for the rest of the day. */
  open: boolean
}

export function barOf(ride: Ride): Bar {
  const start = toMinutes(ride.departure_time)
  return ride.return_time
    ? { ride, start, end: toMinutes(ride.return_time), open: false }
    : { ride, start, end: DAY_END, open: true }
}

/** A stretch of the axis with nobody in the car. */
export interface Gap {
  start: number
  end: number
}

export interface PlanRow {
  key: string
  /** The car's name as the board writes it ("Mazda 6e (FIRM-001)", or an own car as typed). */
  label: string
  /** Set for a pool car: its free stretches can be booked from the timeline. */
  car: CorporateCar | null
  bars: Bar[]
  /** Pool cars only: the free stretches inside the axis, at least `MIN_GAP` long. */
  gaps: Gap[]
}

/** A free stretch shorter than this is not offered for booking. */
export const MIN_GAP = 30

/** The free stretches of `axis` between `bars` (sorted by start), none before `notBefore`.
 * A ride waiting for an admin's approval holds no slot (backend: ensure_car_available), so
 * it does not cut a stretch: the car can still be booked over it. */
export function freeGaps(bars: Bar[], axis: Axis, notBefore = 0): Gap[] {
  const gaps: Gap[] = []
  let at = Math.max(axis.from, notBefore)
  for (const b of bars) {
    if (b.ride.approval === 'pending') continue
    if (Math.min(b.start, axis.to) - at >= MIN_GAP) gaps.push({ start: at, end: Math.min(b.start, axis.to) })
    at = Math.max(at, b.end)
  }
  if (axis.to - at >= MIN_GAP) gaps.push({ start: at, end: axis.to })
  return gaps
}

/**
 * One row per company car, every active one even when nobody has it (a free
 * car is what someone scheduling is looking for), plus a retired one a ride
 * still uses; then one row per own car going that day, by name and driver.
 * Today, the time already gone (`notBefore`) is not offered for booking.
 */
export function planRows(rides: Ride[], cars: CorporateCar[], axis: Axis, notBefore = 0): { pool: PlanRow[]; own: PlanRow[] } {
  const byStart = (a: Bar, b: Bar) => a.start - b.start || a.ride.id - b.ride.id
  const pool = new Map<number, PlanRow>()
  for (const c of cars) {
    if (c.active) pool.set(c.id, { key: `car-${c.id}`, label: `${c.name} (${c.plate})`, car: c, bars: [], gaps: [] })
  }
  const own = new Map<string, PlanRow>()
  for (const r of rides) {
    if (r.car_type === 'corporate' && r.corporate_car_id !== null) {
      let row = pool.get(r.corporate_car_id)
      if (!row) {
        const known = cars.find((c) => c.id === r.corporate_car_id) ?? null
        row = { key: `car-${r.corporate_car_id}`, label: r.car_name, car: known?.active ? known : null, bars: [], gaps: [] }
        pool.set(r.corporate_car_id, row)
      }
      row.bars.push(barOf(r))
    } else {
      const key = `own-${r.driver_id ?? r.driver_name}-${r.car_name.trim().toLowerCase()}`
      let row = own.get(key)
      if (!row) own.set(key, (row = { key, label: r.car_name, car: null, bars: [], gaps: [] }))
      row.bars.push(barOf(r))
    }
  }
  for (const row of [...pool.values(), ...own.values()]) {
    row.bars.sort(byStart)
    if (row.car) row.gaps = freeGaps(row.bars, axis, notBefore)
  }
  return { pool: [...pool.values()], own: [...own.values()] }
}

/**
 * The times a tap on a free stretch offers: departure at the tapped point
 * rounded to the half hour (the stretch's start for a keyboard press), and the
 * car back by the next booking, or by 17:00 (an hour out at least) when the
 * rest of the day is free.
 */
export function slotTimes(gap: Gap, at: number | null, axis: Axis): { departure: number; ret: number } {
  const latest = Math.max(gap.start, gap.end - MIN_GAP)
  const departure = at === null ? gap.start : Math.min(Math.max(Math.round(at / 30) * 30, gap.start), latest)
  const ret = gap.end < axis.to ? gap.end : Math.min(Math.max(17 * 60, departure + 60), 23 * 60 + 30)
  return { departure, ret: Math.max(ret, departure + MIN_GAP) }
}

/** What a company car's row says about it at a glance, next to its name. */
export type RowStatus =
  | { kind: 'freeAllDay' }
  | { kind: 'booked' }
  | { kind: 'freeFrom'; at: number }
  | { kind: 'freeBetween'; from: number; to: number }

export function rowStatus(row: PlanRow, axis: Axis): RowStatus {
  const gap = row.gaps[0]
  // Today the hours already gone are not free any more, so an empty car is free "from" now.
  if (row.bars.length === 0 && (!row.car || gap?.start === axis.from)) return { kind: 'freeAllDay' }
  if (!gap) return { kind: 'booked' }
  return gap.end >= axis.to ? { kind: 'freeFrom', at: gap.start } : { kind: 'freeBetween', from: gap.start, to: gap.end }
}

/** How much room a bar's caption may take: up to where the next bar on the row starts. */
export function captionRoom(bars: Bar[], i: number, axis: Axis): number {
  const next = bars[i + 1]
  return (next ? next.start : axis.to) - bars[i].start
}
