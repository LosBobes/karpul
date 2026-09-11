import { useRef, type CSSProperties, type TouchEvent } from 'react'
import { addDays, fmtWeekRange, fmtWeekday, parseISODate, startOfWeek, toISODate, todayISO } from '../lib/dates'
import { useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import { slideClass, useSlideDir } from '../lib/motion'
import type { Ride } from '../lib/types'
import { DatePicker } from './DatePicker'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

interface Props {
  selected: string
  rides: Ride[]
  onSelect: (iso: string) => void
}

/** A horizontal flick at least this long (and mostly sideways) changes the week. */
const SWIPE_PX = 48

/**
 * The date picker at the top: the seven days of the loaded week as pills that
 * always fit the width, so nothing is hidden off-screen. The arrows sit next
 * to the week label below, because that is what they move; a sideways swipe
 * on the pills does the same. A dot under a day means at least one car is
 * going that day. The green pill is one element that slides to the tapped
 * day; a week step slides the whole strip in from the side the week came from.
 */
export function DateCarousel({ selected, rides, onSelect }: Props) {
  const t = useT()
  const today = todayISO()
  const monday = startOfWeek(parseISODate(selected))
  const mondayISO = toISODate(monday)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const withRides = new Set(rides.map((r) => r.ride_date))
  const stepWeek = (n: number) => onSelect(toISODate(addDays(monday, 7 * n)))
  const weekDir = useSlideDir(mondayISO, (iso) => parseISODate(iso).getTime())
  const selectedIndex = days.findIndex((d) => toISODate(d) === selected)

  // Touch swipe on the strip. The handlers never preventDefault, so a vertical
  // drag still scrolls the page as usual.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touch.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current
    const t = e.changedTouches[0]
    touch.current = null
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) stepWeek(dx < 0 ? 1 : -1)
  }

  return (
    <section className="dates" aria-label={t.dates.pickDay}>
      <div
        key={mondayISO}
        className={['dates-strip', slideClass(weekDir)].filter(Boolean).join(' ')}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => (touch.current = null)}
      >
        <span className="date-thumb" aria-hidden="true" style={{ '--date-i': selectedIndex } as CSSProperties} />
        {days.map((d) => {
          const iso = toISODate(d)
          const cls = [
            'date',
            iso === selected && 'date-selected',
            iso === today && 'date-today',
            iso < today && 'date-past',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={iso}
              type="button"
              className={cls}
              aria-pressed={iso === selected}
              aria-label={d.toLocaleDateString(intlTag(), { weekday: 'long', day: 'numeric', month: 'long' })}
              onClick={() => onSelect(iso)}
            >
              <span className="date-wd">{fmtWeekday(d)}</span>
              <span className="date-md">{d.getDate()}</span>
              <span className={withRides.has(iso) ? 'date-dot' : 'date-dot date-dot-off'} aria-hidden="true" />
            </button>
          )
        })}
      </div>
      <div className="dates-foot">
        <div className="week-nav" role="group" aria-label={t.dates.week}>
          <button type="button" className="week-btn" aria-label={t.dates.prevWeek} onClick={() => stepWeek(-1)}>
            <ChevronLeftIcon size={18} />
          </button>
          <span className="dates-week">{fmtWeekRange(monday)}</span>
          <button type="button" className="week-btn" aria-label={t.dates.nextWeek} onClick={() => stepWeek(1)}>
            <ChevronRightIcon size={18} />
          </button>
        </div>
        <span className="dates-tools">
          {selected !== today && (
            <button type="button" className="link" onClick={() => onSelect(today)}>
              {t.common.today}
            </button>
          )}
          <DatePicker variant="link" label={t.dates.jumpToDate} value={selected} onChange={onSelect} />
        </span>
      </div>
    </section>
  )
}
