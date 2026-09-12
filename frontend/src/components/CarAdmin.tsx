import { useEffect, useState, type FormEvent } from 'react'
import { fmtShortDate, fmtTime, shortCarName } from '../lib/dates'
import { messages, useT } from '../lib/i18n'
import type { CarUsage, CorporateCar, CorporateCarInput } from '../lib/types'
import { CarGlyph, PowertrainMark } from './CarArt'
import { CarIcon, ChartIcon, KebabIcon, MinusIcon, PencilIcon, PlusIcon, TrashIcon } from './icons'
import { Menu } from './Menu'
import { SegThumb } from './Segmented'
import { Sheet } from './Sheet'

type CarPatch = Partial<CorporateCarInput & { active: boolean }>

interface Props {
  unlocked: boolean
  cars: CorporateCar[]
  loading: boolean
  error: string | null
  busyId: number | null
  onUnlock: (password: string) => void
  onLock: () => void
  onCreate: (input: CorporateCarInput) => void
  onUpdate: (id: number, patch: CarPatch) => void
  onDelete: (car: CorporateCar) => void
  /** The usage report for the last `days` days (admin, see backend services.corporate_usage). */
  onLoadUsage: (days: number) => Promise<CarUsage>
  onClose: () => void
}

/** Sentinel id for the "add a car" row, which has no car id of its own. */
export const NEW_CAR_BUSY_ID = -1

type Tab = 'cars' | 'usage'

/** The company-car pool, behind the shared admin password, with a usage tab. */
export function CarAdmin({ unlocked, cars, loading, error, busyId, onUnlock, onLock, onCreate, onUpdate, onDelete, onLoadUsage, onClose }: Props) {
  const t = useT()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [tab, setTab] = useState<Tab>('cars')

  if (!unlocked) {
    return <Unlock error={error} loading={loading} onUnlock={onUnlock} onClose={onClose} />
  }

  return (
    <Sheet
      id="car-admin-title"
      title={t.admin.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
            {t.common.done}
          </button>
          <button type="button" className="link" onClick={onLock}>
            {t.admin.forget}
          </button>
        </>
      }
    >
      <div className="segmented admin-tabs" role="radiogroup" aria-label={t.admin.title}>
        <SegThumb count={2} index={tab === 'cars' ? 0 : 1} />
        <button type="button" role="radio" aria-checked={tab === 'cars'} className={tab === 'cars' ? 'seg seg-on' : 'seg'} onClick={() => setTab('cars')}>
          <CarIcon size={16} /> {t.usage.carsTab}
        </button>
        <button type="button" role="radio" aria-checked={tab === 'usage'} className={tab === 'usage' ? 'seg seg-on' : 'seg'} onClick={() => setTab('usage')}>
          <ChartIcon size={16} /> {t.usage.tab}
        </button>
      </div>

      {tab === 'usage' && <Usage load={onLoadUsage} />}

      {tab === 'cars' && (
        <>
      <p className="hint">{t.admin.hint}</p>

      {error && <p className="error">{error}</p>}

      <ul className="admin-list">
        {loading && cars.length === 0 && <li className="hint">{t.common.loading}</li>}
        {cars.map((car) => (
          <li key={car.id} className={car.active ? 'admin-row' : 'admin-row admin-row-retired'}>
            <span className="admin-car-icon" aria-hidden="true">
              <CarGlyph carName={car.name} size={16} />
            </span>
            <span className="admin-row-text">
              <strong>
                {car.name}
                <PowertrainMark carName={car.name} />
              </strong>
              <span>
                <span className="mono">{car.plate}</span> · {t.admin.seats(car.passenger_seats)}
                {!car.active && <span className="tag">{t.admin.retired}</span>}
              </span>
            </span>
            <Menu
              trigger={<KebabIcon />}
              label={t.admin.optionsFor(car.name)}
              items={[
                { label: t.common.edit, icon: <PencilIcon size={18} />, onSelect: () => setEditing(car.id), disabled: busyId === car.id },
                {
                  label: car.active ? t.admin.retire : t.admin.restore,
                  icon: <CarIcon size={18} />,
                  onSelect: () => onUpdate(car.id, { active: !car.active }),
                  disabled: busyId === car.id,
                },
                { label: t.common.delete, icon: <TrashIcon size={18} />, onSelect: () => onDelete(car), danger: true, disabled: busyId === car.id },
              ]}
            />
            {editing === car.id && (
              <CarEditor
                key={`${car.id}:${car.name}:${car.plate}:${car.passenger_seats}`}
                initial={{ name: car.name, plate: car.plate, passenger_seats: car.passenger_seats }}
                busy={busyId === car.id}
                submitLabel={t.common.save}
                onSubmit={(input) => {
                  onUpdate(car.id, input)
                  setEditing(null)
                }}
                onCancel={() => setEditing(null)}
              />
            )}
          </li>
        ))}
      </ul>

      {editing === 'new' ? (
        <CarEditor
          initial={{ name: '', plate: '', passenger_seats: 4 }}
          busy={busyId === NEW_CAR_BUSY_ID}
          submitLabel={t.admin.addCar}
          onSubmit={(input) => {
            onCreate(input)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="add-row" onClick={() => setEditing('new')}>
          <PlusIcon size={18} /> {t.admin.addCompanyCar}
        </button>
      )}
        </>
      )}
    </Sheet>
  )
}

const WINDOWS = [30, 90, 365] as const

/**
 * How the pool is used: per car the rides, the days it went out (as a share
 * of the working days in the window), drivers, passengers and kilometres,
 * when it last went out and what is booked ahead; then the rides themselves.
 */
function Usage({ load }: { load: (days: number) => Promise<CarUsage> }) {
  const t = useT()
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(90)
  const [report, setReport] = useState<CarUsage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // Data fetching, like App.load: a window change clears the old error first.
    // oxlint-disable-next-line react/set-state-in-effect
    setError(null)
    load(days)
      .then((r) => live && setReport(r))
      .catch((e) => live && setError(e instanceof Error ? messages().apiError(e.message) : messages().common.somethingWrong))
    return () => {
      live = false
    }
  }, [days, load])

  const pct = (rate: number) => `${Math.round(rate * 100)}%`

  return (
    <div className="usage">
      <div className="segmented usage-window" role="radiogroup" aria-label={t.usage.window(days)}>
        <SegThumb count={WINDOWS.length} index={WINDOWS.indexOf(days)} />
        {WINDOWS.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? 'seg seg-on' : 'seg'} onClick={() => setDays(d)}>
            {t.usage.window(d)}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {!report && !error && <p className="hint">{t.common.loading}</p>}

      {report && (
        <>
          <div className="stat-grid stat-grid-4">
            <div className="card stat-tile">
              <strong className="when-value">{report.totals.rides}</strong>
              <span>{t.usage.ridesLabel}</span>
            </div>
            <div className="card stat-tile">
              <strong className="when-value">{report.totals.days_used}</strong>
              <span>{t.usage.daysOut}</span>
            </div>
            <div className="card stat-tile">
              <strong className="when-value">{report.totals.passengers}</strong>
              <span>{t.usage.passengers}</span>
            </div>
            <div className="card stat-tile">
              <strong className="when-value">{report.totals.km}</strong>
              <span>{t.usage.km}</span>
            </div>
          </div>
          <p className="hint">{t.usage.useRateHint(report.working_days)}</p>

          <ul className="usage-list">
            {report.cars.map((row) => (
              <li key={row.car.id} className={row.car.active ? 'card usage-car' : 'card usage-car usage-car-retired'}>
                <div className="usage-car-head">
                  <span className="admin-car-icon" aria-hidden="true">
                    <CarGlyph carName={row.car.name} size={16} />
                  </span>
                  <span className="admin-row-text">
                    <strong>
                      {row.car.name}
                      <PowertrainMark carName={row.car.name} />
                      {!row.car.active && <span className="tag">{t.usage.retired}</span>}
                    </strong>
                    <span>
                      <span className="mono">{row.car.plate}</span> · {t.usage.lastUsed}: {row.last_used ? fmtShortDate(row.last_used) : t.usage.never}
                      {row.upcoming > 0 && ` · ${t.usage.booked(row.upcoming)}`}
                    </span>
                  </span>
                  <span className="usage-rate when-value" title={t.usage.useRate}>
                    {pct(row.use_rate)}
                  </span>
                </div>
                <div className="usage-bar" role="img" aria-label={`${t.usage.useRate} ${pct(row.use_rate)}`}>
                  <span style={{ width: pct(Math.min(row.use_rate, 1)) }} />
                </div>
                <dl className="usage-facts">
                  <div>
                    <dt>{t.usage.ridesLabel}</dt>
                    <dd className="when-value">{row.rides}</dd>
                  </div>
                  <div>
                    <dt>{t.usage.daysOut}</dt>
                    <dd className="when-value">{row.days_used}</dd>
                  </div>
                  <div>
                    <dt>{t.usage.drivers}</dt>
                    <dd className="when-value">{row.drivers}</dd>
                  </div>
                  <div>
                    <dt>{t.usage.passengers}</dt>
                    <dd className="when-value">{row.passengers}</dd>
                  </div>
                  <div>
                    <dt>{t.usage.km}</dt>
                    <dd className="when-value">{row.km}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <h3 className="section-title">{t.usage.history}</h3>
          {report.history.length === 0 ? (
            <p className="hint">{t.usage.noUsage}</p>
          ) : (
            <ul className="history-list">
              {report.history.map((h) => (
                <li key={h.id} className="history-row">
                  <span className="history-when">
                    <span className="when-value">{fmtShortDate(h.ride_date)}</span>
                    <small>
                      {fmtTime(h.departure_time)}
                      {h.return_time ? ` – ${fmtTime(h.return_time)}` : ''}
                    </small>
                  </span>
                  <span className="history-text">
                    <strong>
                      {shortCarName(h.car_name)} · {h.driver_name}
                    </strong>
                    <span>
                      {t.myRides.route(h.origin, h.destination)} · {t.usage.pax(h.passengers, h.seats)}
                      {h.distance_km != null && ` · ${h.distance_km} km`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function Unlock({
  error,
  loading,
  onUnlock,
  onClose,
}: {
  error: string | null
  loading: boolean
  onUnlock: (password: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState('')

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (draft.trim()) onUnlock(draft)
  }

  return (
    <Sheet
      id="car-admin-title"
      title={t.admin.title}
      as="form"
      onSubmit={submit}
      onClose={onClose}
      footer={
        <button type="submit" className="btn btn-primary btn-block" disabled={loading || !draft.trim()}>
          {loading ? t.common.checking : t.admin.unlock}
        </button>
      }
    >
      <label className="field">
        <span className="field-label">{t.admin.password}</span>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder={t.admin.passwordPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <p className="hint">{t.admin.passwordHint}</p>
    </Sheet>
  )
}

function CarEditor({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CorporateCarInput
  busy: boolean
  submitLabel: string
  onSubmit: (input: CorporateCarInput) => void
  onCancel: () => void
}) {
  const t = useT()
  const [name, setName] = useState(initial.name)
  const [plate, setPlate] = useState(initial.plate)
  const [seats, setSeats] = useState(initial.passenger_seats)

  const valid = !!name.trim() && !!plate.trim() && seats >= 1 && seats <= 8
  const dirty = name.trim() !== initial.name || plate.trim() !== initial.plate || seats !== initial.passenger_seats

  return (
    // Not a <form>: the editor sits inside the admin sheet, which is not a form
    // itself, and nesting would submit the wrong thing. Enter saves via the button.
    <div className="admin-editor">
      <label className="field">
        <span className="field-label">{t.admin.name}</span>
        <input autoFocus maxLength={80} placeholder={t.admin.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">{t.admin.plate}</span>
          <input className="mono" maxLength={20} placeholder={t.admin.platePlaceholder} value={plate} onChange={(e) => setPlate(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label" id="car-seats-label">
            {t.form.seats}
          </span>
          <div className="stepper" role="group" aria-labelledby="car-seats-label">
            <button type="button" aria-label={t.form.fewer} disabled={seats <= 1} onClick={() => setSeats(seats - 1)}>
              <MinusIcon />
            </button>
            <output>{seats}</output>
            <button type="button" aria-label={t.form.more} disabled={seats >= 8} onClick={() => setSeats(seats + 1)}>
              <PlusIcon />
            </button>
          </div>
        </div>
      </div>
      <div className="row-end">
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !valid || !dirty}
          onClick={() => onSubmit({ name: name.trim(), plate: plate.trim(), passenger_seats: seats })}
        >
          {busy ? t.common.saving : submitLabel}
        </button>
      </div>
    </div>
  )
}
