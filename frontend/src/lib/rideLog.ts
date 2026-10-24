import type { Messages } from './i18n'
import type { Ride } from './types'

/**
 * The admin's table of every ride (components/RideLog.tsx), without React:
 * the filters, the column sort, the totals line and the spreadsheet.
 */

export type LogKind = 'all' | 'corporate' | 'own'
export type SortKey = 'date' | 'driver' | 'car' | 'from' | 'to' | 'taken' | 'km'
export interface LogSort {
  key: SortKey
  dir: 1 | -1
}

/** Lower case without accents, so "dordevic" and "djordjevic" both find "Đorđević". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/dj/g, 'd')
}

export function filterLog(rides: Ride[], kind: LogKind, query: string): Ride[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return rides.filter((r) => {
    if (kind !== 'all' && r.car_type !== kind) return false
    if (!words.length) return true
    const text = fold(
      [r.driver_name, r.car_name, r.origin, r.destination, ...r.stops, ...r.bookings.map((b) => b.passenger_name), r.notes].join(' '),
    )
    // Every word somewhere in the row: "ana octavia" is Ana's rides in the Octavia.
    return words.every((w) => text.includes(w))
  })
}

const chronological = (a: Ride, b: Ride) =>
  a.ride_date.localeCompare(b.ride_date) || a.departure_time.localeCompare(b.departure_time) || a.id - b.id

function compare(key: SortKey, a: Ride, b: Ride): number {
  switch (key) {
    case 'date':
      return chronological(a, b)
    case 'driver':
      return a.driver_name.localeCompare(b.driver_name)
    case 'car':
      return a.car_name.localeCompare(b.car_name)
    case 'from':
      return a.origin.localeCompare(b.origin)
    case 'to':
      return a.destination.localeCompare(b.destination)
    case 'taken':
      return a.bookings.length - b.bookings.length
    case 'km':
      return (a.distance_km ?? -1) - (b.distance_km ?? -1)
  }
}

/** By the column, then by when, so equal cells keep the board's order. */
export function sortLog(rides: Ride[], sort: LogSort): Ride[] {
  return [...rides].sort((a, b) => sort.dir * compare(sort.key, a, b) || chronological(a, b))
}

export function logTotals(rides: Ride[]): { rides: number; pax: number; km: number } {
  return {
    rides: rides.length,
    pax: rides.reduce((n, r) => n + r.bookings.length, 0),
    km: Math.round(rides.reduce((n, r) => n + (r.distance_km ?? 0), 0)),
  }
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

/**
 * The rows as a spreadsheet opens them in an office in Germany or Serbia:
 * semicolons between cells and a decimal comma (Excel there reads a comma
 * file as one column), a UTF-8 byte order mark so č and ć survive, ISO dates
 * and 24-hour times a spreadsheet recognises. A cell that starts like a
 * formula gets a leading apostrophe, so a note can never run as one.
 */
export function logCsv(rides: Ride[], t: Messages): string {
  const c = t.rideLog.col
  const header = [c.date, c.departs, c.back, c.driver, c.phone, c.car, c.type, c.from, c.stops, c.to, c.seats, c.taken, c.passengers, c.waiting, c.km, c.chipIn, c.note]
  const rows = rides.map((r) => [
    r.ride_date,
    hhmm(r.departure_time),
    hhmm(r.return_time),
    r.driver_name,
    r.driver_phone ?? '',
    r.car_name,
    r.car_type === 'corporate' ? t.rideLog.company : t.rideLog.own,
    r.origin,
    r.stops.join(', '),
    r.destination,
    String(r.seats),
    String(r.bookings.length),
    r.bookings.map((b) => b.passenger_name).join(', '),
    r.waitlist.map((w) => w.name).join(', '),
    r.distance_km == null ? '' : String(r.distance_km).replace('.', ','),
    r.chip_in,
    r.notes,
  ])
  return '﻿' + [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n'
}

function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
