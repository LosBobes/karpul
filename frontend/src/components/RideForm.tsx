import { useState, type FormEvent } from 'react'
import { addDays, parseISODate, toISODate } from '../lib/dates'
import { messages, useT } from '../lib/i18n'
import type { CarType, CorporateCar, Ride, RideInput } from '../lib/types'
import { Avatar } from './Avatar'
import { DatePicker } from './DatePicker'
import { CarIcon, MinusIcon, PinIcon, PlusIcon, TrashIcon, XIcon } from './icons'
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
/** At most this many extra pickup points (backend: schemas.MAX_STOPS). */
const MAX_STOPS = 3
/** "Repeat weekly" may reach this far (backend: schemas.MAX_REPEAT_WEEKS). */
const MAX_REPEAT_WEEKS = 26

/** What the form remembers from the last ride you added: the route, your own
 *  car and how many seats you offered in it, so a regular commute is two taps. */
interface LastRoute {
  origin: string
  destination: string
  car_name: string
  seats?: number
}

function loadLastRoute(): LastRoute {
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { origin: '', destination: messages().form.defaultDestination, car_name: '' }
}

/** How many rides "repeat weekly until" makes: the first plus one per full week. */
function weeklyCount(from: string, until: string): number {
  const days = Math.round((parseISODate(until).getTime() - parseISODate(from).getTime()) / 86_400_000)
  return days < 0 ? 0 : Math.floor(days / 7) + 1
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
  const [rawSeats, setSeats] = useState(seed?.seats ?? last.seats ?? 3)
  const [notes, setNotes] = useState(seed?.notes ?? '')
  const [passengersManage, setPassengersManage] = useState(seed?.passengers_manage ?? false)
  const [stops, setStops] = useState<string[]>(seed?.stops ?? [])
  const [distance, setDistance] = useState(seed?.distance_km != null ? String(seed.distance_km) : '')
  const [chipIn, setChipIn] = useState(seed?.chip_in ?? '')
  // New rides only: one ride a week up to a date. Editing touches one ride.
  const [repeat, setRepeat] = useState(false)
  const [repeatUntil, setRepeatUntil] = useState(() => toISODate(addDays(parseISODate(existing?.ride_date ?? date), 7 * 4)))
  const repeatCount = repeat ? weeklyCount(rideDate, repeatUntil) : 1
  const repeatTooFar = repeat && weeklyCount(rideDate, repeatUntil) > MAX_REPEAT_WEEKS + 1
  const repeatTooEarly = repeat && repeatUntil < rideDate

  const selectedCar = cars.find((c) => c.id === carId)
  const maxSeats = carType === 'corporate' && selectedCar ? selectedCar.passenger_seats : 8
  const minSeats = existing?.bookings.length ?? 0
  // Clamp during render so switching to a smaller car never leaves an invalid value.
  const seats = Math.min(Math.max(rawSeats, minSeats), maxSeats)

  const distanceNum = distance.trim() === '' ? null : Number(distance.replace(',', '.'))
  const distanceBad = distanceNum !== null && (!Number.isFinite(distanceNum) || distanceNum < 0 || distanceNum > 2000)
  const localError =
    !oneWay && ret <= departure ? t.form.returnAfter : repeatTooFar ? t.form.repeatMax : repeatTooEarly ? t.form.repeatUntil : null

  function setStop(i: number, value: string) {
    setStops((ss) => ss.map((s, j) => (j === i ? value : s)))
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (localError || distanceBad) return
    try {
      const remembered: LastRoute = { origin, destination, car_name: carType === 'own' ? carName : last.car_name, seats }
      localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(remembered))
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
      stops: stops.map((s) => s.trim()).filter(Boolean),
      distance_km: distanceNum,
      chip_in: chipIn.trim(),
      repeat_until: !existing && repeat && repeatCount > 1 ? repeatUntil : null,
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
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !!localError || distanceBad}>
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

      {!existing && (
        <div className="field">
          <span className="field-label field-label-row">
            {t.form.repeat}
            <label className="toggle">
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
              <span>{t.form.repeatWeekly}</span>
            </label>
          </span>
          {repeat && (
            <>
              <div className="grid-2">
                <DatePicker label={t.form.repeatUntil} value={repeatUntil} onChange={setRepeatUntil} />
                <p className="hint hint-inline">{repeatCount > 1 ? t.form.repeatCount(repeatCount) : t.form.repeatMax}</p>
              </div>
            </>
          )}
        </div>
      )}

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

      <div className="field">
        <span className="field-label field-label-row">
          {t.form.stops} <span className="muted">{t.form.optional}</span>
        </span>
        {stops.map((stop, i) => (
          <span key={i} className="input-icon input-row">
            <PinIcon size={16} />
            <input
              aria-label={`${t.form.stops} ${i + 1}`}
              maxLength={120}
              placeholder={t.form.stopPlaceholder}
              value={stop}
              onChange={(e) => setStop(i, e.target.value)}
            />
            <button
              type="button"
              className="icon-btn icon-btn-sm input-clear"
              aria-label={t.form.removeStop}
              onClick={() => setStops((ss) => ss.filter((_, j) => j !== i))}
            >
              <XIcon size={16} />
            </button>
          </span>
        ))}
        {stops.length < MAX_STOPS && (
          <button type="button" className="add-row add-row-quiet" onClick={() => setStops((ss) => [...ss, ''])}>
            <PlusIcon size={18} /> {t.form.addStop}
          </button>
        )}
        <p className="hint">{t.form.stopsHint}</p>
      </div>

      <label className="field">
        <span className="field-label">{t.form.dropoff}</span>
        <span className="input-icon">
          <PinIcon size={16} />
          <input required maxLength={120} placeholder={t.form.dropoffPlaceholder} value={destination} onChange={(e) => setDestination(e.target.value)} />
        </span>
      </label>

      <div className="grid-2">
        <label className="field">
          <span className="field-label">
            {t.form.distance} <span className="muted">{t.form.optional}</span>
          </span>
          <span className="input-unit">
            <input
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              maxLength={7}
              placeholder="0"
              aria-invalid={distanceBad || undefined}
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
            <span aria-hidden="true">km</span>
          </span>
        </label>
        <label className="field">
          <span className="field-label">
            {t.form.chipIn} <span className="muted">{t.form.optional}</span>
          </span>
          <input maxLength={40} placeholder={t.form.chipInPlaceholder} value={chipIn} onChange={(e) => setChipIn(e.target.value)} />
        </label>
      </div>
      <p className="hint hint-tight">{t.form.distanceHint} {t.form.chipInHint}</p>

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
