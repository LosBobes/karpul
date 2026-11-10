import { useEffect, useId, type ReactNode } from 'react'
import { fmtDayDate, fmtDayLabel, fmtTime } from '../lib/dates'
import { useT } from '../lib/i18n'
import { useClosing } from '../lib/motion'
import { useBackClose } from '../lib/useBackClose'
import type { Ride } from '../lib/types'
import { ArrowLeftIcon } from './icons'

interface Props {
  ride: Ride
  onClose: () => void
  /** The ride card itself (App owns the handlers it needs). */
  children: ReactNode
}

/**
 * One ride on a screen of its own, on a phone: a tapped row in Upcoming, a tile
 * in Week or a bar in Day opens it over the board, and the arrow (or the phone's
 * back) goes back to the list where it was, which stays mounted underneath so
 * its scroll is kept. One ride is looked at at a time, so the card no longer
 * unfolds inside the list. A wide screen keeps the ride in the pane beside it.
 *
 * The sheets the card opens (the thread, where you get in, the map) are its
 * children and stack above it; Escape is left to them while one is up.
 */
export function RidePage({ ride, onClose, children }: Props) {
  const t = useT()
  const titleId = useId()
  const { closing, requestClose, onAnimationEnd } = useClosing(onClose)
  useBackClose(requestClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // A sheet, a confirmation or a menu over the ride closes first.
      if (document.querySelector('.backdrop, .popover')) return
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  // The list underneath must not scroll along with the finger.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      className={closing ? 'ride-page ride-page-closing' : 'ride-page'}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onAnimationEnd={onAnimationEnd}
    >
      <header className="ride-page-bar">
        <button type="button" className="icon-btn" aria-label={t.common.back} onClick={requestClose}>
          <ArrowLeftIcon size={22} />
        </button>
        <h2 id={titleId} className="ride-page-title">
          <span>{fmtDayLabel(ride.ride_date)}</span>
          <small>
            {fmtDayDate(ride.ride_date)} · {fmtTime(ride.departure_time)}
          </small>
        </h2>
      </header>
      <div className="ride-page-body" data-scroll-pane="">
        {children}
      </div>
    </div>
  )
}
