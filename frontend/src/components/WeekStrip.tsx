import { addDays, parseISODate, startOfWeek, toISODate, todayISO } from '../lib/dates'
import type { Ride } from '../lib/types'

interface Props {
  selected: string
  rides: Ride[]
  onSelect: (iso: string) => void
}

export function WeekStrip({ selected, rides, onSelect }: Props) {
  const today = todayISO()
  const monday = startOfWeek(parseISODate(selected))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const counts = new Map<string, { rides: number; free: number }>()
  for (const r of rides) {
    const c = counts.get(r.ride_date) ?? { rides: 0, free: 0 }
    c.rides += 1
    c.free += r.free_seats
    counts.set(r.ride_date, c)
  }

  const weekLabel = `${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(
    monday,
    6,
  ).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <section className="weekstrip" aria-label="Week navigation">
      <div className="weekstrip-head">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onSelect(toISODate(addDays(monday, -7)))}
          aria-label="Previous week"
        >
          ‹ Prev
        </button>
        <div className="weekstrip-title">
          <span>{weekLabel}</span>
          <button type="button" className="btn btn-link btn-sm" onClick={() => onSelect(today)}>
            Today
          </button>
          <input
            type="date"
            aria-label="Jump to date"
            value={selected}
            onChange={(e) => e.target.value && onSelect(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onSelect(toISODate(addDays(monday, 7)))}
          aria-label="Next week"
        >
          Next ›
        </button>
      </div>
      <div className="weekstrip-days">
        {days.map((d) => {
          const iso = toISODate(d)
          const c = counts.get(iso)
          const cls = [
            'day',
            iso === selected && 'day-selected',
            iso === today && 'day-today',
            iso < today && 'day-past',
            d.getDay() === 0 || d.getDay() === 6 ? 'day-weekend' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button key={iso} type="button" className={cls} onClick={() => onSelect(iso)}>
              <span className="day-name">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="day-num">{d.getDate()}</span>
              <span className="day-meta">
                {c ? (
                  <>
                    {c.rides} {c.rides === 1 ? 'ride' : 'rides'} · {c.free} free
                  </>
                ) : (
                  <>&nbsp;</>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
