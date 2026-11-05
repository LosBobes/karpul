import { firstName, fmtTime } from '../lib/dates'
import { useT } from '../lib/i18n'
import { drives, hasSeatFor, useMe } from '../lib/me'
import type { Ride } from '../lib/types'
import { Avatar } from './Avatar'
import { CheckCircleIcon, HandIcon } from './icons'

interface Props {
  dayRides: Ride[]
  /** The ride the user is booked on that day, if any. */
  currentRide: Ride | null
  isPast: boolean
  onOpenCar: (rideId: number) => void
  /** Nothing suits you that day: ask for a ride (components/RequestForm.tsx). */
  onAsk: () => void
  /** You already asked for that day; the button says so instead. */
  asked: boolean
}

/**
 * The design's "Unassigned" list, for a board with no roster: the only
 * passenger here is yourself: where you are that day, and the way to ask for
 * a ride when nothing suits.
 */
export function YouPanel({
  dayRides,
  currentRide,
  isPast,
  onOpenCar,
  onAsk,
  asked,
}: Props) {
  const t = useT()
  const me = useMe()
  const userName = me.name

  const driving = dayRides.find((r) => drives(r, me)) ?? null
  const seated = currentRide !== null
  const openSeats = dayRides.some((r) => hasSeatFor(r, me) && !drives(r, me))
  const cls = seated && !isPast ? 'you you-seated' : 'you'

  const status = isPast
    ? seated
      ? t.you.rodeWith(firstName(currentRide.driver_name))
      : t.you.dayOver
    : driving
      ? t.you.youDrive
      : seated
        ? t.you.inCar(firstName(currentRide.driver_name))
        : openSeats
          ? t.you.notInCar
          : dayRides.length
            ? t.you.noFreeSeats
            : t.you.noRides

  return (
    <section className={cls}>
      <h3 className="section-title">{t.you.title}</h3>

      {seated && !isPast && (
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

      <div className="card you-row">
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
      </div>

      {!seated && !driving && !isPast && !asked && (
        <button type="button" className="add-row add-row-quiet" onClick={onAsk}>
          <HandIcon size={18} />
          {t.requests.ask}
        </button>
      )}
    </section>
  )
}
