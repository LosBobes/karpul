import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { getLocale } from './locale'

/**
 * Push notifications, the browser side (backend: app/push.py). The service
 * worker that shows them is `public/push-sw.js`, pulled into the generated
 * worker by `importScripts` (vite.config.ts). Subscribing needs the server's
 * VAPID key (`/api/push/config`), the user's permission and a name to file
 * the subscription under; `usePush` folds all of that into one state and two
 * actions for the Notifications sheet.
 */
export type PushState =
  | 'unsupported' // no service worker / Push API here (or not installed, on iOS)
  | 'unavailable' // the server has no VAPID key
  | 'denied' // the browser blocked notifications for this site
  | 'off'
  | 'on'
  | 'loading'

function supported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function toKey(b64url: string): Uint8Array {
  const padded = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration()
  return reg ? reg.pushManager.getSubscription() : null
}

export function usePush(userName: string) {
  const [state, setState] = useState<PushState>('loading')
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!supported()) return setState('unsupported')
    let key: string | null = null
    try {
      const cfg = await api.pushConfig()
      key = cfg.enabled ? cfg.public_key : null
    } catch {
      key = null
    }
    setPublicKey(key)
    if (!key) return setState('unavailable')
    if (Notification.permission === 'denied') return setState('denied')
    const sub = await currentSubscription()
    setState(sub ? 'on' : 'off')
  }, [])

  useEffect(() => {
    // Data fetching: the state is set after the awaits inside `refresh`.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  const enable = useCallback(async () => {
    if (!publicKey || !userName) return
    setError(null)
    setState('loading')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return setState('denied')
      const reg = await registration()
      if (!reg) return setState('unsupported')
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) as BufferSource }))
      await api.subscribePush(sub.toJSON(), getLocale(), userName)
      setState('on')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('off')
    }
  }, [publicKey, userName])

  const disable = useCallback(async () => {
    setError(null)
    setState('loading')
    try {
      const sub = await currentSubscription()
      if (sub) {
        await api.unsubscribePush(sub.endpoint).catch(() => undefined)
        await sub.unsubscribe()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setState('off')
  }, [])

  return { state, error, enable, disable }
}

/**
 * A subscription is filed under a name; when the name changes the server has
 * to learn the new one, or the pushes keep going to the old name. Called from
 * App on every name change; a no-op while nothing is subscribed.
 */
export async function resubscribePush(userName: string): Promise<void> {
  if (!userName) return
  const sub = await currentSubscription()
  if (!sub) return
  await api.subscribePush(sub.toJSON(), getLocale(), userName).catch(() => undefined)
}
