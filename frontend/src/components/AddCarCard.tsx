import { useT } from '../lib/i18n'
import { CarIcon } from './icons'

interface Props {
  userName: string
  isPast: boolean
  /** Title when there is nothing yet; the default speaks of a day. */
  emptyTitle?: string
  /** The board is empty altogether: say what the two views are for. */
  intro?: boolean
  onEditName: () => void
}

/**
 * The illustrated placeholder shown where a ride would be: "nothing yet" or
 * "nothing went". It does not add a ride itself; that is the floating plus
 * (components/AddRideButton.tsx), which the hint points at.
 */
export function AddCarCard({ userName, isPast, emptyTitle, intro = false, onEditName }: Props) {
  const t = useT()
  if (isPast) {
    return (
      <div className="card empty-card">
        <Illustration muted />
        <strong>{t.empty.noRidesWent}</strong>
        <span>{t.empty.pastReadOnly}</span>
      </div>
    )
  }
  if (!userName) {
    return (
      <button type="button" className="card empty-card empty-card-btn" onClick={onEditName}>
        <Illustration />
        <strong>{t.empty.whoAreYou}</strong>
        <span>{t.empty.enterToAdd}</span>
      </button>
    )
  }
  return (
    <div className="card empty-card">
      <Illustration />
      <strong>{emptyTitle ?? t.empty.noRidesDay}</strong>
      <span>{t.empty.usePlus}</span>
      {intro && (
        <p className="empty-intro">
          {t.empty.viewsIntro} {t.empty.firstRide}
        </p>
      )}
    </div>
  )
}

function Illustration({ muted = false }: { muted?: boolean }) {
  return (
    <span className={muted ? 'illus illus-muted' : 'illus'} aria-hidden="true">
      <span className="illus-hill" />
      <span className="illus-tree illus-tree-a" />
      <span className="illus-tree illus-tree-b" />
      <span className="illus-car">
        <CarIcon size={44} strokeWidth={1.5} />
      </span>
    </span>
  )
}
