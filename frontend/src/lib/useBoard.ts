import { useCallback, useEffect, useRef, useState } from 'react'
import { api, isNetworkError } from './api'
import { useLiveBoard, type LiveEvent, type LiveStatus } from './live'
import { loadPhotos } from './photos'
import type { CarState, CorporateCar, Ride, RideRequest } from './types'

export interface Range {
  from: string
  to: string
}

/** Same order the API lists in, so a ride pushed over the socket lands in the right row. */
export function sortRides(rides: Ride[]): Ride[] {
  return [...rides].sort(
    (a, b) => a.ride_date.localeCompare(b.ride_date) || a.departure_time.localeCompare(b.departure_time) || a.id - b.id,
  )
}

/** Requests in board order too: day, then the time asked for, then id. */
export function sortRequests(requests: RideRequest[]): RideRequest[] {
  return [...requests].sort(
    (a, b) => a.request_date.localeCompare(b.request_date) || a.departure_time.localeCompare(b.departure_time) || a.id - b.id,
  )
}

const inRange = (date: string, range: Range) => date >= range.from && date <= range.to

/** Put `item` in its place in `list` (replacing the one with its id), or take it out when it left the range. */
export function upsertInRange<T extends { id: number }>(list: T[], item: T, keep: boolean, sort: (xs: T[]) => T[]): T[] {
  const rest = list.filter((x) => x.id !== item.id)
  return keep ? sort([...rest, item]) : rest
}

interface Options {
  /** An admin's tab also keeps the full car list (retired cars too) current. */
  isAdmin: boolean
  /** A load failed; the board says so in its toast. */
  onLoadError: (error: unknown) => void
}

export interface Board {
  rides: Ride[]
  requests: RideRequest[]
  /** The active pool, for the ride form. */
  cars: CorporateCar[]
  /** Every car, retired ones too: the admin's list. Empty until an admin loads it. */
  adminCars: CorporateCar[]
  /** How each shared car stands (backend: app/carstate.py); null until loaded. */
  carStates: CarState[] | null
  reloadCarStates: () => Promise<void>
  /** The range on screen has not been loaded yet. */
  loading: boolean
  liveStatus: LiveStatus
  load: () => Promise<void>
  upsertRide: (ride: Ride) => void
  removeRides: (gone: (ride: Ride) => boolean) => void
  upsertRequest: (request: RideRequest) => void
  removeRequest: (id: number) => void
  /** Fetch both car lists again (after a pool edit, or a `cars.changed`). */
  reloadCars: () => Promise<void>
}

/** How long to wait before each new try when the network did not answer. */
const NETWORK_RETRY_MS = [1000, 2000, 4000]

/**
 * The board's rides and requests. A phone coming back from sleep reloads the
 * board the moment it wakes, often before its radio is back, so a call that got
 * no answer at all is tried again a few times, quietly, before it counts as a
 * failure; a real answer from the server (a 4xx or 5xx) is never retried.
 * `current` says whether this load is still the one that matters.
 */
async function loadOnce(from: string, to: string, current: () => boolean): Promise<[Ride[], RideRequest[]]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await Promise.all([api.rides(from, to), api.requests(from, to)])
    } catch (e) {
      if (!isNetworkError(e) || attempt >= NETWORK_RETRY_MS.length || !current()) throw e
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_MS[attempt]))
    }
  }
}

/**
 * Everything the board shows, for the days in `range`, kept current.
 *
 * Loads overlap when twenty people are busy: a reconnect, a range change and
 * a `cars.changed` can all be in flight together, and a live event can land
 * between sending the request and getting the answer. Only the newest load
 * may set the board, and an answer that an event may have overtaken is
 * fetched once more instead of being trusted.
 *
 * Live events (lib/live.ts) are applied in place when they fall inside the
 * range; the socket's (re)connect reloads, because whatever happened while it
 * was down was never delivered; and while it is down a 30 s poll stands in.
 */
export function useBoard(range: Range, { isAdmin, onLoadError }: Options): Board {
  const [rides, setRides] = useState<Ride[]>([])
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [cars, setCars] = useState<CorporateCar[]>([])
  const [adminCars, setAdminCars] = useState<CorporateCar[]>([])
  const [carStates, setCarStates] = useState<CarState[] | null>(null)
  const [loadedRange, setLoadedRange] = useState<string | null>(null)
  const rangeKey = `${range.from}:${range.to}`

  const loadSeq = useRef(0)
  const eventDuringLoad = useRef(false)
  const failed = useRef(onLoadError)
  useEffect(() => {
    failed.current = onLoadError
  })

  const load = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    let next: [Ride[], RideRequest[]] | null = null
    // One more round trip whenever an event overtook the answer; a quiet one ends it.
    do {
      eventDuringLoad.current = false
      try {
        next = await loadOnce(range.from, range.to, () => seq === loadSeq.current)
      } catch (e) {
        if (seq === loadSeq.current) failed.current(e)
        next = null
        break
      }
    } while (seq === loadSeq.current && eventDuringLoad.current)
    if (seq !== loadSeq.current) return // superseded; that load sets the board
    if (next) {
      setRides(next[0])
      setRequests(next[1])
    }
    setLoadedRange(rangeKey)
  }, [range, rangeKey])

  useEffect(() => {
    // Data fetching: the state update happens after the await, not synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const reloadCars = useCallback(async () => {
    if (isAdmin) {
      const all = await api.allCorporateCars()
      setAdminCars(all)
      setCars(all.filter((c) => c.active))
    } else {
      setCars(await api.corporateCars())
    }
  }, [isAdmin])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    reloadCars().catch(() => setCars([]))
  }, [reloadCars])

  const reloadCarStates = useCallback(async () => {
    setCarStates(await api.carStates())
  }, [])

  /** An edit can move a ride into or out of the loaded range. */
  const upsertRide = useCallback(
    (ride: Ride) => setRides((rs) => upsertInRange(rs, ride, inRange(ride.ride_date, range), sortRides)),
    [range],
  )
  const removeRides = useCallback((gone: (ride: Ride) => boolean) => setRides((rs) => rs.filter((r) => !gone(r))), [])
  const upsertRequest = useCallback(
    (request: RideRequest) =>
      setRequests((qs) => upsertInRange(qs, request, inRange(request.request_date, range), sortRequests)),
    [range],
  )
  const removeRequest = useCallback((id: number) => setRequests((qs) => qs.filter((q) => q.id !== id)), [])

  const onEvent = useCallback(
    (ev: LiveEvent) => {
      switch (ev.type) {
        case 'ride.created':
        case 'ride.updated':
          eventDuringLoad.current = true
          upsertRide(ev.ride)
          break
        case 'ride.deleted':
          eventDuringLoad.current = true
          removeRides((r) => r.id === ev.ride_id)
          break
        case 'request.saved':
          eventDuringLoad.current = true
          upsertRequest(ev.request)
          break
        case 'request.deleted':
          eventDuringLoad.current = true
          removeRequest(ev.request_id)
          break
        case 'cars.changed':
          // A pool edit can relabel rides (backend: relabel_rides_for_car), so
          // both lists are reloaded rather than patched.
          reloadCars().catch(() => undefined)
          reloadCarStates().catch(() => undefined)
          void load()
          break
        case 'cars.state':
          reloadCarStates().catch(() => undefined)
          break
        case 'photos.changed':
          loadPhotos().catch(() => undefined)
          break
        default:
          break
      }
    },
    [upsertRide, removeRides, upsertRequest, removeRequest, reloadCars, reloadCarStates, load],
  )
  // Whatever happened while the socket was down was never delivered: the
  // board, the photos and the cars' state are all fetched again on every (re)connect.
  const onConnect = useCallback(() => {
    loadPhotos().catch(() => undefined)
    reloadCarStates().catch(() => undefined)
    return load()
  }, [load, reloadCarStates])
  const liveStatus = useLiveBoard({ onEvent, onConnect })
  // Also without a socket (a proxy that refuses WebSockets falls back to polling).
  useEffect(() => {
    loadPhotos().catch(() => undefined)
    // Data fetching: the state update happens after the await, not synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    reloadCarStates().catch(() => undefined)
  }, [reloadCarStates])

  // Keep the board fresh for people who leave the tab open. Polling is the
  // fallback for when the socket is down; coming back to the app always
  // re-syncs: a focus, or (an installed app on a phone, which often fires no
  // focus when it is brought back) the page becoming visible again.
  useEffect(() => {
    const id = liveStatus === 'live' ? null : setInterval(() => void load(), 30_000)
    const onFocus = () => void load()
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      void load()
      loadPhotos().catch(() => undefined)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      if (id !== null) clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [load, liveStatus])

  return {
    rides,
    requests,
    cars,
    adminCars,
    carStates,
    reloadCarStates,
    loading: loadedRange !== rangeKey,
    liveStatus,
    load,
    upsertRide,
    removeRides,
    upsertRequest,
    removeRequest,
    reloadCars,
  }
}
