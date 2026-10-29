import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Where you were, kept across a reload: the view's day, the open ride, the
 * sheets that were up and whatever was half typed in them. A refresh (the
 * browser's, or `applyUpdate` taking a new build) should land you back on the
 * same screen with the same words in the same fields.
 *
 * State that should come back is held with `useKept(key, init)` instead of
 * `useState`. Every mounted `useKept` is in a registry, and when the page is
 * hidden or unloads the registry is written to sessionStorage as one snapshot
 * (`karpul.keep`). So what is saved is exactly what is on screen: a sheet that
 * was closed is unmounted, out of the registry and not saved, with nothing to
 * forget by hand. On the next load each `useKept` starts from its key in the
 * snapshot, once (the first mount takes it), and after that from its `init`.
 *
 * sessionStorage is per tab and survives a reload but not a new tab or an app
 * started afresh, which is the line between "refresh" and "open". The snapshot
 * also carries whose it was (`keepFor`, a different account gets nothing) and
 * when (`MAX_AGE_MS`, a tab picked up a day later starts on today). The scroll
 * of the page and of each `[data-scroll-pane]` rides along (`restoreScroll`).
 *
 * Passwords never go through here.
 */

const KEY = 'karpul.keep'
const MAX_AGE_MS = 6 * 60 * 60 * 1000

interface Snapshot {
  user: number | null
  at: number
  values: Record<string, unknown>
  scroll?: number[]
}

function read(): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as Snapshot
    if (!snap || typeof snap.values !== 'object' || Date.now() - snap.at > MAX_AGE_MS) return null
    return snap
  } catch {
    return null
  }
}

const loaded = read()
const restored = new Map<string, unknown>(loaded ? Object.entries(loaded.values) : [])
let restoredScroll = loaded?.scroll ?? null
let user: number | null = null

/** What every mounted `useKept` holds now, by key. */
const live = new Map<string, () => unknown>()

/** The account the kept state belongs to; another one's snapshot is not handed out. */
export function keepFor(id: number | null) {
  if (id === user) return
  user = id
  if (loaded && loaded.user !== id) {
    restored.clear()
    restoredScroll = null
  }
}

function scrollers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-pane]'))
}

function save() {
  const values: Record<string, unknown> = {}
  for (const [key, get] of live) values[key] = get()
  const snap: Snapshot = {
    user,
    at: Date.now(),
    values,
    scroll: [window.scrollY, ...scrollers().map((el) => el.scrollTop)],
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(snap))
  } catch {
    /* private mode, or full: a reload starts afresh */
  }
}

if (typeof window !== 'undefined') {
  // pagehide is the reload itself; a hidden tab may be discarded by a phone
  // without one, and comes back as a reload.
  window.addEventListener('pagehide', save)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save()
  })
}

/**
 * `useState` that comes back after a reload. `key` names it in the snapshot,
 * so two components must not share one (a ride's thread puts the ride's id in it).
 * `revive` tidies a value that comes back (say, drops what should not reopen).
 */
export function useKept<T>(key: string, init: T | (() => T), revive?: (value: T) => T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (restored.has(key)) {
      const back = restored.get(key) as T
      return revive ? revive(back) : back
    }
    return typeof init === 'function' ? (init as () => T)() : init
  })
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  useEffect(() => {
    // Taken: a sheet closed and opened again starts from its `init`.
    restored.delete(key)
    const get = () => ref.current
    live.set(key, get)
    return () => {
      if (live.get(key) === get) live.delete(key)
    }
  }, [key])
  return [value, setValue]
}

/**
 * Puts the page and its panes back where they were scrolled, once, when the
 * board has something to scroll. Panes are matched by their order on the page.
 */
export function restoreScroll() {
  const saved = restoredScroll
  restoredScroll = null
  if (!saved) return
  requestAnimationFrame(() => {
    const [page, ...panes] = saved
    if (page) window.scrollTo(0, page)
    scrollers().forEach((el, i) => {
      if (panes[i]) el.scrollTop = panes[i]
    })
  })
}
