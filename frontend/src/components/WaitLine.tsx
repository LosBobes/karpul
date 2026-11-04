import { useT } from '../lib/i18n'
import { useMe } from '../lib/me'
import type { Ride } from '../lib/types'
import { Avatar } from './Avatar'
import { XIcon } from './icons'

/** Who is queueing for a seat in a full car, in order; the driver may take someone off. */
export function WaitLine({ ride, isDriver, isPast, busy, onLeaveLine }: { ride: Ride; isDriver: boolean; isPast: boolean; busy: boolean; onLeaveLine: (ride: Ride, entryId: number) => void }) {
  const t = useT()
  const me = useMe()
  return (
    <div className="waitline">
      <h4 className="waitline-title">
        {t.detail.waitingTitle} <span className="section-count">{ride.waitlist.length}</span>
      </h4>
      <ol className="waitline-list">
        {ride.waitlist.map((w) => (
          <li key={w.id} className="waitline-row">
            <Avatar name={w.name} size="sm" />
            <span className="waitline-name">
              {w.name}
              {w.user_id === me.id && <span className="tag">{t.detail.you}</span>}
              {w.pickup && (
                <small>
                  {t.detail.getsInAt(w.pickup)}
                  {w.new_stop_before != null && ` · ${t.detail.newPlace}`}
                </small>
              )}
            </span>
            {isDriver && !isPast && (
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                title={t.detail.removeFromLine(w.name)}
                aria-label={t.detail.removeFromLine(w.name)}
                disabled={busy}
                onClick={() => onLeaveLine(ride, w.id)}
              >
                <XIcon size={16} />
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
