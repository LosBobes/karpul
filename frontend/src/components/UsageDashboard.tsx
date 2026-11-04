import { useEffect, useState } from 'react'
import { fmtHour, fmtShortDate, parseISODate, addDays, startOfWeek } from '../lib/dates'
import { messages, useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import type { CarUsage, CarUsageRow } from '../lib/types'
import { dayColumns, dayLevel, monthStarts, shareLevel, weekdayCounts, type HeatLevel } from '../lib/usageHeat'
import { CarGlyph, PowertrainMark } from './CarArt'
import { DownloadIcon } from './icons'
import { SegThumb } from './Segmented'

const WINDOWS = [30, 90, 365] as const
type Shape = 'days' | 'hours'
const SHAPES: Shape[] = ['days', 'hours']

const pct = (rate: number) => `${Math.round(rate * 100)}%`
const hoursText = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1))

/** Monday first, in the app language: "M", "T", ... */
function weekdayNames(style: 'narrow' | 'short'): string[] {
  const monday = startOfWeek(new Date())
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i).toLocaleDateString(intlTag(), { weekday: style }))
}

/**
 * The shared cars' usage as a dashboard (admins, *Shared cars* → *Usage*): the
 * pool in three figures, then a card per car with its use rate and a heatmap,
 * either the calendar (how many hours it was out each day) or the week by hour
 * (when in the week it tends to be out). The rides themselves are in the
 * spreadsheet and in *All rides*, so they are not listed again here.
 */
export function UsageDashboard({ load, download }: { load: (days: number) => Promise<CarUsage>; download: (days: number) => Promise<void> }) {
  const t = useT()
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(90)
  const [shape, setShape] = useState<Shape>('days')
  const [report, setReport] = useState<CarUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  async function exportSheet() {
    setDownloading(true)
    try {
      await download(days)
    } catch (e) {
      setError(e instanceof Error ? messages().apiError(e.message) : messages().common.somethingWrong)
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    let live = true
    // Data fetching, like App.load: a window change clears the old error first.
    // oxlint-disable-next-line react/set-state-in-effect
    setError(null)
    load(days)
      .then((r) => live && setReport(r))
      .catch((e) => live && setError(e instanceof Error ? messages().apiError(e.message) : messages().common.somethingWrong))
    return () => {
      live = false
    }
  }, [days, load])

  const active = report?.cars.filter((r) => r.car.active || r.rides > 0) ?? []
  const pool = active.filter((r) => r.car.active)
  const poolRate = pool.length ? pool.reduce((s, r) => s + r.use_rate, 0) / pool.length : 0
  const poolHours = active.reduce((s, r) => s + r.hours, 0)
  const counts = report ? weekdayCounts(report.from, report.to) : []

  return (
    <div className="usage">
      <div className="segmented usage-window" role="radiogroup" aria-label={t.usage.window(days)}>
        <SegThumb count={WINDOWS.length} index={WINDOWS.indexOf(days)} />
        {WINDOWS.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? 'seg seg-on' : 'seg'} onClick={() => setDays(d)}>
            {t.usage.window(d)}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {!report && !error && <p className="hint">{t.common.loading}</p>}

      {report && (
        <>
          <div className="stat-grid usage-stats">
            <div className="card stat-tile" title={t.usage.useRateHint(report.working_days)}>
              <strong className="when-value">{pct(poolRate)}</strong>
              <span>{t.usage.poolRate}</span>
            </div>
            <div className="card stat-tile">
              <strong className="when-value">{report.totals.rides}</strong>
              <span>{t.usage.ridesLabel}</span>
            </div>
            <div className="card stat-tile">
              <strong className="when-value">{Math.round(poolHours)}</strong>
              <span>{t.usage.hoursOut}</span>
            </div>
            <div className="card stat-tile">
              <strong className="when-value">{Math.round(report.totals.km)}</strong>
              <span>{t.usage.km}</span>
            </div>
          </div>

          {report.team && (
            <section className="stats">
              <h3 className="section-title">{t.usage.team}</h3>
              <div className="stat-grid usage-stats">
                {(
                  [
                    [report.team.seats_filled, t.usage.seatsFilled],
                    [Math.round(report.team.car_km_avoided), t.usage.carKm],
                    [Math.round(report.team.co2_kg), t.usage.co2],
                    [Math.round(report.team.fuel_l), t.usage.fuel],
                  ] as const
                ).map(([value, label]) => (
                  <div key={label} className="card stat-tile stat-tile-green">
                    <strong className="when-value">{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="usage-shape-row">
            <div className="segmented usage-shape" role="radiogroup" aria-label={t.usage.heatmap}>
              <SegThumb count={SHAPES.length} index={SHAPES.indexOf(shape)} />
              {SHAPES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={shape === s} className={shape === s ? 'seg seg-on' : 'seg'} onClick={() => setShape(s)}>
                  {s === 'days' ? t.usage.byDay : t.usage.byHour}
                </button>
              ))}
            </div>
            <Legend />
          </div>

          {active.length === 0 ? (
            <p className="hint">{t.usage.noUsage}</p>
          ) : (
            <ul className="usage-list">
              {active.map((row) => (
                <li key={row.car.id} className={row.car.active ? 'card usage-car' : 'card usage-car usage-car-retired'}>
                  <div className="usage-car-head">
                    <span className="admin-car-icon" aria-hidden="true">
                      <CarGlyph carName={row.car.name} size={16} />
                    </span>
                    <span className="admin-row-text">
                      <strong>
                        {row.car.name}
                        <PowertrainMark carName={row.car.name} />
                        {!row.car.active && <span className="tag">{t.usage.retired}</span>}
                      </strong>
                      <span>
                        <span className="mono">{row.car.plate}</span>
                      </span>
                    </span>
                    <span className="usage-rate when-value" title={t.usage.useRateHint(report.working_days)}>
                      {pct(row.use_rate)}
                    </span>
                  </div>
                  {shape === 'days' ? <DayHeat row={row} from={report.from} to={report.to} /> : <HourHeat row={row} counts={counts} />}
                  <p className="usage-sum">{t.usage.summary(row.rides, row.days_used, row.drivers, Math.round(row.km), row.upcoming)}</p>
                </li>
              ))}
            </ul>
          )}

          {report.totals.rides > 0 && (
            <button type="button" className="btn btn-soft btn-block" disabled={downloading} onClick={() => void exportSheet()}>
              <DownloadIcon size={18} /> {t.usage.download}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function Legend() {
  const t = useT()
  return (
    <span className="heat-legend" aria-hidden="true">
      {t.usage.less}
      {([0, 1, 2, 3, 4] as HeatLevel[]).map((l) => (
        <span key={l} className={`heat-cell heat-${l}`} />
      ))}
      {t.usage.more}
    </span>
  )
}

/** The calendar: a column per week, a row per weekday, a cell per day in the hours it was out. */
function DayHeat({ row, from, to }: { row: CarUsageRow; from: string; to: string }) {
  const t = useT()
  const weeks = dayColumns(from, to, row.per_day)
  const labels = monthStarts(weeks)
  const names = weekdayNames('narrow')
  return (
    <div className="heat-scroll">
      <div className={weeks.length > 26 ? 'heat heat-days heat-dense' : 'heat heat-days'} style={{ ['--cols' as string]: weeks.length }} role="img" aria-label={t.usage.dayHeatLabel(row.car.name, row.days_used)}>
        <span className="heat-corner" />
        <div className="heat-months">
          {labels.map((m) => (
            <span key={m.iso} style={{ gridColumn: m.index + 1 }}>
              {parseISODate(m.iso).toLocaleDateString(intlTag(), { month: 'short' })}
            </span>
          ))}
        </div>
        <div className="heat-weekdays">
          {names.map((n, i) => (
            <span key={i}>{i % 2 === 0 ? n : ''}</span>
          ))}
        </div>
        <div className="heat-grid">
          {weeks.map((week) =>
            week.map((c) =>
              c.out ? (
                <span key={c.iso} className="heat-cell heat-out" />
              ) : (
                <span key={c.iso} className={`heat-cell heat-${dayLevel(c.hours)}`} title={t.usage.dayCell(fmtShortDate(c.iso), hoursText(c.hours))} />
              ),
            ),
          )}
        </div>
      </div>
    </div>
  )
}

/** The week by hour: a row per weekday, a cell per hour, as a share of those weekdays in the window. */
function HourHeat({ row, counts }: { row: CarUsageRow; counts: number[] }) {
  const t = useT()
  const names = weekdayNames('short')
  return (
    <div className="heat-scroll">
      <div className="heat heat-hours" role="img" aria-label={t.usage.hourHeatLabel(row.car.name)}>
        <span className="heat-corner" />
        <div className="heat-months">
          {[0, 6, 12, 18].map((h) => (
            <span key={h} style={{ gridColumn: h + 1 }}>
              {fmtHour(h)}
            </span>
          ))}
        </div>
        <div className="heat-weekdays">
          {names.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <div className="heat-grid">
          {row.by_hour.map((hours, d) =>
            hours.map((n, h) => (
              <span
                key={`${d}-${h}`}
                className={`heat-cell heat-${shareLevel(counts[d] ? n / counts[d] : 0)}`}
                style={{ gridRow: d + 1, gridColumn: h + 1 }}
                title={t.usage.hourCell(names[d], fmtHour(h), n, counts[d] ?? 0)}
              />
            )),
          )}
        </div>
      </div>
    </div>
  )
}
