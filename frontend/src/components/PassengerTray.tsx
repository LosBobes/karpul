import { dropZone, type PassengerDrag } from '../lib/dnd'
import type { Ride } from '../lib/types'
import { useCoarsePointer } from '../lib/useCoarsePointer'

interface Props {
  userName: string
  /** The ride the user is booked on today, if any. */
  currentRide: Ride | null
  currentBookingId: number | null
  drivingToday: boolean
  hasOpenRides: boolean
  /** A passenger token is in flight right now. */
  dragActive: boolean
  /** The token is hovering over the tray. */
  over: boolean
  onGrab: (e: React.PointerEvent<HTMLElement>, drag: PassengerDrag) => void
}

/**
 * The "you" token. Drag it onto a car to pick that driver; when you're already
 * seated, the tray doubles as a drop zone for getting out.
 */
export function PassengerTray({
  userName,
  currentRide,
  currentBookingId,
  drivingToday,
  hasOpenRides,
  dragActive,
  over,
  onGrab,
}: Props) {
  const coarse = useCoarsePointer()

  if (!userName || drivingToday) return null

  const seated = currentRide !== null
  // On a phone the chip lifts after a short hold, and the wording has to say so
  // or nobody discovers it.
  const verb = coarse ? 'Hold and drag' : 'Drag'

  return (
    <div
      className={[
        'tray',
        seated && 'tray-seated',
        // While the token is in flight the tray stops being a caption and
        // becomes the "get out here" target, so it has to look like one.
        seated && dragActive && 'tray-armed',
        seated && over && 'tray-over',
      ]
        .filter(Boolean)
        .join(' ')}
      {...dropZone(seated ? { kind: 'tray' } : null)}
    >
      {seated ? (
        <>
          <span className="tray-eject" aria-hidden="true">
            ⏏
          </span>
          {dragActive ? (
            <span className="tray-text tray-text-armed">Drop here to get out of the car.</span>
          ) : (
            <span className="tray-text">
              You're riding with <strong>{currentRide.driver_name}</strong>. {verb} your{' '}
              {/* A copy of the chip that sits in the ride row below, so it is obvious
                  which thing on the board is the one you can pick up. */}
              <span className="tray-chip">
                <span className="grip" aria-hidden="true">
                  ⠿
                </span>
                {userName}
              </span>{' '}
              chip onto another car to switch, or drop it here to get out.
            </span>
          )}
        </>
      ) : (
        <>
          <span
            className={hasOpenRides ? 'token' : 'token token-off'}
            title={hasOpenRides ? `${verb} me onto a car` : 'No cars with free seats today'}
            onPointerDown={(e) => {
              if (hasOpenRides) onGrab(e, { name: userName, fromRideId: null, bookingId: currentBookingId })
            }}
            onDragStart={(e) => e.preventDefault()}
          >
            <span aria-hidden="true">▸</span> {userName}
          </span>
          <span className="tray-text">
            {hasOpenRides
              ? `${verb} your name onto a car to pick a driver, or press Join.`
              : 'No free seats today yet.'}
          </span>
        </>
      )}
    </div>
  )
}
