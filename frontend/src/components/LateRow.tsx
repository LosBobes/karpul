import { toISODate } from '../lib/dates'
import { useT } from '../lib/i18n'
import type { Ride } from '../lib/types'
import { HourglassIcon } from './icons'

/** The driver's "running late" choices (backend: schemas.LateIn). */
const LATE_CHOICES = [5, 10, 15]
/** How long after departure the driver may still say so. */
const LATE_AFTER_MIN = 60

/** Is it the ride's day, and not yet an hour past its departure? The server
 * takes a late notice all day (routers/thread.py); the row goes once it is moot. */
function lateWindow(ride: Ride, now = new Date()): boolean {
  if (ride.ride_date !== toISODate(now)) return false
  const [h, m] = ride.departure_time.split(':').map(Number)
  return now.getHours() * 60 + now.getMinutes() < h * 60 + m + LATE_AFTER_MIN
}

/** The driver's *Running late?* 5, 10 or 15 min: on the ride's day, until an hour after it leaves. */
export function LateRow({ ride, busy, onLate }: { ride: Ride; busy: boolean; onLate: (ride: Ride, minutes: number) => void }) {
  const t = useT()
  if (!lateWindow(ride)) return null
  return (
    <div className="late-row" role="group" aria-label={t.detail.lateAsk}>
      <span className="late-ask">
        <HourglassIcon size={16} /> {t.detail.lateAsk}
      </span>
      <span className="late-actions">
        {LATE_CHOICES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="btn btn-sm"
            disabled={busy}
            aria-label={t.detail.lateTell(minutes)}
            onClick={() => onLate(ride, minutes)}
          >
            {t.detail.lateChoice(minutes)}
          </button>
        ))}
      </span>
    </div>
  )
}
