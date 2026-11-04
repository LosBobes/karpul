/**
 * What's new: one entry per feature people will notice, newest first. Every
 * pull request that adds or changes something on screen adds an entry here
 * (CLAUDE.md, "What's new"), with its words in `whatsNew.entries` in both
 * languages of lib/i18n.ts and its moving picture in components/WhatsNewArt.tsx.
 *
 * The sheet opens by itself once after an entry lands (components/WhatsNew.tsx),
 * showing only what this account has not seen in this browser and nothing from
 * before the account existed: a newcomer is not handed the history.
 */
export type DemoKey = 'addedBy' | 'seatNotice' | 'carWhere' | 'carBusy' | 'prefill' | 'consent'

export interface WhatsNewEntry {
  /** Stable: it is what "seen" remembers. Also the key of its words in i18n. */
  id: DemoKey
  /** The day it reached the app, `YYYY-MM-DD`. */
  date: string
}

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  { id: 'addedBy', date: '2026-11-04' },
  { id: 'seatNotice', date: '2026-11-03' },
  { id: 'carWhere', date: '2026-11-03' },
  { id: 'carBusy', date: '2026-11-03' },
  { id: 'prefill', date: '2026-11-02' },
  { id: 'consent', date: '2026-11-02' },
]

const SEEN_KEY = 'karpul.whatsNewSeen'

/** The entries to show: not seen yet, and from after the day of `joined` (an ISO date or
 *  timestamp). Someone who signs up on the day a feature lands found the app with it. */
export function unseen(entries: readonly WhatsNewEntry[], seen: readonly string[], joined: string): WhatsNewEntry[] {
  const since = joined.slice(0, 10)
  return entries.filter((e) => !seen.includes(e.id) && e.date > since)
}

/** What this account has seen in this browser. */
export function loadSeen(userId: number): string[] {
  try {
    const raw = localStorage.getItem(`${SEEN_KEY}.${userId}`)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function markSeen(userId: number, ids: readonly string[]): void {
  try {
    const all = Array.from(new Set([...loadSeen(userId), ...ids]))
    localStorage.setItem(`${SEEN_KEY}.${userId}`, JSON.stringify(all))
  } catch {
    /* no storage: it shows again next time, which is harmless */
  }
}
