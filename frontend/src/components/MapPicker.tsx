import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { useLocale } from '../lib/locale'
import { mapsOn, useMapConfig } from '../lib/places'
import type { Point } from '../lib/types'
import { LocateIcon, SearchIcon } from './icons'
import { PlaceInput } from './PlaceInput'
import { HOME_VIEW } from '../lib/maps'
import { loadLeaflet } from '../lib/leaflet'

interface Props {
  /** The pin the place already has, when it has one. */
  initial: Point | null
  /** Another place of the route, to open nearby when there is no pin yet. */
  near?: Point | null
  /** Picked with *Use this point*; the name is the address searched for, or the spot's. */
  onPick?: (point: Point, name: string | null) => void
  onCancel?: () => void
  /**
   * Part of a form that has its own place field (*Add a pickup point*): no
   * search box and no buttons of its own. The map goes where `focus` says
   * (a suggestion picked in that field) and reports where it was moved to
   * with `onMove`, and that is the pin.
   */
  embedded?: boolean
  focus?: Point | null
  onMove?: (point: Point) => void
}

const round = (p: { lat: number; lng: number }): Point => ({
  lat: Math.round(p.lat * 1e6) / 1e6,
  lng: Math.round(p.lng * 1e6) / 1e6,
})

/**
 * Dropping a pin: the map moves under a fixed ring, so a finger never covers
 * the spot it is choosing. On its own (a ride form's place, a car's home, an
 * office) it has an address search floating on top of the map, the same
 * suggestions as any place field, which takes the map there to be nudged,
 * and *Use this point* takes the middle: named by the address picked while
 * the map has not moved off it, else looked up (`/api/places/reverse`).
 * Embedded, the form's own field is the search and the middle is the pin as
 * soon as the map is moved. Either way *Use my location* is a round button
 * on the map, and the picker sits inline, never as a second overlay.
 */
export function MapPicker({ initial, near, onPick, onCancel, embedded = false, focus = null, onMove }: Props) {
  const t = useT()
  const locale = useLocale()
  const config = useMapConfig()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // The address picked in the search box and where it is.
  const found = useRef<{ name: string; point: Point } | null>(null)
  // Where it opens, read once: the map is made once and then only moved.
  const start = useRef({ at: initial ?? near ?? HOME_VIEW, zoom: initial ? 17 : near ? 14 : 12 })
  const moved = useRef(onMove)
  useEffect(() => {
    moved.current = onMove
  }, [onMove])

  useEffect(() => {
    let live = true
    let ro: ResizeObserver | null = null
    loadLeaflet().then(
      (L) => {
        if (!live || !box.current || !mapsOn(config)) return
        const { at, zoom } = start.current
        const m = L.map(box.current, { zoomControl: false }).setView([at.lat, at.lng], zoom)
        L.control.zoom({ position: 'bottomleft' }).addTo(m)
        L.tileLayer(config.tiles, { maxZoom: config.max_zoom, attribution: config.attribution }).addTo(m)
        // A person moving the map puts the pin where it stops: a drag once it has
        // settled (it may glide on after the finger lifts), a zoom as it starts
        // and as it ends (a button zooms about the middle, a wheel about the
        // pointer). A resize also moves the map, and must not drop a pin.
        let dragging = false
        const report = () => moved.current?.(round(m.getCenter()))
        m.on('dragstart', () => {
          dragging = true
        })
        m.on('moveend', () => {
          if (!dragging) return
          dragging = false
          report()
        })
        m.on('zoomstart zoomend', report)
        map.current = m
        ro = new ResizeObserver(() => m.invalidateSize())
        ro.observe(box.current)
        setReady(true)
      },
      () => live && setError(t.map.failed),
    )
    return () => {
      live = false
      ro?.disconnect()
      map.current?.remove()
      map.current = null
    }
  }, [config, t.map.failed])

  // A suggestion picked in the form's own field takes the map there.
  const focusKey = focus ? `${focus.lat},${focus.lng}` : ''
  useEffect(() => {
    if (!focusKey || !ready) return
    const [lat, lng] = focusKey.split(',').map(Number)
    map.current?.setView([lat, lng], 17)
  }, [focusKey, ready])

  function locate() {
    if (!('geolocation' in navigator)) {
      setError(t.map.noLocation)
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        map.current?.setView([pos.coords.latitude, pos.coords.longitude], 17)
        moved.current?.(round({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      },
      () => {
        setLocating(false)
        setError(t.map.noLocation)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  async function pick() {
    const m = map.current
    if (!m) return
    const point = round(m.getCenter())
    setBusy(true)
    let name: string | null = null
    const hit = found.current
    if (hit && Math.abs(hit.point.lat - point.lat) < 1e-4 && Math.abs(hit.point.lng - point.lng) < 1e-4) {
      name = hit.name
    } else {
      try {
        name = (await api.placeName(point, locale)).name
      } catch {
        name = null
      }
    }
    setBusy(false)
    onPick?.(point, name)
  }

  return (
    <div className={embedded ? 'map-picker map-picker-embedded' : 'map-picker'}>
      <div className="map map-pick">
        <div ref={box} className="map-canvas" />
        <span className="map-crosshair" aria-hidden="true" />
        {!embedded && (
          // Enter picks a suggestion, never submits the form the picker sits in.
          <div className="map-search" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}>
            <SearchIcon size={18} className="map-search-icon" />
            <PlaceInput
              label={t.map.searchAddress}
              placeholder={t.map.searchPlaceholder}
              value={query}
              point={null}
              near={initial ?? near ?? null}
              onChange={(value, point) => {
                setQuery(value)
                if (!point) return
                found.current = { name: value, point }
                map.current?.setView([point.lat, point.lng], 17)
              }}
            />
          </div>
        )}
        <button
          type="button"
          className="map-locate"
          aria-label={t.map.myLocation}
          title={t.map.myLocation}
          onClick={locate}
          disabled={!ready || locating}
        >
          <LocateIcon size={20} className={locating ? 'map-locating' : undefined} />
        </button>
        {!ready && !error && <div className="map-loading">{t.map.loading}</div>}
      </div>
      <p className="hint hint-tight">{embedded ? t.map.moveHint : t.map.privacy}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!embedded && (
        <div className="map-picker-actions">
          <button type="button" className="btn btn-soft" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={pick} disabled={!ready || busy}>
            {t.map.usePoint}
          </button>
        </div>
      )}
    </div>
  )
}
