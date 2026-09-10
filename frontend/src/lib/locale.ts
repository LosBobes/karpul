import { useSyncExternalStore } from 'react'

/**
 * Which language the app speaks. English is the default; Serbian is written in
 * the Latin script, which is what people in Serbia type and read on a phone.
 * The choice is remembered per browser (`karpul.locale`); a first visit takes
 * the browser's own language when it is Serbian (or a language close enough
 * that the Serbian text reads naturally), else English.
 *
 * This is a plain external store rather than a context so that `lib/dates.ts`,
 * which is not a component, can read the current locale when it formats a
 * date. Every component that shows text calls `useT()` (lib/i18n.ts), which
 * subscribes here, so a switch re-renders the whole screen.
 */
export type Locale = 'en' | 'sr'

export const LOCALES: Locale[] = ['en', 'sr']

const KEY = 'karpul.locale'

/** What `Intl` should be handed for each locale; `undefined` = the browser's own. */
const INTL_TAG: Record<Locale, string | undefined> = { en: undefined, sr: 'sr-Latn-RS' }

function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'sr'
}

function detect(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (isLocale(saved)) return saved
  } catch {
    /* private mode etc. */
  }
  const langs = typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages ?? [])] : []
  for (const l of langs) {
    const base = (l ?? '').toLowerCase().split('-')[0]
    if (base === 'sr' || base === 'hr' || base === 'bs' || base === 'me') return 'sr'
    if (base === 'en') return 'en'
  }
  return 'en'
}

let current: Locale = detect()
const listeners = new Set<() => void>()

function applyToDocument(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale === 'sr' ? 'sr-Latn' : 'en'
}
applyToDocument(current)

export function getLocale(): Locale {
  return current
}

/** The BCP 47 tag for `Intl.DateTimeFormat` and friends under the current locale. */
export function intlTag(): string | undefined {
  return INTL_TAG[current]
}

export function setLocale(next: Locale) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* keep in memory only */
  }
  applyToDocument(next)
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** The current locale, re-rendering the caller when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale)
}
