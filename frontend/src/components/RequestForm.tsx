import { useState, type FormEvent } from 'react'
import { addDays, parseISODate, toISODate, todayISO } from '../lib/dates'
import { useT } from '../lib/i18n'
import type { RideRequestInput } from '../lib/types'
import { DatePicker } from './DatePicker'
import { PinIcon } from './icons'
import { Sheet } from './Sheet'
import { TimePicker } from './TimePicker'

/** Same memory as the ride form: the last route you used, so a commute is two taps. */
const LAST_ROUTE_KEY = 'karpul.lastRoute'
/** How far ahead a request may be (backend: routers/requests.py). */
const MAX_DAYS_AHEAD = 92

function lastRoute(): { origin: string; destination: string } {
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY)
    if (raw) {
      const r = JSON.parse(raw) as { origin?: string; destination?: string }
      return { origin: r.origin ?? '', destination: r.destination ?? '' }
    }
  } catch {
    /* ignore */
  }
  return { origin: '', destination: '' }
}

interface Props {
  /** The day the sheet opens on; a past day starts at today instead. */
  date: string
  submitting: boolean
  error: string | null
  onSubmit: (input: RideRequestInput) => void
  onClose: () => void
}

/**
 * "I need a ride Tuesday around 8, Novi Sad to HQ." A short form on purpose:
 * the day, a time, the way, and a note. The request shows on the board under
 * its day, where a driver can answer it by adding a ride for it.
 */
export function RequestForm({ date, submitting, error, onSubmit, onClose }: Props) {
  const t = useT()
  const [last] = useState(lastRoute)
  const today = todayISO()
  const [day, setDay] = useState(date < today ? today : date)
  const [time, setTime] = useState('08:00')
  const [origin, setOrigin] = useState(last.origin)
  const [destination, setDestination] = useState(last.destination)
  const [note, setNote] = useState('')

  const latest = toISODate(addDays(parseISODate(today), MAX_DAYS_AHEAD))
  const dayError = day < today || day > latest
  const ready = !dayError && origin.trim() !== '' && destination.trim() !== ''

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || submitting) return
    onSubmit({ request_date: day, departure_time: time, origin: origin.trim(), destination: destination.trim(), note: note.trim() })
  }

  return (
    <Sheet
      id="request-form-title"
      title={t.requests.formTitle}
      as="form"
      onSubmit={submit}
      onClose={onClose}
      footer={
        <button type="submit" className="btn btn-primary btn-block" disabled={!ready || submitting}>
          {submitting ? t.common.saving : t.requests.submit}
        </button>
      }
    >
      <div className="field">
        <span className="field-label">{t.form.when}</span>
        <div className="when-grid when-grid-one">
          <div className="subfield">
            <span className="subfield-label">{t.requests.day}</span>
            <DatePicker label={t.requests.day} value={day} onChange={setDay} />
          </div>
          <div className="subfield">
            <span className="subfield-label">{t.requests.around}</span>
            <TimePicker label={t.requests.around} value={time} onChange={setTime} />
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field-label">{t.form.route}</span>
        <div className="route">
          <span className="route-row">
            <PinIcon size={16} />
            <span className="route-tag">{t.requests.from}</span>
            <input
              required
              aria-label={t.form.pickup}
              maxLength={120}
              placeholder={t.form.pickupPlaceholder}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
          </span>
          <span className="route-row">
            <PinIcon size={16} />
            <span className="route-tag">{t.requests.to}</span>
            <input
              required
              aria-label={t.form.dropoff}
              maxLength={120}
              placeholder={t.form.dropoffPlaceholder}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </span>
        </div>
      </div>

      <label className="field">
        <span className="field-label">
          {t.requests.note} <span className="field-optional">{t.form.optional}</span>
        </span>
        <input maxLength={300} placeholder={t.requests.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {/* The server's own wordings, so the two never say it differently. */}
      {dayError && <p className="error">{t.apiError(day < today ? 'That day is already over' : 'Ask for a ride at most three months ahead')}</p>}
      {error && <p className="error">{error}</p>}
    </Sheet>
  )
}
