import { useId, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { carPowertrain } from '../lib/carModels'
import { messages, useT } from '../lib/i18n'
import { useKept } from '../lib/keep'
import { intlTag } from '../lib/locale'
import type { CarReport, CarReportInput, CarState } from '../lib/types'
import { IDLE_MS, useIdle } from '../lib/useIdle'
import { BatteryGauge, CleanPicker, IssuesField, OdometerWheels, type Cleanness } from './CarReportParts'
import { Sheet } from './Sheet'

const km = (n: number) => n.toLocaleString(intlTag())
const errText = (err: unknown) => messages().apiError(err instanceof Error ? err.message : String(err))

interface Props {
  state: CarState
  /** An admin putting a report right; null writes a new one. */
  report: CarReport | null
  onDone: (sent: boolean) => void
}

/**
 * A report on a shared car, in a window of its own over the Shared cars
 * sheet, made of the parts in components/CarReportParts.tsx: the odometer as
 * rolling wheels, the battery as a battery you drag or type, the car clean or
 * muddy as a picture, and what is wrong. Every part is
 * optional (left alone is "not said"); the server keeps the newest of each
 * as the car's state (backend: app/carstate.py).
 */
export function CarReportSheet({ state, report, onDone }: Props) {
  const t = useT()
  const titleId = useId()
  // A new report's draft is kept per car, an edit's per report.
  const k = report ? `carState.report${report.id}` : `carState.${state.car.id}`
  const [odometer, setOdometer] = useKept(`${k}.odometer`, report?.odometer_km != null ? String(report.odometer_km) : '')
  const [soc, setSoc] = useKept<number | null>(`${k}.socValue`, report?.soc ?? null)
  const [cleanness, setCleanness] = useKept<Cleanness>(`${k}.cleanness`, report?.clean == null ? '' : report.clean ? 'clean' : 'dirty')
  const [issues, setIssues] = useKept(`${k}.issues`, report?.issues ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idle = useIdle(IDLE_MS)

  const odoNum = odometer.trim() === '' ? null : Number(odometer)
  const empty = odoNum === null && soc === null && cleanness === '' && issues.trim() === ''

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (empty || busy) return
    const input: CarReportInput = {
      odometer_km: odoNum,
      soc,
      clean: cleanness === '' ? null : cleanness === 'clean',
      // Editing a report that said "nothing wrong" keeps saying so while the field stays empty.
      issues: issues.trim() === '' ? (report?.issues === '' ? '' : null) : issues.trim(),
    }
    setBusy(true)
    setError(null)
    try {
      if (report === null) await api.reportCar(state.car.id, input)
      else await api.editCarReport(report.id, input)
      onDone(true)
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }

  return (
    <Sheet
      id={titleId}
      title={report ? t.carState.editTitle : t.carState.reportTitle(state.car.name)}
      as="form"
      stacked
      className={idle ? 'report-sheet report-parts report-idle' : 'report-sheet report-parts'}
      onSubmit={submit}
      onClose={() => onDone(false)}
      footer={
        <div className="row-end">
          <button type="button" className="btn btn-soft" disabled={busy} onClick={() => onDone(false)}>
            {t.common.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || empty} title={empty ? t.carState.nothingSaid : undefined}>
            {busy ? t.common.saving : report ? t.common.save : t.carState.send}
          </button>
        </div>
      }
    >
      <OdometerWheels
        value={odometer}
        last={state.odometer.value}
        base={state.odometer_read ?? state.odometer.value}
        driven={state.odometer_read != null && state.km_since > 0 ? { km: state.km_since, label: t.carState.drivenSince(km(state.km_since)) } : null}
        onChange={setOdometer}
      />
      <BatteryGauge value={soc} last={state.soc.value} electric={carPowertrain(state.car.name) === 'electric'} onChange={setSoc} />
      <CleanPicker value={cleanness} onChange={setCleanness} />
      <IssuesField value={issues} onChange={setIssues} />
      {error && <p className="error">{error}</p>}
    </Sheet>
  )
}
