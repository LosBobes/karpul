import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtShortDate, fmtTime } from '../lib/dates'
import { useT } from '../lib/i18n'
import type { GaragePlate, Ride } from '../lib/types'
import { Avatar } from './Avatar'
import { ArrowRightIcon, CheckIcon, TrashIcon } from './icons'
import { Sheet } from './Sheet'

interface Props {
  /** Bumped by the board after a tick or a live change, so the list reloads. */
  version: number
  busyId: number | null
  /** `standing`: the garage lets the plate in for good, so its next rides are on the list already. */
  onMark: (ride: Ride, registered: boolean, standing?: boolean) => void
  /** Open the ride on the day plan. */
  onOpen: (ride: Ride) => void
  onClose: () => void
}

/**
 * The admin's task list for the Beograd office garage, which lets in only the
 * cars on its list: every own car coming there from today on with the plate
 * its driver gave (backend: GET /api/admin/garage), the ones still to add
 * first, soonest first, then the ones already ticked off (a tick can be
 * taken back). The list itself is kept outside Karpul; this says what to add.
 */
export function GarageList({ version, busyId, onMark, onOpen, onClose }: Props) {
  const t = useT()
  const [rides, setRides] = useState<Ride[] | null>(null)
  const [plates, setPlates] = useState<GaragePlate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState(0)

  useEffect(() => {
    api
      .garage()
      .then((list) => {
        setRides(list)
        setError(null)
      })
      .catch((e) => setError(t.apiError(e instanceof Error ? e.message : String(e))))
    api
      .standingPlates()
      .then(setPlates)
      .catch(() => setPlates([]))
  }, [version, mine, t])

  async function forget(plate: GaragePlate) {
    try {
      await api.removeStandingPlate(plate.id)
    } catch (e) {
      setError(t.apiError(e instanceof Error ? e.message : String(e)))
    }
    setMine((n) => n + 1)
  }

  return (
    <Sheet id="garage-title" title={t.garage.title} className="approvals" onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {rides === null && !error && <p className="hint">{t.common.loading}</p>}
      {rides?.length === 0 && <div className="card empty-card empty-card-short">{t.garage.empty}</div>}
      {rides && rides.length > 0 && (
        <ul className="approval-list">
          {rides.map((r) => {
            const busy = busyId === r.id
            return (
              <li key={r.id} className={r.plate_registered ? 'card approval-item garage-done' : 'card approval-item'}>
                <button type="button" className="approval-ride" title={t.garage.open} onClick={() => onOpen(r)}>
                  <Avatar name={r.driver_name} size="md" />
                  <span className="approval-what">
                    <strong className="garage-plate">{r.plate}</strong>
                    <span className="approval-car">{r.driver_name} · {r.car_name}</span>
                    <span className="approval-when">
                      {fmtShortDate(r.ride_date)} · {fmtTime(r.departure_time)}
                      {r.return_time ? `–${fmtTime(r.return_time)}` : ''}
                    </span>
                    <span className="approval-route">
                      {r.origin}
                      <ArrowRightIcon size={12} />
                      {r.destination}
                    </span>
                  </span>
                </button>
                <span className="approval-actions">
                  {r.plate_registered ? (
                    <>
                      <span className="garage-on-list">
                        <CheckIcon size={16} /> {t.garage.onList}
                      </span>
                      <button type="button" className="btn" disabled={busy} onClick={() => onMark(r, false)}>
                        {t.garage.undo}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onMark(r, true)}>
                        <CheckIcon size={16} /> {t.garage.markDone}
                      </button>
                      <button type="button" className="btn btn-soft" disabled={busy} onClick={() => onMark(r, true, true)}>
                        {t.garage.forGood}
                      </button>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {plates.length > 0 && (
        <section className="standing-plates" aria-label={t.garage.standing}>
          <h3 className="section-title">{t.garage.standing}</h3>
          <ul className="admin-list">
            {plates.map((p) => (
              <li key={p.id} className="admin-row">
                <span className="admin-row-text">
                  <strong className="garage-plate">{p.plate}</strong>
                  <span>{p.owner_name}</span>
                </span>
                <button type="button" className="icon-btn" aria-label={t.garage.forgetPlate(p.plate)} title={t.garage.forgetPlate(p.plate)} onClick={() => void forget(p)}>
                  <TrashIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  )
}
