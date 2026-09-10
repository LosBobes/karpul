import { CarIcon, PlusIcon } from './icons'

interface Props {
  userName: string
  isPast: boolean
  hasCars: boolean
  onAdd: () => void
  onEditName: () => void
}

/** The illustrated placeholder shown where a car would be: "add one" or "nothing went". */
export function AddCarCard({ userName, isPast, hasCars, onAdd, onEditName }: Props) {
  if (isPast) {
    return (
      <div className="card empty-card">
        <Illustration muted />
        <strong>{hasCars ? 'Pick a car above' : 'No cars went on this day'}</strong>
        <span>Past days are read-only.</span>
      </div>
    )
  }
  if (!userName) {
    return (
      <button type="button" className="card empty-card empty-card-btn" onClick={onEditName}>
        <Illustration />
        <strong>Who are you?</strong>
        <span>Enter your name to add a car or get into one.</span>
      </button>
    )
  }
  return (
    <button type="button" className="card empty-card empty-card-btn" onClick={onAdd}>
      <Illustration plus />
      <strong>{hasCars ? 'Add a new car' : 'No cars on this day yet'}</strong>
      <span>Tap to enter the car, seats, times and route.</span>
    </button>
  )
}

function Illustration({ plus = false, muted = false }: { plus?: boolean; muted?: boolean }) {
  return (
    <span className={muted ? 'illus illus-muted' : 'illus'} aria-hidden="true">
      <span className="illus-hill" />
      <span className="illus-tree illus-tree-a" />
      <span className="illus-tree illus-tree-b" />
      <span className="illus-car">
        <CarIcon size={44} strokeWidth={1.5} />
      </span>
      {plus && (
        <span className="illus-plus">
          <PlusIcon size={14} strokeWidth={2.5} />
        </span>
      )}
    </span>
  )
}
