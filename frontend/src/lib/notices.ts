import { useSyncExternalStore } from 'react'
import { api } from './api'
import type { SeatNotice } from './types'

/**
 * "You lost a seat" (backend: app/notices.py, GET /api/notices): someone
 * took you, or a colleague you had put in, out of a car, or removed the ride.
 * A push may have said so already, but not everyone has push on, so the
 * board shows the unseen ones on top until *Got it*. An external store like
 * the photos: `useBoard` loads it on every (re)connect, when the app comes
 * back to the foreground and on `notices.changed`, which only this account hears.
 */
let current: readonly SeatNotice[] = []
let seq = 0
const listeners = new Set<() => void>()

function set(next: readonly SeatNotice[]): void {
  current = next
  listeners.forEach((fn) => fn())
}

export async function loadNotices(): Promise<void> {
  const mine = ++seq
  const notices = await api.notices()
  if (mine === seq) set(notices)
}

/** Put one away: gone from the screen at once, then marked seen on the server. */
export async function dismissNotice(id: number): Promise<void> {
  seq++
  set(current.filter((n) => n.id !== id))
  await api.noticeSeen(id)
}

/** Signing out: the next account starts with none. */
export function clearNotices(): void {
  seq++
  set([])
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const snapshot = () => current

export function useNotices(): readonly SeatNotice[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
