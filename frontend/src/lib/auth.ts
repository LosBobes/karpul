import { useSyncExternalStore } from 'react'

/**
 * Who is signed in, in this browser.
 *
 * Karpul used to keep a typed-in name in `localStorage` and send it as a
 * header; now a person registers once and the browser keeps the token the
 * server handed back (`karpul.auth`). The token goes out as
 * `Authorization: Bearer` on every request (lib/api.ts) and the account's
 * display name is the name colleagues see on the board, so nothing downstream
 * had to learn about accounts: it still receives a `userName` string.
 *
 * Like the theme and the locale this is an external store rather than React
 * state, because non-component code (lib/api.ts) needs to read the token too.
 */
export interface AuthUser {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  display_name: string
  created_at: string
}

export interface Session {
  token: string
  expires_at: string
  user: AuthUser
}

const KEY = 'karpul.auth'

function isUser(v: unknown): v is AuthUser {
  if (!v || typeof v !== 'object') return false
  const u = v as Record<string, unknown>
  return typeof u.id === 'number' && typeof u.username === 'string' && typeof u.display_name === 'string'
}

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    if (typeof parsed?.token !== 'string' || !isUser(parsed.user)) return null
    // A session the server would refuse anyway: drop it before the app starts
    // rather than letting the first request fail.
    if (parsed.expires_at && Date.parse(parsed.expires_at) <= Date.now()) return null
    return { token: parsed.token, expires_at: parsed.expires_at ?? '', user: parsed.user }
  } catch {
    return null
  }
}

let current: Session | null = load()
const listeners = new Set<() => void>()

function save() {
  try {
    if (current) localStorage.setItem(KEY, JSON.stringify(current))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode etc. - keep it in memory only */
  }
}

function announce() {
  listeners.forEach((fn) => fn())
}

export function getSession(): Session | null {
  return current
}

/** The token for the next request, or "" when nobody is signed in. */
export function authToken(): string {
  return current?.token ?? ''
}

/** The name the board knows this person by, or "" when nobody is signed in. */
export function currentUserName(): string {
  return current?.user.display_name ?? ''
}

export function setSession(next: Session | null) {
  current = next
  save()
  announce()
}

/** Keep the token, take the account's new details (after editing the profile). */
export function setUser(user: AuthUser) {
  if (!current) return
  current = { ...current, user }
  save()
  announce()
}

/** Forget the session in this browser. The caller tells the server separately. */
export function clearSession() {
  setSession(null)
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession)
}
