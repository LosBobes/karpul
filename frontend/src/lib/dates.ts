import { messages } from './i18n'
import { intlTag } from './locale'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local-date ISO string (YYYY-MM-DD), never shifted by the timezone. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (out.getDay() + 6) % 7 // Mon=0 … Sun=6
  return addDays(out, -day)
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return norm(a) !== '' && norm(a) === norm(b)
}

/** "HH:MM[:SS]" from the API, shown the way the app's locale writes clock times. */
export function fmtTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(intlTag(), { hour: 'numeric', minute: '2-digit' })
}

export function fmtLongDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(intlTag(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** "Sat" */
export function fmtWeekday(d: Date): string {
  return d.toLocaleDateString(intlTag(), { weekday: 'short' })
}

/** "May 17" */
export function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString(intlTag(), { month: 'short', day: 'numeric' })
}

/**
 * The Mon to Sun week starting at `monday`, the way the locale writes a range:
 * "7–13 Sept 2026" / "Sep 7 – 13, 2026", or "31 Aug – 6 Sept 2026" when it
 * straddles a month.
 */
export function fmtWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6)
  const fmt = new Intl.DateTimeFormat(intlTag(), { day: 'numeric', month: 'short', year: 'numeric' })
  if (typeof fmt.formatRange === 'function') return fmt.formatRange(monday, sunday)
  return `${fmtMonthDay(monday)} – ${fmt.format(sunday)}`
}

/**
 * A day as a list heading: "Today", "Tomorrow", else the weekday and date
 * ("Friday, Sep 12"). The date is always given as well, in `fmtDayDate`, so
 * "Today" still says which day that is.
 */
export function fmtDayLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return messages().common.today
  if (iso === toISODate(addDays(parseISODate(today), 1))) return messages().common.tomorrow
  return parseISODate(iso).toLocaleDateString(intlTag(), { weekday: 'long' })
}

/** "Sep 12" for a heading next to `fmtDayLabel`, with the year once it is not this year. */
export function fmtDayDate(iso: string): string {
  const d = parseISODate(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(intlTag(), { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })
}

/** "Sat, May 17" */
export function fmtShortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(intlTag(), { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Ana Petrović" → "AP"; a single word gives its first letter. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase()
}

/** First name only, for tight labels ("John Smith" → "John"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/**
 * The car's own name without the plate the server appends to corporate rides
 * ("Octavia (FIRM-001)" → "Octavia"). Own cars are shown as typed.
 */
export function shortCarName(carName: string): string {
  return carName.replace(/\s*\([^)]*\)\s*$/, '') || carName
}
