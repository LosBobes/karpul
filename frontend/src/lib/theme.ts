import { useSyncExternalStore } from 'react'

/**
 * Light, dark or the system's choice. Like the language (lib/locale.ts) this
 * is an external store, remembered per browser (`karpul.theme`); "system"
 * follows `prefers-color-scheme` live. The choice lands on the root element
 * as `data-theme`, which is what index.css keys its dark tokens on, and on
 * the `theme-color` meta so the browser chrome matches the top bar.
 */
export type Theme = 'light' | 'dark' | 'system'

export const THEMES: Theme[] = ['light', 'dark', 'system']

const KEY = 'karpul.theme'
const LIGHT_BAR = '#f5f6f8'
const DARK_BAR = '#15171b'

function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark' || v === 'system'
}

function load(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (isTheme(saved)) return saved
  } catch {
    /* private mode etc. */
  }
  return 'system'
}

let current: Theme = load()
const listeners = new Set<() => void>()
const media = typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(prefers-color-scheme: dark)') : null

/** What is actually on screen right now. */
export function resolvedTheme(theme: Theme = current): 'light' | 'dark' {
  if (theme === 'system') return media?.matches ? 'dark' : 'light'
  return theme
}

function apply() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (current === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', current)
  const dark = resolvedTheme() === 'dark'
  // What is actually on screen, for the rules in index.css that are not tokens.
  root.setAttribute('data-resolved', dark ? 'dark' : 'light')
  root.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? DARK_BAR : LIGHT_BAR)
}
apply()
media?.addEventListener('change', () => {
  apply()
  listeners.forEach((fn) => fn())
})

export function getTheme(): Theme {
  return current
}

export function setTheme(next: Theme) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* keep in memory only */
  }
  apply()
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme)
}
