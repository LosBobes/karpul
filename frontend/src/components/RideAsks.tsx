import { useT } from '../lib/i18n'
import { mayClaim, useMe } from '../lib/me'
import type { Ride } from '../lib/types'
import { CarIcon, CheckIcon } from './icons'

/** An admin's *Approve* / *Decline* on a shared car past its driver's share. */
export function ApprovalAsk({ ride, busy, onApprove, onDecline }: { ride: Ride; busy: boolean; onApprove: (ride: Ride) => void; onDecline: (ride: Ride) => void }) {
  const t = useT()
  return (
    <div className="approval-row">
      <span className="approval-ask">{t.detail.approvalAsk(ride.driver_name)}</span>
      <span className="approval-actions">
        <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => onDecline(ride)}>
          {t.detail.decline}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onApprove(ride)}>
          <CheckIcon size={16} /> {t.detail.approve}
        </button>
      </span>
    </div>
  )
}

interface DriverAsksProps {
  ride: Ride
  busy: boolean
  /** The driver, or an admin (`runs()` in lib/me.ts). */
  runsIt: boolean
  isDriver: boolean
  isPast: boolean
  /** You have a seat in the car. */
  seated: boolean
  onTakeOver: (ride: Ride) => void
  onConfirmRide: (ride: Ride) => void
  onClaim: (ride: Ride) => void
}

/**
 * The rows that ask about who drives: a shared car whose driver cancelled
 * (*I'll drive*), a ride from the paper log waiting for its driver to confirm
 * it, and *This is me* on a ride whose driver has no account (past rides
 * too: the paper log is mostly behind us).
 */
export function DriverAsks({ ride, busy, runsIt, isDriver, isPast, seated, onTakeOver, onConfirmRide, onClaim }: DriverAsksProps) {
  const t = useT()
  const me = useMe()
  return (
    <>
      {ride.needs_driver && !isPast && (
        <div className="approval-row">
          <span className="approval-ask">
            {seated ? t.detail.takeOverAsk(ride.driver_name) : t.detail.takeOverWait(ride.driver_name)}
          </span>
          {seated && (
            <span className="approval-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onTakeOver(ride)}>
                <CarIcon size={16} /> {t.detail.takeOver}
              </button>
            </span>
          )}
        </div>
      )}

      {ride.unconfirmed && !isPast && (
        <div className="approval-row">
          <span className="approval-ask">
            {!runsIt ? t.detail.unconfirmedWait(ride.driver_name) : isDriver ? t.detail.confirmAsk : t.detail.confirmAskFor(ride.driver_name)}
          </span>
          {runsIt && (
            <span className="approval-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onConfirmRide(ride)}>
                <CheckIcon size={16} /> {t.detail.confirm}
              </button>
            </span>
          )}
        </div>
      )}

      {mayClaim(ride, me) && (
        <div className="claim-row">
          <span className="claim-ask">{t.detail.claimAsk(ride.driver_name)}</span>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onClaim(ride)}>
            <CheckIcon size={16} /> {t.detail.claim}
          </button>
        </div>
      )}
    </>
  )
}
