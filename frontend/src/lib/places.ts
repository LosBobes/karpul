import { useEffect, useState, useSyncExternalStore } from 'react'
import { api } from './api'
import { useMe, type Me } from './me'
import type { MapConfig, Point, Road } from './types'

/**
 * Where the map's tiles come from, asked of the server once per page
 * (GET /api/map/config) and kept here like the theme: an external store, so
 * every map and every place input reads the same answer. Until it arrives (or
 * when it fails) there is no map, only "Open in Maps", which needs nothing.
 * The server also says who has the maps (`audience`); for anyone else the
 * hooks answer as if there were none, so nothing of them shows.
 */

const OFF: MapConfig = { audience: 'off', tiles: '', attribution: '', max_zoom: 19, search: false, road: false }

let config: MapConfig = OFF
let asked = false
const listeners = new Set<() => void>()

function ask() {
  if (asked) return
  asked = true
  api
    .mapConfig()
    .then((answer) => {
      config = answer
      listeners.forEach((fn) => fn())
    })
    .catch(() => {
      // Try again on the next subscriber, after a failure (offline at start).
      asked = false
    })
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  ask()
  return () => listeners.delete(fn)
}

/** Are the maps on for `me` (backend: geo.maps_for)? */
export function mapsFor(c: MapConfig, me: Me): boolean {
  return c.audience === 'everyone' || (c.audience === 'admins' && !!me.admin)
}

/** The map config as this person has it: none at all unless the maps are theirs. */
export function useMapConfig(): MapConfig {
  const me = useMe()
  const c = useSyncExternalStore(subscribe, () => config, () => OFF)
  return mapsFor(c, me) ? c : OFF
}

/** Whether anything of the maps shows to this person: suggestions, pins, the "Open in Maps" links. */
export function useMapsAllowed(): boolean {
  return useMapConfig().audience !== 'off'
}

/** Whether there is a map to draw at all. */
export function mapsOn(c: MapConfig): boolean {
  return c.tiles !== ''
}

/** How long the place input waits after the last key before it asks. */
export const SEARCH_PAUSE_MS = 300
/** What has to be typed before the server's search is asked; the known places answer from one letter. */
export const SEARCH_MIN = 2

/** The road through a route's pins, when the server has a road finder; null otherwise. */
export function useRoad(points: Point[]): Road | null {
  const config = useMapConfig()
  const key = config.road && points.length >= 2 ? JSON.stringify(points) : ''
  const [found, setFound] = useState<{ key: string; road: Road } | null>(null)
  useEffect(() => {
    if (!key) return
    const ctl = new AbortController()
    api.road(JSON.parse(key) as Point[], ctl.signal).then(
      (road) => setFound({ key, road }),
      () => {
        /* none: straight dashes between the pins */
      },
    )
    return () => ctl.abort()
  }, [key])
  return found && found.key === key ? found.road : null
}
