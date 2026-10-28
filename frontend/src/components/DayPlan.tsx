import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { addDays, firstName, fmtDayDate, fmtDayLabel, fmtHour, fmtTime, parseISODate, shortCarName, toISODate, todayISO } from '../lib/dates'
import {
  captionRoom,
  DAY_AXIS,
  fromMinutes,
  planRows,
  rowStatus,
  slotTimes,
  toMinutes,
  type Axis,
  type Bar,
  type Gap,
  type PlanRow,
} from '../lib/dayPlan'
import { useT } from '../lib/i18n'
import { useWide } from '../lib/useWide'
import { drives, runs, seatedIn, useMe } from '../lib/me'
import type { CorporateCar, Ride } from '../lib/types'
import { avatarTone } from '../lib/tone'
import { Avatar } from './Avatar'
import { PowertrainMark } from './CarArt'
import { DatePicker } from './DatePicker'
import { DayClock } from './DayClock'
import { PlanOverview } from './PlanOverview'
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, PencilIcon, TimelineIcon } from './icons'
import { SegThumb } from './Segmented'

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
  /** The active pool; every car gets a road, booked or not. */
  cars: CorporateCar[]
  loading: boolean
  isPast: boolean
  /** The ride whose card shows beside or under the plan. */
  selectedId: number | null
  onSelect: (rideId: number) => void
  onDate: (iso: string) => void
  onBook: (slot: Slot) => void
  /** Open the ride form on a ride you run (yours, or anyone's for an admin). */
  onEdit: (ride: Ride) => void
}

/** The minute on the clock, re-read every half minute so the "now" mark moves. */
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

type Shape = 'clock' | 'timeline'
const SHAPES: Shape[] = ['clock', 'timeline']
/** The day as a clock or as roads across the hours, remembered per browser. */
const SHAPE_KEY = 'karpul.planShape'

function loadShape(): Shape | null {
  try {
    const v = localStorage.getItem(SHAPE_KEY)
    return v === 'clock' || v === 'timeline' ? v : null
  } catch {
    return null
  }
}

const at = (min: number, axis: Axis) => `${((min - axis.from) / (axis.to - axis.from)) * 100}%`
const len = (minutes: number, axis: Axis) => `${(minutes / (axis.to - axis.from)) * 100}%`

/** The minute under the pointer within a free stretch's button. */
function minuteAt(gap: Gap, e: { clientX: number; currentTarget: Element }): number {
  const box = e.currentTarget.getBoundingClientRect()
  return gap.start + ((e.clientX - box.left) / box.width) * (gap.end - gap.start)
}

/**
 * One day, one road per car. Each company car in the pool is a thin road
 * across the hours, free ones included (a free car is what someone scheduling
 * is looking for), and then each own car going that day. A ride is a stretch
 * of its car's road in the driver's own colour (the colour of their avatar,
 * green when it is you), starting at the driver's avatar where they leave and
 * ending in a dot where they are back, the way a ride's route is drawn on its
 * card. A ride with no return holds the car to the end of the day, so its
 * stretch runs off the edge. A free stretch of a company car books it: under
 * a mouse a pin follows the pointer to say from when, a tap opens the ride
 * form there with the car and the times filled in. A ride you run (yours, or
 * any ride for an admin) is edited from the plan too: picked, it grows a
 * pencil at its end, and a double click goes straight to the form.
 */
export function DayPlan({ date, rides, cars, loading, isPast, selectedId, onSelect, onDate, onBook, onEdit }: Props) {
  const t = useT()
  const me = useMe()
  const today = todayISO()
  const isToday = date === today
  const now = useNowMinutes(isToday)
  // The pin under the pointer, per road. A road keeps its last pin once the
  // pointer leaves (`on` false), so the pin pops out where it was.
  const [pins, setPins] = useState<Record<string, { min: number; on: boolean }>>({})
  const pinOff = (key: string) => setPins((p) => (p[key]?.on ? { ...p, [key]: { ...p[key], on: false } } : p))
  // A wide screen has a square to spare, so the day opens as a clock there;
  // a phone keeps the roads, which scroll sideways under a thumb.
  const wide = useWide()
  const [chosen, setChosen] = useState<Shape | null>(loadShape)
  const shape: Shape = chosen ?? (wide ? 'clock' : 'timeline')
  const pickShape = (next: Shape) => {
    setChosen(next)
    try {
      localStorage.setItem(SHAPE_KEY, next)
    } catch {
      // Not remembered, still switched.
    }
  }
  const axis = DAY_AXIS
  // Today the time already gone is not offered: booking starts at the next half hour.
  const { pool, own } = planRows(rides, cars, axis, isToday ? Math.ceil(now / 30) * 30 : 0)
  const hours: number[] = []
  for (let h = axis.from; h <= axis.to; h += 60) hours.push(h)
  const step = (n: number) => onDate(toISODate(addDays(parseISODate(date), n)))
  const showNow = isToday && now >= axis.from && now <= axis.to
  const nearNow = (h: number) => showNow && Math.abs(h - now) < 25
  const style = { '--plan-hours': (axis.to - axis.from) / 60 } as CSSProperties
  const empty = pool.length === 0 && own.length === 0

  // The whole day does not fit a phone, so the board scrolls sideways. A day
  // opens on the hour that matters: now today, else the first ride, else 07:00.
  const scroller = useRef<HTMLDivElement>(null)
  const placed = useRef('')
  const firstDeparture = rides.length ? Math.min(...rides.map((r) => toMinutes(r.departure_time))) : 7 * 60
  const focus = isToday ? now : firstDeparture
  useLayoutEffect(() => {
    const el = scroller.current
    const scale = el?.querySelector<HTMLElement>('.plan-hours')
    // Only when the day or the board itself changes, never under the reader's finger.
    const key = `${date}|${loading}|${empty}|${shape}`
    // No board on screen (the clock, a skeleton): forget the place, so the
    // timeline mounting again opens on the focus rather than at 00:00.
    if (!el || !scale) {
      placed.current = ''
      return
    }
    if (placed.current === key) return
    placed.current = key
    // The hour before the focus lands at the left edge, just inside the board's padding.
    el.scrollLeft = ((Math.max(focus - 60, DAY_AXIS.from) - DAY_AXIS.from) / (DAY_AXIS.to - DAY_AXIS.from)) * scale.offsetWidth
  }, [date, loading, empty, focus, shape])

  const bookAt = (row: PlanRow, gap: Gap, min: number | null) => {
    if (!row.car) return
    const { departure, ret } = slotTimes(gap, min, axis)
    pinOff(row.key)
    onBook({ date, carId: row.car.id, departure: fromMinutes(departure), ret: fromMinutes(ret) })
  }
  // A keyboard press has no point on the road: it books from the start of the stretch.
  const book = (row: PlanRow, gap: Gap, e: MouseEvent<HTMLButtonElement>) => bookAt(row, gap, e.detail > 0 ? minuteAt(gap, e) : null)
  const hover = (row: PlanRow, gap: Gap, e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse') return
    const min = slotTimes(gap, minuteAt(gap, e), axis).departure
    setPins((p) => (p[row.key]?.on && p[row.key].min === min ? p : { ...p, [row.key]: { min, on: true } }))
  }

  const status = (row: PlanRow): string | null => {
    if (!row.car) return row.bars[0] ? firstName(row.bars[0].ride.driver_name) : null
    if (isPast) return null
    const s = rowStatus(row, axis)
    switch (s.kind) {
      case 'freeAllDay':
        return t.plan.freeAllDay
      case 'booked':
        return t.plan.booked
      case 'freeFrom':
        return t.plan.freeFrom(fmtTime(fromMinutes(s.at)))
      case 'freeBetween':
        return t.plan.freeBetween(fmtTime(fromMinutes(s.from)), fmtTime(fromMinutes(s.to)))
    }
  }

  const stretch = (row: PlanRow, b: Bar, i: number) => {
    const r = b.ride
    const driving = drives(r, me)
    const mine = driving || seatedIn(r, me)
    const end = Math.min(b.end, axis.to)
    const when = b.open ? t.plan.from(fmtTime(r.departure_time)) : `${fmtTime(r.departure_time)}–${fmtTime(r.return_time)}`
    // The caption may run past a short stretch, up to where the next one starts.
    const room = captionRoom(row.bars, i, axis) / Math.max(end - b.start, 1)
    const editable = !isPast && runs(r, me)
    const picked = r.id === selectedId
    const cls = ['plan-ride', `tone-${mine ? 'green' : avatarTone(r.driver_name)}`, mine && 'plan-ride-mine', r.approval === 'pending' && 'plan-ride-pending', b.open && 'plan-ride-open', r.id === selectedId && 'plan-ride-on']
      .filter(Boolean)
      .join(' ')
    return [
      <button
        key={r.id}
        type="button"
        className={cls}
        style={{ left: at(b.start, axis), width: len(end - b.start, axis), '--room': `${room * 100}%` } as CSSProperties}
        aria-label={t.plan.barLabel(r.driver_name, when, r.origin, r.destination, r.bookings.length)}
        aria-pressed={r.id === selectedId}
        onClick={() => onSelect(r.id)}
        onDoubleClick={editable ? () => onEdit(r) : undefined}
      >
        <span className="plan-ride-line" />
        <Avatar name={r.driver_name} size="sm" />
        <span className="plan-ride-caption">
          <strong>{driving ? t.plan.you : firstName(r.driver_name)}</strong> {when}
        </span>
      </button>,
      editable && picked && (
        <button
          key={`edit-${r.id}`}
          type="button"
          className={b.open || end >= axis.to ? 'plan-edit plan-edit-edge' : 'plan-edit'}
          style={{ left: at(end, axis) }}
          aria-label={t.plan.edit(r.driver_name)}
          title={t.plan.edit(r.driver_name)}
          onClick={() => onEdit(r)}
        >
          <PencilIcon size={17} weight="bold" />
        </button>
      ),
    ]
  }

  const road = (row: PlanRow) => {
    const shown = pins[row.key]
    const pin = shown?.on ? shown.min : null
    const free = row.car !== null && row.bars.length === 0 && !isPast
    // A company car's hour ticks are real marks: the ones on a free stretch
    // belong to its button and light up under the pointer, the rest just stand.
    const bookable = row.car !== null && !isPast
    const inGap = (h: number) => row.gaps.find((g) => h >= g.start && h <= g.end)
    const tick = (h: number, left: string, gap: boolean) => {
      // How far (in hours) from the pointer: the wave reaches the near ticks first.
      const d = pin === null ? 0 : Math.abs(h - pin) / 60
      const cls = gap && pin !== null && d <= 0.5 ? 'plan-tick plan-tick-near' : 'plan-tick'
      return <span key={h} className={cls} style={{ left, '--d': d } as CSSProperties} aria-hidden="true" />
    }
    return (
      <div key={row.key} className="plan-car">
        <div className="plan-car-head">
          <span className="plan-car-name">
            <span>{shortCarName(row.label)}</span>
            <PowertrainMark carName={row.label} />
          </span>
          {row.car && <span className="plan-plate">{row.car.plate}</span>}
          <span className={free ? 'plan-status plan-status-free' : 'plan-status'}>{status(row)}</span>
        </div>
        <div className={['plan-road', !row.bars.length && 'plan-road-empty', bookable && 'plan-road-ticks'].filter(Boolean).join(' ')}>
          {bookable && hours.filter((h) => !inGap(h)).map((h) => tick(h, at(h, axis), false))}
          {!isPast &&
            row.gaps.map((g) => (
              <button
                key={`gap-${g.start}`}
                type="button"
                className="plan-free"
                style={{ left: at(g.start, axis), width: len(g.end - g.start, axis) }}
                aria-label={t.plan.book(shortCarName(row.label), fmtTime(fromMinutes(g.start)), fmtTime(fromMinutes(g.end)))}
                onClick={(e) => book(row, g, e)}
                onPointerMove={(e) => hover(row, g, e)}
                onPointerLeave={() => pinOff(row.key)}
              >
                {hours.filter((h) => inGap(h) === g).map((h) => tick(h, `${((h - g.start) / (g.end - g.start)) * 100}%`, true))}
              </button>
            ))}
          {row.bars.map((b, i) => stretch(row, b, i))}
          {shown && (
            <span className={shown.on ? 'plan-pin plan-pin-on' : 'plan-pin'} style={{ left: at(shown.min, axis) }} aria-hidden="true">
              <span className="plan-pin-label">{t.plan.pin(fmtTime(fromMinutes(shown.min)))}</span>
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="plan" aria-label={t.plan.label}>
      <div className="dates-head">
        <DatePicker variant="title" label={t.dates.jumpToDate} value={date} onChange={onDate} linkText={`${fmtDayLabel(date)}, ${fmtDayDate(date)}`} />
        <div className="week-nav" role="group" aria-label={t.plan.label}>
          <div className="segmented plan-shape" role="radiogroup" aria-label={t.plan.shape}>
            <SegThumb count={SHAPES.length} index={SHAPES.indexOf(shape)} />
            {SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={shape === s}
                aria-label={t.plan[s]}
                title={t.plan[s]}
                className={shape === s ? 'seg seg-on' : 'seg'}
                onClick={() => pickShape(s)}
              >
                {s === 'clock' ? <ClockIcon size={16} /> : <TimelineIcon size={16} />}
              </button>
            ))}
          </div>
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
        <div className="card plan-board skeleton plan-skeleton" aria-busy="true" />
      ) : empty ? (
        <div className="card empty-card empty-card-short">
          <strong>{isPast ? t.empty.noRidesWent : t.empty.noRidesDay}</strong>
        </div>
      ) : shape === 'clock' ? (
        <div className="card plan-board plan-board-clock">
          <DayClock
            date={date}
            pool={pool}
            own={own}
            isPast={isPast}
            isToday={isToday}
            now={now}
            selectedId={selectedId}
            status={status}
            onSelect={onSelect}
            onBook={bookAt}
            onEdit={onEdit}
          />
        </div>
      ) : (
        <div className="card plan-board" style={style}>
          <PlanOverview pool={pool} own={own} now={showNow ? now : null} scroller={scroller} />
          <div className="plan-scroll" ref={scroller}>
            <div className="plan-track">
              {/* The clock face: the hours across the top, and now as an ink rule
                  down through every road. Both sit on the same inset as the roads. */}
              <div className="plan-scale" aria-hidden="true">
                <div className="plan-hours">
                  {hours.map((h) =>
                    h < axis.to && !nearNow(h) ? (
                      <span key={h} style={{ left: at(h, axis) }}>
                        {fmtHour(h / 60)}
                      </span>
                    ) : null,
                  )}
                  {showNow && (
                    <span className="plan-now-time" style={{ left: at(now, axis) }}>
                      {fmtTime(fromMinutes(now))}
                    </span>
                  )}
                </div>
                {showNow && <span className="plan-now" style={{ left: at(now, axis) }} />}
              </div>
              {pool.length > 0 && <div className="plan-group">{pool.map(road)}</div>}
              {own.length > 0 && (
                <div className="plan-group">
                  <h3 className="plan-group-title">{t.plan.ownCars}</h3>
                  {own.map(road)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
