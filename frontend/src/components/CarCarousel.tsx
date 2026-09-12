import { useEffect, useRef } from 'react'
import { firstName, sameName, shortCarName } from '../lib/dates'
import { useT } from '../lib/i18n'
import { dropZone, type DropTarget } from '../lib/dnd'
import type { Ride } from '../lib/types'
import { CarGlyph, PowertrainMark } from './CarArt'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

interface Props {
  rides: Ride[]
  selected: number | null
  userName: string
  /** Someone is dragging the passenger chip; cards that can take it light up. */
  dragActive: boolean
  over: DropTarget | null
  onSelect: (rideId: number) => void
}

function canReceive(ride: Ride, userName: string): boolean {
  if (!userName) return false
  if (sameName(ride.driver_name, userName)) return false
  if (ride.bookings.some((b) => sameName(b.passenger_name, userName))) return false
  return ride.free_seats > 0
}

/**
 * One tile per ride going that day. The tiles are also drop targets, so a
 * chip can be dropped straight onto another car without opening it first.
 * Adding a ride is the floating plus (AddRideButton.tsx), not a tile here.
 */
export function CarCarousel({ rides, selected, userName, dragActive, over, onSelect }: Props) {
  const t = useT()
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selected])

  const scrollBy = (dir: -1 | 1) => strip.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })

  return (
    <section className="cars" aria-label={t.carousel.label}>
      <button type="button" className="icon-btn cars-arrow" aria-label={t.carousel.scrollLeft} onClick={() => scrollBy(-1)}>
        <ChevronLeftIcon />
      </button>
      <div ref={strip} className="cars-strip">
        {rides.map((r) => {
          const driving = sameName(r.driver_name, userName)
          const seated = r.bookings.some((b) => sameName(b.passenger_name, userName))
          const mine = driving || seated
          const full = r.free_seats <= 0
          const receives = dragActive && canReceive(r, userName)
          const isOver = over?.kind === 'ride' && over.rideId === r.id
          const cls = [
            'car-tile',
            selected === r.id && 'car-tile-selected',
            full && 'car-tile-full',
            mine && 'car-tile-mine',
            receives && 'car-tile-droppable',
            dragActive && !receives && 'car-tile-nodrop',
            receives && isOver && 'car-tile-over',
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
              {...dropZone(receives ? { kind: 'ride', rideId: r.id } : null)}
            >
              <span className="car-tile-art">
                <CarGlyph carName={r.car_name} size={22} />
              </span>
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
      <button type="button" className="icon-btn cars-arrow" aria-label={t.carousel.scrollRight} onClick={() => scrollBy(1)}>
        <ChevronRightIcon />
      </button>
    </section>
  )
}
