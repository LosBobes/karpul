import { useT } from '../lib/i18n'
import { CarIcon } from './icons'

interface Props {
  isPast: boolean
  /** Title when there is nothing yet; the default speaks of a day. */
  emptyTitle?: string
}

/**
 * The placeholder shown where a ride would be: "nothing yet" or
 * "nothing went". It does not add a ride itself; that is the floating plus
 * (components/AddRideButton.tsx), which needs no pointing at.
 */
export function AddCarCard({ isPast, emptyTitle }: Props) {
  const t = useT()
  if (isPast) {
    return (
      <div className="card empty-card">
        <Badge muted />
        <strong>{t.empty.noRidesWent}</strong>
      </div>
    )
  }
  return (
    <div className="card empty-card">
      <Badge />
      <strong>{emptyTitle ?? t.empty.noRidesDay}</strong>
    </div>
  )
}

/** The car on a small tinted disc: says what goes here without a picture to read. */
function Badge({ muted = false }: { muted?: boolean }) {
  return (
    <span className={muted ? 'empty-badge empty-badge-muted' : 'empty-badge'} aria-hidden="true">
      <CarIcon size={24} />
    </span>
  )
}
