import { useEffect, useRef } from 'react'
import { firstName, sameName, shortCarName } from '../lib/dates'
import { useT } from '../lib/i18n'
import { dropZone, type DropTarget } from '../lib/dnd'
import type { Ride } from '../lib/types'
import { CarGlyph, PowertrainMark } from './CarArt'
import { PlusCircle } from './AddRideButton'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

export type CarSelection = number | 'new'

interface Props {
  rides: Ride[]
  selected: CarSelection | null
  userName: string
  /** Someone is dragging the passenger chip; cards that can take it light up. */
  dragActive: boolean
  over: DropTarget | null
  /** False for past days: nothing can be added or joined any more. */
  canAdd: boolean
  onSelect: (sel: CarSelection) => void
}

function canReceive(ride: Ride, userName: string): boolean {
  if (!userName) return false
  if (sameName(ride.driver_name, userName)) return false
  if (ride.bookings.some((b) => sameName(b.passenger_name, userName))) return false
  return ride.free_seats > 0
}

/**
 * One tile per ride going that day, plus the "Add ride" tile at the end. The
 * tiles are also drop targets, so a chip can be dropped straight onto another
 * car without opening it first.
 */
export function CarCarousel({ rides, selected, userName, dragActive, over, canAdd, onSelect }: Props) {
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
          const mine = sameName(r.driver_name, userName) || r.bookings.some((b) => sameName(b.passenger_name, userName))
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
              <span className="car-tile-seats">
                {r.bookings.length} / {r.seats}
              </span>
            </button>
          )
        })}
        {canAdd && (
          <button
            type="button"
            className={selected === 'new' ? 'car-tile car-tile-add car-tile-selected' : 'car-tile car-tile-add'}
            aria-pressed={selected === 'new'}
            onClick={() => onSelect('new')}
          >
            <PlusCircle size={32} />
            <span className="car-tile-name">{t.carousel.addRide}</span>
          </button>
        )}
      </div>
      <button type="button" className="icon-btn cars-arrow" aria-label={t.carousel.scrollRight} onClick={() => scrollBy(1)}>
        <ChevronRightIcon />
      </button>
    </section>
  )
}
