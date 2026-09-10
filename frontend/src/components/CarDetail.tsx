import { fmtTime, sameName } from '../lib/dates'
import { dropZone, type PassengerDrag } from '../lib/dnd'
import type { Ride } from '../lib/types'
import { useCoarsePointer } from '../lib/useCoarsePointer'
import { Avatar } from './Avatar'
import { ArrowLeftIcon, ArrowRightIcon, CopyIcon, GripIcon, KebabIcon, PencilIcon, PinIcon, PlusIcon, TrashIcon, UsersIcon, XIcon } from './icons'
import { Menu } from './Menu'

interface Props {
  ride: Ride
  userName: string
  busy: boolean
  isPast: boolean
  onJoin: (ride: Ride) => void
  onLeave: (ride: Ride, bookingId: number) => void
  onCancel: (ride: Ride) => void
  onEdit: (ride: Ride) => void
  onDuplicate: (ride: Ride) => void
  dragActive: boolean
  /** The chip in flight was picked up from this car. */
  lifted: boolean
  /** The chip is hovering over this card. */
  over: boolean
  onGrab: (e: React.PointerEvent<HTMLElement>, drag: PassengerDrag) => void
}

/**
 * The selected car: who drives, when it leaves and comes back, where from and
 * to, and who is in it. The passenger list doubles as the drop zone.
 */
export function CarDetail({
  ride,
  userName,
  busy,
  isPast,
  onJoin,
  onLeave,
  onCancel,
  onEdit,
  onDuplicate,
  dragActive,
  lifted,
  over,
  onGrab,
}: Props) {
  const coarse = useCoarsePointer()
  const isDriver = sameName(userName, ride.driver_name)
  const myBooking = ride.bookings.find((b) => sameName(b.passenger_name, userName))
  const full = ride.free_seats <= 0
  const canJoin = !!userName && !isDriver && !myBooking && !full && !busy && !isPast
  const receives = dragActive && canJoin

  const menuItems = isDriver
    ? [
        { label: 'Edit car', icon: <PencilIcon size={18} />, onSelect: () => onEdit(ride), disabled: busy },
        { label: 'Duplicate car', icon: <CopyIcon size={18} />, onSelect: () => onDuplicate(ride), disabled: busy },
        { label: 'Remove car', icon: <TrashIcon size={18} />, onSelect: () => onCancel(ride), danger: true, disabled: busy },
      ]
    : [{ label: 'Duplicate as my car', icon: <CopyIcon size={18} />, onSelect: () => onDuplicate(ride), disabled: !userName }]

  return (
    <div className="detail">
      <article className="card driver-card">
        <header className="driver-head">
          <Avatar name={ride.driver_name} size="lg" />
          <div className="driver-name">
            <strong>{ride.driver_name}</strong>
            <span className="tag tag-green">Driver</span>
            {isDriver && <span className="tag">You</span>}
          </div>
          <Menu trigger={<KebabIcon />} label="Car options" items={menuItems} />
        </header>

        <div className="driver-times">
          <div className="when">
            <span className="when-icon">
              <ArrowRightIcon size={16} />
            </span>
            <span>
              <span className="when-label">Leaves</span>
              <span className="when-value">{fmtTime(ride.departure_time)}</span>
            </span>
          </div>
          <div className="when">
            <span className="when-icon">
              <ArrowLeftIcon size={16} />
            </span>
            <span>
              <span className="when-label">Returns</span>
              <span className="when-value">{ride.return_time ? fmtTime(ride.return_time) : 'One way'}</span>
            </span>
          </div>
        </div>

        <div className="driver-route">
          <span className="place">
            <PinIcon size={15} />
            <span>
              <b>From:</b> {ride.origin}
            </span>
          </span>
          <span className="place">
            <PinIcon size={15} />
            <span>
              <b>To:</b> {ride.destination}
            </span>
          </span>
        </div>

        <div className="driver-car">
          <span className={`tag ${ride.car_type === 'corporate' ? 'tag-blue' : ''}`}>
            {ride.car_type === 'corporate' ? 'Company car' : 'Own car'}
          </span>
          <span className="driver-car-name">{ride.car_name}</span>
        </div>
        {ride.notes && <p className="driver-notes">{ride.notes}</p>}
      </article>

      <section
        className={[
          'pax',
          receives && 'pax-droppable',
          dragActive && !receives && !lifted && 'pax-nodrop',
          receives && over && 'pax-over',
        ]
          .filter(Boolean)
          .join(' ')}
        {...dropZone(receives ? { kind: 'ride', rideId: ride.id } : null)}
      >
        <h3 className="section-title">
          Passengers in this car{' '}
          <span className="section-count">
            ({ride.bookings.length} / {ride.seats})
          </span>
        </h3>

        {ride.bookings.length === 0 && !canJoin ? (
          <div className="dropzone dropzone-still">
            <UsersIcon size={28} />
            <span>{isPast ? 'Nobody rode along.' : full ? 'No passenger seats offered.' : 'No passengers yet.'}</span>
          </div>
        ) : null}

        {ride.bookings.length === 0 && canJoin ? (
          <button type="button" className="dropzone" onClick={() => onJoin(ride)}>
            <UsersIcon size={28} />
            <strong>{dragActive ? 'Drop here to get in' : 'Get in this car'}</strong>
            <span>{coarse ? 'Hold and drag your chip here, or tap to join' : 'Drag your chip here or tap to join'}</span>
          </button>
        ) : null}

        {ride.bookings.length > 0 && (
          <ul className="pax-list">
            {ride.bookings.map((b) => {
              const mine = sameName(b.passenger_name, userName)
              const grabbable = mine && !busy && !isPast
              return (
                <li
                  key={b.id}
                  className={['pax-row', mine && 'pax-row-me', grabbable && 'grabbable', mine && lifted && 'lifting']
                    .filter(Boolean)
                    .join(' ')}
                  title={grabbable ? 'Drag to another car to switch, or down to "You" to get out' : undefined}
                  onPointerDown={(e) => {
                    if (grabbable) onGrab(e, { name: userName, fromRideId: ride.id, bookingId: b.id })
                  }}
                  onDragStart={(e) => e.preventDefault()}
                >
                  <Avatar name={b.passenger_name} />
                  <span className="pax-name">
                    {b.passenger_name}
                    {mine && <span className="tag">You</span>}
                  </span>
                  {isDriver && !isPast && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      title={`Remove ${b.passenger_name}`}
                      aria-label={`Remove ${b.passenger_name}`}
                      disabled={busy}
                      onClick={() => onLeave(ride, b.id)}
                    >
                      <XIcon size={16} />
                    </button>
                  )}
                  {mine && !isDriver && !isPast && (
                    <button
                      type="button"
                      className="link pax-leave"
                      disabled={busy}
                      onClick={() => onLeave(ride, b.id)}
                    >
                      Leave
                    </button>
                  )}
                  {grabbable && (
                    <span className="grip" aria-hidden="true">
                      <GripIcon size={18} />
                    </span>
                  )}
                </li>
              )
            })}
            {canJoin && (
              <li>
                <button type="button" className="add-row" onClick={() => onJoin(ride)}>
                  <PlusIcon size={18} />
                  {dragActive ? 'Drop here to get in' : 'Get in this car'}
                </button>
              </li>
            )}
          </ul>
        )}

        {!userName && !isPast && !full && <p className="hint">Set your name from the menu to get in.</p>}
        {full && !myBooking && !isDriver && ride.bookings.length > 0 && <p className="hint">This car is full.</p>}
      </section>
    </div>
  )
}
