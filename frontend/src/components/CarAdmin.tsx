import { useEffect, useState, type FormEvent } from 'react'
import type { CorporateCar, CorporateCarInput } from '../lib/types'

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

export function CarAdmin({
  unlocked,
  cars,
  loading,
  error,
  busyId,
  onUnlock,
  onLock,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" aria-labelledby="car-admin-title">
        <header className="modal-head">
          <h2 id="car-admin-title">Company cars</h2>
          <button type="button" className="btn-x btn-x-lg" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        {!unlocked ? (
          <Unlock error={error} loading={loading} onUnlock={onUnlock} />
        ) : (
          <>
            <p className="hint">
              Changes here affect everyone. Retiring a car keeps it on past rides but takes it out
              of the ride form.
            </p>

            {error && <p className="error">{error}</p>}

            <div className="car-rows">
              {loading && cars.length === 0 && <p className="empty">Loading…</p>}
              {cars.map((car) => (
                <CarRow
                  key={`${car.id}:${car.name}:${car.plate}:${car.passenger_seats}:${car.active}`}
                  car={car}
                  busy={busyId === car.id}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
            </div>

            <NewCarRow busy={busyId === NEW_CAR_BUSY_ID} onCreate={onCreate} />

            <footer className="modal-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onLock}>
                Forget password
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

/** Sentinel id for the "add a car" row, which has no car id of its own. */
export const NEW_CAR_BUSY_ID = -1

function Unlock({
  error,
  loading,
  onUnlock,
}: {
  error: string | null
  loading: boolean
  onUnlock: (password: string) => void
}) {
  const [draft, setDraft] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (draft.trim()) onUnlock(draft)
  }

  return (
    <form className="admin-lock" onSubmit={submit}>
      <label htmlFor="admin-password">
        Admin password
        <input
          id="admin-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Shared car-pool password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <p className="hint">
        Only needed to change the car pool. Offering and joining rides never asks for it.
      </p>
      <footer className="modal-foot">
        <button type="submit" className="btn btn-primary" disabled={loading || !draft.trim()}>
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      </footer>
    </form>
  )
}

function CarRow({
  car,
  busy,
  onUpdate,
  onDelete,
}: {
  car: CorporateCar
  busy: boolean
  onUpdate: (id: number, patch: CarPatch) => void
  onDelete: (car: CorporateCar) => void
}) {
  const [name, setName] = useState(car.name)
  const [plate, setPlate] = useState(car.plate)
  const [seats, setSeats] = useState(car.passenger_seats)

  const dirty = name.trim() !== car.name || plate.trim() !== car.plate || seats !== car.passenger_seats
  const valid = !!name.trim() && !!plate.trim() && seats >= 1 && seats <= 8

  function save(e: FormEvent) {
    e.preventDefault()
    if (!dirty || !valid) return
    onUpdate(car.id, { name: name.trim(), plate: plate.trim(), passenger_seats: seats })
  }

  return (
    <form className={`car-row ${car.active ? '' : 'car-row-retired'}`} onSubmit={save}>
      <label className="car-field car-field-name">
        <span>Name</span>
        <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="car-field car-field-plate">
        <span>Plate</span>
        <input maxLength={20} value={plate} onChange={(e) => setPlate(e.target.value)} />
      </label>
      <label className="car-field car-field-seats">
        <span>Seats</span>
        <input
          type="number"
          min={1}
          max={8}
          value={seats}
          onChange={(e) => setSeats(Number(e.target.value))}
        />
      </label>
      <div className="car-row-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !dirty || !valid}>
          {busy ? '…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => onUpdate(car.id, { active: !car.active })}
        >
          {car.active ? 'Retire' : 'Restore'}
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={busy}
          onClick={() => onDelete(car)}
        >
          Delete
        </button>
      </div>
      {!car.active && <span className="car-retired-tag">retired</span>}
    </form>
  )
}

function NewCarRow({ busy, onCreate }: { busy: boolean; onCreate: (input: CorporateCarInput) => void }) {
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [seats, setSeats] = useState(4)

  const valid = !!name.trim() && !!plate.trim() && seats >= 1 && seats <= 8

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    onCreate({ name: name.trim(), plate: plate.trim(), passenger_seats: seats })
    setName('')
    setPlate('')
    setSeats(4)
  }

  return (
    <form className="car-row car-row-new" onSubmit={submit}>
      <label className="car-field car-field-name">
        <span>Name</span>
        <input
          maxLength={80}
          placeholder="e.g. Skoda Octavia"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="car-field car-field-plate">
        <span>Plate</span>
        <input
          maxLength={20}
          placeholder="FIRM-004"
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
        />
      </label>
      <label className="car-field car-field-seats">
        <span>Seats</span>
        <input
          type="number"
          min={1}
          max={8}
          value={seats}
          onChange={(e) => setSeats(Number(e.target.value))}
        />
      </label>
      <div className="car-row-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !valid}>
          {busy ? 'Adding…' : '+ Add car'}
        </button>
      </div>
    </form>
  )
}
