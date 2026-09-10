import { useState, type FormEvent } from 'react'
import type { CarType, CorporateCar, Ride, RideInput } from '../lib/types'
import { Avatar } from './Avatar'
import { DatePicker } from './DatePicker'
import { CarIcon, MinusIcon, PinIcon, PlusIcon, TrashIcon } from './icons'
import { Select } from './Select'
import { Sheet } from './Sheet'
import { TimePicker } from './TimePicker'

interface Props {
  date: string
  userName: string
  cars: CorporateCar[]
  /** Editing this ride (the sheet says "Edit car" and offers Delete). */
  existing?: Ride | null
  /** Pre-fill a new ride from this one ("Duplicate car"). */
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
  return { origin: '', destination: 'Office', car_name: '' }
}

/** The "Add car" / "Edit car" bottom sheet. */
export function RideForm({ date, userName, cars, existing, template, submitting, error, onSubmit, onDelete, onClose }: Props) {
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

  const localError = !oneWay && ret <= departure ? 'Return time must be after departure time' : null

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
      title={existing ? 'Edit car' : 'Add car'}
      as="form"
      onSubmit={submit}
      onClose={onClose}
      footer={
        <>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !!localError}>
            {submitting ? 'Saving…' : existing ? 'Save changes' : 'Add car'}
          </button>
          {existing && onDelete && (
            <button type="button" className="btn btn-outline-danger btn-block" disabled={submitting} onClick={onDelete}>
              <TrashIcon size={18} /> Delete car
            </button>
          )}
        </>
      }
    >
      <div className="field">
        <span className="field-label">Driver</span>
        <div className="driver-pill">
          <Avatar name={userName} size="sm" />
          <span>{userName}</span>
        </div>
      </div>

      <div className="field">
        <span className="field-label">Car</span>
        <div className="segmented" role="radiogroup" aria-label="Car">
          <button
            type="button"
            role="radio"
            aria-checked={carType === 'corporate'}
            className={carType === 'corporate' ? 'seg seg-on' : 'seg'}
            disabled={!cars.length}
            onClick={() => setCarType('corporate')}
          >
            Company car
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={carType === 'own'}
            className={carType === 'own' ? 'seg seg-on' : 'seg'}
            onClick={() => setCarType('own')}
          >
            My own car
          </button>
        </div>
        {carType === 'corporate' ? (
          <Select
            label="Which company car"
            icon={<CarIcon size={16} />}
            value={carId === '' ? null : carId}
            options={cars.map((c) => ({ value: c.id, label: c.name, hint: `${c.plate} · ${c.passenger_seats} seats` }))}
            onChange={setCarId}
          />
        ) : (
          <input
            required
            aria-label="Your car"
            placeholder="e.g. grey Octavia"
            maxLength={80}
            value={carName}
            onChange={(e) => setCarName(e.target.value)}
          />
        )}
      </div>

      <div className="field">
        <span className="field-label" id="capacity-label">
          Passenger seats
        </span>
        <div className="stepper" role="group" aria-labelledby="capacity-label">
          <button type="button" aria-label="Fewer seats" disabled={seats <= minSeats} onClick={() => setSeats(seats - 1)}>
            <MinusIcon />
          </button>
          <output aria-live="polite">{seats}</output>
          <button type="button" aria-label="More seats" disabled={seats >= maxSeats} onClick={() => setSeats(seats + 1)}>
            <PlusIcon />
          </button>
        </div>
        {minSeats > 0 && <p className="hint">{minSeats} already booked, so it can't go lower.</p>}
      </div>

      <div className="field">
        <span className="field-label">Passenger list</span>
        <label className="toggle toggle-row">
          <input type="checkbox" checked={passengersManage} onChange={(e) => setPassengersManage(e.target.checked)} />
          <span>Passengers can add and remove each other</span>
        </label>
        <p className="hint">
          {passengersManage
            ? 'Anyone in the car can put a colleague in or take one out. You can still do both.'
            : 'Only you can put others in or take them out. Anyone can still get in or leave on their own.'}
        </p>
      </div>

      <div className="field">
        <span className="field-label">Departs</span>
        <div className="grid-2">
          <DatePicker label="Day" value={rideDate} onChange={setRideDate} />
          <TimePicker label="Departure time" value={departure} onChange={setDeparture} />
        </div>
      </div>

      <div className="field">
        <span className="field-label field-label-row">
          Returns
          <label className="toggle">
            <input type="checkbox" checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} />
            <span>One way</span>
          </label>
        </span>
        <div className="grid-2">
          {/* Rides are same-day, so the return day only echoes the departure. */}
          <DatePicker label="Return day (same day)" value={rideDate} onChange={setRideDate} disabled />
          <TimePicker label="Return time" value={ret} onChange={setRet} disabled={oneWay} />
        </div>
      </div>

      <label className="field">
        <span className="field-label">Pickup location</span>
        <span className="input-icon">
          <PinIcon size={16} />
          <input required maxLength={120} placeholder="e.g. Main St. Parking" value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </span>
      </label>

      <label className="field">
        <span className="field-label">Drop-off location</span>
        <span className="input-icon">
          <PinIcon size={16} />
          <input required maxLength={120} placeholder="e.g. Office" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </span>
      </label>

      <label className="field">
        <span className="field-label">
          Notes <span className="muted">(optional)</span>
        </span>
        <textarea rows={2} maxLength={500} placeholder="Meeting point, detours, luggage…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {(localError || error) && <p className="error">{localError ?? error}</p>}
    </Sheet>
  )
}
