import { useEffect, useRef, useState } from 'react'
import type { Ride } from './types'

/** What the server pushes on `/api/ws` (see backend/app/events.py). */
export type LiveEvent =
  | { type: 'hello' }
  | { type: 'ping' }
  | { type: 'ride.created' | 'ride.updated'; ride: Ride }
  | { type: 'ride.deleted'; ride_id: number; ride_date: string }
  | { type: 'cars.changed' }

export type LiveStatus = 'connecting' | 'live' | 'offline'

interface Handlers {
  onEvent: (event: LiveEvent) => void
  /** Fires on every (re)connect: whatever happened while the socket was down was never delivered. */
  onConnect: () => void
}

function socketUrl(): string {
  const base = import.meta.env.VITE_API_URL as string | undefined
  const url = new URL('/api/ws', base || window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const MAX_BACKOFF_MS = 30_000

/**
 * One socket for the tab, kept open for as long as the page lives. Drops are
 * expected — phones suspend background tabs, laptops sleep — so it reconnects
 * with exponential backoff and immediately when the tab comes back into view.
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

    function connect() {
      if (closed || socket) return
      const ws = new WebSocket(socketUrl())
      socket = ws
      ws.onopen = () => {
        attempt = 0
        setStatus('live')
        latest.current.onConnect()
      }
      ws.onmessage = (m) => {
        let event: LiveEvent
        try {
          event = JSON.parse(m.data as string) as LiveEvent
        } catch {
          return
        }
        latest.current.onEvent(event)
      }
      ws.onerror = () => ws.close()
      ws.onclose = () => {
        if (socket !== ws) return
        socket = null
        if (closed) return
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

    /** Skip the backoff when the user is plainly back. */
    function wake() {
      if (document.visibilityState !== 'visible' || socket) return
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      connect()
    }

    connect()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    return () => {
      closed = true
      if (timer !== null) clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
      socket?.close()
    }
  }, [])

  return status
}
