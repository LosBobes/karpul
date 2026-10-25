import { initials } from '../lib/dates'
import { avatarTone } from '../lib/tone'

/**
 * Pastel initials disc. The hue is a stable function of the name, so the same
 * person gets the same colour in every list and on the drag ghost.
 */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`avatar avatar-${size} avatar-${avatarTone(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
