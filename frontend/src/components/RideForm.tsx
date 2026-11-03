import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useKept } from '../lib/keep'
import { addDays, foldName, parseISODate, toISODate } from '../lib/dates'
import { messages, useT } from '../lib/i18n'
import { fmtKm, pinsFor } from '../lib/maps'
import { goesToGarage, officeDistance } from '../lib/offices'
import { useRoad } from '../lib/places'
import type { CarType, CorporateCar, Point, Ride, RideInput, RideRequest } from '../lib/types'
import { drives, useMe } from '../lib/me'
import { MAX_STOPS } from '../lib/stops'
import { clashOn, clashText, firstFreeDay, useCarBusy } from '../lib/carBusy'
import { PlaceDialog } from './PlaceDialog'
import { PlaceInput } from './PlaceInput'
import { Avatar } from './Avatar'
import { DriverPicker, type Driver } from './DriverPicker'
import { DatePicker } from './DatePicker'
import { CarIcon, ChevronRightIcon, CoffeeIcon, HandIcon, MinusIcon, PinIcon, PlusIcon, TrashIcon, XIcon } from './icons'
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
  /** A new ride in answer to this request: its day, time and way, and a seat for whoever asked. */
  request?: RideRequest | null
  /** A new ride in a company car's free stretch, picked on the day plan (components/DayPlan.tsx). */
  slot?: { carId: number; departure: string; ret: string } | null
  /** The last ride you drove (backend: GET /api/rides/last): a new ride starts as a copy of it while `prefill` is on. */
  previous?: Ride | null
  /** The account's choice (`User.prefill_rides`), switched in the form itself. */
  prefill?: boolean
  onPrefillChange?: (on: boolean) => void
  submitting: boolean
  error: string | null
  /** The error is the shared-car share (one a week): offer to add the ride for an admin to approve. */
  canAskApproval?: boolean
  /** `wayBack` is the mirror ride a one-way ride asked for with it (a second create). */
  onSubmit: (input: RideInput, wayBack?: RideInput) => void
  onDelete?: () => void
  onClose: () => void
}

const LAST_ROUTE_KEY = 'karpul.lastRoute'
/** Simple or advanced, remembered per browser like the view and the theme. */
const MODE_KEY = 'karpul.formMode'
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
    !seed.passengers_add_stops ||
    seed.stops.length > 0 ||
    seed.stops_before.length > 0 ||
    seed.distance_km != null ||
    seed.chip_in.trim() !== '' ||
    seed.coffee_please ||
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
  /** Your own car's plate, for the Beograd garage. */
  plate?: string
  /** The pins of the two, by folded name, when they had any. */
  points?: Record<string, Point>
}

/** A shared car's home as a pin, by its folded name. */
function homePin(car: CorporateCar | undefined): Record<string, Point> {
  return car && car.home && car.home_lat != null && car.home_lng != null ? { [foldName(car.home)]: { lat: car.home_lat, lng: car.home_lng } } : {}
}

/** Which place of the route the map picker is pinning. */
interface Picking {
  field: 'origin' | 'destination' | 'stop' | 'before'
  /** Which stop, for a stop. */
  index: number
}

const BLANK_ROUTE = (): LastRoute => ({ origin: '', destination: messages().form.defaultDestination, car_name: '' })

function loadLastRoute(): LastRoute {
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return BLANK_ROUTE()
}

/** How many rides "repeat weekly until" makes: the first plus one per full week. */
function weeklyCount(from: string, until: string): number {
  const days = Math.round((parseISODate(until).getTime() - parseISODate(from).getTime()) / 86_400_000)
  return days < 0 ? 0 : Math.floor(days / 7) + 1
}

/** The "Add ride" / "Edit ride" bottom sheet. */
export function RideForm({ date, userName, cars, existing, template, request = null, slot = null, previous = null, prefill = true, onPrefillChange, submitting, error, canAskApproval = false, onSubmit, onDelete, onClose }: Props) {
  const t = useT()
  const seed = existing ?? template ?? null
  const me = useMe()
  // A new ride of your own starts as a copy of the last one you drove, on the
  // day picked (the times, car, route and the rest; never the date or a repeat).
  const fresh = !seed
  const [fromPrevious, setFromPrevious] = useKept('rideForm.fromPrevious', () => fresh && prefill && !!previous)
  const prev = fresh && fromPrevious ? previous : null
  // What the fields are filled in from: the ride edited or duplicated, else the last one.
  const fill = seed ?? prev
  // A shared car of the last ride that has left the pool since is no pick.
  const fillCarId = (r: Ride | null) => (r?.corporate_car_id != null && (r !== prev || cars.some((c) => c.id === r.corporate_car_id)) ? r.corporate_car_id : null)
  const fillCarType = (r: Ride | null): CarType | null => (r?.car_type === 'corporate' && r === prev && fillCarId(r) === null ? (cars.length ? 'corporate' : 'own') : (r?.car_type ?? null))
  // An admin adding a ride picks who drives it; a duplicate keeps its driver.
  const picksDriver = !!me.admin && !existing
  const [driver, setDriver] = useKept<Driver>('rideForm.driver', () =>
    picksDriver && template?.driver_id != null ? { id: template.driver_id, name: template.driver_name } : { id: me.id, name: userName },
  )
  // Switched off, a new ride starts blank: not even the route this browser remembers.
  const [last] = useState(() => (fresh && !prefill ? BLANK_ROUTE() : loadLastRoute()))
  const [mode, setModeState] = useKept<Mode>('rideForm.mode', () => (isAdvancedRide(fill) ? 'advanced' : loadMode()))
  const [rideDate, setRideDate] = useKept('rideForm.rideDate', existing?.ride_date ?? request?.request_date ?? date)
  const [carType, setCarType] = useKept<CarType>('rideForm.carType', slot ? 'corporate' : (fillCarType(fill) ?? (cars.length ? 'corporate' : 'own')))
  const [carId, setCarId] = useKept<number | ''>('rideForm.carId', slot?.carId ?? fillCarId(fill) ?? cars[0]?.id ?? '')
  const [carName, setCarName] = useKept('rideForm.carName', fill?.car_type === 'own' ? fill.car_name : last.car_name)
  // A shared car kept somewhere (CorporateCar.home) starts a new ride there.
  const homeOf = (type: CarType, id: number | '') => (type === 'corporate' ? (cars.find((c) => c.id === id)?.home ?? '') : '')
  const [origin, setOrigin] = useKept('rideForm.origin', seed?.origin ?? request?.origin ?? prev?.origin ?? (homeOf(carType, carId) || last.origin))
  const [destination, setDestination] = useKept('rideForm.destination', seed?.destination ?? request?.destination ?? prev?.destination ?? last.destination)
  const [departure, setDeparture] = useKept('rideForm.departure', slot?.departure ?? seed?.departure_time.slice(0, 5) ?? request?.departure_time.slice(0, 5) ?? prev?.departure_time.slice(0, 5) ?? '08:00')
  const [ret, setRet] = useKept('rideForm.ret', slot?.ret ?? fill?.return_time?.slice(0, 5) ?? '17:00')
  const [oneWay, setOneWay] = useKept('rideForm.oneWay', fill && !slot ? fill.return_time === null : false)
  // A one-way ride's mirror image, offered with it: the route reversed, on its own day and time.
  const [wayBack, setWayBack] = useKept('rideForm.wayBack', false)
  const [backDate, setBackDate] = useKept('rideForm.backDate', existing?.ride_date ?? request?.request_date ?? date)
  const [backDeparture, setBackDeparture] = useKept('rideForm.backDeparture', '17:00')
  const offersWayBack = oneWay && !existing && !request
  const [rawSeats, setSeats] = useKept('rideForm.rawSeats', fill?.seats ?? last.seats ?? 3)
  const [notes, setNotes] = useKept('rideForm.notes', fill?.notes ?? '')
  const [passengersManage, setPassengersManage] = useKept('rideForm.passengersManage', fill?.passengers_manage ?? false)
  const [passengersAddStops, setPassengersAddStops] = useKept('rideForm.passengersAddStops', fill?.passengers_add_stops ?? true)
  const [coffee, setCoffee] = useKept('rideForm.coffee', fill?.coffee_please ?? false)
  const [plate, setPlate] = useKept('rideForm.plate', fill ? fill.plate : (last.plate ?? ''))
  const [stops, setStops] = useKept<string[]>('rideForm.stops', fill?.stops ?? [])
  const [stopsBefore, setStopsBefore] = useKept<string[]>('rideForm.stopsBefore', fill?.stops_before ?? [])
  const roomForStop = stops.length + stopsBefore.length < MAX_STOPS
  const [distance, setDistance] = useKept('rideForm.distance', fill?.distance_km != null ? String(fill.distance_km) : '')
  const [chipIn, setChipIn] = useKept('rideForm.chipIn', fill?.chip_in ?? '')
  // The pins of the route by folded name (lib/maps.ts): the ride's own, a
  // request's, the last route's and the shared cars' homes, whichever apply.
  const [pins, setPins] = useKept<Record<string, Point>>('rideForm.pins', () => ({
    ...(fill ? {} : (last.points ?? {})),
    ...Object.assign({}, ...cars.map(homePin)),
    ...(prev?.points ?? {}),
    ...(request?.points ?? {}),
    ...(seed?.points ?? {}),
  }))
  const [picking, setPicking] = useKept<Picking | null>('rideForm.picking', null)
  const pinOf = (place: string): Point | null => pins[foldName(place)] ?? null
  // Typed words keep whatever pin those words already have; a suggestion brings its own.
  const placeSetter = (set: (value: string) => void) => (value: string, point: Point | null) => {
    set(value)
    if (point && value.trim()) setPins((p) => ({ ...p, [foldName(value)]: point }))
  }
  // New rides only: one ride a week up to a date. Editing touches one ride.
  const [repeat, setRepeat] = useKept('rideForm.repeat', false)
  const [repeatUntil, setRepeatUntil] = useKept('rideForm.repeatUntil', () => toISODate(addDays(parseISODate(existing?.ride_date ?? date), 7 * 4)))
  const repeatCount = repeat ? weeklyCount(rideDate, repeatUntil) : 1
  const repeatTooFar = repeat && weeklyCount(rideDate, repeatUntil) > MAX_REPEAT_WEEKS + 1
  const repeatTooEarly = repeat && repeatUntil < rideDate

  const advanced = mode === 'advanced'
  // Whose passenger list the switch is about: the admin's own, or the driver's.
  const ownRide = existing ? drives(existing, me) : driver.id === me.id
  const listDriver = existing?.driver_name ?? driver.name
  const manageHint = passengersManage
    ? ownRide ? t.form.manageOn : t.form.manageOnFor(listDriver)
    : ownRide ? t.form.manageOff : t.form.manageOffFor(listDriver)
  function setMode(next: Mode) {
    setModeState(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  /** The switch: fill the form in from the last ride, or empty it back to a new one.
   *  The day stays, and so does whatever a request or a picked slot put there. */
  function startFromPrevious(on: boolean) {
    setFromPrevious(on)
    onPrefillChange?.(on)
    const r = on ? previous : null
    const base = on ? last : BLANK_ROUTE()
    const type: CarType = slot ? 'corporate' : (fillCarType(r) ?? (cars.length ? 'corporate' : 'own'))
    const id = slot?.carId ?? fillCarId(r) ?? cars[0]?.id ?? ''
    if (!slot) {
      setCarType(type)
      setCarId(id)
    }
    setCarName(r?.car_type === 'own' ? r.car_name : base.car_name)
    if (!request) {
      setOrigin(r?.origin ?? (homeOf(type, id) || base.origin))
      setDestination(r?.destination ?? base.destination)
      setDeparture(r?.departure_time.slice(0, 5) ?? '08:00')
    }
    if (!slot) {
      setRet(r?.return_time?.slice(0, 5) ?? '17:00')
      setOneWay(r ? r.return_time === null : false)
    }
    setSeats(r?.seats ?? base.seats ?? 3)
    setNotes(r?.notes ?? '')
    setPassengersManage(r?.passengers_manage ?? false)
    setPassengersAddStops(r?.passengers_add_stops ?? true)
    setCoffee(r?.coffee_please ?? false)
    setPlate(r ? r.plate : (base.plate ?? ''))
    setStops(r?.stops ?? [])
    setStopsBefore(r?.stops_before ?? [])
    setDistance(r?.distance_km != null ? String(r.distance_km) : '')
    setChipIn(r?.chip_in ?? '')
    if (r) setPins((p) => ({ ...p, ...r.points }))
    if (r && isAdvancedRide(r)) setModeState('advanced')
  }

  // Another car moves the start along with it, unless the start is one the driver typed.
  function pickCar(type: CarType, id: number | '') {
    const from = homeOf(carType, carId)
    const to = homeOf(type, id)
    setCarType(type)
    setCarId(id)
    if (seed || request || from === to) return
    if (origin.trim() === '' || origin === (from || last.origin) || origin === prev?.origin) setOrigin(to || last.origin)
  }

  const selectedCar = cars.find((c) => c.id === carId)
  const maxSeats = carType === 'corporate' && selectedCar ? selectedCar.passenger_seats : 8
  const minSeats = existing?.bookings.length ?? 0
  // Clamp during render so switching to a smaller car never leaves an invalid value.
  const seats = Math.min(Math.max(rawSeats, minSeats), maxSeats)

  const distanceNum = distance.trim() === '' ? null : Number(distance.replace(',', '.'))
  // The road between the offices is a known length (lib/offices.ts); the server fills a blank in with it.
  const knownKm = officeDistance(origin, destination)
  // An own car to the Beograd office: the garage lets in only the plates on its list.
  const askPlate = goesToGarage(carType, destination)
  // The driver's change to the day, times or route of a ride with passengers
  // waits for them to agree (backend: rides.update_ride); an admin's does not.
  const asksPassengers =
    !!existing && drives(existing, me) && existing.bookings.some((b) => b.passenger_id !== null && b.passenger_id !== existing.driver_id)
  // Elsewhere, with the two ends pinned and a road finder on the server, the
  // road's length is the placeholder, and what a blank distance is sent as.
  const roadPins = [pinOf(origin), ...stops.map(pinOf), pinOf(destination)]
  const roadKm = useRoad(knownKm === null && advanced && roadPins.every(Boolean) ? (roadPins as Point[]) : [])?.km ?? null
  const distanceBad = distanceNum !== null && (!Number.isFinite(distanceNum) || distanceNum < 0 || distanceNum > 2000)
  // An answer to a request has to be on the day that was asked for, with a
  // seat for whoever asked (the server says the same, in the same words).
  const requestError = request
    ? rideDate !== request.request_date
      ? t.apiError('The ride has to be on the requested day')
      : seats < 1
        ? t.apiError('Offer at least one seat to take the person who asked')
        : null
    : null
  // A shared car already taken in the hours asked for: the day is red in the
  // calendar and cannot be picked, and a day picked before the times moved says so.
  const [months, setMonths] = useState<string[]>([])
  const busyCar = carType === 'corporate' && carId !== '' ? carId : null
  // A weekly repeat books the same car on each of its days, so each is checked too.
  const repeatDates = !existing && repeat && !repeatTooFar && !repeatTooEarly ? Array.from({ length: repeatCount - 1 }, (_, i) => toISODate(addDays(parseISODate(rideDate), 7 * (i + 1)))) : []
  // A new ride in a shared car starts on a day the car is free in those hours:
  // the day asked for, else the next free one. Once per car, so a day the
  // driver picks (or times they move later) are never overruled.
  const autoDay = !existing && !request && !slot
  const [settledFor, setSettledFor] = useKept<number | null>('rideForm.settledFor', null)
  const settling = busyCar !== null && autoDay && settledFor !== busyCar
  // While it looks, the next three months come too: the free day may be in one of them.
  const probe = settling ? [1, 2, 3].map((n) => toISODate(new Date(parseISODate(rideDate).getFullYear(), parseISODate(rideDate).getMonth() + n, 1))) : []
  const { busy, known } = useCarBusy(busyCar, existing?.id ?? null, [rideDate, ...repeatDates, ...(offersWayBack && wayBack ? [backDate] : []), ...probe, ...months])
  const addMonth = (iso: string) => setMonths((ms) => (ms.includes(iso) ? ms : [...ms, iso]))
  const rideBusy = (iso: string) => {
    const b = clashOn(busy, iso, departure, oneWay ? null : ret)
    return b ? t.apiError(clashText(b)) : null
  }
  const backBusy = (iso: string) => {
    const b = clashOn(busy, iso, backDeparture, null)
    return b ? t.apiError(clashText(b)) : null
  }
  const repeatClash = (() => {
    for (const day of repeatDates) {
      const b = clashOn(busy, day, departure, oneWay ? null : ret)
      if (b) return t.apiError(`${clashText(b)} (${day})`)
    }
    return null
  })()
  const clash = rideBusy(rideDate) ?? repeatClash ?? (offersWayBack && wayBack ? backBusy(backDate) : null)
  // Until the car's days have come back the save waits, so a taken slot is never sent.
  const checkingCar = busyCar !== null && [rideDate, ...repeatDates, ...(offersWayBack && wayBack ? [backDate] : [])].some((d) => !known(d))

  const first = settling ? firstFreeDay(busy, known, rideDate, departure, oneWay ? null : ret, 60) : null
  // Nothing free three months on, or still loading: the day stays (and the save waits or says why).
  const settleTo = first && !first.unknown ? (first.free ?? rideDate) : null
  useEffect(() => {
    if (settleTo === null || busyCar === null) return
    // The car's days came back from the server: move off a taken day once.
    // oxlint-disable-next-line react/set-state-in-effect
    if (settleTo !== rideDate) setRideDate(settleTo)
    setSettledFor(busyCar)
  }, [settleTo, busyCar, rideDate, setRideDate, setSettledFor])
  const localError =
    !oneWay && ret <= departure
      ? t.form.returnAfter
      : repeatTooFar
        ? t.form.repeatMax
        : repeatTooEarly
          ? t.form.repeatUntil
          : (requestError ?? clash)

  // What the simple form is carrying out of sight, named so it is never a surprise.
  const stopCount = [...stopsBefore, ...stops].filter((s) => s.trim() !== '').length
  const extras = [
    !existing && repeat && repeatCount > 1 ? t.form.sumRepeat : null,
    stopCount ? t.form.sumStops(stopCount) : null,
    passengersManage ? t.form.sumManage : null,
    passengersAddStops ? null : t.form.sumNoNewStops,
    distance.trim() || knownKm !== null ? t.form.sumDistance : null,
    chipIn.trim() ? t.form.sumChipIn : null,
    coffee ? t.form.sumCoffee : null,
    notes.trim() ? t.form.sumNotes : null,
  ].filter((x): x is string => x !== null)

  // What was last sent, so "ask an admin" can send the same ride once more as pending.
  const lastInput = useRef<RideInput | null>(null)
  const askApproval = () => {
    if (lastInput.current) onSubmit({ ...lastInput.current, request_approval: true })
  }

  function pickingPlace(p: Picking): string {
    if (p.field === 'origin') return origin
    if (p.field === 'destination') return destination
    return (p.field === 'stop' ? stops : stopsBefore)[p.index] ?? ''
  }

  function pickingLabel(p: Picking): string {
    if (p.field === 'origin') return t.form.pickup
    if (p.field === 'destination') return t.form.dropoff
    return p.field === 'stop' ? `${t.form.stops} ${p.index + 1}` : `${t.detail.beforeStart} ${p.index + 1}`
  }

  function setPickingPlace(p: Picking, value: string) {
    if (p.field === 'origin') setOrigin(value)
    else if (p.field === 'destination') setDestination(value)
    else if (p.field === 'stop') setStop(p.index, value)
    else setStopBefore(p.index, value)
  }

  function setStop(i: number, value: string) {
    setStops((ss) => ss.map((s, j) => (j === i ? value : s)))
  }

  function setStopBefore(i: number, value: string) {
    setStopsBefore((ss) => ss.map((s, j) => (j === i ? value : s)))
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (localError || distanceBad || checkingCar) return
    try {
      // A ride an admin adds for someone else is not their own commute to remember.
      const remembered: LastRoute = {
        origin,
        destination,
        car_name: carType === 'own' ? carName : last.car_name,
        plate: carType === 'own' && plate.trim() ? plate.trim() : last.plate,
        seats,
        points: Object.fromEntries(
          [origin, destination].filter((p) => pinOf(p)).map((p) => [foldName(p), pinOf(p) as Point]),
        ),
      }
      if (driver.id === me.id) localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(remembered))
    } catch {
      /* ignore */
    }
    lastInput.current = {
      ride_date: rideDate,
      car_type: carType,
      car_name: carType === 'own' ? carName : '',
      corporate_car_id: carType === 'corporate' && carId !== '' ? carId : null,
      driver_name: driver.name,
      driver_id: picksDriver && driver.id !== me.id ? driver.id : null,
      origin,
      destination,
      departure_time: departure,
      return_time: oneWay ? null : ret,
      seats,
      notes,
      passengers_manage: passengersManage,
      passengers_add_stops: passengersAddStops,
      coffee_please: coffee,
      plate: askPlate ? plate.trim() : '',
      stops: stops.map((s) => s.trim()).filter(Boolean),
      stops_before: stopsBefore.map((s) => s.trim()).filter(Boolean),
      distance_km: distanceNum ?? (knownKm === null ? roadKm : null),
      chip_in: chipIn.trim(),
      points: pinsFor([...stopsBefore, origin, ...stops, destination], pins),
      repeat_until: !existing && repeat && repeatCount > 1 ? repeatUntil : null,
      request_id: request?.id ?? null,
    }
    const back: RideInput | undefined =
      offersWayBack && wayBack
        ? {
            ...lastInput.current,
            ride_date: backDate,
            origin: destination,
            destination: origin,
            departure_time: backDeparture,
            return_time: null,
            stops: [],
            stops_before: [],
            distance_km: distanceNum !== null && knownKm === null ? distanceNum : null,
            request_id: null,
          }
        : undefined
    onSubmit(lastInput.current, back)
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
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !!localError || distanceBad || checkingCar}>
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

      {request && (
        <div className="banner banner-ok form-answering">
          <HandIcon size={22} />
          <span>
            <strong>{t.requests.answering(request.name)}</strong> {t.requests.answeringHint}
          </span>
        </div>
      )}

      {/* The driver never changes, so it is a line that says so, not a field;
          only an admin adding a ride may choose whose it is. */}
      {picksDriver ? (
        <DriverPicker value={driver} meId={me.id} onChange={setDriver} />
      ) : (
        <div className="form-driver">
          <Avatar name={existing?.driver_name ?? userName} size="sm" />
          <span className="form-driver-name">{existing?.driver_name ?? userName}</span>
          <span className="form-driver-role">{t.form.driver}</span>
        </div>
      )}

      {fresh && previous && (
        <div className="field">
          <label className="switch-row">
            <span className="switch-row-text">
              <span className="switch-row-title">{t.form.fromLast}</span>
              <span className="switch-row-desc">
                {t.form.fromLastHint(previous.origin, previous.destination, previous.departure_time.slice(0, 5))}
              </span>
            </span>
            <input type="checkbox" checked={fromPrevious} onChange={(e) => startFromPrevious(e.target.checked)} />
          </label>
        </div>
      )}

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
            onClick={() => pickCar('corporate', carId)}
          >
            {t.form.companyCar}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={carType === 'own'}
            className={carType === 'own' ? 'seg seg-on' : 'seg'}
            onClick={() => pickCar('own', carId)}
          >
            {t.form.myOwnCar}
          </button>
        </div>
        {carType === 'corporate' ? (
          <Select
            label={t.form.whichCar}
            icon={<CarIcon size={16} />}
            value={carId === '' ? null : carId}
            options={cars.map((c) => ({ value: c.id, label: c.name, hint: [t.form.carHint(c.plate, c.passenger_seats), c.home].filter(Boolean).join(' · ') }))}
            onChange={(id) => pickCar('corporate', id)}
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
              <span className="switch-row-desc">{manageHint}</span>
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
            <DatePicker label={t.form.day} value={rideDate} onChange={setRideDate} busy={busyCar !== null ? rideBusy : undefined} onMonth={addMonth} />
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
        {asksPassengers && <p className="hint">{t.form.consentHint}</p>}
      </div>

      {offersWayBack && (
        <div className="field">
          <label className="switch-row">
            <span className="switch-row-text">
              <span className="switch-row-title">{t.form.wayBack}</span>
              <span className="switch-row-desc">{t.form.wayBackHint}</span>
            </span>
            <input type="checkbox" checked={wayBack} onChange={(e) => setWayBack(e.target.checked)} />
          </label>
          {wayBack && (
            <div className="when-grid when-grid-one">
              <div className="subfield">
                <span className="subfield-label">{t.form.wayBackDay}</span>
                <DatePicker label={t.form.wayBackDay} value={backDate} onChange={setBackDate} busy={busyCar !== null ? backBusy : undefined} onMonth={addMonth} />
              </div>
              <div className="subfield">
                <span className="subfield-label">{t.form.wayBackLeaves}</span>
                <TimePicker label={t.form.wayBackLeaves} value={backDeparture} onChange={setBackDeparture} />
              </div>
            </div>
          )}
        </div>
      )}

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
          {advanced && roomForStop && (
            <button type="button" className="route-add route-add-top" onClick={() => setStopsBefore((ss) => [...ss, ''])}>
              <PlusIcon size={16} /> {t.form.addStopBefore}
            </button>
          )}
          {advanced &&
            stopsBefore.map((stop, i) => (
              <span key={i} className="route-row route-row-stop">
                <PinIcon size={16} />
                <span className="route-tag">{t.form.beforeTag}</span>
                <PlaceInput
                  label={`${t.detail.beforeStart} ${i + 1}`}
                  placeholder={t.form.stopPlaceholder}
                  value={stop}
                  point={pinOf(stop)}
                  near={pinOf(origin)}
                  onChange={placeSetter((v) => setStopBefore(i, v))}
                  onMap={() => setPicking({ field: 'before', index: i })}
                />
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={t.form.removeStop}
                  onClick={() => setStopsBefore((ss) => ss.filter((_, j) => j !== i))}
                >
                  <XIcon size={16} />
                </button>
              </span>
            ))}
          <span className="route-row">
            <PinIcon size={16} />
            <span className="route-tag">{t.form.from}</span>
            <PlaceInput
              required
              label={t.form.pickup}
              placeholder={t.form.pickupPlaceholder}
              value={origin}
              point={pinOf(origin)}
              near={pinOf(destination)}
              onChange={placeSetter(setOrigin)}
              onMap={() => setPicking({ field: 'origin', index: 0 })}
            />
          </span>
          {advanced &&
            stops.map((stop, i) => (
              <span key={i} className="route-row route-row-stop">
                <PinIcon size={16} />
                <span className="route-tag">{t.form.stopTag}</span>
                <PlaceInput
                  label={`${t.form.stops} ${i + 1}`}
                  placeholder={t.form.stopPlaceholder}
                  value={stop}
                  point={pinOf(stop)}
                  near={pinOf(origin)}
                  onChange={placeSetter((v) => setStop(i, v))}
                  onMap={() => setPicking({ field: 'stop', index: i })}
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
            <PlaceInput
              required
              label={t.form.dropoff}
              placeholder={t.form.dropoffPlaceholder}
              value={destination}
              point={pinOf(destination)}
              near={pinOf(origin)}
              onChange={placeSetter(setDestination)}
              onMap={() => setPicking({ field: 'destination', index: 0 })}
            />
          </span>
          {advanced && roomForStop && (
            <button type="button" className="route-add" onClick={() => setStops((ss) => [...ss, ''])}>
              <PlusIcon size={16} /> {t.form.addStop}
            </button>
          )}
        </div>
        {picking && (
          <PlaceDialog
            key={JSON.stringify(picking)}
            title={pickingLabel(picking)}
            value={pickingPlace(picking)}
            point={pinOf(pickingPlace(picking))}
            near={pinOf(origin) ?? pinOf(destination)}
            onClose={() => setPicking(null)}
            onPick={(name, point) => {
              setPickingPlace(picking, name)
              setPins((p) => ({ ...p, [foldName(name)]: point }))
              setPicking(null)
            }}
          />
        )}
        {advanced && <p className="hint">{t.form.stopsHint}</p>}
        {advanced && (
          <label className="switch-row">
            <span className="switch-row-text">
              <span className="switch-row-title">{t.form.canAddStops}</span>
              <span className="switch-row-desc">{passengersAddStops ? t.form.addStopsOn : t.form.addStopsOff}</span>
            </span>
            <input type="checkbox" checked={passengersAddStops} onChange={(e) => setPassengersAddStops(e.target.checked)} />
          </label>
        )}
      </div>

      {/* An own car to the Beograd office: the garage lets in only the plates on its list. */}
      {askPlate && (
        <label className="field">
          <span className="field-label">{t.form.plate}</span>
          <input
            placeholder={t.form.platePlaceholder}
            maxLength={16}
            autoCapitalize="characters"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
          />
          <span className="hint">{t.form.plateHint}</span>
        </label>
      )}

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
                  placeholder={knownKm !== null ? String(knownKm) : roadKm !== null ? fmtKm(roadKm) : '0'}
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
            {knownKm !== null && distance.trim() === ''
              ? t.form.knownRoad(knownKm)
              : roadKm !== null && distance.trim() === ''
                ? t.form.roadKm(fmtKm(roadKm))
                : t.form.distanceHint}{' '}
            {t.form.chipInHint}
          </p>

          <label className="switch-row">
            <span className="switch-row-text">
              <span className="switch-row-title switch-row-title-icon">
                <CoffeeIcon size={16} /> {t.form.coffee}
              </span>
            </span>
            <input type="checkbox" checked={coffee} onChange={(e) => setCoffee(e.target.checked)} />
          </label>

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
      {!localError && error && canAskApproval && !existing && (
        <div className="form-ask">
          <button type="button" className="btn btn-soft btn-block" disabled={submitting} onClick={askApproval}>
            <HandIcon size={18} /> {t.form.askApproval}
          </button>
          <p className="hint">{t.form.askApprovalHint}</p>
        </div>
      )}
    </Sheet>
  )
}

