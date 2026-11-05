import { useT } from '../lib/i18n'
import type { Ride } from '../lib/types'
import { Avatar } from './Avatar'
import { ChevronRightIcon, PinIcon, PlusIcon } from './icons'
import { Sheet } from './Sheet'

interface Props {
  ride: Ride
  busy: boolean
  /** Offer *Somewhere else…*, a place not on the route yet. */
  elsewhere: boolean
  /** A place on the route: "" is the start. */
  onPick: (pickup: string) => void
  onElsewhere: () => void
  onClose: () => void
}

/**
 * Where you get in, asked after *Get in* (or *Wait for a seat*) is tapped: the
 * route's places in order, each a row that takes the seat there in one tap,
 * with the faces of whoever already gets in at it, and *Somewhere else…* at
 * the foot for a place not on the route yet (`AddStop`).
 */
export function PickupSheet({ ride, busy, elsewhere, onPick, onElsewhere, onClose }: Props) {
  const t = useT()
  const places = [
    ...ride.stops_before.map((s) => ({ value: s, label: s, hint: t.detail.beforeStart })),
    { value: '', label: ride.origin, hint: t.detail.start },
    ...ride.stops.map((s) => ({ value: s, label: s, hint: '' })),
  ]
  const onRoute = new Set([...ride.stops_before, ...ride.stops])
  const riders = (place: string) => ride.bookings.filter((b) => (onRoute.has(b.pickup) ? b.pickup : '') === place)

  return (
    <Sheet title={t.detail.whereGetIn} id="pickup-title" onClose={onClose} className="pickup-sheet" stacked>
      <ul className="pickup-list">
        {places.map((p) => {
          const here = riders(p.value)
          return (
            <li key={p.value || '\u0000start'}>
              <button type="button" className="pickup-row" disabled={busy} onClick={() => onPick(p.value)}>
                <span className="pickup-icon" aria-hidden="true">
                  <PinIcon size={18} />
                </span>
                <span className="pickup-text">
                  <span className="pickup-place">{p.label}</span>
                  {p.hint && <span className="pickup-hint">{p.hint}</span>}
                </span>
                {here.length > 0 && (
                  <span className="pickup-who" title={here.map((b) => b.passenger_name).join(', ')}>
                    {here.slice(0, 3).map((b) => (
                      <span key={b.id} className="trip-face">
                        <Avatar name={b.passenger_name} size="sm" />
                      </span>
                    ))}
                  </span>
                )}
                <ChevronRightIcon size={18} className="pickup-chevron" />
              </button>
            </li>
          )
        })}
        {elsewhere && (
          <li>
            <button type="button" className="pickup-row pickup-row-new" disabled={busy} onClick={onElsewhere}>
              <span className="pickup-icon" aria-hidden="true">
                <PlusIcon size={18} />
              </span>
              <span className="pickup-text">
                <span className="pickup-place">{t.detail.elsewhere}</span>
              </span>
              <ChevronRightIcon size={18} className="pickup-chevron" />
            </button>
          </li>
        )}
      </ul>
    </Sheet>
  )
}
