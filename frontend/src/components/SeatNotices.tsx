import { fmtShortDate, fmtTime } from '../lib/dates'
import { useT } from '../lib/i18n'
import { dismissNotice, useNotices } from '../lib/notices'
import type { SeatNotice } from '../lib/types'
import { BellDotIcon } from './icons'

interface Props {
  /** A wide screen floats the cards in the top corner instead of above the board. */
  floating?: boolean
  /** *See that day*: the day board on the ride's day, to find another car. */
  onSeeDay: (isoDate: string) => void
}

/**
 * "You lost a seat", one card each (lib/notices.ts): who took you, or a
 * colleague you had put in, out of a car, or removed the ride; which ride;
 * and the way to another car that day. Stays until *Got it*, so nobody who
 * missed the push turns up for a ride they are no longer in.
 */
export function SeatNotices({ floating, onSeeDay }: Props) {
  const t = useT()
  const notices = useNotices()
  if (notices.length === 0) return null
  const title = (n: SeatNotice) =>
    n.kind === 'ride_removed'
      ? n.yours
        ? t.notices.rideRemoved(n.by_name)
        : t.notices.guestRideRemoved(n.by_name, n.passenger_name)
      : n.yours
        ? t.notices.takenOut(n.by_name)
        : t.notices.guestTakenOut(n.by_name, n.passenger_name)
  return (
    <section className={floating ? 'seat-notices seat-notices-float' : 'seat-notices'} aria-label={t.notices.label}>
      {notices.map((n) => (
        <article key={n.id} className="card seat-notice" role="alert">
          <div className="seat-notice-head">
            <span className="seat-notice-icon" aria-hidden="true">
              <BellDotIcon size={20} />
            </span>
            <div className="seat-notice-text">
              <strong>{title(n)}</strong>
              <span>
                {fmtShortDate(n.ride_date)} {fmtTime(n.departure_time)} · {n.origin} → {n.destination}
              </span>
            </div>
          </div>
          <div className="seat-notice-actions">
            <button type="button" className="btn" onClick={() => void dismissNotice(n.id).catch(() => undefined)}>
              {t.notices.gotIt}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onSeeDay(n.ride_date)
                void dismissNotice(n.id).catch(() => undefined)
              }}
            >
              {t.notices.seeDay}
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}
