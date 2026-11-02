import { describe, expect, it } from 'vitest'
import { MESSAGES } from './i18n'
import { unseen, WHATS_NEW, type WhatsNewEntry } from './whatsNew'

const E = (id: WhatsNewEntry['id'], date: string): WhatsNewEntry => ({ id, date })

describe('unseen', () => {
  const list = [E('prefill', '2026-11-02'), E('consent', '2026-10-01')]
  it('leaves out what was seen', () => {
    expect(unseen(list, ['prefill'], '2026-01-01').map((e) => e.id)).toEqual(['consent'])
  })
  it('never hands a newcomer what came before they joined', () => {
    expect(unseen(list, [], '2026-10-15T09:00:00Z').map((e) => e.id)).toEqual(['prefill'])
  })
  it('leaves out what landed the day someone joined: they found it there', () => {
    expect(unseen(list, [], '2026-11-02T08:00:00').map((e) => e.id)).toEqual([])
    expect(unseen(list, [], '2026-11-01T08:00:00').map((e) => e.id)).toEqual(['prefill'])
  })
})

describe('WHATS_NEW', () => {
  it('has unique ids, newest first, and dates as days', () => {
    const ids = WHATS_NEW.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const dates = WHATS_NEW.map((e) => e.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('has words in both languages for every entry', () => {
    for (const e of WHATS_NEW) {
      for (const m of [MESSAGES.en, MESSAGES.sr]) {
        expect(m.whatsNew.entries[e.id].title.trim()).not.toBe('')
        expect(m.whatsNew.entries[e.id].body.trim()).not.toBe('')
      }
    }
  })
})
