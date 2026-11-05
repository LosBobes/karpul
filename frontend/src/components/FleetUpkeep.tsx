import { useState } from 'react'
import { api } from '../lib/api'
import { fmtShortDate, todayISO } from '../lib/dates'
import { blockSpan, blockedNow, dueText } from '../lib/fleet'
import { messages, useT } from '../lib/i18n'
import type { CarPaperwork, CarState, CorporateCar, Due, Tyres } from '../lib/types'
import { CarGlyph } from './CarArt'
import { DatePicker } from './DatePicker'
import { CalendarIcon, PencilIcon, PlusIcon, WrenchIcon, XIcon } from './icons'
import { Select } from './Select'

interface Props {
  cars: CorporateCar[]
  /** How each car stands, with its blocks and due list (admins get the due list). */
  states: CarState[] | null
  onNotice: (text: string) => void
  /** Something changed: the cars and their state are fetched again. */
  onChanged: () => void
}

const errText = (e: unknown) => messages().apiError(e instanceof Error ? e.message : String(e))

/**
 * The fleet manager's tab of *Shared cars*: per car what its paperwork and
 * upkeep have coming (backend: fleet.due_items), the dates themselves, and
 * when it is out of service (a service, a repair: nobody can book it then).
 */
export function FleetUpkeep({ cars, states, onNotice, onChanged }: Props) {
  const t = useT()
  const active = cars.filter((c) => c.active)
  if (active.length === 0) return <p className="hint">{t.fleet.noCars}</p>
  return (
    <div className="fleet-list">
      {active.map((car) => (
        <CarUpkeep key={car.id} car={car} state={states?.find((s) => s.car.id === car.id) ?? null} onNotice={onNotice} onChanged={onChanged} />
      ))}
    </div>
  )
}

function DueChip({ due }: { due: Due }) {
  return <span className={`due-chip due-${due.level}`}>{dueText(due)}</span>
}

function CarUpkeep({ car, state, onNotice, onChanged }: { car: CorporateCar; state: CarState | null; onNotice: (text: string) => void; onChanged: () => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [busy, setBusy] = useState(false)
  const due = (state?.due ?? []).filter((d) => d.level !== 'ok')
  const blocks = state?.blocks ?? []

  async function run(work: () => Promise<void>) {
    setBusy(true)
    try {
      await work()
      onChanged()
    } catch (e) {
      onNotice(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const backInService = (id: number, started: boolean) =>
    run(async () => {
      // One that has started ends today, so its past days stay on record; one still to come just goes.
      if (started) await api.endBlock(id, todayISO())
      else await api.removeBlock(id)
      onNotice(t.fleet.backInService(car.name))
    })

  return (
    <article className="card fleet-car">
      <header className="fleet-car-head">
        <span className="admin-car-icon" aria-hidden="true">
          <CarGlyph carName={car.name} size={16} />
        </span>
        <span className="admin-row-text">
          <strong>{car.name}</strong>
          <span className="mono">{car.plate}</span>
        </span>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setEditing(!editing)} aria-expanded={editing}>
          <PencilIcon size={16} /> {t.fleet.paperwork}
        </button>
      </header>

      {due.length > 0 ? (
        <div className="due-chips">
          {due.map((d) => (
            <DueChip key={d.kind} due={d} />
          ))}
        </div>
      ) : (
        <p className="hint hint-tight">{t.fleet.nothingDue}</p>
      )}

      <dl className="fleet-facts">
        <div>
          <dt>{t.fleet.dueKind.registration}</dt>
          <dd>{car.registration_until ? fmtShortDate(car.registration_until) : '–'}</dd>
        </div>
        <div>
          <dt>{t.fleet.dueKind.insurance}</dt>
          <dd>{car.insurance_until ? fmtShortDate(car.insurance_until) : '–'}</dd>
        </div>
        <div>
          <dt>{t.fleet.dueKind.service}</dt>
          <dd>
            {[car.service_due_on ? fmtShortDate(car.service_due_on) : null, car.service_due_km != null ? `${car.service_due_km.toLocaleString()} km` : null]
              .filter(Boolean)
              .join(' · ') || '–'}
          </dd>
        </div>
        <div>
          <dt>{t.fleet.dueKind.tyres}</dt>
          <dd>{car.tyres ? t.fleet.tyres[car.tyres] : '–'}</dd>
        </div>
      </dl>

      {editing && (
        <PaperworkEditor
          car={car}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(paperwork) =>
            void run(async () => {
              await api.setPaperwork(car.id, paperwork)
              setEditing(false)
              onNotice(t.fleet.saved)
            })
          }
        />
      )}

      <section className="fleet-blocks" aria-label={t.fleet.outOfService}>
        <h4 className="fleet-sub">
          <WrenchIcon size={16} /> {t.fleet.outOfService}
        </h4>
        {blocks.length === 0 && <p className="hint hint-tight">{t.fleet.inService}</p>}
        {blocks.map((b) => (
          <div key={b.id} className={blockedNow(b) ? 'fleet-block fleet-block-now' : 'fleet-block'}>
            <span>
              <strong>{blockSpan(b)}</strong>
              {b.reason && ` · ${b.reason}`}
            </span>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void backInService(b.id, blockedNow(b))}>
              {blockedNow(b) ? t.fleet.backToday : t.fleet.cancelBlock}
            </button>
          </div>
        ))}
        {blocking ? (
          <BlockForm
            busy={busy}
            onCancel={() => setBlocking(false)}
            onSave={(start, end, reason) =>
              void run(async () => {
                const out = await api.addBlock({ car_id: car.id, start_date: start, end_date: end, reason })
                setBlocking(false)
                onNotice(out.rides.length ? t.fleet.blockedWithRides(car.name, out.rides.length) : t.fleet.blocked(car.name))
              })
            }
          />
        ) : (
          <button type="button" className="add-row" onClick={() => setBlocking(true)}>
            <PlusIcon size={18} /> {t.fleet.takeOut}
          </button>
        )}
      </section>
    </article>
  )
}

/** A day that may be left unset: a "Set" button until it has one, then the calendar and a clear button. */
function OptionalDate({ label, value, onChange }: { label: string; value: string | null; onChange: (iso: string | null) => void }) {
  const t = useT()
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {value === null ? (
        <button type="button" className="control control-empty" onClick={() => onChange(todayISO())}>
          <CalendarIcon size={16} /> {t.fleet.setDate}
        </button>
      ) : (
        <div className="optional-date">
          <DatePicker label={label} value={value} onChange={onChange} />
          <button type="button" className="icon-btn icon-btn-sm" aria-label={t.fleet.clear(label)} onClick={() => onChange(null)}>
            <XIcon size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function PaperworkEditor({ car, busy, onSave, onCancel }: { car: CorporateCar; busy: boolean; onSave: (p: CarPaperwork) => void; onCancel: () => void }) {
  const t = useT()
  const [registration, setRegistration] = useState(car.registration_until ?? null)
  const [insurance, setInsurance] = useState(car.insurance_until ?? null)
  const [serviceOn, setServiceOn] = useState(car.service_due_on ?? null)
  const [serviceKm, setServiceKm] = useState(car.service_due_km != null ? String(car.service_due_km) : '')
  const [tyres, setTyres] = useState<Tyres>(car.tyres ?? '')
  return (
    <div className="admin-editor">
      <div className="grid-2">
        <OptionalDate label={t.fleet.registrationUntil} value={registration} onChange={setRegistration} />
        <OptionalDate label={t.fleet.insuranceUntil} value={insurance} onChange={setInsurance} />
      </div>
      <div className="grid-2">
        <OptionalDate label={t.fleet.serviceOn} value={serviceOn} onChange={setServiceOn} />
        <label className="field">
          <span className="field-label">{t.fleet.serviceKm}</span>
          <input inputMode="numeric" pattern="[0-9]*" maxLength={7} placeholder="60000" value={serviceKm} onChange={(e) => setServiceKm(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <div className="field">
        <span className="field-label">{t.fleet.dueKind.tyres}</span>
        <Select<Tyres>
          label={t.fleet.dueKind.tyres}
          value={tyres}
          onChange={setTyres}
          options={(['', 'summer', 'winter', 'all_season'] as const).map((v) => ({ value: v, label: v ? t.fleet.tyres[v] : t.fleet.notSaid }))}
        />
      </div>
      <div className="row-end">
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            onSave({
              registration_until: registration,
              insurance_until: insurance,
              service_due_on: serviceOn,
              service_due_km: serviceKm === '' ? null : Number(serviceKm),
              tyres,
            })
          }
        >
          {busy ? t.common.saving : t.common.save}
        </button>
      </div>
    </div>
  )
}

function BlockForm({ busy, onSave, onCancel }: { busy: boolean; onSave: (start: string, end: string | null, reason: string) => void; onCancel: () => void }) {
  const t = useT()
  const [start, setStart] = useState(todayISO())
  const [end, setEnd] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const bad = end !== null && end < start
  return (
    <div className="admin-editor">
      <div className="grid-2">
        <div className="field">
          <span className="field-label">{t.fleet.firstDay}</span>
          <DatePicker label={t.fleet.firstDay} value={start} onChange={setStart} />
        </div>
        <OptionalDate label={t.fleet.lastDay} value={end} onChange={setEnd} />
      </div>
      {end === null && <p className="hint hint-tight">{t.fleet.untilNotice}</p>}
      <label className="field">
        <span className="field-label">{t.fleet.reason}</span>
        <input maxLength={200} placeholder={t.fleet.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="row-end">
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || bad} onClick={() => onSave(start, end, reason.trim())}>
          {busy ? t.common.saving : t.fleet.takeOut}
        </button>
      </div>
    </div>
  )
}
