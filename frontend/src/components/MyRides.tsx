import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtShortDate, fmtTime, shortCarName } from '../lib/dates'
import { messages, useT } from '../lib/i18n'
import type { PersonStats, StatBucket } from '../lib/types'
import { Avatar } from './Avatar'
import { CalendarIcon, CopyIcon } from './icons'
import { Sheet } from './Sheet'

interface Props {
  userName: string
  onEditName: () => void
  onClose: () => void
}

/**
 * Your rides: the figures for this month and all time, the past rides, and
 * the calendar feed address. Read from `/api/stats/me` for the name in this
 * browser; there is no account, so it is the name's history, not a person's.
 */
export function MyRides({ userName, onEditName, onClose }: Props) {
  const t = useT()
  const [stats, setStats] = useState<PersonStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!userName) return
    let live = true
    api
      .myStats(userName)
      .then((s) => live && setStats(s))
      .catch((e) => live && setError(e instanceof Error ? messages().apiError(e.message) : messages().common.somethingWrong))
    return () => {
      live = false
    }
  }, [userName])

  const feedUrl = userName ? new URL(api.calendarFeedUrl(userName), window.location.origin).href : ''

  async function copyFeed() {
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* the address is on screen to select by hand */
    }
  }

  return (
    <Sheet id="my-rides-title" title={t.myRides.title} onClose={onClose}>
      {!userName ? (
        <button type="button" className="card empty-card empty-card-btn" onClick={onEditName}>
          <strong>{t.empty.whoAreYou}</strong>
          <span>{t.myRides.nameFirst}</span>
        </button>
      ) : (
        <>
          <div className="driver-pill">
            <Avatar name={userName} size="sm" />
            <span>{userName}</span>
          </div>
          {error && <p className="error">{error}</p>}
          {stats ? (
            <>
              <StatGrid title={t.myRides.thisMonth} bucket={stats.month} />
              <StatGrid title={t.myRides.allTime} bucket={stats.all} />
              <p className="hint">{t.myRides.kmHint}</p>

              <h3 className="section-title">{t.myRides.feed}</h3>
              <div className="feed-row">
                <CalendarIcon size={18} />
                <code className="feed-url">{feedUrl}</code>
                <button type="button" className="btn btn-soft" onClick={() => void copyFeed()}>
                  <CopyIcon size={16} /> {copied ? t.toasts.linkCopied : t.common.copy}
                </button>
              </div>
              <p className="hint">{t.myRides.feedHint}</p>

              <h3 className="section-title">{t.myRides.history}</h3>
              {stats.history.length === 0 ? (
                <p className="hint">{t.myRides.noHistory}</p>
              ) : (
                <ul className="history-list">
                  {stats.history.map((h) => (
                    <li key={h.id} className="history-row">
                      <span className="history-when">
                        <span className="when-value">{fmtShortDate(h.ride_date)}</span>
                        <small>{fmtTime(h.departure_time)}</small>
                      </span>
                      <span className="history-text">
                        <strong>{t.myRides.route(h.origin, h.destination)}</strong>
                        <span>
                          {h.role === 'driver' ? t.myRides.asDriver : `${t.myRides.asPassenger} · ${h.driver_name}`} · {shortCarName(h.car_name)}
                          {h.role === 'driver' && ` · ${t.myRides.pax(h.passengers)}`}
                          {h.distance_km != null && ` · ${h.distance_km} km`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            !error && <p className="hint">{t.common.loading}</p>
          )}
        </>
      )}
    </Sheet>
  )
}

function StatGrid({ title, bucket }: { title: string; bucket: StatBucket }) {
  const t = useT()
  const tiles = [
    [bucket.rides_driven, t.myRides.driven],
    [bucket.rides_ridden, t.myRides.ridden],
    [bucket.people_carried, t.myRides.carried],
    [bucket.km_shared, t.myRides.km],
  ] as const
  return (
    <section className="stats">
      <h3 className="section-title">{title}</h3>
      <div className="stat-grid">
        {tiles.map(([value, label]) => (
          <div key={label} className="card stat-tile">
            <strong className="when-value">{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
