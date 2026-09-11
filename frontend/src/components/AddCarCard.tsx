import { useT } from '../lib/i18n'
import { PlusCircle } from './AddRideButton'
import { CarIcon } from './icons'

interface Props {
  userName: string
  isPast: boolean
  hasCars: boolean
  /** Title when there is nothing yet; the default speaks of a day. */
  emptyTitle?: string
  onAdd: () => void
  onEditName: () => void
}

/** The illustrated placeholder shown where a ride would be: "add one" or "nothing went". */
export function AddCarCard({ userName, isPast, hasCars, emptyTitle, onAdd, onEditName }: Props) {
  const t = useT()
  if (isPast) {
    return (
      <div className="card empty-card">
        <Illustration muted />
        <strong>{hasCars ? t.empty.pickAbove : t.empty.noRidesWent}</strong>
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
    <button type="button" className="card empty-card empty-card-btn empty-card-add" onClick={onAdd}>
      <Illustration />
      <PlusCircle size={56} className="empty-card-plus" />
      <strong>{hasCars ? t.empty.addNew : (emptyTitle ?? t.empty.noRidesDay)}</strong>
      <span>{t.empty.tapToEnter}</span>
    </button>
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
