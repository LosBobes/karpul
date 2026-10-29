import { useState, type FormEvent } from 'react'
import { addDays, foldName, parseISODate, toISODate, todayISO } from '../lib/dates'
import { useT } from '../lib/i18n'
import { pinsFor } from '../lib/maps'
import type { Point, RideRequestInput } from '../lib/types'
import { DatePicker } from './DatePicker'
import { PinIcon } from './icons'
import { MapPicker } from './MapPicker'
import { PlaceInput } from './PlaceInput'
import { Sheet } from './Sheet'
import { TimePicker } from './TimePicker'

/** Same memory as the ride form: the last route you used, so a commute is two taps. */
const LAST_ROUTE_KEY = 'karpul.lastRoute'
/** How far ahead a request may be (backend: routers/requests.py). */
const MAX_DAYS_AHEAD = 92

function lastRoute(): { origin: string; destination: string; points: Record<string, Point> } {
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY)
    if (raw) {
      const r = JSON.parse(raw) as { origin?: string; destination?: string; points?: Record<string, Point> }
      return { origin: r.origin ?? '', destination: r.destination ?? '', points: r.points ?? {} }
    }
  } catch {
    /* ignore */
  }
  return { origin: '', destination: '', points: {} }
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
  // Pinned, a request also reaches the drivers who pass close by (backend: requests.drivers_for).
  const [pins, setPins] = useState<Record<string, Point>>(last.points)
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null)
  const pinOf = (place: string): Point | null => pins[foldName(place)] ?? null
  const placeSetter = (set: (value: string) => void) => (value: string, point: Point | null) => {
    set(value)
    if (point && value.trim()) setPins((p) => ({ ...p, [foldName(value)]: point }))
  }

  const latest = toISODate(addDays(parseISODate(today), MAX_DAYS_AHEAD))
  const dayError = day < today || day > latest
  const ready = !dayError && origin.trim() !== '' && destination.trim() !== ''

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || submitting) return
    onSubmit({
      request_date: day,
      departure_time: time,
      origin: origin.trim(),
      destination: destination.trim(),
      note: note.trim(),
      points: pinsFor([origin, destination], pins),
    })
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
            <PlaceInput
              required
              label={t.form.pickup}
              placeholder={t.form.pickupPlaceholder}
              value={origin}
              point={pinOf(origin)}
              near={pinOf(destination)}
              onChange={placeSetter(setOrigin)}
              onMap={() => setPicking('origin')}
            />
          </span>
          <span className="route-row">
            <PinIcon size={16} />
            <span className="route-tag">{t.requests.to}</span>
            <PlaceInput
              required
              label={t.form.dropoff}
              placeholder={t.form.dropoffPlaceholder}
              value={destination}
              point={pinOf(destination)}
              near={pinOf(origin)}
              onChange={placeSetter(setDestination)}
              onMap={() => setPicking('destination')}
            />
          </span>
        </div>
        {picking && (
          <div className="route-picker">
            <span className="subfield-label">{t.map.pinFor((picking === 'origin' ? origin : destination) || (picking === 'origin' ? t.form.pickup : t.form.dropoff))}</span>
            <MapPicker
              key={picking}
              initial={pinOf(picking === 'origin' ? origin : destination)}
              near={pinOf(origin) ?? pinOf(destination)}
              onCancel={() => setPicking(null)}
              onPick={(point, name) => {
                const words = (picking === 'origin' ? origin : destination).trim() || name || ''
                if (words) {
                  ;(picking === 'origin' ? setOrigin : setDestination)(words)
                  setPins((p) => ({ ...p, [foldName(words)]: point }))
                }
                setPicking(null)
              }}
            />
          </div>
        )}
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
