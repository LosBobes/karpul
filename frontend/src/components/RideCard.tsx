import { useState } from 'react'
import ScrambleHover from '../fancy/text/scramble-hover'
import { BoardText } from './BoardText'
import { fmtTime, sameName } from '../lib/dates'
import { isPassengerDrag, readPassengerDrag, setPassengerDrag, type PassengerDrag } from '../lib/dnd'
import type { Ride } from '../lib/types'

/** Split-flap feel: uppercase letters only, revealed left to right. */
const SCRAMBLE = {
  characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  scrambleSpeed: 35,
  maxIterations: 8,
  sequential: true,
  revealDirection: 'start',
  scrambledClassName: 'text-[var(--muted)]',
} as const

interface Props {
  ride: Ride
  userName: string
  busy: boolean
  onJoin: (ride: Ride) => void
  onLeave: (ride: Ride, bookingId: number) => void
  onCancel: (ride: Ride) => void
  onEdit: (ride: Ride) => void
  /** Someone is dragging a passenger token right now. */
  dragActive: boolean
  onDragState: (dragging: boolean) => void
  onDropPassenger: (ride: Ride, drag: PassengerDrag) => void
}

export function RideCard({
  ride,
  userName,
  busy,
  onJoin,
  onLeave,
  onCancel,
  onEdit,
  dragActive,
  onDragState,
  onDropPassenger,
}: Props) {
  const [over, setOver] = useState(false)
  const [lifting, setLifting] = useState(false)
  const isDriver = sameName(userName, ride.driver_name)
  const myBooking = ride.bookings.find((b) => sameName(b.passenger_name, userName))
  const full = ride.free_seats <= 0
  const canReceive = !!userName && !isDriver && !myBooking && !full && !busy

  const seatDots = Array.from({ length: ride.seats }, (_, i) => i < ride.bookings.length)

  const cls = [
    'ride',
    full && 'ride-full',
    dragActive && canReceive && 'ride-droppable',
    dragActive && !canReceive && 'ride-nodrop',
    over && 'ride-over',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      className={cls}
      onDragOver={(e) => {
        if (!canReceive || !isPassengerDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        setOver(false)
        if (!canReceive) return
        const drag = readPassengerDrag(e)
        if (!drag) return
        e.preventDefault()
        onDropPassenger(ride, drag)
      }}
    >
      <div className="ride-times">
        <div className="time">
          <span className="time-label">Leave</span>
          <span className="time-value">{fmtTime(ride.departure_time)}</span>
        </div>
        <div className="time">
          <span className="time-label">Back</span>
          <span className="time-value">{fmtTime(ride.return_time)}</span>
        </div>
      </div>

      <div className="ride-body">
        <div className="ride-route">
          <ScrambleHover text={ride.origin} {...SCRAMBLE} />
          <span className="arrow" aria-hidden="true">
            →
          </span>
          <ScrambleHover text={ride.destination} {...SCRAMBLE} />
        </div>
        <div className="ride-meta">
          <span className={`chip chip-${ride.car_type}`}>
            {ride.car_type === 'corporate' ? 'Company car' : 'Own car'}
          </span>
          <span className="ride-car">{ride.car_name}</span>
          <span className="ride-driver">
            driver <strong>{ride.driver_name}</strong>
            {isDriver && ' (you)'}
          </span>
        </div>
        {ride.notes && <p className="ride-notes">{ride.notes}</p>}
        <div className="ride-seats">
          <span className="seat-dots" aria-hidden="true">
            {seatDots.map((taken, i) => (
              <span key={i} className={taken ? 'seat seat-taken' : 'seat'} />
            ))}
          </span>
          <span className="seat-text">
            {/* Re-keying on the count is what makes it flip: a new key remounts
                the component, which replays the reveal on the new figure. */}
            <BoardText key={ride.free_seats} staggerDuration={0.02} stiffness={260}>
              {full ? 'FULL' : `${ride.free_seats} OF ${ride.seats} FREE`}
            </BoardText>
          </span>
        </div>
        {ride.bookings.length > 0 && (
          <div className="ride-pax">
            <span className="pax-label">Aboard</span>
            {ride.bookings.map((b) => {
              const mine = sameName(b.passenger_name, userName)
              return (
                <span
                  key={b.id}
                  className={[
                    'passenger',
                    mine && 'passenger-me',
                    mine && !busy && 'passenger-grabbable',
                    mine && lifting && 'passenger-lifting',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable={mine && !busy}
                  title={mine ? 'Drag to another car to switch, or to the tray to leave' : undefined}
                  onDragStart={(e) => {
                    if (!mine) return
                    setPassengerDrag(e, { name: userName, fromRideId: ride.id, bookingId: b.id })
                    setLifting(true)
                    onDragState(true)
                  }}
                  onDragEnd={() => {
                    setLifting(false)
                    onDragState(false)
                  }}
                >
                  {/* The grip is the whole point: without it the chip reads as a
                      highlight, not as something you can pick up. */}
                  {mine && !busy && (
                    <span className="grip" aria-hidden="true">
                      ⠿
                    </span>
                  )}
                  {b.passenger_name}
                  {mine && <span className="pax-you">you</span>}
                  {isDriver && (
                    <button
                      type="button"
                      className="btn-x"
                      title={`Remove ${b.passenger_name}`}
                      disabled={busy}
                      onClick={() => onLeave(ride, b.id)}
                    >
                      ×
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        )}
      </div>

      <div className="ride-actions">
        {isDriver ? (
          <>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onEdit(ride)}>
              Edit
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => onCancel(ride)}>
              Cancel ride
            </button>
          </>
        ) : myBooking ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => onLeave(ride, myBooking.id)}
          >
            Leave
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || full || !userName}
            title={!userName ? 'Set your name first' : undefined}
            onClick={() => onJoin(ride)}
          >
            {full ? 'Full' : 'Join'}
          </button>
        )}
      </div>
    </article>
  )
}
