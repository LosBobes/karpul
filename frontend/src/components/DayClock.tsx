import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { firstName, fmtDayDate, fmtDayLabel, fmtHour, fmtTime, initials, shortCarName } from '../lib/dates'
import {
  arcPath,
  CENTER,
  innerEdge,
  minuteAtPoint,
  pointAt,
  R_OUT,
  ringLayout,
  sectorPath,
  SIZE,
  type Point,
} from '../lib/dayClock'
import { DAY_AXIS, DAY_END, fromMinutes, slotTimes, type Bar, type Gap, type PlanRow } from '../lib/dayPlan'
import { useT } from '../lib/i18n'
import { drives, runs, seatedIn, useMe } from '../lib/me'
import type { Ride } from '../lib/types'
import { avatarTone } from '../lib/tone'
import { Avatar } from './Avatar'
import { PowertrainMark } from './CarArt'
import { ArrowRightIcon, PencilIcon } from './icons'

interface Props {
  date: string
  pool: PlanRow[]
  own: PlanRow[]
  isPast: boolean
  isToday: boolean
  /** Minutes since midnight, for the hand. */
  now: number
  selectedId: number | null
  /** What each car is up to that day, as the timeline writes it beside the name. */
  status: (row: PlanRow) => string | null
  onSelect: (rideId: number) => void
  /** A free stretch was picked; `at` is the minute under the pointer, null from the keyboard. */
  onBook: (row: PlanRow, gap: Gap, at: number | null) => void
  onEdit: (ride: Ride) => void
}

/** What the middle of the dial is talking about. */
type Focus = { kind: 'ride'; ride: Ride } | { kind: 'slot'; row: PlanRow; min: number } | null

const MAIN_HOURS = new Set([0, 6, 12, 18])

/** Which ring a car is, in the legend: the dial in miniature with that ring drawn in. */
function RingMark({ index, count }: { index: number; count: number }) {
  const step = count > 1 ? 6 / (count - 1) : 0
  return (
    <svg className="clock-legend-mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} cx="10" cy="10" r={9 - i * step} className={i === index ? 'on' : undefined} />
      ))}
    </svg>
  )
}

/** A press of Enter or Space on an SVG shape acting as a button. */
function onKeyPress(fn: () => void) {
  return (e: KeyboardEvent<SVGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }
}

/**
 * The day plan as a 24-hour clock: midnight at the top, noon at the bottom, one
 * ring per car (the company cars outermost, where a ring is longest, then the
 * own cars going that day). A ride is an arc of its car's ring in the driver's
 * colour, from their initials where they leave to a dot where they are back;
 * yours is solid green. A free stretch of a company car is bookable straight
 * from the ring: under a mouse a pin follows the pointer round to the half
 * hour, and the middle of the dial says what a tap would book. The middle
 * otherwise shows the ride you are on (picked, or under the pointer), and
 * the time when there is nothing to show. It uses whatever square the screen
 * has, which a sideways timeline cannot: every hour of the day is on screen
 * at once.
 */
export function DayClock({ date, pool, own, isPast, isToday, now, selectedId, status, onSelect, onBook, onEdit }: Props) {
  const t = useT()
  const me = useMe()
  const uid = useId()
  const svg = useRef<SVGSVGElement>(null)
  const [hoverRide, setHoverRide] = useState<Ride | null>(null)
  const [slot, setSlot] = useState<{ row: PlanRow; min: number } | null>(null)
  const [hoverRow, setHoverRow] = useState<string | null>(null)

  const rows = [...pool, ...own]
  const rings = ringLayout(pool.length, own.length)
  const inner = innerEdge(rings)
  const showNow = isToday && !isPast

  /** The pointer in the dial's own units. */
  const toDial = (e: { clientX: number; clientY: number }): Point | null => {
    const m = svg.current?.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }
  const minuteUnder = (e: { clientX: number; clientY: number }) => {
    const p = toDial(e)
    return p ? minuteAtPoint(p) : null
  }

  const hoverGap = (row: PlanRow, gap: Gap, e: PointerEvent<SVGPathElement>) => {
    if (e.pointerType !== 'mouse') return
    const min = minuteUnder(e)
    if (min === null) return
    setSlot({ row, min: slotTimes(gap, min, DAY_AXIS).departure })
  }

  const focus: Focus = slot
    ? { kind: 'slot', ...slot }
    : hoverRide
      ? { kind: 'ride', ride: hoverRide }
      : selectedId !== null
        ? (() => {
            const ride = rows.flatMap((r) => r.bars).find((b) => b.ride.id === selectedId)?.ride
            return ride ? { kind: 'ride' as const, ride } : null
          })()
        : null

  const rideArc = (row: PlanRow, b: Bar, r: number, band: number) => {
    const ride = b.ride
    const driving = drives(ride, me)
    const mine = driving || seatedIn(ride, me)
    const picked = ride.id === selectedId
    const end = Math.min(b.end, DAY_END)
    const when = b.open ? t.plan.from(fmtTime(ride.departure_time)) : `${fmtTime(ride.departure_time)}–${fmtTime(ride.return_time)}`
    const width = band * 0.68
    const start = pointAt(r, b.start)
    const stop = pointAt(r, end)
    const editable = !isPast && runs(ride, me)
    const cls = [
      'clock-ride',
      `tone-${mine ? 'green' : avatarTone(ride.driver_name)}`,
      mine && 'clock-ride-mine',
      ride.approval === 'pending' && 'clock-ride-pending',
      picked && 'clock-ride-on',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <g
        key={ride.id}
        className={cls}
        role="button"
        tabIndex={0}
        aria-label={t.plan.barLabel(ride.driver_name, when, ride.origin, ride.destination, ride.bookings.length)}
        aria-pressed={picked}
        onClick={() => onSelect(ride.id)}
        onDoubleClick={editable ? () => onEdit(ride) : undefined}
        onKeyDown={onKeyPress(() => onSelect(ride.id))}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHoverRide(ride)}
        onPointerLeave={() => setHoverRide(null)}
      >
        <title>{`${row.label}: ${firstName(ride.driver_name)}, ${when}`}</title>
        <path className="clock-ride-edge" d={arcPath(r, b.start, end)} style={{ strokeWidth: width }} />
        <path className="clock-ride-fill" d={arcPath(r, b.start, end)} style={{ strokeWidth: Math.max(width - 5, 2) }} />
        {!b.open && <circle className="clock-ride-end" cx={stop.x} cy={stop.y} r={width * 0.17} />}
        <g className="clock-ride-face">
          <circle className="clock-ride-avatar" cx={start.x} cy={start.y} r={band * 0.46} />
          <text className="clock-ride-initials" x={start.x} y={start.y} style={{ fontSize: band * 0.34 }}>
            {initials(ride.driver_name)}
          </text>
        </g>
      </g>
    )
  }

  const ring = (row: PlanRow, i: number) => {
    const { r, band } = rings[i]
    const bookable = row.car !== null && !isPast
    const labelPath = `${uid}-label-${i}`
    const lit = hoverRow === row.key
    // A waiting ride holds no slot, so it is drawn under the free stretch: a
    // tap there books the car (as on the timeline); the others sit on top.
    const pending = row.bars.filter((b) => b.ride.approval === 'pending')
    const held = row.bars.filter((b) => b.ride.approval !== 'pending')
    return (
      <g
        key={row.key}
        className={lit ? 'clock-ring clock-ring-lit' : 'clock-ring'}
        onPointerEnter={() => setHoverRow(row.key)}
        onPointerLeave={() => setHoverRow(null)}
      >
        <circle className="clock-ring-band" cx={CENTER} cy={CENTER} r={r} style={{ strokeWidth: band - 2 }} />
        <circle className="clock-track" cx={CENTER} cy={CENTER} r={r} />
        <path id={labelPath} d={arcPath(r, DAY_END * 0.7, DAY_END - 8)} fill="none" stroke="none" />
        <text className="clock-ring-label" style={{ fontSize: Math.min(band * 0.36, 19) }} dy="0.35em">
          <textPath href={`#${labelPath}`} startOffset="100%" textAnchor="end">
            {shortCarName(row.label)}
          </textPath>
        </text>
        {pending.map((b) => rideArc(row, b, r, band))}
        {bookable &&
          row.gaps.map((g) => (
            <path
              key={`gap-${g.start}`}
              className="clock-free"
              d={arcPath(r, g.start, g.end)}
              style={{ strokeWidth: band * 0.9 }}
              role="button"
              tabIndex={0}
              aria-label={t.plan.book(shortCarName(row.label), fmtTime(fromMinutes(g.start)), fmtTime(fromMinutes(g.end)))}
              onClick={(e) => {
                setSlot(null)
                onBook(row, g, e.detail > 0 ? minuteUnder(e) : null)
              }}
              onKeyDown={onKeyPress(() => onBook(row, g, null))}
              onPointerMove={(e) => hoverGap(row, g, e)}
              onPointerLeave={() => setSlot(null)}
            />
          ))}
        {held.map((b) => rideArc(row, b, r, band))}
      </g>
    )
  }

  // Where a tap would book: a ring across the road at the half hour under the pointer.
  const pinRing = slot ? rings[rows.indexOf(slot.row)] : undefined
  const pin =
    slot && pinRing
      ? {
          ring: pinRing,
          at: pointAt(pinRing.r, slot.min),
          from: pointAt(pinRing.r - pinRing.band / 2, slot.min),
          to: pointAt(pinRing.r + pinRing.band / 2, slot.min),
        }
      : null
  const hand = (r: number) => pointAt(r, now)

  const readout = () => {
    if (focus?.kind === 'slot') {
      return (
        <>
          <span className="clock-readout-kicker">{shortCarName(focus.row.label)}</span>
          <strong className="clock-readout-big">{fmtTime(fromMinutes(focus.min))}</strong>
          <span className="clock-readout-line">{t.plan.pin(fmtTime(fromMinutes(focus.min)))}</span>
        </>
      )
    }
    if (focus?.kind === 'ride') {
      const r = focus.ride
      const editable = !isPast && runs(r, me) && r.id === selectedId
      return (
        <>
          <span className="clock-readout-who">
            <Avatar name={r.driver_name} size="sm" />
            {drives(r, me) ? t.plan.you : firstName(r.driver_name)}
          </span>
          <strong className="clock-readout-mid">
            {r.return_time ? `${fmtTime(r.departure_time)}–${fmtTime(r.return_time)}` : t.plan.from(fmtTime(r.departure_time))}
          </strong>
          <span className="clock-readout-route">
            {r.origin} <ArrowRightIcon size={12} /> {r.destination}
          </span>
          <span className="clock-readout-line">{shortCarName(r.car_name)}</span>
          {editable && (
            <button type="button" className="clock-readout-edit" onClick={() => onEdit(r)} aria-label={t.plan.edit(r.driver_name)}>
              <PencilIcon size={15} weight="bold" /> {t.common.edit}
            </button>
          )}
        </>
      )
    }
    return isToday ? (
      <>
        <span className="clock-readout-kicker">{t.common.today}</span>
        <strong className="clock-readout-big">{fmtTime(fromMinutes(now))}</strong>
        <span className="clock-readout-line">{fmtDayDate(date)}</span>
      </>
    ) : (
      <>
        <span className="clock-readout-kicker">{fmtDayLabel(date)}</span>
        <strong className="clock-readout-mid">{fmtDayDate(date)}</strong>
      </>
    )
  }

  return (
    <div className="clock">
      <div className="clock-dial" style={{ '--clock-inner': inner / SIZE } as CSSProperties}>
        <svg ref={svg} viewBox={`0 0 ${SIZE} ${SIZE}`} className="clock-svg" role="group" aria-label={t.plan.label}>
          <circle className="clock-face" cx={CENTER} cy={CENTER} r={R_OUT + 62} />
          {showNow && now > 0 && <path className="clock-past" d={sectorPath(inner, R_OUT, 0, now)} />}
          {Array.from({ length: 24 }, (_, h) => {
            const a = pointAt(inner - 6, h * 60)
            const b = pointAt(R_OUT + 8, h * 60)
            const l = pointAt(R_OUT + 36, h * 60)
            const main = MAIN_HOURS.has(h)
            return (
              <g key={h} aria-hidden="true">
                <line className={main ? 'clock-spoke clock-spoke-main' : 'clock-spoke'} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <text className={main ? 'clock-hour clock-hour-main' : 'clock-hour'} x={l.x} y={l.y}>
                  {main ? fmtHour(h) : h % 3 === 0 ? fmtHour(h) : String(h % 12 || 12)}
                </text>
              </g>
            )
          })}
          {rows.map(ring)}
          {showNow && (
            <g className="clock-now" aria-hidden="true">
              <line x1={hand(inner - 14).x} y1={hand(inner - 14).y} x2={hand(R_OUT + 12).x} y2={hand(R_OUT + 12).y} />
              <circle cx={hand(R_OUT + 12).x} cy={hand(R_OUT + 12).y} r={6} />
            </g>
          )}
          {pin && (
            <g className="clock-pin" aria-hidden="true">
              <circle cx={pin.at.x} cy={pin.at.y} r={pin.ring.band * 0.42} />
              <line x1={pin.from.x} y1={pin.from.y} x2={pin.to.x} y2={pin.to.y} />
            </g>
          )}
        </svg>
        <div className={focus ? 'clock-readout clock-readout-focus' : 'clock-readout'}>
          {readout()}
        </div>
      </div>

      <ul className="clock-legend" aria-label={t.plan.label}>
        {rows.flatMap((row, i) => {
          const s = status(row)
          const free = row.car !== null && row.bars.length === 0 && !isPast
          const head =
            i === pool.length && own.length > 0 ? (
              <li key="own" className="clock-legend-group" aria-hidden="true">
                {t.plan.ownCars}
              </li>
            ) : null
          return [
            head,
            <li
              key={row.key}
              className={hoverRow === row.key ? 'clock-legend-row clock-legend-lit' : 'clock-legend-row'}
              onPointerEnter={() => setHoverRow(row.key)}
              onPointerLeave={() => setHoverRow(null)}
            >
              <RingMark index={i} count={rows.length} />
              <span className="clock-legend-name">
                <span>{shortCarName(row.label)}</span>
                <PowertrainMark carName={row.label} />
                {row.car && <span className="plan-plate">{row.car.plate}</span>}
              </span>
              {s && <span className={free ? 'plan-status plan-status-free' : 'plan-status'}>{s}</span>}
            </li>,
          ]
        })}
      </ul>
    </div>
  )
}
