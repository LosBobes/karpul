import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { fmtHour, fmtTime } from '../lib/dates'
import { DAY_AXIS, fromMinutes, scrollToCentre, visibleSpan, type Gap, type PlanRow } from '../lib/dayPlan'
import { useT } from '../lib/i18n'
import { drives, seatedIn, useMe } from '../lib/me'
import { avatarTone } from '../lib/tone'

interface Props {
  pool: PlanRow[]
  own: PlanRow[]
  /** Minutes since midnight, when the day is today. */
  now: number | null
  /** The timeline's sideways scroller, which this strip reads and steers. */
  scroller: RefObject<HTMLDivElement | null>
}

const axis = DAY_AXIS
const pct = (min: number) => `${((min - axis.from) / (axis.to - axis.from)) * 100}%`
const LABELS = [0, 6, 12, 18]

/** Where 00:00 sits in the scroller's content and how wide the day is drawn, read off the hour scale. */
function measure(el: HTMLDivElement) {
  const scale = el.querySelector<HTMLElement>('.plan-hours')
  if (!scale) return null
  const start = scale.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft
  return { start, span: scale.offsetWidth }
}

/**
 * The whole day at once, above a timeline too wide for its screen: every car's
 * road squeezed into one thin lane with its rides on it in the drivers'
 * colours, and a green frame around the hours the board below is showing. A
 * tap moves the board there and a drag pans it, so on a phone the day reads
 * at a glance and the detail is one touch away. Only drawn while the board
 * actually scrolls; a screen that fits the day needs no map of it.
 */
export function PlanOverview({ pool, own, now, scroller }: Props) {
  const t = useT()
  const me = useMe()
  const strip = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [view, setView] = useState<Gap | null>(null)

  // Follow the board: its scroll, and anything that changes how wide it is.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const read = () => {
      const m = measure(el)
      if (!m || el.scrollWidth <= el.clientWidth + 2) return setView(null)
      setView(visibleSpan(el.scrollLeft, el.clientWidth, m.start, m.span))
    }
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = new ResizeObserver(read)
    ro.observe(el)
    const track = el.firstElementChild
    if (track) ro.observe(track)
    return () => {
      el.removeEventListener('scroll', read)
      ro.disconnect()
    }
  }, [scroller])

  if (!view) return null

  const centreOn = (min: number, smooth: boolean) => {
    const el = scroller.current
    const m = el && measure(el)
    if (!el || !m) return
    el.scrollTo({ left: scrollToCentre(min, el.clientWidth, m.start, m.span), behavior: smooth ? 'smooth' : 'auto' })
  }
  const minuteAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = strip.current?.getBoundingClientRect()
    if (!box) return null
    return axis.from + Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1) * (axis.to - axis.from)
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const min = minuteAt(e)
    if (min === null) return
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    centreOn(min, true)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const min = minuteAt(e)
    if (min !== null) centreOn(min, false)
  }
  const up = () => {
    dragging.current = false
  }
  const centre = (view.start + view.end) / 2
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -60, ArrowRight: 60, PageUp: -180, PageDown: 180 }[e.key]
    if (step !== undefined) centreOn(centre + step, true)
    else if (e.key === 'Home') centreOn(axis.from, true)
    else if (e.key === 'End') centreOn(axis.to, true)
    else return
    e.preventDefault()
  }

  const rows = [...pool, ...own]
  return (
    <div
      className="plan-overview"
      role="slider"
      tabIndex={0}
      aria-label={t.plan.overview}
      aria-valuemin={axis.from}
      aria-valuemax={axis.to}
      aria-valuenow={Math.round(centre)}
      aria-valuetext={`${fmtTime(fromMinutes(view.start))}–${fmtTime(fromMinutes(view.end))}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    >
      <div className="plan-ov-lanes" ref={strip} style={{ '--lanes': rows.length } as CSSProperties}>
        {now !== null && <span className="plan-ov-past" style={{ width: pct(now) }} />}
        {rows.map((row, i) => (
          <div key={row.key} className={i === pool.length && i > 0 ? 'plan-ov-lane plan-ov-lane-own' : 'plan-ov-lane'}>
            {row.bars.map((b) => {
              const mine = drives(b.ride, me) || seatedIn(b.ride, me)
              const cls = ['plan-ov-bar', `tone-${mine ? 'green' : avatarTone(b.ride.driver_name)}`, mine && 'plan-ov-mine', b.ride.approval === 'pending' && 'plan-ov-pending']
                .filter(Boolean)
                .join(' ')
              return <span key={b.ride.id} className={cls} style={{ left: pct(b.start), width: pct(Math.min(b.end, axis.to) - b.start + axis.from) }} />
            })}
          </div>
        ))}
        {now !== null && <span className="plan-ov-now" style={{ left: pct(now) }} />}
        <span className="plan-ov-window" style={{ left: pct(view.start), width: pct(view.end - view.start + axis.from) }} />
      </div>
      <div className="plan-ov-hours" aria-hidden="true">
        {LABELS.map((h) => (
          <span key={h} style={{ left: pct(h * 60) }}>
            {fmtHour(h)}
          </span>
        ))}
      </div>
    </div>
  )
}
