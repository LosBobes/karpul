import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtShortDate, fmtTime, shortCarName } from '../lib/dates'
import { useT } from '../lib/i18n'
import type { Ride } from '../lib/types'
import { Avatar } from './Avatar'
import { PowertrainMark } from './CarArt'
import { ArrowRightIcon, CheckIcon } from './icons'
import { Sheet } from './Sheet'

interface Props {
  /** Bumped by the board after any decision or live change, so the list reloads. */
  version: number
  busyId: number | null
  onApprove: (ride: Ride) => void
  onDecline: (ride: Ride) => void
  /** Open the ride on the day plan, among that day's cars. */
  onOpen: (ride: Ride) => void
  onClose: () => void
}

/**
 * The admin's queue: every shared-car ride from today on that someone asked
 * for past their one a week, soonest first (backend: GET /api/admin/approvals).
 * Each is decided here without opening it; a tap on the ride itself opens it
 * on the day plan, to see what else has the car that day. Approving checks the
 * car is still free (a pending ride holds no slot), so it can be refused.
 */
export function Approvals({ version, busyId, onApprove, onDecline, onOpen, onClose }: Props) {
  const t = useT()
  const [rides, setRides] = useState<Ride[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .approvals()
      .then((list) => {
        setRides(list)
        setError(null)
      })
      .catch((e) => setError(t.apiError(e instanceof Error ? e.message : String(e))))
  }, [version, t])

  return (
    <Sheet id="approvals-title" title={t.approvals.title} className="approvals" onClose={onClose}>
      <p className="hint">{t.approvals.intro}</p>
      {error && <p className="error">{error}</p>}
      {rides === null && !error && <p className="hint">{t.common.loading}</p>}
      {rides?.length === 0 && <div className="card empty-card empty-card-short">{t.approvals.empty}</div>}
      {rides && rides.length > 0 && (
        <ul className="approval-list">
          {rides.map((r) => {
            const busy = busyId === r.id
            return (
              <li key={r.id} className="card approval-item">
                <button type="button" className="approval-ride" title={t.approvals.open} onClick={() => onOpen(r)}>
                  <Avatar name={r.driver_name} size="md" />
                  <span className="approval-what">
                    <strong>{r.driver_name}</strong>
                    <span className="approval-when">
                      {fmtShortDate(r.ride_date)} · {fmtTime(r.departure_time)}
                      {r.return_time ? `–${fmtTime(r.return_time)}` : ''}
                    </span>
                    <span className="approval-car">
                      {shortCarName(r.car_name)}
                      <PowertrainMark carName={r.car_name} />
                    </span>
                    <span className="approval-route">
                      {r.origin}
                      <ArrowRightIcon size={12} />
                      {r.destination}
                    </span>
                  </span>
                </button>
                <span className="approval-actions">
                  <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => onDecline(r)}>
                    {t.detail.decline}
                  </button>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onApprove(r)}>
                    <CheckIcon size={16} /> {t.detail.approve}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
