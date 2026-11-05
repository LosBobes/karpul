import { useEffect, useRef } from 'react'
import { firstName, fmtTime, shortCarName } from '../lib/dates'
import { useT } from '../lib/i18n'
import { drives, seatedIn, useMe } from '../lib/me'
import type { Ride } from '../lib/types'
import { CarGlyph, PowertrainMark } from './CarArt'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

interface Props {
  rides: Ride[]
  selected: number | null
  onSelect: (rideId: number) => void
  /** A list down the side column on a wide screen instead of a sideways strip. */
  vertical?: boolean
}

/**
 * One tile per ride going that day; a tap opens it.
 * Adding a ride is the floating plus (AddRideButton.tsx), not a tile here.
 */
export function CarCarousel({ rides, selected, onSelect, vertical = false }: Props) {
  const t = useT()
  const me = useMe()
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selected])

  const scrollBy = (dir: -1 | 1) => strip.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })

  return (
    <section className={vertical ? 'cars cars-vertical' : 'cars'} aria-label={t.carousel.label}>
      {!vertical && (
        <button type="button" className="icon-btn cars-arrow" aria-label={t.carousel.scrollLeft} onClick={() => scrollBy(-1)}>
          <ChevronLeftIcon />
        </button>
      )}
      <div ref={strip} className="cars-strip">
        {rides.map((r) => {
          const driving = drives(r, me)
          const seated = seatedIn(r, me)
          const mine = driving || seated
          const full = r.free_seats <= 0
          const cls = [
            'car-tile',
            selected === r.id && 'car-tile-selected',
            full && 'car-tile-full',
            mine && 'car-tile-mine',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={r.id}
              type="button"
              className={cls}
              aria-pressed={selected === r.id}
              onClick={() => onSelect(r.id)}
              title={`${r.driver_name} · ${r.car_name}`}
            >
              <span className="car-tile-art">
                <CarGlyph carName={r.car_name} size={22} />
              </span>
              {vertical && <span className="car-tile-time when-value">{fmtTime(r.departure_time)}</span>}
              <span className="car-tile-name">
                <span className="car-tile-name-text">{shortCarName(r.car_name) || firstName(r.driver_name)}</span>
                <PowertrainMark carName={r.car_name} />
              </span>
              <span className="car-tile-route" title={`${r.origin}, ${r.destination}`}>
                {r.origin}
                <span className="car-tile-route-arrow" aria-hidden="true">
                  ›
                </span>
                {r.destination}
              </span>
              {vertical && <span className="car-tile-driver">{r.driver_name}</span>}
              <span
                className={['car-tile-seats', full && 'car-tile-seats-full', seated && 'car-tile-seats-in', driving && 'car-tile-seats-driving']
                  .filter(Boolean)
                  .join(' ')}
                aria-label={t.upcoming.seats(r.free_seats)}
              >
                {r.bookings.length} / {r.seats}
              </span>
            </button>
          )
        })}
      </div>
      {!vertical && (
        <button type="button" className="icon-btn cars-arrow" aria-label={t.carousel.scrollRight} onClick={() => scrollBy(1)}>
          <ChevronRightIcon />
        </button>
      )}
    </section>
  )
}
