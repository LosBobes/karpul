import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import { addDays, firstName, fmtDayDate, fmtDayLabel, fmtHour, fmtTime, parseISODate, shortCarName, toISODate, todayISO } from '../lib/dates'
import { dayAxis, fromMinutes, planRows, slotTimes, type Axis, type Bar, type Gap, type PlanRow } from '../lib/dayPlan'
import { useT } from '../lib/i18n'
import { drives, seatedIn, useMe } from '../lib/me'
import type { CorporateCar, Ride } from '../lib/types'
import { PowertrainMark } from './CarArt'
import { DatePicker } from './DatePicker'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from './icons'

/** A free stretch of a company car, tapped: the ride form opens on it. */
export interface Slot {
  date: string
  carId: number
  departure: string
  ret: string
}

interface Props {
  date: string
  /** The rides that day, in the API's order. */
  rides: Ride[]
  /** The active pool; every car gets a row, booked or not. */
  cars: CorporateCar[]
  loading: boolean
  isPast: boolean
  /** The ride whose card shows beside or under the plan. */
  selectedId: number | null
  onSelect: (rideId: number) => void
  onDate: (iso: string) => void
  onBook: (slot: Slot) => void
}

/** The minute on the clock, re-read every half minute so the "now" line moves. */
function useNowMinutes(on: boolean): number {
  const read = () => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }
  const [now, setNow] = useState(read)
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => setNow(read()), 30_000)
    return () => clearInterval(id)
  }, [on])
  return now
}

const pct = (min: number, axis: Axis) => `${((min - axis.from) / (axis.to - axis.from)) * 100}%`
const len = (minutes: number, axis: Axis) => `${(minutes / (axis.to - axis.from)) * 100}%`

/**
 * One day as a timeline: a row per company car (every one in the pool, so a
 * free car shows as free) and then a row per own car going, with a bar from
 * departure to return for each ride, labelled with who drives. A ride with no
 * return holds the car to the end of the day, and its bar runs off the edge.
 * The free stretches of a company car are buttons: a tap books the car from
 * that point (the ride form opens with the car and the times filled in).
 */
export function DayPlan({ date, rides, cars, loading, isPast, selectedId, onSelect, onDate, onBook }: Props) {
  const t = useT()
  const me = useMe()
  const today = todayISO()
  const isToday = date === today
  const now = useNowMinutes(isToday)
  const axis = dayAxis(rides)
  // Today the stretches already gone are not offered: booking starts at the next half hour.
  const { pool, own } = planRows(rides, cars, axis, isToday ? Math.ceil(now / 30) * 30 : 0)
  const hours: number[] = []
  for (let h = axis.from; h <= axis.to; h += 60) hours.push(h)
  // Every hour gets a line; a long day labels every other one so the labels fit a phone.
  const labelEvery = hours.length > 14 ? 2 : 1
  const step = (n: number) => onDate(toISODate(addDays(parseISODate(date), n)))
  const showNow = isToday && now >= axis.from && now <= axis.to
  // An hour label the "now" pill would sit on is left out.
  const nearNow = (h: number) => showNow && Math.abs(h - now) < (axis.to - axis.from) / 24
  const style = { '--plan-hours': (axis.to - axis.from) / 60 } as CSSProperties

  const book = (row: PlanRow, gap: Gap, e: MouseEvent<HTMLButtonElement>) => {
    if (!row.car) return
    // A keyboard press has no point on the bar: it books from the start of the stretch.
    let at: number | null = null
    if (e.detail > 0) {
      const box = e.currentTarget.getBoundingClientRect()
      at = gap.start + ((e.clientX - box.left) / box.width) * (gap.end - gap.start)
    }
    const { departure, ret } = slotTimes(gap, at, axis)
    onBook({ date, carId: row.car.id, departure: fromMinutes(departure), ret: fromMinutes(ret) })
  }

  const bar = (b: Bar) => {
    const r = b.ride
    const mine = drives(r, me) || seatedIn(r, me)
    const end = Math.min(b.end, axis.to)
    const when = b.open ? t.plan.from(fmtTime(r.departure_time)) : `${fmtTime(r.departure_time)}–${fmtTime(r.return_time)}`
    const cls = ['plan-bar', mine && 'plan-bar-mine', b.open && 'plan-bar-open', r.id === selectedId && 'plan-bar-on']
      .filter(Boolean)
      .join(' ')
    return (
      <button
        key={r.id}
        type="button"
        className={cls}
        style={{ left: pct(b.start, axis), width: len(end - b.start, axis) }}
        aria-label={t.plan.barLabel(r.driver_name, when, r.origin, r.destination, r.bookings.length)}
        aria-pressed={r.id === selectedId}
        title={`${r.driver_name} · ${when} · ${r.origin} → ${r.destination}`}
        onClick={() => onSelect(r.id)}
      >
        <span className="plan-bar-name">{firstName(r.driver_name)}</span>
        <span className="plan-bar-time">{when}</span>
      </button>
    )
  }

  const row = (row: PlanRow) => (
    <div key={row.key} className={row.bars.length ? 'plan-row' : 'plan-row plan-row-free'}>
      <div className="plan-label">
        <span className="plan-car">
          <span className="plan-car-name">
            <span className="plan-car-text">{shortCarName(row.label)}</span>
            <PowertrainMark carName={row.label} />
          </span>
          {row.car ? <small>{row.car.plate}</small> : row.bars[0] && <small>{firstName(row.bars[0].ride.driver_name)}</small>}
        </span>
      </div>
      <div className="plan-track">
        {!isPast &&
          row.gaps.map((g) => (
            <button
              key={`gap-${g.start}`}
              type="button"
              className="plan-free"
              style={{ left: pct(g.start, axis), width: len(g.end - g.start, axis) }}
              aria-label={t.plan.book(shortCarName(row.label), fmtTime(fromMinutes(g.start)), fmtTime(fromMinutes(g.end)))}
              onClick={(e) => book(row, g, e)}
            >
              <PlusIcon size={14} />
            </button>
          ))}
        {row.bars.map(bar)}
        {showNow && <span className="plan-now" style={{ left: pct(now, axis) }} aria-hidden="true" />}
      </div>
    </div>
  )

  const free = pool.filter((r) => r.bars.length === 0).length

  return (
    <section className="plan" aria-label={t.plan.label}>
      <div className="dates-head">
        <DatePicker variant="title" label={t.dates.jumpToDate} value={date} onChange={onDate} linkText={`${fmtDayLabel(date)}, ${fmtDayDate(date)}`} />
        <div className="week-nav" role="group" aria-label={t.plan.label}>
          {!isToday && (
            <button type="button" className="today-chip" onClick={() => onDate(today)}>
              {t.common.today}
            </button>
          )}
          <button type="button" className="week-btn" aria-label={t.plan.prevDay} onClick={() => step(-1)}>
            <ChevronLeftIcon size={18} />
          </button>
          <button type="button" className="week-btn" aria-label={t.plan.nextDay} onClick={() => step(1)}>
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card plan-card skeleton plan-skeleton" aria-busy="true" />
      ) : pool.length === 0 && own.length === 0 ? (
        <div className="card empty-card empty-card-short">
          <strong>{isPast ? t.empty.noRidesWent : t.empty.noRidesDay}</strong>
          {!isPast && <span>{t.empty.usePlus}</span>}
        </div>
      ) : (
        <div className="card plan-card" style={style}>
          <div className="plan-row plan-axis" aria-hidden="true">
            <div className="plan-label" />
            <div className="plan-track">
              {hours.map((h, i) =>
                i % labelEvery === 0 && h < axis.to && !nearNow(h) ? (
                  <span key={h} className="plan-hour" style={{ left: pct(h, axis) }}>
                    {fmtHour(h / 60)}
                  </span>
                ) : null,
              )}
              {showNow && (
                <span className="plan-now-label" style={{ left: pct(now, axis) }}>
                  {fmtTime(fromMinutes(now))}
                </span>
              )}
            </div>
          </div>
          {pool.length > 0 && (
            <>
              <h3 className="plan-group">
                {t.plan.companyCars}
                <span className="section-meta">{t.plan.freeCars(free, pool.length)}</span>
              </h3>
              {pool.map(row)}
            </>
          )}
          {own.length > 0 && (
            <>
              <h3 className="plan-group">{t.plan.ownCars}</h3>
              {own.map(row)}
            </>
          )}
        </div>
      )}
      {!loading && !isPast && pool.length > 0 && <p className="plan-hint">{t.plan.hint}</p>}
    </section>
  )
}

