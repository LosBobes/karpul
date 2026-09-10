import { useState, type FormEvent } from 'react'
import type { CorporateCar, CorporateCarInput } from '../lib/types'
import { CarGlyph, PowertrainBadge } from './CarArt'
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
  const [editing, setEditing] = useState<number | 'new' | null>(null)

  if (!unlocked) {
    return <Unlock error={error} loading={loading} onUnlock={onUnlock} onClose={onClose} />
  }

  return (
    <Sheet
      id="car-admin-title"
      title="Company cars"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
            Done
          </button>
          <button type="button" className="link" onClick={onLock}>
            Forget the admin password on this device
          </button>
        </>
      }
    >
      <p className="hint">
        Changes here affect everyone. Retiring a car keeps it on past rides but takes it out of the
        "Add ride" form.
      </p>

      {error && <p className="error">{error}</p>}

      <ul className="admin-list">
        {loading && cars.length === 0 && <li className="hint">Loading…</li>}
        {cars.map((car) => (
          <li key={car.id} className={car.active ? 'admin-row' : 'admin-row admin-row-retired'}>
            <span className="admin-car-icon" aria-hidden="true">
              <CarGlyph carName={car.name} size={16} />
              <PowertrainBadge carName={car.name} />
            </span>
            <span className="admin-row-text">
              <strong>{car.name}</strong>
              <span>
                <span className="mono">{car.plate}</span> · {car.passenger_seats} seats
                {!car.active && <span className="tag">Retired</span>}
              </span>
            </span>
            <Menu
              trigger={<KebabIcon />}
              label={`Options for ${car.name}`}
              items={[
                { label: 'Edit', icon: <PencilIcon size={18} />, onSelect: () => setEditing(car.id), disabled: busyId === car.id },
                {
                  label: car.active ? 'Retire' : 'Restore',
                  icon: <CarIcon size={18} />,
                  onSelect: () => onUpdate(car.id, { active: !car.active }),
                  disabled: busyId === car.id,
                },
                { label: 'Delete', icon: <TrashIcon size={18} />, onSelect: () => onDelete(car), danger: true, disabled: busyId === car.id },
              ]}
            />
            {editing === car.id && (
              <CarEditor
                key={`${car.id}:${car.name}:${car.plate}:${car.passenger_seats}`}
                initial={{ name: car.name, plate: car.plate, passenger_seats: car.passenger_seats }}
                busy={busyId === car.id}
                submitLabel="Save"
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
          submitLabel="Add car"
          onSubmit={(input) => {
            onCreate(input)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="add-row" onClick={() => setEditing('new')}>
          <PlusIcon size={18} /> Add company car
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
  const [draft, setDraft] = useState('')

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (draft.trim()) onUnlock(draft)
  }

  return (
    <Sheet
      id="car-admin-title"
      title="Company cars"
      as="form"
      onSubmit={submit}
      onClose={onClose}
      footer={
        <button type="submit" className="btn btn-primary btn-block" disabled={loading || !draft.trim()}>
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      }
    >
      <label className="field">
        <span className="field-label">Admin password</span>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Shared car-pool password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <p className="hint">Only needed to change the car pool. Adding and joining cars never asks for it.</p>
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
        <span className="field-label">Name</span>
        <input autoFocus maxLength={80} placeholder="e.g. Skoda Octavia" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">Plate</span>
          <input className="mono" maxLength={20} placeholder="FIRM-004" value={plate} onChange={(e) => setPlate(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label" id="car-seats-label">
            Passenger seats
          </span>
          <div className="stepper" role="group" aria-labelledby="car-seats-label">
            <button type="button" aria-label="Fewer seats" disabled={seats <= 1} onClick={() => setSeats(seats - 1)}>
              <MinusIcon />
            </button>
            <output>{seats}</output>
            <button type="button" aria-label="More seats" disabled={seats >= 8} onClick={() => setSeats(seats + 1)}>
              <PlusIcon />
            </button>
          </div>
        </div>
      </div>
      <div className="row-end">
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !valid || !dirty}
          onClick={() => onSubmit({ name: name.trim(), plate: plate.trim(), passenger_seats: seats })}
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
