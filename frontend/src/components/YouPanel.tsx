import { firstName, fmtTime } from '../lib/dates'
import { dropZone, type PassengerDrag } from '../lib/dnd'
import { useT } from '../lib/i18n'
import { drives, useMe } from '../lib/me'
import type { Ride } from '../lib/types'
import { useCoarsePointer } from '../lib/useCoarsePointer'
import { Avatar } from './Avatar'
import { CheckCircleIcon, GripIcon, HandIcon, LogoutIcon } from './icons'

interface Props {
  dayRides: Ride[]
  /** The ride the user is booked on that day, if any. */
  currentRide: Ride | null
  currentBookingId: number | null
  isPast: boolean
  dragActive: boolean
  /** The chip is hovering over this panel. */
  over: boolean
  onGrab: (e: React.PointerEvent<HTMLElement>, drag: PassengerDrag) => void
  onOpenCar: (rideId: number) => void
  /** Nothing suits you that day: ask for a ride (components/RequestForm.tsx). */
  onAsk: () => void
  /** You already asked for that day; the button says so instead. */
  asked: boolean
}

/**
 * The design's "Unassigned" list, for a board with no roster: the only
 * passenger you can move is yourself. Not seated, this is your chip to drag
 * onto a car; seated, it is where you drop the chip to get out.
 */
export function YouPanel({
  dayRides,
  currentRide,
  currentBookingId,
  isPast,
  dragActive,
  over,
  onGrab,
  onOpenCar,
  onAsk,
  asked,
}: Props) {
  const t = useT()
  const me = useMe()
  const userName = me.name
  const coarse = useCoarsePointer()
  const verb = coarse ? t.you.holdDrag : t.you.drag

  const driving = dayRides.find((r) => drives(r, me)) ?? null
  const seated = currentRide !== null
  const openSeats = dayRides.some((r) => r.free_seats > 0 && !drives(r, me))
  const canDrag = !seated && !driving && openSeats && !isPast

  const cls = [
    'you',
    seated && !isPast && 'you-seated',
    seated && dragActive && 'you-armed',
    seated && over && 'you-over',
  ]
    .filter(Boolean)
    .join(' ')

  const status = isPast
    ? seated
      ? t.you.rodeWith(firstName(currentRide.driver_name))
      : t.you.dayOver
    : driving
      ? t.you.youDrive
      : seated
        ? t.you.inCar(firstName(currentRide.driver_name), verb)
        : openSeats
          ? t.you.notInCar(verb)
          : dayRides.length
            ? t.you.noFreeSeats
            : t.you.noRides

  return (
    <section className={cls} {...dropZone(seated && !isPast ? { kind: 'tray' } : null)}>
      <h3 className="section-title">{t.you.title}</h3>

      {seated && !isPast && !dragActive && (
        <div className="banner banner-ok">
          <CheckCircleIcon size={22} />
          <span>
            <strong>{t.you.allSet}</strong> {t.you.ridingWith(firstName(currentRide.driver_name), fmtTime(currentRide.departure_time))}
          </span>
        </div>
      )}

      {driving && (
        <div className="banner">
          <CheckCircleIcon size={22} />
          <span>{t.you.drivingToday(driving.bookings.length, driving.seats)}</span>
        </div>
      )}

      <div
        className={['card', 'you-row', canDrag && 'grabbable', seated && dragActive && 'you-row-out'].filter(Boolean).join(' ')}
        title={canDrag ? t.you.dragMe(verb) : undefined}
        onPointerDown={(e) => {
          if (canDrag) onGrab(e, { name: userName, fromRideId: null, bookingId: currentBookingId })
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {seated && dragActive ? (
          <>
            <span className="you-out-icon" aria-hidden="true">
              <LogoutIcon size={22} />
            </span>
            <span className="you-text">
              <strong>{t.you.dropOut}</strong>
            </span>
          </>
        ) : (
          <>
            <Avatar name={userName} />
            <span className="you-text">
              <strong>{userName}</strong>
              <span>{status}</span>
            </span>
            {seated && !isPast && (
              <button type="button" className="link" onClick={() => onOpenCar(currentRide.id)}>
                {t.common.open}
              </button>
            )}
            {canDrag && (
              <span className="grip" aria-hidden="true">
                <GripIcon size={18} />
              </span>
            )}
          </>
        )}
      </div>

      {!seated && !driving && !isPast && !dragActive && !asked && (
        <button type="button" className="add-row add-row-quiet" onClick={onAsk}>
          <HandIcon size={18} />
          {t.requests.ask}
        </button>
      )}
    </section>
  )
}
