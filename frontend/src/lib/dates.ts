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

/** "HH:MM[:SS]" from the API, shown the way the browser locale writes clock times. */
export function fmtTime(t: string | null): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function fmtLongDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** "Sat" */
export function fmtWeekday(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

/** "May 17" */
export function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "Sat, May 17" */
export function fmtShortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
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
