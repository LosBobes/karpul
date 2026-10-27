import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import { isMe, runs, useMe } from '../lib/me'
import { canNoteKm, isBack, kmDriven, openLeg } from '../lib/odometer'
import type { Ride } from '../lib/types'
import { Avatar } from './Avatar'
import { ArrowRightIcon, RoadIcon, SteeringIcon } from './icons'
import { Select } from './Select'

interface Props {
  ride: Ride
  busy: boolean
  /** The ride's day has not come yet: nothing to note. */
  coming: boolean
  /** Runs an odometer call and puts the ride it returns on the board. */
  onOdometer: (ride: Ride, call: () => Promise<Ride>) => void
}

const km = (n: number) => n.toLocaleString(intlTag())

/**
 * A shared car's kilometres on its ride card: the reading when the car is
 * taken, at every change of driver and when it is back, so the office knows
 * who drove it and how far (lib/odometer.ts; backend: the `/legs` routes).
 * "Hand over" is how the wheel changes hands: the one driving becomes a
 * passenger in the log and whoever takes it drives the next stretch.
 */
export function Odometer({ ride, busy, coming, onOdometer }: Props) {
  const t = useT()
  const me = useMe()
  const [reading, setReading] = useState('')
  const current = openLeg(ride)
  const back = isBack(ride)
  const driven = kmDriven(ride)
  const may = canNoteKm(ride, me) && !coming
  const runsIt = runs(ride, me)
  const last = ride.legs.at(-1)
  const floor = current ? current.start_km : null

  // Who may take the wheel: the ride's driver ("") or anyone with a seat, never whoever has it now.
  const people = [
    { value: '', label: ride.driver_name, id: ride.driver_id, name: ride.driver_name },
    ...ride.bookings.map((b) => ({ value: String(b.id), label: b.passenger_name, id: b.passenger_id, name: b.passenger_name })),
  ]
  const others = people.filter((p) => !current || !(current.driver_id !== null ? p.id === current.driver_id : p.name === current.driver_name))
  const [who, setWho] = useState('')
  const pick = others.some((p) => p.value === who) ? who : (others[0]?.value ?? '')

  const value = Number(reading)
  const valid = reading.trim() !== '' && Number.isInteger(value) && value >= 0 && (floor === null || value >= floor)

  function run(call: () => Promise<Ride>) {
    onOdometer(ride, call)
    setReading('')
  }

  function submit(e: FormEvent<HTMLFormElement>, action: 'take' | 'back') {
    e.preventDefault()
    if (!valid) return
    if (action === 'back') run(() => api.bringBack(ride.id, value))
    else run(() => api.takeWheel(ride.id, value, pick === '' ? null : Number(pick)))
  }

  return (
    <section className="card odo" aria-labelledby={`odo-${ride.id}`}>
      <h3 className="section-title" id={`odo-${ride.id}`}>
        <RoadIcon size={16} /> {t.odo.title}
        {driven !== null && driven > 0 && <span className="section-count">{t.odo.total(km(driven))}</span>}
      </h3>

      {ride.legs.length > 0 ? (
        <ol className="odo-legs">
          {ride.legs.map((leg) => (
            <li key={leg.id} className={leg.end_km === null ? 'odo-leg odo-leg-open' : 'odo-leg'}>
              <Avatar name={leg.driver_name} size="sm" />
              <span className="odo-who">
                <span className="odo-name">
                  {leg.driver_name}
                  {isMe(me, leg.driver_id, leg.driver_name) && <span className="tag">{t.detail.you}</span>}
                </span>
                <span className="odo-span mono">
                  {km(leg.start_km)}
                  <ArrowRightIcon size={12} />
                  {leg.end_km === null ? '' : km(leg.end_km)}
                </span>
              </span>
              <span className="odo-km mono">
                {leg.end_km === null ? <span className="tag tag-green">{t.odo.driving}</span> : `${km(leg.end_km - leg.start_km)} km`}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint hint-tight">{may ? t.odo.hint : t.odo.notNoted}</p>
      )}

      {may && !back && (
        <form className="odo-form" onSubmit={(e) => submit(e, current ? 'back' : 'take')}>
          <label className="odo-reading">
            <span className="subfield-label">{t.odo.reading}</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={last ? km(last.end_km ?? last.start_km) : '0'}
              aria-invalid={reading !== '' && !valid}
              value={reading}
              onChange={(e) => setReading(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          {(!current || others.length > 0) && (
            <div className="odo-who-pick">
              <Select
                label={current ? t.odo.handOverTo : t.odo.atWheel}
                icon={<SteeringIcon size={16} />}
                value={pick}
                options={others.map((p) => ({ value: p.value, label: p.label }))}
                onChange={setWho}
              />
            </div>
          )}
          <div className="odo-actions">
            {current ? (
              <>
                {others.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-soft"
                    disabled={busy || !valid}
                    onClick={() => run(() => api.takeWheel(ride.id, value, pick === '' ? null : Number(pick)))}
                  >
                    {t.odo.handOver}
                  </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={busy || !valid}>
                  {t.odo.back}
                </button>
              </>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={busy || !valid}>
                {t.odo.noteStart}
              </button>
            )}
          </div>
          {reading !== '' && floor !== null && value < floor && <p className="error">{t.odo.tooLow(km(floor))}</p>}
        </form>
      )}

      {runsIt && ride.legs.length > 0 && (
        <button type="button" className="link link-sm odo-undo" disabled={busy} onClick={() => onOdometer(ride, () => api.undoLeg(ride.id))}>
          {t.odo.undo}
        </button>
      )}
    </section>
  )
}
