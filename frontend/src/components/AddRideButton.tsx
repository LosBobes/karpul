import { useT } from '../lib/i18n'
import { PlusIcon } from './icons'

/**
 * The one way to add a ride: a white plus in a green circle, floating at the
 * bottom right of the column on both views whenever a ride can be added. It
 * is deliberately the only add control on the screen (no tile in the
 * carousel, no plus in the empty card, no drawer item), so there is one place
 * to look for it.
 */
function PlusCircle({ size }: { size: number }) {
  return (
    <span className="plus-circle" style={{ width: size, height: size }} aria-hidden="true">
      <PlusIcon size={Math.round(size * 0.5)} weight="bold" />
    </span>
  )
}

export function AddRideFab({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button type="button" className="fab" aria-label={t.fab.addRide} title={t.fab.addRide} onClick={onClick}>
      <PlusCircle size={60} />
    </button>
  )
}
