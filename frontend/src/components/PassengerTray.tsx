import { useState } from 'react'
import { isPassengerDrag, setPassengerDrag } from '../lib/dnd'
import type { Ride } from '../lib/types'

interface Props {
  userName: string
  /** The ride the user is booked on today, if any. */
  currentRide: Ride | null
  currentBookingId: number | null
  drivingToday: boolean
  hasOpenRides: boolean
  onDragState: (dragging: boolean) => void
  onLeave: () => void
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
  onDragState,
  onLeave,
}: Props) {
  const [over, setOver] = useState(false)

  if (!userName || drivingToday) return null

  const seated = currentRide !== null

  return (
    <div
      className={`tray ${seated ? 'tray-seated' : ''} ${over ? 'tray-over' : ''}`}
      onDragOver={(e) => {
        if (!seated || !isPassengerDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!seated || !isPassengerDrag(e)) return
        e.preventDefault()
        setOver(false)
        onLeave()
      }}
    >
      {seated ? (
        <>
          <span className="tray-text">
            You're riding with <strong>{currentRide.driver_name}</strong>. Drag your name to another car to switch,
            or drop it here to get out.
          </span>
        </>
      ) : (
        <>
          <span
            className="token"
            draggable={hasOpenRides}
            title={hasOpenRides ? 'Drag me onto a car' : 'No cars with free seats today'}
            onDragStart={(e) => {
              setPassengerDrag(e, { name: userName, fromRideId: null, bookingId: currentBookingId })
              onDragState(true)
            }}
            onDragEnd={() => onDragState(false)}
          >
            <span aria-hidden="true">▸</span> {userName}
          </span>
          <span className="tray-text">
            {hasOpenRides ? 'Drag your name onto a car to pick a driver, or press Join.' : 'No free seats today yet.'}
          </span>
        </>
      )}
    </div>
  )
}
