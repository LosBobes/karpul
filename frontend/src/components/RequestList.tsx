import { fmtTime } from '../lib/dates'
import { useT } from '../lib/i18n'
import { isMyRequest, useMe } from '../lib/me'
import type { RideRequest } from '../lib/types'
import { Avatar } from './Avatar'
import { HandIcon } from './icons'

interface Props {
  /** The day's open requests, in board order (time, then id). */
  requests: RideRequest[]
  isPast: boolean
  busy: boolean
  /** A driver answers: the ride form opens filled in for it. */
  onOffer: (request: RideRequest) => void
  onWithdraw: (request: RideRequest) => void
}

/**
 * The passengers' side of a day: who is looking for a ride that nobody offers
 * yet. A driver answers one by adding a ride for it, which puts the requester
 * in the car; your own request can be withdrawn. Answered requests are not
 * shown: the seat they turned into is on the board already.
 */
export function RequestList({ requests, isPast, busy, onOffer, onWithdraw }: Props) {
  const t = useT()
  const me = useMe()
  if (requests.length === 0) return null
  return (
    <section className="requests" aria-label={t.requests.title}>
      <h4 className="requests-title">
        <HandIcon size={15} /> {t.requests.title} <span className="section-count">{requests.length}</span>
      </h4>
      <ul className="requests-list">
        {requests.map((r) => {
          const mine = isMyRequest(r, me)
          return (
            <li key={r.id} className={mine ? 'request-row request-row-me' : 'request-row'}>
              <Avatar name={r.name} size="sm" />
              <span className="request-text">
                <strong>
                  {mine ? t.requests.yours : r.name}
                  <small>{t.requests.aroundTime(fmtTime(r.departure_time))}</small>
                </strong>
                <span>{t.myRides.route(r.origin, r.destination)}</span>
                {r.note && <span className="request-note">{r.note}</span>}
              </span>
              {!isPast &&
                (mine ? (
                  <button type="button" className="link link-sm" disabled={busy} onClick={() => onWithdraw(r)}>
                    {t.requests.withdraw}
                  </button>
                ) : (
                  <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => onOffer(r)}>
                    {t.requests.offer}
                  </button>
                ))}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
