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

export function fmtTime(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

export function fmtLongDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}
