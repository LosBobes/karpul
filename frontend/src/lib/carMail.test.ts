import { describe, expect, it } from 'vitest'
import { aRide } from '../test/render'
import { adminCopies, carMail, carMailHref, companyEmail, OFFICE_EMAIL, sharedCarRides } from './carMail'
import type { Person } from './people'

const admin = (id: number, display_name: string): Person => ({ id, display_name, is_admin: true })

describe('carMail', () => {
  it('makes a company address from a name, lower case and without accents', () => {
    expect(companyEmail('Marko Jovanović')).toBe('marko.jovanovic@se.com')
    expect(companyEmail('Đorđe  Šćekić')).toBe('djordje.scekic@se.com')
    expect(companyEmail('Ana Marija Žarić')).toBe('ana.marija.zaric@se.com')
  })

  it('knows the office has an address of its own, whatever the word order', () => {
    expect(companyEmail('Vesna Ardeljan')).toBe('vesna.ardeljan@non.se.com')
    expect(companyEmail('Ardeljan Vesna')).toBe('vesna.ardeljan@non.se.com')
    expect(OFFICE_EMAIL).toBe('vesna.ardeljan@non.se.com')
  })

  it('copies every admin once by the company pattern, never the office or a non-admin', () => {
    const people: Person[] = [
      admin(1, 'Ada Čolić'),
      admin(2, 'Boris Boss'),
      admin(3, 'Vesna Ardeljan'),
      { id: 4, display_name: 'Nina Nobody', is_admin: false },
      admin(5, 'Ada Colic'),
    ]
    expect(adminCopies(people)).toEqual(['ada.colic@se.com', 'boris.boss@se.com'])
  })

  it('only mails about shared cars', () => {
    expect(sharedCarRides([aRide({ car_type: 'own' })])).toEqual([])
    expect(sharedCarRides([aRide({ car_type: 'corporate' })])).toHaveLength(1)
  })

  it('says who has which car from when to when, in Serbian, and that the app wrote it', () => {
    const ride = aRide({ ride_date: '2026-11-11', car_type: 'corporate', car_name: 'Mazda 3 (BG-123-AB)', driver_name: 'Ana Petrović', departure_time: '08:00:00', return_time: '17:30:00' })
    const m = carMail([ride], [admin(1, 'Ada Admin')])
    expect(m.to).toBe(OFFICE_EMAIL)
    expect(m.cc).toEqual(['ada.admin@se.com'])
    expect(m.subject).toBe('Službeni automobil Mazda 3 (BG-123-AB), 11.11.2026. (Ana Petrović)')
    expect(m.body).toContain('službeni automobil Mazda 3 (BG-123-AB) je zauzet')
    expect(m.body).toMatch(/od 08:00 do 17:30/)
    expect(m.body).toMatch(/Vozač: +Ana Petrović/)
    expect(m.body).toContain('automatski napravila aplikacija Karpul')

    const q = new URLSearchParams(carMailHref(m).split('?')[1])
    expect(carMailHref(m).startsWith(`mailto:${OFFICE_EMAIL}?`)).toBe(true)
    expect(q.get('cc')).toBe('ada.admin@se.com')
    expect(q.get('body')).toBe(m.body)
  })

  it('says until the end of the day when there is no return time', () => {
    const m = carMail([aRide({ car_type: 'corporate', return_time: null })], [])
    expect(m.body).toContain('do kraja dana')
    expect(carMailHref(m)).not.toContain('cc=')
  })
})
