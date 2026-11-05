import { fmtTime } from '../lib/dates'
import { useT } from '../lib/i18n'
import { mapsSearchUrl, pointOf } from '../lib/maps'
import { useMapsAllowed } from '../lib/places'
import { isMyBooking, useMe } from '../lib/me'
import type { Booking, Ride } from '../lib/types'
import { Avatar } from './Avatar'
import { MapIcon } from './icons'

/** How many faces a place shows before the rest become a "+N". */
const FACES = 3

/**
 * The ride's journey as dots on a line: the pickup points before the start,
 * the start, the stops, the destination and, on a ride that comes back, the
 * start again at the return time. Every place opens in the maps app (by its
 * pin when it has one) while the maps are on. Beside each place where someone
 * gets in sit their faces (yours ringed), so the route says who is where.
 */
export function TripRoute({ ride }: { ride: Ride }) {
  const t = useT()
  const me = useMe()
  const mapsAllowed = useMapsAllowed()
  // Who gets in where: "" is the origin, and a pickup no longer on the route counts as the origin too.
  const onRoute = new Set([...ride.stops_before, ...ride.stops])
  const riders = new Map<string, Booking[]>()
  for (const b of ride.bookings) {
    const at = onRoute.has(b.pickup) ? b.pickup : ''
    riders.set(at, [...(riders.get(at) ?? []), b])
  }
  const who = (place: string) => {
    // Yours first, so it is never folded into the "+N".
    const here = [...(riders.get(place) ?? [])].sort((a, b) => Number(isMyBooking(b, me)) - Number(isMyBooking(a, me)))
    if (!here.length) return null
    const names = here.map((b) => b.passenger_name)
    const rest = here.length - FACES
    return (
      <span className="trip-who" role="img" aria-label={t.detail.getInHere(names)} title={names.join(', ')}>
        {here.slice(0, rest > 0 ? FACES - 1 : FACES).map((b, i) => (
          // The first face on top, so the ring of yours (always first) shows whole.
          <span key={b.id} className={isMyBooking(b, me) ? 'trip-face trip-face-me' : 'trip-face'} style={{ zIndex: FACES - i }}>
            <Avatar name={b.passenger_name} size="sm" />
          </span>
        ))}
        {rest > 0 && <span className="trip-face trip-more">+{rest + 1}</span>}
      </span>
    )
  }
  // The note and the faces share the column before the map button.
  const aside = (place: string, note?: string) => {
    const faces = who(place)
    return faces || note ? (
      <span className="trip-aside">
        {faces}
        {note && <span className="trip-note">{note}</span>}
      </span>
    ) : null
  }
  // Every place opens in the maps app: by its pin when it has one, else by its words.
  const placeLink = (place: string) =>
    mapsAllowed ? (
      <a
        className={pointOf(ride, place) ? 'trip-map trip-map-pinned' : 'trip-map'}
        href={mapsSearchUrl(place, pointOf(ride, place))}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t.map.openPlace(place)}
        title={t.map.openPlace(place)}
      >
        <MapIcon size={14} />
      </a>
    ) : null

  return (
    <ol className="trip" aria-label={ride.return_time ? `${ride.origin}, ${ride.destination}, ${ride.origin}` : `${ride.origin}, ${ride.destination}`}>
      {ride.stops_before.map((stop) => (
        <li key={stop} className="trip-stop trip-via">
          <span className="trip-dot" aria-hidden="true" />
          <span className="trip-place">{stop}</span>
          {aside(stop, riders.has(stop) ? undefined : t.detail.pickup)}
          {placeLink(stop)}
        </li>
      ))}
      <li className="trip-stop trip-start">
        <span className="trip-dot" aria-hidden="true" />
        <span className="trip-place">{ride.origin}</span>
        {aside('')}
        {placeLink(ride.origin)}
      </li>
      {ride.stops.map((stop) => (
        <li key={stop} className="trip-stop trip-via">
          <span className="trip-dot" aria-hidden="true" />
          <span className="trip-place">{stop}</span>
          {aside(stop, riders.has(stop) ? undefined : t.detail.pickup)}
          {placeLink(stop)}
        </li>
      ))}
      <li className="trip-stop trip-end">
        <span className="trip-dot" aria-hidden="true" />
        <span className="trip-place">{ride.destination}</span>
        {placeLink(ride.destination)}
      </li>
      {/* A ride with a return comes back where it started: the last dot of the way. */}
      {ride.return_time && (
        <li className="trip-stop trip-back">
          <span className="trip-dot" aria-hidden="true" />
          <span className="trip-place">{ride.origin}</span>
          <span className="trip-note">{t.detail.backAt(fmtTime(ride.return_time))}</span>
        </li>
      )}
    </ol>
  )
}
