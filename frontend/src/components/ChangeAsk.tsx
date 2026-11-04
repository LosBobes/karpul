import { useState } from 'react'
import { firstName, fmtShortDate, fmtTime } from '../lib/dates'
import { useT } from '../lib/i18n'
import { useMe } from '../lib/me'
import type { ProposalField, Ride } from '../lib/types'
import { ArrowRightIcon, CheckIcon } from './icons'
import { Sheet } from './Sheet'
import { TimePicker } from './TimePicker'

const CHANGE_FIELDS: ProposalField[] = ['ride_date', 'departure_time', 'return_time', 'origin', 'destination']

/**
 * A change to the ride waiting on people (backend: `Ride.proposal`), each
 * field before and after. The driver's own change waits for the passengers:
 * one who has not answered gets *Decline* / *Agree*, and whoever runs the
 * ride sees who is still to answer and can *Withdraw*. A passenger's
 * suggested time waits for the driver first: whoever runs the ride gets
 * *Decline* / *Accept*, the suggester *Withdraw*.
 */
export function ChangeAsk({ ride, busy, onAnswer, onWithdraw }: { ride: Ride; busy: boolean; onAnswer: (agree: boolean) => void; onWithdraw?: () => void }) {
  const t = useT()
  const me = useMe()
  const proposal = ride.proposal!
  const asked = ride.bookings.filter((b) => b.passenger_id !== null && b.passenger_id !== ride.driver_id)
  const mine = asked.find((b) => b.passenger_id === me.id)
  const agreed = new Set(proposal.agreed)
  const waiting = asked.filter((b) => !agreed.has(b.passenger_id as number)).map((b) => firstName(b.passenger_name))
  const suggested = !!proposal.suggested
  const myAsk = proposal.by_id === me.id
  const shown = (field: ProposalField, value: string | null | undefined) => {
    if (field === 'ride_date') return value ? fmtShortDate(value) : ''
    if (field === 'departure_time') return fmtTime(value ?? null)
    if (field === 'return_time') return value ? fmtTime(value) : t.detail.noReturn
    return value ?? ''
  }
  const changes = CHANGE_FIELDS.filter((f) => f in proposal.fields)
  const head = suggested
    ? myAsk
      ? t.detail.suggestYours
      : t.detail.suggestAsk(proposal.by)
    : onWithdraw && !mine
      ? t.detail.changeYours
      : t.detail.changeAsk(proposal.by)
  // Who answers now: on a suggestion whoever runs the ride, else a passenger who has not.
  const answers = suggested ? !!onWithdraw && !myAsk : !!mine && !agreed.has(me.id)
  const takesBack = suggested ? myAsk || (!!onWithdraw && !answers) : !!onWithdraw && !mine
  return (
    <div className="approval-row change-ask">
      <span className="approval-ask">{head}</span>
      <dl className="change-list">
        {changes.map((f) => (
          <div key={f} className="change-item">
            <dt>{t.adminLog.fields[f]}</dt>
            <dd>
              <s>{shown(f, ride[f] as string | null)}</s>
              <ArrowRightIcon size={12} />
              <strong>{shown(f, proposal.fields[f])}</strong>
            </dd>
          </div>
        ))}
      </dl>
      {proposal.suggested_by && <span className="change-waiting">{t.detail.suggestFrom(proposal.suggested_by)}</span>}
      {!suggested && mine && agreed.has(me.id) && <span className="approval-ask">{t.detail.changeYouAgreed}</span>}
      {suggested && !answers && <span className="change-waiting">{t.detail.suggestWaiting(firstName(ride.driver_name))}</span>}
      {!suggested && waiting.length > 0 && !answers && <span className="change-waiting">{t.detail.changeWaiting(waiting.join(', '))}</span>}
      {answers && (
        <span className="approval-actions">
          <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => onAnswer(false)}>
            {t.detail.decline}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onAnswer(true)}>
            <CheckIcon size={16} /> {suggested ? t.detail.accept : t.detail.agree}
          </button>
        </span>
      )}
      {takesBack && (
        <span className="approval-actions">
          <button type="button" className="btn" disabled={busy} onClick={onWithdraw}>
            {t.detail.withdraw}
          </button>
        </span>
      )}
    </div>
  )
}

/** A passenger's "Suggest another time": the departure and, when the ride comes back, the return. */
export function SuggestTime({ ride, busy, onSend, onClose }: { ride: Ride; busy: boolean; onSend: (times: { departure_time?: string; return_time?: string }) => void; onClose: () => void }) {
  const t = useT()
  const [departure, setDeparture] = useState(fmtTime(ride.departure_time))
  const [back, setBack] = useState(fmtTime(ride.return_time))
  const times: { departure_time?: string; return_time?: string } = {}
  if (departure !== fmtTime(ride.departure_time)) times.departure_time = departure
  if (ride.return_time && back !== fmtTime(ride.return_time)) times.return_time = back
  const changed = Object.keys(times).length > 0
  return (
    <Sheet
      id="suggest-title"
      title={t.detail.suggestTitle}
      as="form"
      stacked
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault()
        if (changed) onSend(times)
      }}
      footer={
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !changed}>
          {t.detail.suggestSend}
        </button>
      }
    >
      <div className={ride.return_time ? 'grid-2' : undefined}>
        <TimePicker label={t.form.departs} value={departure} onChange={setDeparture} />
        {ride.return_time && <TimePicker label={t.form.returns} value={back} onChange={setBack} />}
      </div>
      <p className="hint">{t.detail.suggestHint}</p>
    </Sheet>
  )
}
