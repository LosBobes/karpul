/**
 * Which screens get opened, for the office to see what is used (backend:
 * routers/usage.py). `track('sheet.myRides')` puts the name in a batch that
 * goes out a minute later, or when the tab is hidden or closed, so a busy
 * session is one small request a minute at most. Only names: no account on
 * the row, no time of day, nothing a person typed, and a failure is dropped.
 */
import { authToken } from './auth'

/** Mirrors routers/usage.py `USAGE_KEY`. */
const SCREEN = /^(view|sheet|plan)\.[A-Za-z][A-Za-z0-9]{0,39}$/
/** Mirrors routers/usage.py `MAX_KEYS`. */
const BATCH = 50
const FLUSH_MS = 60_000

const pending: string[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let listening = false

export function track(key: string): void {
  if (!SCREEN.test(key)) return
  pending.push(key)
  listen()
  if (pending.length >= BATCH) flush()
  else timer ??= setTimeout(flush, FLUSH_MS)
}

/** Send what is waiting (also on `pagehide`; `keepalive` lets it outlive the page). */
export function flush(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const token = authToken()
  const keys = pending.splice(0, BATCH)
  if (!keys.length || !token) return
  try {
    void fetch('/api/usage', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ keys }),
    }).catch(() => {})
  } catch {
    /* counting is never worth an error */
  }
}

/** For tests: what is waiting to go. */
export function pendingKeys(): readonly string[] {
  return pending
}

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
