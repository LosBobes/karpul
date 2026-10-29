import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import { loadLeaflet, type L } from '../lib/leaflet'
import { useT } from '../lib/i18n'
import { bounds } from '../lib/maps'
import { mapsOn, useMapConfig } from '../lib/places'
import type { Point } from '../lib/types'

/** One pin on a map. */
export interface MapPin {
  point: Point
  /** What the pin is called, for its tooltip and for a screen reader. */
  label: string
  /** start: the driver's start, stop: a pickup point, end: the destination,
   * mine: where you get in, spot: a place on its own (a car's home). */
  kind: 'start' | 'stop' | 'end' | 'mine' | 'spot'
  /** What the pin shows: its number along the route, or initials. */
  text?: string
  /** The driver's colour (lib/tone.ts) on a map of many rides. */
  tone?: string
}

/** A line between pins: the road, or straight dashes when no road is known. */
export interface MapPath {
  line: [number, number][]
  dashed?: boolean
  tone?: string
}

interface Props {
  pins: MapPin[]
  paths?: MapPath[]
  /** The map's name for a screen reader. */
  label: string
  className?: string
  onPinClick?: (index: number) => void
}

/**
 * A map with pins, drawn the way the rest of Karpul is: a rounded card, the
 * pins as the app's own dots (the driver's start an avatar-like disc, the
 * pickup points numbered, the destination a ring, your own pickup green),
 * fitted to what is on it. Tiles come from the server's map config; with none
 * there is no map at all and the caller shows the places as words.
 */
export function MapView({ pins, paths = [], label, className, onPinClick }: Props) {
  const t = useT()
  const config = useMapConfig()
  const box = useRef<HTMLDivElement>(null)
  const [lib, setLib] = useState<L | null>(null)
  const [failed, setFailed] = useState(false)
  const map = useRef<Leaflet.Map | null>(null)
  const layer = useRef<Leaflet.LayerGroup | null>(null)
  const click = useRef(onPinClick)
  useEffect(() => {
    click.current = onPinClick
  }, [onPinClick])

  useEffect(() => {
    let live = true
    loadLeaflet().then(
      (l) => live && setLib(l),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!lib || !box.current || !mapsOn(config)) return
    const m = lib.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    lib.tileLayer(config.tiles, { maxZoom: config.max_zoom, attribution: config.attribution }).addTo(m)
    layer.current = lib.layerGroup().addTo(m)
    map.current = m
    // A sheet or a pane may still be growing; measure again once it settles.
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(box.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
      layer.current = null
    }
  }, [lib, config])

  // Pins and paths are fresh arrays on every render; their contents are what counts.
  const key = JSON.stringify([pins, paths])
  useEffect(() => {
    const m = map.current
    const group = layer.current
    if (!lib || !m || !group) return
    const [pins, paths] = JSON.parse(key) as [MapPin[], MapPath[]]
    group.clearLayers()
    for (const path of paths) {
      if (path.line.length < 2) continue
      lib
        .polyline(path.line, {
          className: ['map-path', path.dashed && 'map-path-dashed', path.tone && `tone-${path.tone}`].filter(Boolean).join(' '),
          interactive: false,
        })
        .addTo(group)
    }
    pins.forEach((pin, i) => {
      const html = `<span class="map-pin-body">${escapeHtml(pin.text ?? '')}</span>`
      const icon = lib.divIcon({
        className: ['map-pin', `map-pin-${pin.kind}`, pin.tone && `tone-${pin.tone}`].filter(Boolean).join(' '),
        html,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      const marker = lib.marker([pin.point.lat, pin.point.lng], { icon, title: pin.label, alt: pin.label, keyboard: true, riseOnHover: true })
      marker.bindTooltip(escapeHtml(pin.label), { direction: 'top', offset: [0, -14] })
      marker.on('click', () => click.current?.(i))
      marker.addTo(group)
    })
    const all = [...pins.map((p) => p.point), ...paths.flatMap((p) => p.line.map(([lat, lng]) => ({ lat, lng })))]
    const b = bounds(all)
    if (b) {
      if (all.length === 1) m.setView(b[0], 15)
      else m.fitBounds(b, { padding: [32, 32], maxZoom: 16 })
    }
  }, [lib, key, config])

  if (!mapsOn(config)) return null
  return (
    <div className={['map', className].filter(Boolean).join(' ')} role="region" aria-label={label}>
      <div ref={box} className="map-canvas" />
      {!lib && !failed && <div className="map-loading">{t.map.loading}</div>}
      {failed && <div className="map-loading">{t.map.failed}</div>}
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}
