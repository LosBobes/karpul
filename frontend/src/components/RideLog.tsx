import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { addDays, fmtTime, parseISODate, todayISO, toISODate } from '../lib/dates'
import { messages, useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import { filterLog, logCsv, logTotals, sortLog, type LogKind, type LogSort, type SortKey } from '../lib/rideLog'
import type { Ride } from '../lib/types'
import { DatePicker } from './DatePicker'
import { CarIcon, DownloadIcon, SearchIcon, XIcon } from './icons'
import { SegThumb } from './Segmented'
import { Select } from './Select'
import { Sheet } from './Sheet'

type Period = 'upcoming' | 'past'

/** Matches the Upcoming view's reach; the server allows up to three years. */
const SPAN_DAYS = 90

function window(period: Period): { from: string; to: string } {
  const today = parseISODate(todayISO())
  return period === 'upcoming'
    ? { from: toISODate(today), to: toISODate(addDays(today, SPAN_DAYS)) }
    : { from: toISODate(addDays(today, -SPAN_DAYS)), to: toISODate(addDays(today, -1)) }
}

/** "Sat 24 Oct", with the year once it is not this one: a past window can reach back into last year. */
function fmtDate(iso: string): string {
  const d = parseISODate(iso)
  const year = d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  return d.toLocaleDateString(intlTag(), { weekday: 'short', day: 'numeric', month: 'short', year })
}

function save(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

interface Props {
  onClose: () => void
}

/**
 * Every ride between two dates as one table, for an admin who looks things up
 * the way a spreadsheet does: who drove where on which day, in which car, with
 * whom. Upcoming or past sets the dates (both can then be moved), the car type
 * and the search narrow the rows, a column heading sorts by it, and the
 * download is the rows on screen as a spreadsheet (lib/rideLog.ts).
 * Backend: GET /api/admin/rides.
 */
export function RideLog({ onClose }: Props) {
  const t = useT()
  const [period, setPeriod] = useState<Period>('upcoming')
  const [{ from, to }, setRange] = useState(() => window('upcoming'))
  const [kind, setKind] = useState<LogKind>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<LogSort>({ key: 'date', dir: 1 })
  // What came back, for which dates: a result for other dates is still loading.
  const [loaded, setLoaded] = useState<{ range: string; rides: Ride[] | null; error: string | null } | null>(null)
  const range = `${from}/${to}`
  const current = loaded?.range === range ? loaded : null
  const rides = current?.rides ?? null
  const error = current?.error ?? null

  useEffect(() => {
    let live = true
    api
      .rideLog(from, to)
      .then((rs) => live && setLoaded({ range: `${from}/${to}`, rides: rs, error: null }))
      .catch(
        (e) =>
          live &&
          setLoaded({ range: `${from}/${to}`, rides: null, error: e instanceof Error ? messages().apiError(e.message) : messages().common.somethingWrong }),
      )
    return () => {
      live = false
    }
  }, [from, to])

  function pickPeriod(p: Period) {
    setPeriod(p)
    setRange(window(p))
    // The coming rides read soonest first, the past ones latest first.
    setSort({ key: 'date', dir: p === 'upcoming' ? 1 : -1 })
  }

  const shown = useMemo(() => (rides ? sortLog(filterLog(rides, kind, query), sort) : []), [rides, kind, query, sort])
  const totals = logTotals(shown)
  const c = t.rideLog.col

  const sortable = (key: SortKey, label: string, className?: string) => {
    const on = sort.key === key
    return (
      <th scope="col" className={className} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className={on ? 'log-sort log-sort-on' : 'log-sort'}
          title={t.rideLog.sortBy(label)}
          onClick={() => setSort(on ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 })}
        >
          {label}
          <span className="log-sort-mark" aria-hidden="true">
            {on ? (sort.dir === 1 ? '▲' : '▼') : '▲'}
          </span>
        </button>
      </th>
    )
  }

  return (
    <Sheet id="ride-log-title" title={t.rideLog.title} onClose={onClose} className="panel-wide">

      <div className="log-tools">
        <div className="segmented log-period" role="radiogroup" aria-label={t.rideLog.title}>
          <SegThumb count={2} index={period === 'upcoming' ? 0 : 1} />
          {(['upcoming', 'past'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? 'seg seg-on' : 'seg'} onClick={() => pickPeriod(p)}>
              {p === 'upcoming' ? t.rideLog.upcoming : t.rideLog.past}
            </button>
          ))}
        </div>
        <div className="subfield">
          <span className="subfield-label">{t.rideLog.from}</span>
          <DatePicker label={t.rideLog.from} value={from} onChange={(iso) => setRange((r) => ({ ...r, from: iso }))} />
        </div>
        <div className="subfield">
          <span className="subfield-label">{t.rideLog.to}</span>
          <DatePicker label={t.rideLog.to} value={to} onChange={(iso) => setRange((r) => ({ ...r, to: iso }))} />
        </div>
        <div className="subfield log-kind">
          <span className="subfield-label">{t.rideLog.kind}</span>
          <Select<LogKind>
            label={t.rideLog.kind}
            value={kind}
            icon={<CarIcon size={16} />}
            onChange={setKind}
            options={[
              { value: 'all', label: t.rideLog.kindAll },
              { value: 'corporate', label: t.rideLog.kindCorporate },
              { value: 'own', label: t.rideLog.kindOwn },
            ]}
          />
        </div>
        <label className="input-icon search log-search">
          <SearchIcon size={16} />
          <input type="search" placeholder={t.rideLog.search} aria-label={t.rideLog.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="icon-btn icon-btn-sm input-clear" aria-label={t.common.close} onClick={() => setQuery('')}>
              <XIcon size={16} />
            </button>
          )}
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {rides === null && !error && <p className="hint">{t.common.loading}</p>}

      {rides && (
        <div className="log-summary">
          <p className="section-meta">{t.rideLog.totals(totals.rides, totals.pax, totals.km)}</p>
          <button
            type="button"
            className="btn btn-soft"
            disabled={shown.length === 0}
            onClick={() => save(logCsv(shown, messages()), `karpul-rides-${from}-to-${to}.csv`)}
          >
            <DownloadIcon size={16} /> {t.rideLog.download}
          </button>
        </div>
      )}

      {rides && shown.length === 0 && <p className="hint">{rides.length === 0 ? t.rideLog.none : t.rideLog.noMatch}</p>}

      {shown.length > 0 && (
        <div className="log-scroll" tabIndex={0} aria-labelledby="ride-log-title">
          <table className="log-table">
            <thead>
              <tr>
                {sortable('date', c.date, 'log-date')}
                <th scope="col">{c.departs}</th>
                <th scope="col">{c.back}</th>
                {sortable('driver', c.driver)}
                {sortable('car', c.car)}
                {sortable('from', c.from)}
                {sortable('to', c.to)}
                {sortable('taken', c.taken, 'log-num')}
                <th scope="col">{c.passengers}</th>
                {sortable('km', c.km, 'log-num')}
                <th scope="col">{c.chipIn}</th>
                <th scope="col">{c.note}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="log-date">
                    {fmtDate(r.ride_date)}
                  </th>
                  <td className="mono">{fmtTime(r.departure_time)}</td>
                  <td className="mono">{r.return_time ? fmtTime(r.return_time) : <span className="log-sub">{t.rideLog.oneWay}</span>}</td>
                  <td>
                    {r.driver_name}
                    {r.driver_phone && <span className="log-sub mono">{r.driver_phone}</span>}
                  </td>
                  <td>
                    {r.car_name}
                    <span className="log-sub">{r.car_type === 'corporate' ? t.rideLog.company : t.rideLog.own}</span>
                  </td>
                  <td>
                    {r.origin}
                    {r.stops.length > 0 && (
                      <span className="log-sub">
                        {c.stops}: {r.stops.join(', ')}
                      </span>
                    )}
                  </td>
                  <td>{r.destination}</td>
                  <td className="log-num mono">
                    {r.bookings.length}/{r.seats}
                  </td>
                  <td className="log-wide">
                    {r.bookings.map((b) => b.passenger_name).join(', ')}
                    {r.waitlist.length > 0 && (
                      <span className="log-sub">
                        {c.waiting}: {r.waitlist.map((w) => w.name).join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="log-num mono">{r.distance_km == null ? '' : r.distance_km.toLocaleString(intlTag())}</td>
                  <td>{r.chip_in}</td>
                  <td className="log-wide">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  )
}
