import { addDays, parseISODate, startOfWeek, toISODate } from './dates'

/** How dark a heatmap cell is: 0 is nothing, 4 the most. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

/** A day's hours out as a level: up to 2 h, 4 h, 8 h, past that. */
export function dayLevel(hours: number): HeatLevel {
  if (hours <= 0) return 0
  if (hours <= 2) return 1
  if (hours <= 4) return 2
  if (hours <= 8) return 3
  return 4
}

/** A share (0..1) as a level in quarters. */
export function shareLevel(share: number): HeatLevel {
  if (share <= 0) return 0
  if (share <= 0.25) return 1
  if (share <= 0.5) return 2
  if (share <= 0.75) return 3
  return 4
}

export interface DayCell {
  iso: string
  /** Outside the window: drawn as a gap, so the weeks stay in line. */
  out: boolean
  hours: number
}

/**
 * The calendar heatmap: one column per Mon–Sun week from the week of `from` to
 * the week of `to`, the days of each column Monday first.
 */
export function dayColumns(from: string, to: string, perDay: Record<string, number>): DayCell[][] {
  const weeks: DayCell[][] = []
  let monday = startOfWeek(parseISODate(from))
  const last = parseISODate(to)
  while (monday <= last) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const iso = toISODate(addDays(monday, i))
        return { iso, out: iso < from || iso > to, hours: perDay[iso] ?? 0 }
      }),
    )
    monday = addDays(monday, 7)
  }
  return weeks
}

/** How many of each weekday (Monday first) the window holds: what an hour cell is a share of. */
export function weekdayCounts(from: string, to: string): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (let d = parseISODate(from), end = parseISODate(to); d <= end; d = addDays(d, 1)) counts[(d.getDay() + 6) % 7] += 1
  return counts
}

/** Where the month labels go over the calendar: the first column, then each
 *  column holding a 1st, unless it is too close to the label before to fit. */
export function monthStarts(weeks: DayCell[][]): { index: number; iso: string }[] {
  const out: { index: number; iso: string }[] = []
  weeks.forEach((week, index) => {
    const inside = week.filter((c) => !c.out)
    const first = inside.find((c) => c.iso.endsWith('-01'))
    if (index === 0 && inside.length) out.push({ index, iso: first?.iso ?? inside[0].iso })
    else if (first) {
      if (out.length && index - out[out.length - 1].index < 3) out.pop()
      out.push({ index, iso: first.iso })
    }
  })
  return out
}
