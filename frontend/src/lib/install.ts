import { useSyncExternalStore } from 'react'

/**
 * Installing Karpul to the home screen. Chrome and Edge (Android and desktop)
 * fire `beforeinstallprompt` once the app qualifies; we keep that event and
 * suppress the browser's own mini-infobar, which most people never see, so the
 * app can offer the install itself (`InstallCard`, and *Install the app* in the
 * drawer). Safari on an iPhone or iPad has no such event and never offers
 * anything, so there the offer is the two taps through the Share menu.
 * Nothing is offered once the app runs installed (standalone).
 *
 * `listenForInstall` must run before React does (main.tsx): the event can
 * fire before the first render, and a missed one does not come back until the
 * next visit.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** How the app can be installed here: by the browser's prompt, by hand on iOS, or not at all. */
export type InstallMode = 'prompt' | 'ios' | null

/** The card was put away; it does not come back on its own (the drawer item stays). */
const DISMISSED_KEY = 'karpul.installHint'

let deferred: InstallPromptEvent | null = null
let installed = false
let dismissed = readDismissed()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function standalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

/** iPhone, iPod, or an iPad (which calls itself a Mac but has a touch screen). */
function ios(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    emit()
  })
}

function mode(): InstallMode {
  if (installed || standalone()) return null
  if (deferred) return 'prompt'
  return ios() ? 'ios' : null
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** How this browser can install the app, or null when it cannot (or already has). */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, mode, () => null)
}

/** Whether the first-visit card was put away in this browser. */
export function useInstallDismissed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => dismissed,
    () => true,
  )
}

export function setInstallDismissed(on: boolean) {
  dismissed = on
  try {
    if (on) localStorage.setItem(DISMISSED_KEY, '1')
    else localStorage.removeItem(DISMISSED_KEY)
  } catch {
    // Not remembered; the card still goes for now.
  }
  emit()
}

/**
 * Shows the browser's install dialog. The event works once, so it is dropped
 * either way; a refusal puts the card away too. Resolves to whether the app
 * is being installed.
 */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  deferred = null
  emit()
  await event.prompt()
  const { outcome } = await event.userChoice
  if (outcome === 'dismissed') setInstallDismissed(true)
  return outcome === 'accepted'
}
