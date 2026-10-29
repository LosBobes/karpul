import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { useLocale } from '../lib/locale'
import { mapsOn, useMapConfig } from '../lib/places'
import type { Point } from '../lib/types'
import { LocateIcon } from './icons'
import { PlaceInput } from './PlaceInput'
import { HOME_VIEW } from '../lib/maps'
import { loadLeaflet } from '../lib/leaflet'

interface Props {
  /** The pin the place already has, when it has one. */
  initial: Point | null
  /** Another place of the route, to open nearby when there is no pin yet. */
  near?: Point | null
  onPick: (point: Point, name: string | null) => void
  onCancel: () => void
}

/**
 * Dropping a pin: the map moves under a fixed crosshair, so a finger never
 * covers the spot it is choosing, and *Use this point* takes the middle.
 * Inline wherever the place is typed (like the photo cropper in its sheet),
 * not a second overlay. An address typed in the search box on top takes the
 * map there (the same suggestions as any place field), to be nudged from
 * there. A name for the spot is the picked address while the map has not
 * moved off it, else looked up on the way out (`/api/places/reverse`), for a
 * place that has no words yet.
 */
export function MapPicker({ initial, near, onPick, onCancel }: Props) {
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

  useEffect(() => {
    let live = true
    let ro: ResizeObserver | null = null
    loadLeaflet().then(
      (L) => {
        if (!live || !box.current || !mapsOn(config)) return
        const { at, zoom } = start.current
        const m = L.map(box.current, { zoomControl: true }).setView([at.lat, at.lng], zoom)
        L.tileLayer(config.tiles, { maxZoom: config.max_zoom, attribution: config.attribution }).addTo(m)
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
    const c = m.getCenter()
    const point = { lat: Math.round(c.lat * 1e6) / 1e6, lng: Math.round(c.lng * 1e6) / 1e6 }
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
    onPick(point, name)
  }

  return (
    <div className="map-picker">
      {/* Enter picks a suggestion, never submits the form the picker sits in. */}
      <div className="map-search" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}>
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
      <div className="map map-pick">
        <div ref={box} className="map-canvas" />
        <span className="map-crosshair" aria-hidden="true" />
        {!ready && !error && <div className="map-loading">{t.map.loading}</div>}
      </div>
      <p className="hint">{t.map.privacy}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="map-picker-actions">
        <button type="button" className="btn btn-soft" onClick={locate} disabled={!ready || locating}>
          <LocateIcon size={18} />
          {locating ? t.map.locating : t.map.myLocation}
        </button>
        <span className="map-picker-spacer" />
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button type="button" className="btn btn-primary" onClick={pick} disabled={!ready || busy}>
          {t.map.usePoint}
        </button>
      </div>
    </div>
  )
}
