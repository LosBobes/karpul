import { useState, type FormEvent } from 'react'
import { carBrand, carModel, carPowertrain, powertrainLabel } from '../lib/carModels'
import { fmtTime, sameName } from '../lib/dates'
import { dropZone, type PassengerDrag } from '../lib/dnd'
import { useT } from '../lib/i18n'
import type { Ride } from '../lib/types'
import { useCoarsePointer } from '../lib/useCoarsePointer'
import { Avatar } from './Avatar'
import { BrandLogo, CarArt, PowertrainIcon } from './CarArt'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CopyIcon,
  GripIcon,
  InfoIcon,
  KebabIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from './icons'
import { Menu } from './Menu'

interface Props {
  ride: Ride
  userName: string
  busy: boolean
  isPast: boolean
  onJoin: (ride: Ride) => void
  onLeave: (ride: Ride, bookingId: number) => void
  /** Put somebody else in the car (driver, or a passenger when the driver allows it). */
  onAddPassenger: (ride: Ride, name: string) => void
  onCancel: (ride: Ride) => void
  onEdit: (ride: Ride) => void
  onDuplicate: (ride: Ride) => void
  /** The driver's switch: may the passengers add and remove each other? */
  onTogglePassengersManage: (ride: Ride) => void
  /** Opens the company-car guide (charging, the Mazda 6e); shown on company-car rides only. */
  onGuide?: () => void
  dragActive: boolean
  /** The chip in flight was picked up from this car. */
  lifted: boolean
  /** The chip is hovering over this card. */
  over: boolean
  onGrab: (e: React.PointerEvent<HTMLElement>, drag: PassengerDrag) => void
  /** False where there is nowhere to drag the chip to (the upcoming list). */
  draggable?: boolean
}

/**
 * The selected ride: who drives, when it leaves and comes back, where from and
 * to, and who is in the car. The passenger list doubles as the drop zone.
 */
export function CarDetail({
  ride,
  userName,
  busy,
  isPast,
  onJoin,
  onLeave,
  onAddPassenger,
  onCancel,
  onEdit,
  onDuplicate,
  onTogglePassengersManage,
  onGuide,
  dragActive,
  lifted,
  over,
  onGrab,
  draggable = true,
}: Props) {
  const t = useT()
  const coarse = useCoarsePointer()
  const isDriver = sameName(userName, ride.driver_name)
  const model = carModel(ride.car_name)
  const brand = model ? null : carBrand(ride.car_name)
  const powertrain = carPowertrain(ride.car_name)
  const myBooking = ride.bookings.find((b) => sameName(b.passenger_name, userName))
  const full = ride.free_seats <= 0
  const canJoin = !!userName && !isDriver && !myBooking && !full && !busy && !isPast
  const receives = dragActive && canJoin
  // Who may put other people in and take them out: the driver always, the
  // passengers while the driver has switched it on (backend: _may_manage_seats).
  const canManage = !isPast && !!userName && (isDriver || (ride.passengers_manage && !!myBooking))
  const canAddOther = canManage && !full && !busy

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newName.trim().replace(/\s+/g, ' ')
    if (!name) return
    onAddPassenger(ride, name)
    setNewName('')
    setAdding(false)
  }

  const menuItems = isDriver
    ? [
        { label: t.detail.editRide, icon: <PencilIcon size={18} />, onSelect: () => onEdit(ride), disabled: busy },
        {
          label: ride.passengers_manage ? t.detail.stopManage : t.detail.letManage,
          icon: <UsersIcon size={18} />,
          onSelect: () => onTogglePassengersManage(ride),
          disabled: busy || isPast,
        },
        { label: t.detail.duplicate, icon: <CopyIcon size={18} />, onSelect: () => onDuplicate(ride), disabled: busy },
        { label: t.detail.removeRide, icon: <TrashIcon size={18} />, onSelect: () => onCancel(ride), danger: true, disabled: busy },
      ]
    : [{ label: t.detail.duplicateMine, icon: <CopyIcon size={18} />, onSelect: () => onDuplicate(ride), disabled: !userName }]

  return (
    <div className="detail">
      <article className="card driver-card">
        <header className="driver-head">
          <Avatar name={ride.driver_name} size="lg" />
          <div className="driver-name">
            <strong>{ride.driver_name}</strong>
            <span className="tag tag-green">{t.detail.driver}</span>
            {isDriver && <span className="tag">{t.detail.you}</span>}
          </div>
          <Menu trigger={<KebabIcon />} label={t.detail.rideOptions} items={menuItems} />
        </header>

        <div className="driver-times">
          <div className="when">
            <span className="when-icon">
              <ArrowRightIcon size={16} />
            </span>
            <span>
              <span className="when-label">{t.detail.leaves}</span>
              <span className="when-value">{fmtTime(ride.departure_time)}</span>
            </span>
          </div>
          <div className="when">
            <span className="when-icon">
              <ArrowLeftIcon size={16} />
            </span>
            <span>
              <span className="when-label">{t.detail.returns}</span>
              <span className="when-value">{ride.return_time ? fmtTime(ride.return_time) : t.detail.oneWay}</span>
            </span>
          </div>
        </div>

        <div className="driver-route">
          <span className="place">
            <PinIcon size={15} />
            <span>
              <b>{t.detail.from}</b> {ride.origin}
            </span>
          </span>
          <span className="place">
            <PinIcon size={15} />
            <span>
              <b>{t.detail.to}</b> {ride.destination}
            </span>
          </span>
        </div>

        <div className={model || brand ? 'driver-car driver-car-illustrated' : 'driver-car'}>
          {model && (
            <span className="driver-car-art" aria-hidden="true">
              <CarArt model={model.key} width={104} />
            </span>
          )}
          {brand && (
            <span className="driver-car-logo" title={brand.name}>
              <BrandLogo brand={brand.key} size={30} />
            </span>
          )}
          <span className="driver-car-text">
            <span className="driver-car-tags">
              <span className={`tag ${ride.car_type === 'corporate' ? 'tag-blue' : ''}`}>
                {ride.car_type === 'corporate' ? t.detail.companyCar : t.detail.ownCar}
              </span>
              {powertrain && (
                <span className={powertrain === 'electric' || powertrain === 'hybrid' ? 'tag tag-green tag-icon' : 'tag tag-icon'}>
                  <PowertrainIcon kind={powertrain} size={13} /> {powertrainLabel(powertrain)}
                </span>
              )}
            </span>
            <span className="driver-car-name">{ride.car_name}</span>
            {ride.car_type === 'corporate' && onGuide && (
              <button type="button" className="link driver-car-guide" onClick={onGuide}>
                <InfoIcon size={15} /> {t.detail.howTo}
              </button>
            )}
          </span>
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
          {t.detail.passengersTitle}{' '}
          <span className="section-count">
            ({ride.bookings.length} / {ride.seats})
          </span>
          {ride.passengers_manage && (
            <span className="tag tag-icon section-tag" title={t.detail.openListTitle}>
              <UsersIcon size={12} strokeWidth={2.25} /> {t.detail.openList}
            </span>
          )}
        </h3>

        {ride.bookings.length === 0 && !canJoin ? (
          <div className="dropzone dropzone-still">
            <UsersIcon size={28} />
            <span>{isPast ? t.detail.nobodyRode : full ? t.detail.noSeatsOffered : t.detail.noPassengers}</span>
          </div>
        ) : null}

        {ride.bookings.length === 0 && canJoin ? (
          <button type="button" className="dropzone" onClick={() => onJoin(ride)}>
            <UsersIcon size={28} />
            <strong>{dragActive ? t.detail.dropToGetIn : t.detail.getIn}</strong>
            <span>{draggable ? (coarse ? t.detail.dragHintCoarse : t.detail.dragHint) : t.detail.tapSeat}</span>
          </button>
        ) : null}

        {ride.bookings.length > 0 && (
          <ul className="pax-list">
            {ride.bookings.map((b) => {
              const mine = sameName(b.passenger_name, userName)
              const grabbable = draggable && mine && !busy && !isPast
              return (
                <li
                  key={b.id}
                  className={['pax-row', mine && 'pax-row-me', grabbable && 'grabbable', mine && lifted && 'lifting']
                    .filter(Boolean)
                    .join(' ')}
                  title={grabbable ? t.detail.dragSwitch : undefined}
                  onPointerDown={(e) => {
                    if (grabbable) onGrab(e, { name: userName, fromRideId: ride.id, bookingId: b.id })
                  }}
                  onDragStart={(e) => e.preventDefault()}
                >
                  <Avatar name={b.passenger_name} />
                  <span className="pax-name">
                    {b.passenger_name}
                    {mine && <span className="tag">{t.detail.you}</span>}
                  </span>
                  {canManage && !mine && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      title={t.detail.removeName(b.passenger_name)}
                      aria-label={t.detail.removeName(b.passenger_name)}
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
                      {t.detail.leave}
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
                  {dragActive ? t.detail.dropToGetIn : t.detail.getIn}
                </button>
              </li>
            )}
          </ul>
        )}

        {canAddOther && !adding && (
          <button type="button" className="add-row add-row-quiet" onClick={() => setAdding(true)}>
            <UserIcon size={18} />
            {t.detail.addByName}
          </button>
        )}
        {canAddOther && adding && (
          <form className="pax-add" onSubmit={submitAdd}>
            <input
              autoFocus
              required
              aria-label={t.detail.passengerName}
              placeholder={t.detail.colleagueName}
              maxLength={80}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim()}>
              {t.common.add}
            </button>
            <button type="button" className="icon-btn" aria-label={t.common.cancel} onClick={() => setAdding(false)}>
              <XIcon size={18} />
            </button>
          </form>
        )}

        {!userName && !isPast && !full && <p className="hint">{t.detail.setNameHint}</p>}
        {full && !myBooking && !isDriver && ride.bookings.length > 0 && <p className="hint">{t.detail.full}</p>}
        {ride.passengers_manage && !isPast && !!myBooking && !isDriver && (
          <p className="hint">{t.detail.openListHint}</p>
        )}
      </section>
    </div>
  )
}
