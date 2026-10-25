import { useState, type ReactNode } from 'react'
import { fmtDayDate, fmtDayLabel, fmtTime, shortCarName } from '../lib/dates'
import { useT } from '../lib/i18n'
import { drives, seatedIn, useMe } from '../lib/me'
import type { Ride, RideRequest } from '../lib/types'
import { PowertrainMark } from './CarArt'
import { ArrowRightIcon, HandIcon, SearchIcon, XIcon } from './icons'
import { RequestList } from './RequestList'

type Filter = 'all' | 'free' | 'mine' | 'joined'
const FILTERS: Filter[] = ['all', 'free', 'mine', 'joined']

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

interface Props {
  /** Every ride from today on, in the API's order (date, departure, id). */
  rides: Ride[]
  /** The open requests in the same days, in board order. */
  requests: RideRequest[]
  busy: boolean
  onAsk: () => void
  onOffer: (request: RideRequest) => void
  onWithdraw: (request: RideRequest) => void
  /** The ride whose detail is unfolded under its row. */
  openId: number | null
  onOpen: (rideId: number | null) => void
  /** Draws the unfolded detail (App owns the handlers it needs). Left out
   * on a wide screen, where the open ride shows in the pane beside the list. */
  renderDetail?: (ride: Ride) => ReactNode
}

/**
 * The next sessions as one list: a heading per day, a row per ride going that
 * day, then who is still looking for a ride that day. Tapping a row unfolds
 * the full ride card underneath it, so joining or editing never leaves the list.
 */
export function Upcoming({ rides, requests, busy, onAsk, onOffer, onWithdraw, openId, onOpen, renderDetail }: Props) {
  const t = useT()
  const me = useMe()
  // Filters live here: they are a way of looking at the list, not board state.
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const q = fold(query.trim())
  const matches = (r: Ride) => {
    if (filter === 'free' && r.free_seats <= 0) return false
    if (filter === 'mine' && !drives(r, me)) return false
    if (filter === 'joined' && !seatedIn(r, me)) return false
    if (q && !fold(`${r.origin} ${r.destination} ${r.driver_name} ${r.car_name} ${r.stops.join(' ')}`).includes(q)) return false
    return true
  }
  const shown = rides.filter(matches)
  // Requests belong to "All": the other chips are about seats, yours or free.
  const asks =
    filter === 'all' ? requests.filter((r) => !q || fold(`${r.origin} ${r.destination} ${r.name} ${r.note}`).includes(q)) : []
  const filtered = filter !== 'all' || q !== ''
  const byDay = new Map<string, { rides: Ride[]; asks: RideRequest[] }>()
  const day = (date: string) => {
    let d = byDay.get(date)
    if (!d) byDay.set(date, (d = { rides: [], asks: [] }))
    return d
  }
  for (const r of shown) day(r.ride_date).rides.push(r)
  for (const r of asks) day(r.request_date).asks.push(r)
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, ...d }))

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

      <button type="button" className="add-row add-row-quiet upcoming-ask" onClick={onAsk}>
        <HandIcon size={18} />
        {t.requests.ask}
      </button>

      {days.length === 0 && filtered && (
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
              <span className="upcoming-day-name">{fmtDayLabel(day.date)}</span>
              <span className="section-count">{fmtDayDate(day.date)}</span>
              {day.rides.length > 0 && <span className="section-meta">{t.upcoming.meta(day.rides.length, free)}</span>}
            </h3>
            {day.rides.length > 0 && (
            <ul className="session-list">
              {day.rides.map((r) => {
                const open = r.id === openId
                const driving = drives(r, me)
                const riding = seatedIn(r, me)
                const full = r.free_seats <= 0
                const cls = ['card', 'session', open && 'session-open', (driving || riding) && 'session-mine']
                  .filter(Boolean)
                  .join(' ')
                return (
                  <li key={r.id} className="session-item">
                    <button type="button" className={cls} aria-expanded={renderDetail ? open : undefined}
                      aria-current={!renderDetail && open ? 'true' : undefined} onClick={() => onOpen(open ? null : r.id)}>
                      {/* Three lines, each with the whole width: when (and your
                          place in it), the way, who drives what. */}
                      <span className="session-top">
                        <span className="session-time">
                          <span className="when-value">{fmtTime(r.departure_time)}</span>
                          <small>{r.return_time ? t.upcoming.back(fmtTime(r.return_time)) : t.upcoming.oneWay}</small>
                        </span>
                        {r.approval === 'pending' && <span className="tag tag-amber">{t.upcoming.awaiting}</span>}
                        {driving ? (
                          <span className="tag tag-green">{t.upcoming.driving}</span>
                        ) : riding ? (
                          <span className="tag tag-green">{t.upcoming.youreIn}</span>
                        ) : full ? (
                          <span className="tag tag-muted">{t.upcoming.full}</span>
                        ) : (
                          <span className="session-seats">{t.upcoming.seats(r.free_seats)}</span>
                        )}
                      </span>
                      <strong className="session-route">
                        {r.origin}
                        <ArrowRightIcon size={14} className="session-arrow" />
                        {r.destination}
                      </strong>
                      <span className="session-sub">
                        <span className="session-name">
                          {r.driver_name} · {shortCarName(r.car_name)}
                        </span>
                        <PowertrainMark carName={r.car_name} />
                        {r.stops.length > 0 && <span className="session-stops">{t.upcoming.stops(r.stops.length)}</span>}
                      </span>
                    </button>
                    {open && renderDetail && (
                      <div className="session-detail">
                        <div className="session-detail-clip">{renderDetail(r)}</div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            )}
            <RequestList requests={day.asks} isPast={false} busy={busy} onOffer={onOffer} onWithdraw={onWithdraw} />
          </div>
        )
      })}
    </section>
  )
}
