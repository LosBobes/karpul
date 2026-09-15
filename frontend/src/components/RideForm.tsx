import { useState, type FormEvent } from 'react'
import { addDays, parseISODate, toISODate } from '../lib/dates'
import { messages, useT } from '../lib/i18n'
import type { CarType, CorporateCar, Ride, RideInput } from '../lib/types'
import { Avatar } from './Avatar'
import { DatePicker } from './DatePicker'
import { CarIcon, ChevronRightIcon, MinusIcon, PinIcon, PlusIcon, TrashIcon, XIcon } from './icons'
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
/** Simple or advanced, remembered per browser like the view and the theme. */
const MODE_KEY = 'karpul.formMode'
/** At most this many extra pickup points (backend: schemas.MAX_STOPS). */
const MAX_STOPS = 3
/** "Repeat weekly" may reach this far (backend: schemas.MAX_REPEAT_WEEKS). */
const MAX_REPEAT_WEEKS = 26

/**
 * Two depths of the same form. *Simple* asks only what a ride cannot be made
 * without: who drives, which car, how many seats, when, and where from and to.
 * *Advanced* adds the rest in place (the passenger-list switch under the seats,
 * repeats under the day, the pickup points inside the route, then distance,
 * chip-in and the note), so switching mode never reshuffles the fields you
 * already filled in — it only reveals or hides the ones around them.
 *
 * Nothing is dropped by going back to Simple: the values stay in state and are
 * submitted, and a one-line summary at the foot of the simple form says which
 * advanced settings are carrying a value, with a tap to go and see them.
 */
type Mode = 'simple' | 'advanced'

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

/** A ride that already carries an advanced setting opens on the advanced form,
 *  so editing it never hides what is there behind a mode the driver forgot. */
function isAdvancedRide(seed: Ride | null): boolean {
  if (!seed) return false
  return (
    seed.passengers_manage ||
    seed.stops.length > 0 ||
    seed.distance_km != null ||
    seed.chip_in.trim() !== '' ||
    seed.notes.trim() !== ''
  )
}

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
  const [mode, setModeState] = useState<Mode>(() => (isAdvancedRide(seed) ? 'advanced' : loadMode()))
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

  const advanced = mode === 'advanced'
  function setMode(next: Mode) {
    setModeState(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const selectedCar = cars.find((c) => c.id === carId)
  const maxSeats = carType === 'corporate' && selectedCar ? selectedCar.passenger_seats : 8
  const minSeats = existing?.bookings.length ?? 0
  // Clamp during render so switching to a smaller car never leaves an invalid value.
  const seats = Math.min(Math.max(rawSeats, minSeats), maxSeats)

  const distanceNum = distance.trim() === '' ? null : Number(distance.replace(',', '.'))
  const distanceBad = distanceNum !== null && (!Number.isFinite(distanceNum) || distanceNum < 0 || distanceNum > 2000)
  const localError =
    !oneWay && ret <= departure ? t.form.returnAfter : repeatTooFar ? t.form.repeatMax : repeatTooEarly ? t.form.repeatUntil : null

  // What the simple form is carrying out of sight, named so it is never a surprise.
  const stopCount = stops.filter((s) => s.trim() !== '').length
  const extras = [
    !existing && repeat && repeatCount > 1 ? t.form.sumRepeat : null,
    stopCount ? t.form.sumStops(stopCount) : null,
    passengersManage ? t.form.sumManage : null,
    distance.trim() ? t.form.sumDistance : null,
    chipIn.trim() ? t.form.sumChipIn : null,
    notes.trim() ? t.form.sumNotes : null,
  ].filter((x): x is string => x !== null)

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
      className="ride-form"
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
      {/* Sticky, so the way back to the short form is never scrolled away. */}
      <div className="form-mode">
        <div className="segmented" role="radiogroup" aria-label={t.form.detailLevel}>
          <SegThumb count={2} index={advanced ? 1 : 0} />
          <button type="button" role="radio" aria-checked={!advanced} className={advanced ? 'seg' : 'seg seg-on'} onClick={() => setMode('simple')}>
            {t.form.simple}
          </button>
          <button type="button" role="radio" aria-checked={advanced} className={advanced ? 'seg seg-on' : 'seg'} onClick={() => setMode('advanced')}>
            {t.form.advanced}
          </button>
        </div>
      </div>

      {/* The driver never changes, so it is a line that says so, not a field. */}
      <div className="form-driver">
        <Avatar name={userName} size="sm" />
        <span className="form-driver-name">{userName}</span>
        <span className="form-driver-role">{t.form.driver}</span>
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
        <div className="field-row">
          <span className="field-label" id="capacity-label">
            {t.form.seats}
          </span>
          <div className="stepper stepper-sm" role="group" aria-labelledby="capacity-label">
            <button type="button" aria-label={t.form.fewer} disabled={seats <= minSeats} onClick={() => setSeats(seats - 1)}>
              <MinusIcon />
            </button>
            <output aria-live="polite">{seats}</output>
            <button type="button" aria-label={t.form.more} disabled={seats >= maxSeats} onClick={() => setSeats(seats + 1)}>
              <PlusIcon />
            </button>
          </div>
        </div>
        {minSeats > 0 && <p className="hint">{t.form.alreadyBooked(minSeats)}</p>}
      </div>

      {advanced && (
        <div className="field">
          <span className="field-label">{t.form.passengerList}</span>
          <label className="switch-row">
            <span className="switch-row-text">
              <span className="switch-row-title">{t.form.canManage}</span>
              <span className="switch-row-desc">{passengersManage ? t.form.manageOn : t.form.manageOff}</span>
            </span>
            <input type="checkbox" checked={passengersManage} onChange={(e) => setPassengersManage(e.target.checked)} />
          </label>
        </div>
      )}

      {/* Day, departure and return read as one line: rides are same-day, so the
          return has a time and no date of its own. */}
      <div className="field">
        <span className="field-label field-label-row">
          {t.form.when}
          <label className="toggle">
            <span>{t.form.oneWay}</span>
            <input type="checkbox" checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} />
          </label>
        </span>
        <div className={oneWay ? 'when-grid when-grid-one' : 'when-grid'}>
          <div className="subfield">
            <span className="subfield-label">{t.form.day}</span>
            <DatePicker label={t.form.day} value={rideDate} onChange={setRideDate} />
          </div>
          <div className="subfield">
            <span className="subfield-label">{t.form.departs}</span>
            <TimePicker label={t.form.departureTime} value={departure} onChange={setDeparture} />
          </div>
          {!oneWay && (
            <div className="subfield">
              <span className="subfield-label">{t.form.returns}</span>
              <TimePicker label={t.form.returnTime} value={ret} onChange={setRet} />
            </div>
          )}
        </div>
      </div>

      {advanced && !existing && (
        <div className="field">
          <label className="switch-row">
            <span className="switch-row-text">
              <span className="switch-row-title">{t.form.repeatWeekly}</span>
              {!repeat && <span className="switch-row-desc">{t.form.repeatMax}</span>}
            </span>
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          </label>
          {repeat && (
            <div className="grid-2">
              <div className="subfield">
                <span className="subfield-label">{t.form.repeatUntil}</span>
                <DatePicker label={t.form.repeatUntil} value={repeatUntil} onChange={setRepeatUntil} />
              </div>
              <p className="hint hint-inline">{repeatCount > 1 ? t.form.repeatCount(repeatCount) : t.form.repeatMax}</p>
            </div>
          )}
        </div>
      )}

      {/* One box, one focus ring: start, the stops between and the destination
          are the same journey, so they are drawn as one stack of rows. */}
      <div className="field">
        <span className="field-label">{t.form.route}</span>
        <div className="route">
          <span className="route-row">
            <PinIcon size={16} />
            <span className="route-tag">{t.form.from}</span>
            <input
              required
              aria-label={t.form.pickup}
              maxLength={120}
              placeholder={t.form.pickupPlaceholder}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
          </span>
          {advanced &&
            stops.map((stop, i) => (
              <span key={i} className="route-row route-row-stop">
                <PinIcon size={16} />
                <span className="route-tag">{t.form.stopTag}</span>
                <input
                  aria-label={`${t.form.stops} ${i + 1}`}
                  maxLength={120}
                  placeholder={t.form.stopPlaceholder}
                  value={stop}
                  onChange={(e) => setStop(i, e.target.value)}
                />
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={t.form.removeStop}
                  onClick={() => setStops((ss) => ss.filter((_, j) => j !== i))}
                >
                  <XIcon size={16} />
                </button>
              </span>
            ))}
          <span className="route-row">
            <PinIcon size={16} />
            <span className="route-tag">{t.form.to}</span>
            <input
              required
              aria-label={t.form.dropoff}
              maxLength={120}
              placeholder={t.form.dropoffPlaceholder}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </span>
          {advanced && stops.length < MAX_STOPS && (
            <button type="button" className="route-add" onClick={() => setStops((ss) => [...ss, ''])}>
              <PlusIcon size={16} /> {t.form.addStop}
            </button>
          )}
        </div>
        {advanced && <p className="hint">{t.form.stopsHint}</p>}
      </div>

      {advanced && (
        <>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">{t.form.distance}</span>
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
              <span className="field-label">{t.form.chipIn}</span>
              <input maxLength={40} placeholder={t.form.chipInPlaceholder} value={chipIn} onChange={(e) => setChipIn(e.target.value)} />
            </label>
          </div>
          <p className="hint hint-tight">
            {t.form.distanceHint} {t.form.chipInHint}
          </p>

          <label className="field">
            <span className="field-label">
              {t.form.notes} <span className="muted">{t.form.optional}</span>
            </span>
            <textarea rows={2} maxLength={500} placeholder={t.form.notesPlaceholder} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </>
      )}

      {!advanced && extras.length > 0 && (
        <button type="button" className="form-extras" onClick={() => setMode('advanced')}>
          <span>{t.form.alsoSet(extras.join(' · '))}</span>
          <ChevronRightIcon size={16} />
        </button>
      )}

      {(localError || error) && <p className="error">{localError ?? error}</p>}
    </Sheet>
  )
}
