import { useState, type ReactNode } from 'react'
import { useKept } from '../lib/keep'
import { api } from '../lib/api'
import { factText, fmtWhen } from '../lib/carState'
import { messages, useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import type { CarReport, CarState } from '../lib/types'
import { Avatar } from './Avatar'
import { CarGlyph, PowertrainMark } from './CarArt'
import { CheckIcon, BoltIcon, DropIcon, InfoIcon, KebabIcon, PencilIcon, RoadIcon, TrashIcon } from './icons'
import { CarReportSheet } from './CarReportSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { Menu } from './Menu'
import { MapView } from './MapView'

interface Props {
  /** The board's copy, kept live (lib/useBoard.ts); null until loaded. */
  states: CarState[] | null
  /** An admin may also mark a problem fixed and put a report right or take it out. */
  isAdmin: boolean
  onNotice: (text: string) => void
  /** A report went in or changed: the board fetches the state again (the socket brings it too). */
  onReported: () => void
  /** Admins: the pool's controls for a car (its ⋮ menu, and its editor while open), from SharedCars. */
  carMenu?: (carId: number) => ReactNode
  carEditor?: (carId: number) => ReactNode
}

const km = (n: number) => n.toLocaleString(intlTag())
const errText = (err: unknown) => messages().apiError(err instanceof Error ? err.message : String(err))

/**
 * Every shared car as it stands (backend: app/carstate.py): the odometer and
 * the battery from the last reading, guessed on from the rides since when
 * nobody noted them, whether it is clean and what is wrong. For everyone:
 * the next driver wants to know before they go. A report can be written
 * for any car in its own window (components/CarReportSheet.tsx; the one who
 * finds it dirty is not the one who left it so); bringing a car back on its ride card writes one too. The body of
 * the Shared cars sheet (components/SharedCars.tsx), which hands an admin's
 * pool controls in through `carMenu` / `carEditor`.
 */
export function CarStatusList({ states, isAdmin, onNotice, onReported, carMenu, carEditor }: Props) {
  const t = useT()
  // The car whose report window is open, and the report it edits (null: a new one).
  const [reporting, setReporting] = useKept<number | null>('carState.reporting', null)
  const [editing, setEditing] = useKept<number | null>('carState.editing', null)
  const [doomed, setDoomed] = useState<CarReport | null>(null)
  const [busy, setBusy] = useState(false)

  async function fixIssue(carId: number) {
    setBusy(true)
    try {
      await api.reportCar(carId, { odometer_km: null, soc: null, clean: null, issues: '' })
      onNotice(t.carState.fixedSent)
      onReported()
    } catch (err) {
      onNotice(errText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(report: CarReport) {
    setBusy(true)
    try {
      await api.removeCarReport(report.id)
      setDoomed(null)
      onNotice(t.carState.reportRemoved)
      onReported()
    } catch (err) {
      setDoomed(null)
      onNotice(errText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {states === null && <p className="hint">{t.common.loading}</p>}
      {states !== null && states.length === 0 && <p className="hint">{t.carState.noCars}</p>}
      <div className="car-states">
        {states?.map((s) => {
          const open = reporting === s.car.id
          const edited = open && editing !== null ? (s.recent.find((r) => r.id === editing) ?? null) : null
          return (
            <CarStateCard
              key={s.car.id}
              state={s}
              isAdmin={isAdmin}
              menu={carMenu?.(s.car.id)}
              editor={carEditor?.(s.car.id)}
              busy={busy}
              reporting={open}
              editing={edited}
              onReport={() => {
                setEditing(null)
                setReporting(s.car.id)
              }}
              onEdit={(r) => {
                setEditing(r.id)
                setReporting(s.car.id)
              }}
              onRemove={setDoomed}
              onFix={() => void fixIssue(s.car.id)}
              onDone={(sent) => {
                const wasEdit = editing !== null
                setReporting(null)
                setEditing(null)
                if (sent) {
                  onNotice(wasEdit ? t.carState.reportSaved : t.carState.reportSent)
                  onReported()
                }
              }}
            />
          )
        })}
      </div>
      {doomed && (
        <ConfirmDialog
          title={t.carState.removeTitle}
          body={t.carState.removeBody(doomed.user_name, fmtWhen(doomed.created_at))}
          confirmLabel={t.carState.removeReport}
          busy={busy}
          onConfirm={() => void remove(doomed)}
          onCancel={() => setDoomed(null)}
        />
      )}
    </>
  )
}

interface CardProps {
  state: CarState
  isAdmin: boolean
  menu?: ReactNode
  editor?: ReactNode
  busy: boolean
  reporting: boolean
  /** The report being put right, when the open form edits one. */
  editing: CarReport | null
  onReport: () => void
  onEdit: (report: CarReport) => void
  onRemove: (report: CarReport) => void
  onFix: () => void
  onDone: (sent: boolean) => void
}

function CarStateCard({ state, isAdmin, menu, editor, busy, reporting, editing, onReport, onEdit, onRemove, onFix, onDone }: CardProps) {
  const t = useT()
  const odo = factText(state.odometer, (v) => t.carState.km(km(v)))
  const soc = factText(state.soc, (v) => t.carState.pct(v))
  const clean = factText(state.clean, (v) => (v ? t.carState.cleanYes : t.carState.cleanNo))
  const issues = state.issues.value ? state.issues : null

  return (
    <article className={issues ? 'card car-state car-state-issue' : 'card car-state'}>
      <header className="car-state-head">
        <span className="car-state-glyph" aria-hidden="true">
          <CarGlyph carName={state.car.name} size={22} />
        </span>
        <span className="car-state-name">
          <strong>
            {state.car.name}
            <PowertrainMark carName={state.car.name} />
          </strong>
          <span>
            <span className="mono">{state.car.plate}</span> · {t.admin.seats(state.car.passenger_seats)}
            {state.car.home && ` · ${state.car.home}`}
          </span>
        </span>
        {menu}
      </header>
      {editor}

      {state.car.home && state.car.home_lat != null && state.car.home_lng != null && (
        <MapView
          className="car-state-map"
          label={state.car.home}
          pins={[{ point: { lat: state.car.home_lat, lng: state.car.home_lng }, label: state.car.home, kind: 'spot' }]}
        />
      )}

      <dl className="car-facts">
        <div className={odo.guessed ? 'car-fact car-fact-guess' : 'car-fact'}>
          <dt>
            <RoadIcon size={14} /> {t.carState.odometer}
          </dt>
          <dd>{odo.value}</dd>
          {odo.sub && <small>{odo.sub}</small>}
        </div>
        <div className={soc.guessed ? 'car-fact car-fact-guess' : 'car-fact'}>
          <dt>
            <BoltIcon size={14} /> {t.carState.battery}
          </dt>
          <dd>{soc.value}</dd>
          {soc.sub && <small>{soc.sub}</small>}
        </div>
        <div className={state.clean.value === false ? 'car-fact car-fact-warn' : 'car-fact'}>
          <dt>
            <DropIcon size={14} /> {t.carState.cleanTitle}
          </dt>
          <dd>{clean.value}</dd>
          {clean.sub && <small>{clean.sub}</small>}
        </div>
      </dl>
      {(odo.guessed || soc.guessed) && <p className="hint hint-tight">{t.carState.estimated}</p>}

      <div className={issues ? 'car-issues car-issues-on' : 'car-issues'}>
        <InfoIcon size={16} />
        <span>
          <strong>{issues ? issues.value : t.carState.noIssues}</strong>
          {issues && issues.by && issues.at && <small>{t.carState.noted(issues.by, fmtWhen(issues.at))}</small>}
        </span>
        {issues && isAdmin && (
          <button type="button" className="btn car-issues-fix" disabled={busy} onClick={onFix}>
            <CheckIcon size={16} /> {t.carState.fixed}
          </button>
        )}
      </div>

      {state.recent.length > 0 && (
        <details className="car-recent">
          <summary>{t.carState.recent}</summary>
          <ul>
            {state.recent.map((r) => (
              <li key={r.id}>
                <Avatar name={r.user_name} size="sm" />
                <span className="car-recent-text">
                  <span>
                    {r.user_name} · {fmtWhen(r.created_at)}
                    {r.ride_id !== null && <span className="muted"> · {t.carState.fromRide}</span>}
                  </span>
                  <small>
                    {[
                      r.odometer_km !== null ? t.carState.km(km(r.odometer_km)) : null,
                      r.soc !== null ? t.carState.pct(r.soc) : null,
                      r.clean === null ? null : r.clean ? t.carState.cleanYes : t.carState.cleanNo,
                      r.issues ? r.issues : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
                {isAdmin && (
                  <Menu
                    trigger={<KebabIcon />}
                    label={t.carState.reportOptions(r.user_name)}
                    items={[
                      { label: t.carState.editReport, icon: <PencilIcon size={18} />, onSelect: () => onEdit(r), disabled: busy },
                      { label: t.carState.removeReport, icon: <TrashIcon size={18} />, onSelect: () => onRemove(r), danger: true, disabled: busy },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <button type="button" className="add-row add-row-quiet" onClick={onReport}>
        <InfoIcon size={18} /> {t.carState.report}
      </button>
      {reporting && <CarReportSheet key={editing?.id ?? 'new'} state={state} report={editing} onDone={onDone} />}
    </article>
  )
}
