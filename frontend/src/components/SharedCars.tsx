import { useState } from 'react'
import { api } from '../lib/api'
import { messages, useT } from '../lib/i18n'
import type { CarReportInput, CarState, CarUsage, CorporateCar, CorporateCarInput, Point } from '../lib/types'
import { CarGlyph, PowertrainMark } from './CarArt'
import { CarStatusList } from './CarStatus'
import { CarIcon, ChartIcon, CoinsIcon, KebabIcon, MinusIcon, PencilIcon, PlusIcon, TrashIcon, WrenchIcon, XIcon } from './icons'
import { FleetCosts } from './FleetCosts'
import { FleetUpkeep } from './FleetUpkeep'
import { ShareRules } from './ShareRules'
import { PlaceDialog } from './PlaceDialog'
import { Menu } from './Menu'
import { PlaceInput } from './PlaceInput'
import { SegThumb } from './Segmented'
import { Sheet } from './Sheet'
import { UsageDashboard } from './UsageDashboard'

type CarPatch = Partial<CorporateCarInput & { active: boolean }>

interface Props {
  /** Everyone sees the Status tab; an admin also the pool and its usage. */
  isAdmin: boolean
  /** How each car stands (lib/useBoard.ts), null until loaded. */
  states: CarState[] | null
  onNotice: (text: string) => void
  /** A report went in or changed: the board fetches the state again. */
  onReported: () => void
  /** The tab on screen, held by the board so a ride card can open Status. */
  tab: SharedCarsTab
  onTab: (tab: SharedCarsTab) => void
  cars: CorporateCar[]
  loading: boolean
  error: string | null
  busyId: number | null
  onCreate: (input: CorporateCarInput) => void
  onUpdate: (id: number, patch: CarPatch) => void
  onDelete: (car: CorporateCar) => void
  /** The usage report for the last `days` days (admin, see backend services.corporate_usage). */
  onLoadUsage: (days: number) => Promise<CarUsage>
  /** The same window as a spreadsheet download. */
  onDownloadUsage: (days: number) => Promise<void>
  onClose: () => void
}

/** Sentinel id for the "add a car" row, which has no car id of its own. */
export const NEW_CAR_BUSY_ID = -1

export type SharedCarsTab = 'cars' | 'upkeep' | 'costs' | 'usage'
const TABS: SharedCarsTab[] = ['cars', 'upkeep', 'costs', 'usage']

/**
 * The shared cars, in one sheet: a card per car with how it stands
 * (components/CarStatus.tsx), for everyone. An admin manages the pool on the
 * same cards (edit, retire, delete, add one at the foot, the retired ones
 * under them) and has a second tab with how the cars are used.
 */
export function SharedCars({ isAdmin, states, onNotice, onReported, tab: picked, onTab: setTab, cars, loading, error, busyId, onCreate, onUpdate, onDelete, onLoadUsage, onDownloadUsage, onClose }: Props) {
  const t = useT()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const tab: SharedCarsTab = isAdmin ? picked : 'cars'
  const tabIcon = { cars: <CarIcon size={16} />, upkeep: <WrenchIcon size={16} />, costs: <CoinsIcon size={16} />, usage: <ChartIcon size={16} /> }
  const tabLabel = { cars: t.usage.carsTab, upkeep: t.fleet.upkeepTab, costs: t.fleet.costsTab, usage: t.usage.tab }
  const byId = new Map(cars.map((c) => [c.id, c]))
  const retired = cars.filter((c) => !c.active)

  const menuFor = (car: CorporateCar) => (
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
  )

  // An admin's odometer and battery from the car's editor go in as an ordinary report.
  async function saveReading(carId: number, reading: CarReportInput) {
    try {
      await api.reportCar(carId, reading)
      onNotice(t.carState.reportSent)
      onReported()
    } catch (e) {
      onNotice(messages().apiError(e instanceof Error ? e.message : String(e)))
    }
  }

  const editorFor = (car: CorporateCar) => {
    if (editing !== car.id) return null
    const state = states?.find((s) => s.car.id === car.id)
    return (
      <CarEditor
        key={`${car.id}:${car.name}:${car.plate}:${car.passenger_seats}:${car.home}:${car.home_lat}:${car.home_lng}`}
        initial={{
          name: car.name,
          plate: car.plate,
          passenger_seats: car.passenger_seats,
          home: car.home,
          home_point: car.home_lat != null && car.home_lng != null ? { lat: car.home_lat, lng: car.home_lng } : null,
        }}
        readings={state ? { odometer: state.odometer.value, soc: state.soc.value } : undefined}
        busy={busyId === car.id}
        submitLabel={t.common.save}
        onSubmit={(input, reading) => {
          if (input) onUpdate(car.id, input)
          if (reading) void saveReading(car.id, reading)
          setEditing(null)
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <Sheet
      id="shared-cars-title"
      title={t.admin.title}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
          {t.common.done}
        </button>
      }
    >
      {isAdmin && (
        <div className="segmented admin-tabs" role="radiogroup" aria-label={t.admin.title}>
          <SegThumb count={TABS.length} index={TABS.indexOf(tab)} />
          {TABS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={tab === k} className={tab === k ? 'seg seg-on' : 'seg'} onClick={() => setTab(k)}>
              {tabIcon[k]} {tabLabel[k]}
            </button>
          ))}
        </div>
      )}

      {tab === 'upkeep' && <FleetUpkeep cars={cars} states={states} onNotice={onNotice} onChanged={onReported} />}
      {tab === 'costs' && <FleetCosts cars={cars} onNotice={onNotice} />}
      {tab === 'usage' && (
        <>
          <ShareRules onNotice={onNotice} />
          <UsageDashboard load={onLoadUsage} download={onDownloadUsage} />
        </>
      )}

      {tab === 'cars' && (
        <>
          {isAdmin && error && <p className="error">{error}</p>}

          <CarStatusList
            states={states}
            isAdmin={isAdmin}
            onNotice={onNotice}
            onReported={onReported}
            carMenu={isAdmin ? (id) => { const car = byId.get(id); return car ? menuFor(car) : null } : undefined}
            carEditor={isAdmin ? (id) => { const car = byId.get(id); return car ? editorFor(car) : null } : undefined}
          />

          {isAdmin && (
            <>
              {editing === 'new' ? (
                <CarEditor
                  initial={{ name: '', plate: '', passenger_seats: 4, home: '', home_point: null }}
                  busy={busyId === NEW_CAR_BUSY_ID}
                  submitLabel={t.admin.addCar}
                  onSubmit={(input) => {
                    if (input) onCreate(input)
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <button type="button" className="add-row" onClick={() => setEditing('new')}>
                  <PlusIcon size={18} /> {t.admin.addCompanyCar}
                </button>
              )}

              {loading && cars.length === 0 && <p className="hint">{t.common.loading}</p>}
              {retired.length > 0 && (
                <section className="retired-cars" aria-label={t.admin.retired}>
                  <h3 className="section-title">{t.admin.retired}</h3>
                  <ul className="admin-list">
                    {retired.map((car) => (
                      <li key={car.id} className="admin-row admin-row-retired">
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
                            {car.home && ` · ${car.home}`}
                          </span>
                        </span>
                        {menuFor(car)}
                        {editorFor(car)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </Sheet>
  )
}

function CarEditor({
  initial,
  readings,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CorporateCarInput
  /** An existing car's odometer and battery as they stand; a change is sent as a report. */
  readings?: { odometer: number | null; soc: number | null }
  busy: boolean
  submitLabel: string
  /** `input` is null when the car itself did not change, `reading` when its readings did not. */
  onSubmit: (input: CorporateCarInput | null, reading: CarReportInput | null) => void
  onCancel: () => void
}) {
  const t = useT()
  const [name, setName] = useState(initial.name)
  const [plate, setPlate] = useState(initial.plate)
  const [seats, setSeats] = useState(initial.passenger_seats)
  const [home, setHome] = useState(initial.home)
  const [homePoint, setHomePoint] = useState<Point | null>(initial.home_point ?? null)
  const [picking, setPicking] = useState(false)
  const odoAt = readings?.odometer != null ? String(readings.odometer) : ''
  const socAt = readings?.soc != null ? String(readings.soc) : ''
  const [odometer, setOdometer] = useState(odoAt)
  const [soc, setSoc] = useState(socAt)
  const socNum = soc === '' ? null : Number(soc)
  const socBad = socNum !== null && socNum > 100
  // A field emptied says nothing new: the state cannot be unsaid from here.
  const odoChanged = odometer !== '' && odometer !== odoAt
  const socChanged = soc !== '' && soc !== socAt

  const valid = !!name.trim() && !!plate.trim() && seats >= 1 && seats <= 8 && !socBad
  const carDirty =
    name.trim() !== initial.name ||
    plate.trim() !== initial.plate ||
    seats !== initial.passenger_seats ||
    home.trim() !== initial.home ||
    JSON.stringify(homePoint) !== JSON.stringify(initial.home_point ?? null)
  const dirty = carDirty || odoChanged || socChanged

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
      <div className="field">
        <span className="field-label">{t.admin.home}</span>
        <PlaceInput
          label={t.admin.home}
          placeholder={t.admin.homePlaceholder}
          value={home}
          point={homePoint}
          onChange={(value, point) => {
            setHome(value)
            // The pin is of the words it was put on; new words, no pin, unless a suggestion brought one.
            if (point) setHomePoint(point)
            else if (value.trim() !== home.trim()) setHomePoint(null)
          }}
          onMap={() => setPicking(true)}
        />
        {picking && (
          <PlaceDialog
            title={t.admin.home}
            value={home}
            point={homePoint}
            onClose={() => setPicking(false)}
            onPick={(placeName, point) => {
              setHomePoint(point)
              setHome(placeName)
              setPicking(false)
            }}
          />
        )}
        {homePoint && !picking && (
          <button type="button" className="link link-sm" onClick={() => setHomePoint(null)}>
            <XIcon size={14} /> {t.map.noPin}
          </button>
        )}
      </div>
      {readings && (
        <>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">{t.carState.odometerField}</span>
              <input inputMode="numeric" pattern="[0-9]*" maxLength={7} placeholder="0" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="field">
              <span className="field-label">{t.odo.soc}</span>
              <input inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="80" aria-invalid={socBad || undefined} value={soc} onChange={(e) => setSoc(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          {(odoChanged || socChanged) && <p className="hint hint-tight">{t.carState.readingsHint}</p>}
        </>
      )}
      <div className="row-end">
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !valid || !dirty}
          onClick={() =>
            onSubmit(
              carDirty ? { name: name.trim(), plate: plate.trim(), passenger_seats: seats, home: home.trim(), home_point: home.trim() ? homePoint : null } : null,
              odoChanged || socChanged ? { odometer_km: odoChanged ? Number(odometer) : null, soc: socChanged ? socNum : null } : null,
            )
          }
        >
          {busy ? t.common.saving : submitLabel}
        </button>
      </div>
    </div>
  )
}
