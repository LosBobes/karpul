import { useState, type ReactNode } from 'react'
import { fmtDayDate, fmtDayLabel, fmtTime, sameName, shortCarName } from '../lib/dates'
import { useT } from '../lib/i18n'
import type { Ride } from '../lib/types'
import { CarGlyph, PowertrainMark } from './CarArt'
import { ChevronDownIcon, PinIcon, SearchIcon, XIcon } from './icons'

type Filter = 'all' | 'free' | 'mine' | 'joined'
const FILTERS: Filter[] = ['all', 'free', 'mine', 'joined']

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

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
  // Filters live here: they are a way of looking at the list, not board state.
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const q = fold(query.trim())
  const matches = (r: Ride) => {
    if (filter === 'free' && r.free_seats <= 0) return false
    if (filter === 'mine' && !sameName(r.driver_name, userName)) return false
    if (filter === 'joined' && !r.bookings.some((b) => sameName(b.passenger_name, userName))) return false
    if (q && !fold(`${r.origin} ${r.destination} ${r.driver_name} ${r.car_name} ${r.stops.join(' ')}`).includes(q)) return false
    return true
  }
  const shown = rides.filter(matches)
  const filtered = filter !== 'all' || q !== ''
  const days: { date: string; rides: Ride[] }[] = []
  for (const r of shown) {
    const last = days[days.length - 1]
    if (last && last.date === r.ride_date) last.rides.push(r)
    else days.push({ date: r.ride_date, rides: [r] })
  }

  return (
    <section className="upcoming" aria-label={t.upcoming.label}>
      <div className="filters">
        <div className="chips" role="radiogroup" aria-label={t.filters.label}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              className={filter === f ? 'chip chip-on' : 'chip'}
              disabled={(f === 'mine' || f === 'joined') && !userName}
              onClick={() => setFilter(f)}
            >
              {t.filters[f]}
            </button>
          ))}
        </div>
        <label className="input-icon search">
          <SearchIcon size={16} />
          <input type="search" placeholder={t.filters.search} aria-label={t.filters.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="icon-btn icon-btn-sm input-clear" aria-label={t.common.close} onClick={() => setQuery('')}>
              <XIcon size={16} />
            </button>
          )}
        </label>
      </div>

      {shown.length === 0 && filtered && (
        <div className="card empty-card empty-card-short">
          <strong>{t.filters.noMatch}</strong>
          <button
            type="button"
            className="link"
            onClick={() => {
              setFilter('all')
              setQuery('')
            }}
          >
            {t.filters.clear}
          </button>
        </div>
      )}

      {days.map((day) => {
        const free = day.rides.reduce((n, r) => n + r.free_seats, 0)
        return (
          <div key={day.date} className="upcoming-day">
            <h3 className="section-title upcoming-head">
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
                        <span>
                          {t.upcoming.route(r.driver_name, r.origin, r.destination)}
                          {r.stops.length > 0 && (
                            <span className="session-stops" title={r.stops.join(', ')}>
                              <PinIcon size={11} /> +{r.stops.length}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="session-side">
                        {driving ? (
                          <span className="tag tag-green">{t.upcoming.driving}</span>
                        ) : riding ? (
                          <span className="tag tag-green">{t.upcoming.youreIn}</span>
                        ) : full ? (
                          <span className="tag tag-muted">{t.upcoming.full}</span>
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
