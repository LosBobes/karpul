import { useEffect, useState, type FormEvent } from 'react'
import type { CarType, CorporateCar, Ride, RideInput } from '../lib/types'

interface Props {
  date: string
  userName: string
  cars: CorporateCar[]
  existing?: Ride | null
  submitting: boolean
  error: string | null
  onSubmit: (input: RideInput) => void
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

export function RideForm({ date, userName, cars, existing, submitting, error, onSubmit, onClose }: Props) {
  const [last] = useState(loadLastRoute)
  const [rideDate, setRideDate] = useState(existing?.ride_date ?? date)
  const [carType, setCarType] = useState<CarType>(existing?.car_type ?? (cars.length ? 'corporate' : 'own'))
  const [carId, setCarId] = useState<number | ''>(existing?.corporate_car_id ?? cars[0]?.id ?? '')
  const [carName, setCarName] = useState(existing?.car_type === 'own' ? existing.car_name : last.car_name)
  const [origin, setOrigin] = useState(existing?.origin ?? last.origin)
  const [destination, setDestination] = useState(existing?.destination ?? last.destination)
  const [departure, setDeparture] = useState(existing?.departure_time.slice(0, 5) ?? '08:00')
  const [ret, setRet] = useState(existing?.return_time?.slice(0, 5) ?? '17:00')
  const [oneWay, setOneWay] = useState(existing ? existing.return_time === null : false)
  const [rawSeats, setSeats] = useState(existing?.seats ?? 3)
  const [notes, setNotes] = useState(existing?.notes ?? '')

  const selectedCar = cars.find((c) => c.id === carId)
  const maxSeats = carType === 'corporate' && selectedCar ? selectedCar.passenger_seats : 8
  const minSeats = existing?.bookings.length ?? 0
  // Clamp during render so switching to a smaller car never leaves an invalid value.
  const seats = Math.min(rawSeats, maxSeats)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const localError =
    !oneWay && ret <= departure ? 'Return time must be after departure time' : null

  function submit(e: FormEvent) {
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
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} aria-labelledby="ride-form-title">
        <header className="modal-head">
          <h2 id="ride-form-title">{existing ? 'Edit ride' : 'Offer a ride'}</h2>
          <button type="button" className="btn-x btn-x-lg" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <p className="hint">
          Driving as <strong>{userName}</strong>
        </p>

        <div className="grid-2">
          <label>
            Day
            <input type="date" required value={rideDate} onChange={(e) => setRideDate(e.target.value)} />
          </label>
          <label>
            Free seats for passengers
            <input
              type="number"
              required
              min={minSeats}
              max={maxSeats}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
            />
          </label>
        </div>

        <fieldset className="cartype">
          <legend>Car</legend>
          <label className={`radio ${carType === 'corporate' ? 'radio-on' : ''} ${!cars.length ? 'radio-off' : ''}`}>
            <input
              type="radio"
              name="car_type"
              value="corporate"
              disabled={!cars.length}
              checked={carType === 'corporate'}
              onChange={() => setCarType('corporate')}
            />
            Company car
          </label>
          <label className={`radio ${carType === 'own' ? 'radio-on' : ''}`}>
            <input
              type="radio"
              name="car_type"
              value="own"
              checked={carType === 'own'}
              onChange={() => setCarType('own')}
            />
            My own car
          </label>
        </fieldset>

        {carType === 'corporate' ? (
          <label>
            Which company car
            <select required value={carId} onChange={(e) => setCarId(Number(e.target.value))}>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.plate} · {c.passenger_seats} seats
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Your car
            <input
              required
              placeholder="e.g. grey Octavia"
              maxLength={80}
              value={carName}
              onChange={(e) => setCarName(e.target.value)}
            />
          </label>
        )}

        <div className="grid-2">
          <label>
            From
            <input required maxLength={120} value={origin} onChange={(e) => setOrigin(e.target.value)} />
          </label>
          <label>
            To
            <input
              required
              maxLength={120}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </label>
        </div>

        <div className="grid-2">
          <label>
            Departure
            <input type="time" required value={departure} onChange={(e) => setDeparture(e.target.value)} />
          </label>
          <label>
            Return
            <input type="time" required={!oneWay} disabled={oneWay} value={ret} onChange={(e) => setRet(e.target.value)} />
            <span className="check">
              <input type="checkbox" checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} /> one way
            </span>
          </label>
        </div>

        <label>
          Notes <span className="muted">(optional)</span>
          <textarea
            rows={2}
            maxLength={500}
            placeholder="Meeting point, detours, luggage…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {(localError || error) && <p className="error">{localError ?? error}</p>}

        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !!localError}>
            {submitting ? 'Saving…' : existing ? 'Save changes' : 'Publish ride'}
          </button>
        </footer>
      </form>
    </div>
  )
}
