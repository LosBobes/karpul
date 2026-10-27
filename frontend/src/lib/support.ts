/**
 * Who to ask when something does not work, and the feedback mail. Three
 * people, by kind of trouble: the arrangement itself (who may take a car,
 * the rules), the app, and the car. Edit the list here; `SupportSheet`
 * renders whatever it holds, in this order.
 */
export type SupportTopic = 'org' | 'app' | 'car'

export interface SupportContact {
  topic: SupportTopic
  email: string
  /** As people write it; `telHref` makes the link. */
  phone?: string
}

export const SUPPORT: SupportContact[] = [
  { topic: 'car', email: 'vladimir.boskovic@se.com', phone: '+381 628867861' },
  { topic: 'app', email: 'vladimir.batocanin@se.com', phone: '+381606679411' },
  { topic: 'org', email: 'vesna.ardeljan@non.se.com' },
]

/** Bugs and ideas go to whoever looks after the app. */
export const FEEDBACK_EMAIL = SUPPORT.find((c) => c.topic === 'app')!.email

/** `tel:` takes the digits and a leading +, not the spaces and dashes people type. */
export function telHref(phone: string): string {
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}`
}

export function mailHref(email: string, subject?: string, body?: string): string {
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean)
  return `mailto:${email}${q.length ? `?${q.join('&')}` : ''}`
}

export type FeedbackKind = 'bug' | 'idea'

/**
 * The mail a bug report or an idea becomes: the first line of the text as the
 * subject, the text, then what the app knows that the reader would otherwise
 * have to ask for (who, where in the app, which browser and screen).
 */
export function feedbackMail(kind: FeedbackKind, text: string, context: { user: string; view: string }): string {
  const first = text.trim().split('\n')[0].slice(0, 60)
  const subject = `Karpul ${kind === 'bug' ? 'bug' : 'idea'}: ${first}`
  const body = [
    text.trim(),
    '',
    '--',
    `Account: ${context.user}`,
    `View: ${context.view}`,
    `Page: ${typeof location !== 'undefined' ? location.href : ''}`,
    `Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
    `Screen: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : ''}`,
    `Time: ${new Date().toString()}`,
  ].join('\n')
  return mailHref(FEEDBACK_EMAIL, subject, body)
}
