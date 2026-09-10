import { useEffect, useRef } from 'react'
import { addDays, fmtMonthDay, fmtWeekday, parseISODate, startOfWeek, toISODate, todayISO } from '../lib/dates'
import type { Ride } from '../lib/types'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

interface Props {
  selected: string
  rides: Ride[]
  onSelect: (iso: string) => void
}

/**
 * The horizontal date picker at the top: the seven days of the loaded week as
 * pills, the arrows stepping a week at a time. A dot under a day means at least
 * one car is going that day.
 */
export function DateCarousel({ selected, rides, onSelect }: Props) {
  const today = todayISO()
  const monday = startOfWeek(parseISODate(selected))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const withRides = new Set(rides.map((r) => r.ride_date))
  const strip = useRef<HTMLDivElement>(null)

  // Keep the chosen day in view when the strip is narrower than the week.
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [selected])

  const weekLabel = `${fmtMonthDay(monday)} – ${addDays(monday, 6).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`

  return (
    <section className="dates" aria-label="Pick a day">
      <div className="dates-row">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous week"
          onClick={() => onSelect(toISODate(addDays(monday, -7)))}
        >
          <ChevronLeftIcon />
        </button>
        <div ref={strip} className="dates-strip">
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
              <button key={iso} type="button" className={cls} aria-pressed={iso === selected} onClick={() => onSelect(iso)}>
                <span className="date-wd">{fmtWeekday(d)}</span>
                <span className="date-md">{fmtMonthDay(d)}</span>
                <span className={withRides.has(iso) ? 'date-dot' : 'date-dot date-dot-off'} aria-hidden="true" />
              </button>
            )
          })}
        </div>
        <button type="button" className="icon-btn" aria-label="Next week" onClick={() => onSelect(toISODate(addDays(monday, 7)))}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="dates-foot">
        <span className="dates-week">{weekLabel}</span>
        <span className="dates-tools">
          {selected !== today && (
            <button type="button" className="link" onClick={() => onSelect(today)}>
              Today
            </button>
          )}
          <label className="dates-jump">
            <span className="sr-only">Jump to date</span>
            <input type="date" value={selected} onChange={(e) => e.target.value && onSelect(e.target.value)} />
            <span className="link" aria-hidden="true">
              Jump to…
            </span>
          </label>
        </span>
      </div>
    </section>
  )
}
