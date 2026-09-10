import { useState, type FormEvent } from 'react'
import { useT } from '../lib/i18n'
import type { CorporateCar, CorporateCarInput } from '../lib/types'
import { CarGlyph, PowertrainMark } from './CarArt'
import { CarIcon, KebabIcon, MinusIcon, PencilIcon, PlusIcon, TrashIcon } from './icons'
import { Menu } from './Menu'
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
  onClose: () => void
}

/** Sentinel id for the "add a car" row, which has no car id of its own. */
export const NEW_CAR_BUSY_ID = -1

/** The company-car pool, behind the shared admin password. */
export function CarAdmin({ unlocked, cars, loading, error, busyId, onUnlock, onLock, onCreate, onUpdate, onDelete, onClose }: Props) {
  const t = useT()
  const [editing, setEditing] = useState<number | 'new' | null>(null)

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
    </Sheet>
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
