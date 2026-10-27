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

/** `sameName` with the diacritics dropped ("Blažić" is "Blazic"); backend: `fold_name`. */
export function foldName(s: string | null | undefined): string {
  const norm = (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/đ/g, 'dj')
  return norm.normalize('NFKD').replace(/\p{M}/gu, '')
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const here = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = here
    }
  }
  return row[b.length]
}

/**
 * Could these two names be one person typed two ways? Diacritics, case, spacing
 * and word order aside, about one letter in five may differ. Mirrors
 * `similar_names` in backend/app/services.py (SIMILAR_NAME); keep both in step.
 */
export function similarName(a: string | null | undefined, b: string | null | undefined): boolean {
  const fa = foldName(a)
  const fb = foldName(b)
  if (!fa || !fb) return false
  const sorted = (s: string) => s.split(' ').sort().join(' ')
  for (const x of [fa, sorted(fa)]) {
    for (const y of [fb, sorted(fb)]) {
      if (1 - editDistance(x, y) / Math.max(x.length, y.length) >= 0.8) return true
    }
  }
  return false
}

/** "HH:MM[:SS]" from the API as "08:05": the app writes a 24-hour clock in every language. */
export function fmtTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${pad(h)}:${pad(m)}`
}

/** An hour on a timeline axis: "08". */
export function fmtHour(h: number): string {
  return pad(h)
}

/** A moment's clock time, 24-hour like `fmtTime`; `Intl` options for a date can ride along. */
export const CLOCK: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }

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
 * straddles a month. The year is left out for a week of this year.
 */
export function fmtWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6)
  // This year's weeks go without the year: on a phone the label has a line to itself and no more.
  const thisYear = new Date().getFullYear()
  const year = monday.getFullYear() === thisYear && sunday.getFullYear() === thisYear ? undefined : 'numeric'
  const fmt = new Intl.DateTimeFormat(intlTag(), { day: 'numeric', month: 'short', year })
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
