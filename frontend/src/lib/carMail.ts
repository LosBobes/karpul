import { fmtTime, parseISODate } from './dates'
import type { Person } from './people'
import { SUPPORT } from './support'
import type { Ride } from './types'

/**
 * The mail that goes with taking a shared car: to the office (the `org`
 * contact in lib/support.ts, always the recipient) with every admin in copy,
 * saying who has which car from when until when. The app writes it and the
 * driver's own mail app sends it (`CarMailSheet`), so it comes from them.
 * The mail is always in Serbian, whatever language the app is in: the office
 * reads it, not the driver.
 */

const SR = 'sr-Latn-RS'

/** "utorak, 11. novembar 2026." */
function srLongDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(SR, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** "11.11.2026." */
function srDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
}

export const OFFICE_EMAIL = SUPPORT.find((c) => c.topic === 'org')!.email
/** Who reads `OFFICE_EMAIL`: when she is an admin too, she is not copied as well. */
export const OFFICE_NAME = 'Vesna Ardeljan'
export const COMPANY_DOMAIN = 'se.com'

/**
 * A colleague's company address from their name: "Đorđe Jović" →
 * "djordje.jovic@se.com", lower case, no accents, the words joined by dots.
 */
export function companyEmail(name: string): string {
  const local = name
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s'-]/g, '')
    .replace(/'/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('.')
  return `${local}@${COMPANY_DOMAIN}`
}

/** An admin's address: their own when the account has one, else the company pattern. */
export function adminEmail(p: Person): string {
  return p.email?.trim() || companyEmail(p.display_name)
}

/** The copy line: every admin but the office itself, each address once. */
export function adminCopies(people: Person[]): string[] {
  const seen = new Set([OFFICE_EMAIL.toLowerCase()])
  const out: string[] = []
  for (const p of people) {
    if (!p.is_admin || companyEmail(p.display_name) === companyEmail(OFFICE_NAME)) continue
    const e = adminEmail(p)
    if (seen.has(e.toLowerCase())) continue
    seen.add(e.toLowerCase())
    out.push(e)
  }
  return out
}

export interface CarMail {
  to: string
  cc: string[]
  subject: string
  body: string
}

/** The shared-car rides among `rides`, in order: the ones the office hears about. */
export function sharedCarRides(rides: Ride[]): Ride[] {
  return rides
    .filter((r) => r.car_type === 'corporate')
    .sort((a, b) => a.ride_date.localeCompare(b.ride_date) || a.departure_time.localeCompare(b.departure_time))
}

/**
 * The mail for one or more rides just added (a ride and its way back, or the
 * first of a weekly series, with `repeatUntil`). Plain text, since a mailto:
 * link carries nothing else: a block per ride with the labels lined up.
 */
export function carMail(rides: Ride[], admins: Person[], repeatUntil?: string | null): CarMail {
  const first = rides[0]
  const block = (r: Ride) => {
    const day = srLongDate(r.ride_date)
    const rows: [string, string][] = [
      ['Automobil', r.car_name],
      ['Vozač', r.driver_name],
      ['Od', `${day}, ${fmtTime(r.departure_time)}`],
      ['Do', `${day}, ${r.return_time ? fmtTime(r.return_time) : 'kraj dana'}`],
      ['Ruta', `${r.origin} → ${r.destination}`],
    ]
    if (repeatUntil) rows.push(['Ponavlja se', `svake nedelje do ${srLongDate(repeatUntil)}`])
    if (r.approval === 'pending') rows.push(['Status', 'čeka odobrenje administratora'])
    const width = Math.max(...rows.map(([k]) => k.length)) + 2
    return rows.map(([k, v]) => `${`${k}:`.padEnd(width)}${v}`).join('\n')
  }
  const until = first.return_time ? `do ${fmtTime(first.return_time)}` : 'do kraja dana'
  const body = [
    'Poštovani,',
    '',
    `službeni automobil ${first.car_name} je zauzet: ${srLongDate(first.ride_date)}, od ${fmtTime(first.departure_time)} ${until}. Vozi ${first.driver_name}.`,
    '',
    rides.map(block).join('\n\n'),
    '',
    '--',
    'Ovaj mejl je automatski napravila aplikacija Karpul (www.karpul.dev).',
  ].join('\n')
  return {
    to: OFFICE_EMAIL,
    cc: adminCopies(admins),
    subject: `Službeni automobil ${first.car_name}, ${srDate(first.ride_date)} (${first.driver_name})`,
    body,
  }
}

/** The mailto: link: the office in To, the admins in Cc. */
export function carMailHref(m: CarMail): string {
  const q = [
    m.cc.length ? `cc=${m.cc.map(encodeURIComponent).join(',')}` : '',
    `subject=${encodeURIComponent(m.subject)}`,
    `body=${encodeURIComponent(m.body)}`,
  ].filter(Boolean)
  return `mailto:${m.to}?${q.join('&')}`
}
