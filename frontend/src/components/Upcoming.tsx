import type { ReactNode } from 'react'
import { fmtDayDate, fmtDayLabel, fmtTime, sameName, shortCarName } from '../lib/dates'
import { useT } from '../lib/i18n'
import type { Ride } from '../lib/types'
import { CarGlyph, PowertrainMark } from './CarArt'
import { ChevronDownIcon } from './icons'

interface Props {
  /** Every ride from today on, in the API's order (date, departure, id). */
  rides: Ride[]
  userName: string
  /** The ride whose detail is unfolded under its row. */
  openId: number | null
  onOpen: (rideId: number | null) => void
  /** Draws the unfolded detail (App owns the handlers it needs). */
  renderDetail: (ride: Ride) => ReactNode
}

/**
 * The next sessions as one list: a heading per day, a row per ride going that
 * day. Tapping a row unfolds the full ride card underneath it, so joining or
 * editing never leaves the list.
 */
export function Upcoming({ rides, userName, openId, onOpen, renderDetail }: Props) {
  const t = useT()
  const days: { date: string; rides: Ride[] }[] = []
  for (const r of rides) {
    const last = days[days.length - 1]
    if (last && last.date === r.ride_date) last.rides.push(r)
    else days.push({ date: r.ride_date, rides: [r] })
  }

  return (
    <section className="upcoming" aria-label={t.upcoming.label}>
      {days.map((day) => {
        const free = day.rides.reduce((n, r) => n + r.free_seats, 0)
        return (
          <div key={day.date} className="upcoming-day">
            <h3 className="section-title">
              {fmtDayLabel(day.date)}
              <span className="section-count">{fmtDayDate(day.date)}</span>
              <span className="section-meta">{t.upcoming.meta(day.rides.length, free)}</span>
            </h3>
            <ul className="session-list">
              {day.rides.map((r) => {
                const open = r.id === openId
                const driving = sameName(r.driver_name, userName)
                const riding = r.bookings.some((b) => sameName(b.passenger_name, userName))
                const full = r.free_seats <= 0
                const cls = ['card', 'session', open && 'session-open', (driving || riding) && 'session-mine']
                  .filter(Boolean)
                  .join(' ')
                return (
                  <li key={r.id} className="session-item">
                    <button type="button" className={cls} aria-expanded={open} onClick={() => onOpen(open ? null : r.id)}>
                      <span className="session-time">
                        <span className="when-value">{fmtTime(r.departure_time)}</span>
                        <small>{r.return_time ? t.upcoming.back(fmtTime(r.return_time)) : t.upcoming.oneWay}</small>
                      </span>
                      <span className="session-art" aria-hidden="true">
                        <CarGlyph carName={r.car_name} size={20} />
                      </span>
                      <span className="session-text">
                        <strong>
                          <span className="session-name">{shortCarName(r.car_name)}</span>
                          <PowertrainMark carName={r.car_name} />
                        </strong>
                        <span>{t.upcoming.route(r.driver_name, r.origin, r.destination)}</span>
                      </span>
                      <span className="session-side">
                        {driving ? (
                          <span className="tag tag-green">{t.upcoming.driving}</span>
                        ) : riding ? (
                          <span className="tag tag-green">{t.upcoming.youreIn}</span>
                        ) : full ? (
                          <span className="tag">{t.upcoming.full}</span>
                        ) : (
                          <span className="session-seats">{t.upcoming.seats(r.free_seats)}</span>
                        )}
                        <ChevronDownIcon size={16} className="session-chevron" />
                      </span>
                    </button>
                    {open && (
                      <div className="session-detail">
                        <div className="session-detail-clip">{renderDetail(r)}</div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
