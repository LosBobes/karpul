import { useT } from '../lib/i18n'
import { PlusIcon } from './icons'

/**
 * The one way to add a ride, drawn the same everywhere: a white plus in a
 * green circle. `PlusCircle` is the glyph on its own (a span, so it can sit
 * inside another button: the empty card, the "Add ride" tile, the drawer
 * item); `AddRideFab` is the floating button pinned to the bottom right of
 * the column on both views, so adding never means hunting for a tile or the
 * menu first.
 */
export function PlusCircle({ size = 56, className }: { size?: number; className?: string }) {
  const cls = ['plus-circle', className].filter(Boolean).join(' ')
  return (
    <span className={cls} style={{ width: size, height: size }} aria-hidden="true">
      <PlusIcon size={Math.round(size * 0.5)} weight="bold" />
    </span>
  )
}

export function AddRideFab({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button type="button" className="fab" aria-label={t.sidebar.addRide} title={t.sidebar.addRide} onClick={onClick}>
      <PlusCircle size={60} />
    </button>
  )
}
