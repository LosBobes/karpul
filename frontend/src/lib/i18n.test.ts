import { afterEach, describe, expect, it } from 'vitest'
// Every error text the API can send, collected from the backend's source
// (backend/tests/error_catalogue.py; the backend test keeps it current).
import apiErrors from './api-errors.json'
import { messages } from './i18n'
import { setLocale } from './locale'

afterEach(() => setLocale('en'))

function sr() {
  setLocale('sr')
  return messages()
}

describe('server errors in Serbian', () => {
  it.each(apiErrors)('translates %s', (text) => {
    const translated = sr().apiError(text)
    expect(translated).not.toBe(text)
    // A number or a name in the English text comes through untouched.
    for (const kept of text.match(/\d+|Ana Petrović/g) ?? []) expect(translated).toContain(kept)
  })

  it('translates a validation error with its field, and each of several', () => {
    const t = sr()
    expect(t.apiError('origin: must not be empty')).toBe('Mesto polaska ne sme biti prazno')
    expect(t.apiError('email: must be an email address; password: must be at least 8 characters')).toBe(
      'Mejl: mora biti mejl adresa; Lozinka: mora imati najmanje 8 znakova',
    )
  })

  it('says which week a repeat clashed on', () => {
    const t = sr()
    expect(t.apiError('That corporate car is already booked by Ana from 08:00 to 12:00 that day (2026-09-17)')).toBe(
      'Taj zajednički auto je 2026-09-17 već zauzet: Ana, od 08:00 do 12:00',
    )
  })

  it('says plainly when the server could not be reached', () => {
    expect(sr().apiError('No connection to the server')).toBe('Nema veze sa serverom')
  })

  it('leaves English alone', () => {
    setLocale('en')
    expect(messages().apiError('Ride not found')).toBe('Ride not found')
  })
})

describe('Serbian plurals', () => {
  it('takes the right form for 1, 2 to 4 and the rest', () => {
    const t = sr()
    expect(t.form.repeatCount(1)).toMatch(/^1 vožnja,/)
    expect(t.form.repeatCount(3)).toMatch(/^3 vožnje,/)
    expect(t.form.repeatCount(5)).toMatch(/^5 vožnji,/)
    expect(t.form.repeatCount(12)).toMatch(/^12 vožnji,/)
    expect(t.form.repeatCount(22)).toMatch(/^22 vožnje,/)
  })
})

describe('wording', () => {
  // The project's rule for both languages (CLAUDE.md).
  it('never uses an em dash', () => {
    for (const locale of ['en', 'sr'] as const) {
      setLocale(locale)
      const strings: string[] = []
      const walk = (v: unknown) => {
        if (typeof v === 'string') strings.push(v)
        else if (typeof v === 'function') {
          try {
            const out = (v as (...a: unknown[]) => unknown)('X', 'Y', 'Z', 'W')
            if (typeof out === 'string') strings.push(out)
          } catch {
            /* a function that needs real arguments */
          }
        } else if (v && typeof v === 'object') Object.values(v).forEach(walk)
      }
      walk(messages())
      expect(strings.filter((s) => s.includes('—'))).toEqual([])
    }
  })
})
