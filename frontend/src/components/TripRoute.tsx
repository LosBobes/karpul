import { fmtTime } from '../lib/dates'
import { useT } from '../lib/i18n'
import { mapsSearchUrl, pointOf } from '../lib/maps'
import { useMapsAllowed } from '../lib/places'
import type { Ride } from '../lib/types'
import { MapIcon } from './icons'

/**
 * The ride's journey as dots on a line: the pickup points before the start,
 * the start, the stops, the destination and, on a ride that comes back, the
 * start again at the return time. Every place opens in the maps app (by its
 * pin when it has one) while the maps are on.
 */
export function TripRoute({ ride }: { ride: Ride }) {
  const t = useT()
  const mapsAllowed = useMapsAllowed()
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
          <span className="trip-note">{t.detail.pickup}</span>
          {placeLink(stop)}
        </li>
      ))}
      <li className="trip-stop trip-start">
        <span className="trip-dot" aria-hidden="true" />
        <span className="trip-place">{ride.origin}</span>
        {placeLink(ride.origin)}
      </li>
      {ride.stops.map((stop) => (
        <li key={stop} className="trip-stop trip-via">
          <span className="trip-dot" aria-hidden="true" />
          <span className="trip-place">{stop}</span>
          <span className="trip-note">{t.detail.pickup}</span>
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
