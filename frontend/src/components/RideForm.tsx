import { useState, type FormEvent } from 'react'
import { messages, useT } from '../lib/i18n'
import type { CarType, CorporateCar, Ride, RideInput } from '../lib/types'
import { Avatar } from './Avatar'
import { DatePicker } from './DatePicker'
import { CarIcon, MinusIcon, PinIcon, PlusIcon, TrashIcon } from './icons'
import { SegThumb } from './Segmented'
import { Select } from './Select'
import { Sheet } from './Sheet'
import { TimePicker } from './TimePicker'

interface Props {
  date: string
  userName: string
  cars: CorporateCar[]
  /** Editing this ride (the sheet says "Edit ride" and offers Delete). */
  existing?: Ride | null
  /** Pre-fill a new ride from this one ("Duplicate ride"). */
  template?: Ride | null
  submitting: boolean
  error: string | null
  onSubmit: (input: RideInput) => void
  onDelete?: () => void
  onClose: () => void
}

const LAST_ROUTE_KEY = 'karpul.lastRoute'

function loadLastRoute(): { origin: string; destination: string; car_name: string } {
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { origin: '', destination: messages().form.defaultDestination, car_name: '' }
}

/** The "Add ride" / "Edit ride" bottom sheet. */
export function RideForm({ date, userName, cars, existing, template, submitting, error, onSubmit, onDelete, onClose }: Props) {
  const t = useT()
  const seed = existing ?? template ?? null
  const [last] = useState(loadLastRoute)
  const [rideDate, setRideDate] = useState(existing?.ride_date ?? date)
  const [carType, setCarType] = useState<CarType>(seed?.car_type ?? (cars.length ? 'corporate' : 'own'))
  const [carId, setCarId] = useState<number | ''>(seed?.corporate_car_id ?? cars[0]?.id ?? '')
  const [carName, setCarName] = useState(seed?.car_type === 'own' ? seed.car_name : last.car_name)
  const [origin, setOrigin] = useState(seed?.origin ?? last.origin)
  const [destination, setDestination] = useState(seed?.destination ?? last.destination)
  const [departure, setDeparture] = useState(seed?.departure_time.slice(0, 5) ?? '08:00')
  const [ret, setRet] = useState(seed?.return_time?.slice(0, 5) ?? '17:00')
  const [oneWay, setOneWay] = useState(seed ? seed.return_time === null : false)
  const [rawSeats, setSeats] = useState(seed?.seats ?? 3)
  const [notes, setNotes] = useState(seed?.notes ?? '')
  const [passengersManage, setPassengersManage] = useState(seed?.passengers_manage ?? false)

  const selectedCar = cars.find((c) => c.id === carId)
  const maxSeats = carType === 'corporate' && selectedCar ? selectedCar.passenger_seats : 8
  const minSeats = existing?.bookings.length ?? 0
  // Clamp during render so switching to a smaller car never leaves an invalid value.
  const seats = Math.min(Math.max(rawSeats, minSeats), maxSeats)

  const localError = !oneWay && ret <= departure ? t.form.returnAfter : null

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (localError) return
    try {
      localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ origin, destination, car_name: carName }))
    } catch {
      /* ignore */
    }
    onSubmit({
      ride_date: rideDate,
      car_type: carType,
      car_name: carType === 'own' ? carName : '',
      corporate_car_id: carType === 'corporate' && carId !== '' ? carId : null,
      driver_name: userName,
      origin,
      destination,
      departure_time: departure,
      return_time: oneWay ? null : ret,
      seats,
      notes,
      passengers_manage: passengersManage,
    })
  }

  return (
    <Sheet
      id="ride-form-title"
      title={existing ? t.form.editTitle : t.form.addTitle}
      as="form"
      onSubmit={submit}
      onClose={onClose}
      footer={
        <>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !!localError}>
            {submitting ? t.common.saving : existing ? t.form.saveChanges : t.form.addTitle}
          </button>
          {existing && onDelete && (
            <button type="button" className="btn btn-outline-danger btn-block" disabled={submitting} onClick={onDelete}>
              <TrashIcon size={18} /> {t.form.deleteRide}
            </button>
          )}
        </>
      }
    >
      <div className="field">
        <span className="field-label">{t.form.driver}</span>
        <div className="driver-pill">
          <Avatar name={userName} size="sm" />
          <span>{userName}</span>
        </div>
      </div>

      <div className="field">
        <span className="field-label">{t.form.car}</span>
        <div className="segmented" role="radiogroup" aria-label={t.form.car}>
          <SegThumb count={2} index={carType === 'corporate' ? 0 : 1} />
          <button
            type="button"
            role="radio"
            aria-checked={carType === 'corporate'}
            className={carType === 'corporate' ? 'seg seg-on' : 'seg'}
            disabled={!cars.length}
            onClick={() => setCarType('corporate')}
          >
            {t.form.companyCar}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={carType === 'own'}
            className={carType === 'own' ? 'seg seg-on' : 'seg'}
            onClick={() => setCarType('own')}
          >
            {t.form.myOwnCar}
          </button>
        </div>
        {carType === 'corporate' ? (
          <Select
            label={t.form.whichCar}
            icon={<CarIcon size={16} />}
            value={carId === '' ? null : carId}
            options={cars.map((c) => ({ value: c.id, label: c.name, hint: t.form.carHint(c.plate, c.passenger_seats) }))}
            onChange={setCarId}
          />
        ) : (
          <input
            required
            aria-label={t.form.yourCar}
            placeholder={t.form.carPlaceholder}
            maxLength={80}
            value={carName}
            onChange={(e) => setCarName(e.target.value)}
          />
        )}
      </div>

      <div className="field">
        <span className="field-label" id="capacity-label">
          {t.form.seats}
        </span>
        <div className="stepper" role="group" aria-labelledby="capacity-label">
          <button type="button" aria-label={t.form.fewer} disabled={seats <= minSeats} onClick={() => setSeats(seats - 1)}>
            <MinusIcon />
          </button>
          <output aria-live="polite">{seats}</output>
          <button type="button" aria-label={t.form.more} disabled={seats >= maxSeats} onClick={() => setSeats(seats + 1)}>
            <PlusIcon />
          </button>
        </div>
        {minSeats > 0 && <p className="hint">{t.form.alreadyBooked(minSeats)}</p>}
      </div>

      <div className="field">
        <span className="field-label">{t.form.passengerList}</span>
        <label className="toggle toggle-row">
          <input type="checkbox" checked={passengersManage} onChange={(e) => setPassengersManage(e.target.checked)} />
          <span>{t.form.canManage}</span>
        </label>
        <p className="hint">
          {passengersManage ? t.form.manageOn : t.form.manageOff}
        </p>
      </div>

      <div className="field">
        <span className="field-label">{t.form.departs}</span>
        <div className="grid-2">
          <DatePicker label={t.form.day} value={rideDate} onChange={setRideDate} />
          <TimePicker label={t.form.departureTime} value={departure} onChange={setDeparture} />
        </div>
      </div>

      <div className="field">
        <span className="field-label field-label-row">
          {t.form.returns}
          <label className="toggle">
            <input type="checkbox" checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} />
            <span>{t.form.oneWay}</span>
          </label>
        </span>
        <div className="grid-2">
          {/* Rides are same-day, so the return day only echoes the departure. */}
          <DatePicker label={t.form.returnDay} value={rideDate} onChange={setRideDate} disabled />
          <TimePicker label={t.form.returnTime} value={ret} onChange={setRet} disabled={oneWay} />
        </div>
      </div>

      <label className="field">
        <span className="field-label">{t.form.pickup}</span>
        <span className="input-icon">
          <PinIcon size={16} />
          <input required maxLength={120} placeholder={t.form.pickupPlaceholder} value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </span>
      </label>

      <label className="field">
        <span className="field-label">{t.form.dropoff}</span>
        <span className="input-icon">
          <PinIcon size={16} />
          <input required maxLength={120} placeholder={t.form.dropoffPlaceholder} value={destination} onChange={(e) => setDestination(e.target.value)} />
        </span>
      </label>

      <label className="field">
        <span className="field-label">
          {t.form.notes} <span className="muted">{t.form.optional}</span>
        </span>
        <textarea rows={2} maxLength={500} placeholder={t.form.notesPlaceholder} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {(localError || error) && <p className="error">{localError ?? error}</p>}
    </Sheet>
  )
}
