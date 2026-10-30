import { useEffect, useRef, useState } from 'react'
import { authToken, clearSession } from './auth'
import type { Ride, RideRequest } from './types'

/** What the server pushes on `/api/ws` (see backend/app/events.py). */
export type LiveEvent =
  | { type: 'hello' }
  | { type: 'ping' }
  | { type: 'ride.created' | 'ride.updated'; ride: Ride }
  | { type: 'ride.deleted'; ride_id: number; ride_date: string }
  | { type: 'cars.changed' }
  | { type: 'cars.state' }
  | { type: 'request.saved'; request: RideRequest }
  | { type: 'request.deleted'; request_id: number }
  | { type: 'photos.changed' }

export type LiveStatus = 'connecting' | 'live' | 'offline'

interface Handlers {
  onEvent: (event: LiveEvent) => void
  /** Fires on every (re)connect: whatever happened while the socket was down was never delivered. */
  onConnect: () => void
}

/** The server's close code for "this socket did not sign in" (backend: routers/live.py). */
const CLOSE_UNAUTHORIZED = 4401

function socketUrl(): string {
  const base = import.meta.env.VITE_API_URL as string | undefined
  const url = new URL('/api/ws', base || window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const MAX_BACKOFF_MS = 30_000
/**
 * The server pings an idle socket every 25 s (backend: routers/live.py), so a
 * socket that has said nothing for longer than this is dead even though the
 * browser still calls it open: a phone that slept with the app in the
 * background keeps a socket like that for minutes and never fires `close`.
 */
const SILENT_MS = 40_000
/** How often a visible tab checks that its socket still talks. */
const WATCH_MS = 10_000

/**
 * One socket for the tab, kept open for as long as the page lives. Drops are
 * expected — phones suspend background tabs, laptops sleep — so it reconnects
 * with exponential backoff and immediately when the tab comes back into view.
 *
 * The board is for signed-in people only and a browser cannot put a header on
 * a WebSocket, so the first message out is the token; the server's `hello` is
 * what makes the socket live (and reloads the board, since anything that
 * happened before it was never delivered). A 4401 close means the token is
 * dead: the session is dropped, which shows the door, like a 401 from fetch.
 */
export function useLiveBoard(handlers: Handlers): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    let socket: WebSocket | null = null
    let closed = false
    let attempt = 0
    let timer: number | null = null
    let heard = Date.now()

    function connect() {
      if (closed || socket) return
      const ws = new WebSocket(socketUrl())
      socket = ws
      heard = Date.now()
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: authToken() }))
      ws.onmessage = (m) => {
        heard = Date.now()
        let event: LiveEvent
        try {
          event = JSON.parse(m.data as string) as LiveEvent
        } catch {
          return
        }
        if (event.type === 'hello') {
          attempt = 0
          setStatus('live')
          latest.current.onConnect()
          return
        }
        latest.current.onEvent(event)
      }
      ws.onerror = () => ws.close()
      ws.onclose = (e) => {
        if (socket !== ws) return
        socket = null
        if (closed) return
        if (e.code === CLOSE_UNAUTHORIZED) {
          clearSession()
          return
        }
        setStatus('offline')
        schedule()
      }
    }

    function schedule() {
      if (closed || timer !== null) return
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.random() * 500
      attempt += 1
      timer = window.setTimeout(() => {
        timer = null
        connect()
      }, delay)
    }

    /**
     * Let go of a socket that stopped talking: its `close` may come minutes
     * later or never, so it is detached first (its handlers see it is no longer
     * the socket) and a fresh one is opened at once.
     */
    function dropIfSilent(): boolean {
      if (!socket || Date.now() - heard < SILENT_MS) return false
      const dead = socket
      socket = null
      setStatus('offline')
      try {
        dead.close()
      } catch {
        /* already gone */
      }
      return true
    }

    /** Skip the backoff when the user is plainly back. */
    function wake() {
      if (document.visibilityState !== 'visible') return
      dropIfSilent()
      if (socket) return
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      connect()
    }

    connect()
    // A hidden tab's timers are frozen or throttled, so the check runs while it is in view.
    const watch = window.setInterval(() => {
      if (document.visibilityState === 'visible' && dropIfSilent()) wake()
    }, WATCH_MS)
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    return () => {
      closed = true
      if (timer !== null) clearTimeout(timer)
      clearInterval(watch)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
      socket?.close()
    }
  }, [])

  return status
}
