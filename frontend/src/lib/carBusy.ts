import { useEffect, useState } from 'react'
import { api } from './api'
import { addDays, parseISODate, startOfWeek, toISODate } from './dates'
import type { CarBusy } from './types'

/** The six weeks a month calendar shows (components/DatePicker.tsx), as ISO days. */
export function monthGrid(iso: string): { from: string; to: string } {
  const d = parseISODate(iso)
  const first = startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1))
  return { from: toISODate(first), to: toISODate(addDays(first, 41)) }
}

/**
 * Whether `[dep, ret)` clashes with a ride holding the car, the way the server
 * counts it (backend: services._overlaps): half-open, so a car back at 12:00 may
 * leave again at 12:00, and no return holds the car to the end of the day.
 */
export function clashOn(busy: CarBusy[], day: string, dep: string, ret: string | null): CarBusy | null {
  const end = ret ?? '24:00'
  for (const b of busy) {
    if (b.ride_date !== day) continue
    const bStart = b.departure_time.slice(0, 5)
    const bEnd = b.return_time?.slice(0, 5) ?? '24:00'
    if (dep < bEnd && bStart < end) return b
  }
  return null
}

/** The server's own words for a clash (services.ensure_car_available), so `apiError` has them in Serbian too. */
export function clashText(b: CarBusy): string {
  return (
    `That corporate car is already booked by ${b.driver_name} from ${b.departure_time.slice(0, 5)}` +
    (b.return_time ? ` to ${b.return_time.slice(0, 5)}` : '') +
    ' that day'
  )
}

/**
 * When a shared car is taken, month by month as the calendar asks for them
 * (`months`: any day of each month wanted). `null` for no car: nothing is fetched.
 */
export function useCarBusy(carId: number | null, exclude: number | null, months: string[]): CarBusy[] {
  const [got, setGot] = useState<Record<string, CarBusy[]>>({})
  const grids = [...new Set(months.map((m) => monthGrid(m).from))].sort()
  const key = `${carId}:${exclude}`
  const wanted = grids.filter((g) => got[`${key}:${g}`] === undefined).join(',')

  useEffect(() => {
    if (carId === null || wanted === '') return
    const ctl = new AbortController()
    for (const from of wanted.split(',')) {
      const to = toISODate(addDays(parseISODate(from), 41))
      api
        .carBusy(carId, from, to, exclude, ctl.signal)
        .then((rows) => setGot((g) => ({ ...g, [`${key}:${from}`]: rows })))
        .catch(() => {
          /* no marks: the server still refuses a clash */
        })
    }
    return () => ctl.abort()
  }, [carId, exclude, key, wanted])

  if (carId === null) return []
  const seen = new Set<number>()
  return grids.flatMap((g) => got[`${key}:${g}`] ?? []).filter((b) => (seen.has(b.ride_id) ? false : (seen.add(b.ride_id), true)))
}
