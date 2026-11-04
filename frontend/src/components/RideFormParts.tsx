import { CarIcon, CoffeeIcon, MinusIcon, PlusIcon } from './icons'
import { useT } from '../lib/i18n'
import { fmtKm } from '../lib/maps'
import type { CarType, CorporateCar } from '../lib/types'
import { DatePicker } from './DatePicker'
import { SegThumb } from './Segmented'
import { Select } from './Select'
import { TimePicker } from './TimePicker'

/* The ride form's field groups (components/RideForm.tsx), each drawn from the
 * state the form holds and handed back through its setters. */

type Busy = ((day: string) => string | null) | undefined

export function CarField({ cars, carType, carId, carName, onPick, onCarName }: {
  cars: CorporateCar[]
  carType: CarType
  carId: number | ''
  carName: string
  onPick: (type: CarType, id: number | '') => void
  onCarName: (name: string) => void
}) {
  const t = useT()
  return (
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
          onClick={() => onPick('corporate', carId)}
        >
          {t.form.companyCar}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={carType === 'own'}
          className={carType === 'own' ? 'seg seg-on' : 'seg'}
          onClick={() => onPick('own', carId)}
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
          onChange={(id) => onPick('corporate', id)}
        />
      ) : (
        <input
          required
          aria-label={t.form.yourCar}
          placeholder={t.form.carPlaceholder}
          maxLength={80}
          value={carName}
          onChange={(e) => onCarName(e.target.value)}
        />
      )}
    </div>
  )
}

export function SeatsField({ seats, minSeats, maxSeats, onSeats }: { seats: number; minSeats: number; maxSeats: number; onSeats: (n: number) => void }) {
  const t = useT()
  return (
    <div className="field">
      <div className="field-row">
        <span className="field-label" id="capacity-label">
          {t.form.seats}
        </span>
        <div className="stepper stepper-sm" role="group" aria-labelledby="capacity-label">
          <button type="button" aria-label={t.form.fewer} disabled={seats <= minSeats} onClick={() => onSeats(seats - 1)}>
            <MinusIcon />
          </button>
          <output aria-live="polite">{seats}</output>
          <button type="button" aria-label={t.form.more} disabled={seats >= maxSeats} onClick={() => onSeats(seats + 1)}>
            <PlusIcon />
          </button>
        </div>
      </div>
      {minSeats > 0 && <p className="hint">{t.form.alreadyBooked(minSeats)}</p>}
    </div>
  )
}

/** Day, departure and return as one line: rides are same-day, so the return has a time and no date of its own. */
export function WhenField(p: {
  oneWay: boolean
  onOneWay: (on: boolean) => void
  rideDate: string
  onRideDate: (d: string) => void
  departure: string
  onDeparture: (v: string) => void
  ret: string
  onRet: (v: string) => void
  busy: Busy
  onMonth: (month: string) => void
  asksPassengers: boolean
}) {
  const t = useT()
  return (
    <div className="field">
      <span className="field-label field-label-row">
        {t.form.when}
        <label className="toggle">
          <span>{t.form.oneWay}</span>
          <input type="checkbox" checked={p.oneWay} onChange={(e) => p.onOneWay(e.target.checked)} />
        </label>
      </span>
      <div className={p.oneWay ? 'when-grid when-grid-one' : 'when-grid'}>
        <div className="subfield">
          <span className="subfield-label">{t.form.day}</span>
          <DatePicker label={t.form.day} value={p.rideDate} onChange={p.onRideDate} busy={p.busy} onMonth={p.onMonth} />
        </div>
        <div className="subfield">
          <span className="subfield-label">{t.form.departs}</span>
          <TimePicker label={t.form.departureTime} value={p.departure} onChange={p.onDeparture} />
        </div>
        {!p.oneWay && (
          <div className="subfield">
            <span className="subfield-label">{t.form.returns}</span>
            <TimePicker label={t.form.returnTime} value={p.ret} onChange={p.onRet} />
          </div>
        )}
      </div>
      {p.asksPassengers && <p className="hint">{t.form.consentHint}</p>}
    </div>
  )
}

/** On a new one-way ride: *Add the way back too*, on its own day and time. */
export function WayBackField(p: {
  on: boolean
  onToggle: (on: boolean) => void
  backDate: string
  onBackDate: (d: string) => void
  backDeparture: string
  onBackDeparture: (v: string) => void
  busy: Busy
  onMonth: (month: string) => void
}) {
  const t = useT()
  return (
    <div className="field">
      <label className="switch-row">
        <span className="switch-row-text">
          <span className="switch-row-title">{t.form.wayBack}</span>
          <span className="switch-row-desc">{t.form.wayBackHint}</span>
        </span>
        <input type="checkbox" checked={p.on} onChange={(e) => p.onToggle(e.target.checked)} />
      </label>
      {p.on && (
        <div className="when-grid when-grid-one">
          <div className="subfield">
            <span className="subfield-label">{t.form.wayBackDay}</span>
            <DatePicker label={t.form.wayBackDay} value={p.backDate} onChange={p.onBackDate} busy={p.busy} onMonth={p.onMonth} />
          </div>
          <div className="subfield">
            <span className="subfield-label">{t.form.wayBackLeaves}</span>
            <TimePicker label={t.form.wayBackLeaves} value={p.backDeparture} onChange={p.onBackDeparture} />
          </div>
        </div>
      )}
    </div>
  )
}

export function RepeatField({ repeat, onRepeat, until, onUntil, count }: { repeat: boolean; onRepeat: (on: boolean) => void; until: string; onUntil: (d: string) => void; count: number }) {
  const t = useT()
  return (
    <div className="field">
      <label className="switch-row">
        <span className="switch-row-text">
          <span className="switch-row-title">{t.form.repeatWeekly}</span>
          {!repeat && <span className="switch-row-desc">{t.form.repeatMax}</span>}
        </span>
        <input type="checkbox" checked={repeat} onChange={(e) => onRepeat(e.target.checked)} />
      </label>
      {repeat && (
        <div className="grid-2">
          <div className="subfield">
            <span className="subfield-label">{t.form.repeatUntil}</span>
            <DatePicker label={t.form.repeatUntil} value={until} onChange={onUntil} />
          </div>
          <p className="hint hint-inline">{count > 1 ? t.form.repeatCount(count) : t.form.repeatMax}</p>
        </div>
      )}
    </div>
  )
}

/** The Advanced tail: distance and chip-in, the coffee switch and the note. */
export function ExtrasFields(p: {
  distance: string
  onDistance: (v: string) => void
  distanceBad: boolean
  /** The office road's known length (lib/offices.ts), else the router's figure. */
  knownKm: number | null
  roadKm: number | null
  chipIn: string
  onChipIn: (v: string) => void
  coffee: boolean
  onCoffee: (on: boolean) => void
  notes: string
  onNotes: (v: string) => void
}) {
  const t = useT()
  const { knownKm, roadKm, distance } = p
  return (
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
              aria-invalid={p.distanceBad || undefined}
              value={distance}
              onChange={(e) => p.onDistance(e.target.value)}
            />
            <span aria-hidden="true">km</span>
          </span>
        </label>
        <label className="field">
          <span className="field-label">{t.form.chipIn}</span>
          <input maxLength={40} placeholder={t.form.chipInPlaceholder} value={p.chipIn} onChange={(e) => p.onChipIn(e.target.value)} />
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
        <input type="checkbox" checked={p.coffee} onChange={(e) => p.onCoffee(e.target.checked)} />
      </label>

      <label className="field">
        <span className="field-label">
          {t.form.notes} <span className="muted">{t.form.optional}</span>
        </span>
        <textarea rows={2} maxLength={500} placeholder={t.form.notesPlaceholder} value={p.notes} onChange={(e) => p.onNotes(e.target.value)} />
      </label>
    </>
  )
}
