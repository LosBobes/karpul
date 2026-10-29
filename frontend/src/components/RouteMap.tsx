import { createPortal } from 'react-dom'
import { initials } from '../lib/dates'
import { useT } from '../lib/i18n'
import { mapsSearchUrl, navigateUrl, routeStops } from '../lib/maps'
import { drives, myBooking, useMe } from '../lib/me'
import { useRoad } from '../lib/places'
import { avatarTone } from '../lib/tone'
import type { Point, Ride } from '../lib/types'
import { NavigateIcon, PinIcon } from './icons'
import { MapView, type MapPath, type MapPin } from './MapView'
import { Sheet } from './Sheet'

/**
 * One ride on the map: the driver's start as their initials in their colour,
 * the pickup points numbered in the order the car reaches them, the
 * destination a ring, and where you get in green. The road between them when
 * the server knows it, else straight dashes in order. The places nobody pinned
 * are listed under it, each opened in the maps app by its words.
 */
export function RideMap({ ride, className }: { ride: Ride; className?: string }) {
  const t = useT()
  const me = useMe()
  const mine = myBooking(ride, me)
  const myPlace = mine ? mine.pickup || ride.origin : null
  const stops = routeStops(ride)
  const pinned = stops.filter((s) => s.point)
  const road = useRoad(pinned.map((s) => s.point as Point))
  const tone = avatarTone(ride.driver_name)
  const pins: MapPin[] = pinned.map((s) => ({
    point: s.point as Point,
    label: s.role === 'start' ? `${s.place} (${ride.driver_name})` : s.place,
    kind: myPlace !== null && s.place === myPlace ? 'mine' : s.role,
    text: s.role === 'start' ? initials(ride.driver_name) : s.role === 'end' ? '' : String(s.n),
    tone: s.role === 'start' ? tone : undefined,
  }))
  const paths: MapPath[] = road
    ? [{ line: road.line }]
    : [{ line: pinned.map((s) => [s.point!.lat, s.point!.lng] as [number, number]), dashed: true }]
  const unpinned = stops.filter((s) => !s.point)

  return (
    <div className={['ride-map', className].filter(Boolean).join(' ')}>
      <MapView pins={pins} paths={paths} label={t.map.routeOf(ride.origin, ride.destination)} />
      {road && <p className="hint hint-tight">{t.map.roadIs(road.km, road.minutes)}</p>}
      {unpinned.length > 0 && (
        <p className="map-unpinned">
          <span className="muted">{t.map.notPinned}</span>{' '}
          {unpinned.map((s, i) => (
            <span key={s.n}>
              {i > 0 && ', '}
              <a href={mapsSearchUrl(s.place)} target="_blank" rel="noopener noreferrer">
                {s.place}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

/** The ride's map in a sheet (*Show on map* on the ride card). */
export function RouteMapSheet({ ride, onClose }: { ride: Ride; onClose: () => void }) {
  const t = useT()
  const me = useMe()
  const passenger = !!myBooking(ride, me) && !drives(ride, me)
  // Opened from inside a ride card, which may clip (the upcoming list folds
  // it in a clipping row): the sheet goes on <body> like the board's own.
  return createPortal(
    <Sheet
      id="route-map-title"
      className="route-map-sheet"
      title={t.map.routeOf(ride.origin, ride.destination)}
      onClose={onClose}
      footer={
        <a className="btn btn-primary btn-block" href={navigateUrl(ride, me)} target="_blank" rel="noopener noreferrer">
          {passenger ? <PinIcon size={18} /> : <NavigateIcon size={18} />}
          {passenger ? t.map.toMyPickup : t.map.navigate}
        </a>
      }
    >
      <RideMap ride={ride} />
    </Sheet>,
    document.body,
  )
}
