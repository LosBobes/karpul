import { describe, expect, it } from 'vitest'
import { FEEDBACK_EMAIL, feedbackMail, mailHref, SUPPORT, telHref } from './support'

describe('support', () => {
  it('dials the digits and the leading plus only', () => {
    expect(telHref('+381 628867861')).toBe('tel:+381628867861')
    expect(telHref('060 667-9411')).toBe('tel:0606679411')
  })

  it('has every number dialable and every topic once', () => {
    for (const c of SUPPORT) if (c.phone) expect(telHref(c.phone)).toMatch(/^tel:\+\d{9,}$/)
    expect(new Set(SUPPORT.map((c) => c.topic)).size).toBe(SUPPORT.length)
  })

  it('encodes the subject and the body', () => {
    expect(mailHref('a@b.c')).toBe('mailto:a@b.c')
    expect(mailHref('a@b.c', 'Hi & bye')).toBe('mailto:a@b.c?subject=Hi%20%26%20bye')
  })

  it('makes a feedback mail to the app contact, first line as the subject', () => {
    const href = feedbackMail('bug', 'Seat vanished\nAfter I tapped Leave', { user: 'Ana (@ana)', view: 'week' })
    expect(href.startsWith(`mailto:${FEEDBACK_EMAIL}?`)).toBe(true)
    const q = new URLSearchParams(href.split('?')[1])
    expect(q.get('subject')).toBe('Karpul bug: Seat vanished')
    expect(q.get('body')).toContain('After I tapped Leave')
    expect(q.get('body')).toContain('Account: Ana (@ana)')
  })
})
