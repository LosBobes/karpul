import { initials } from '../lib/dates'

/**
 * Pastel initials disc. The hue is a stable function of the name, so the same
 * person gets the same colour in every list and on the drag ghost.
 */
const PALETTE = ['violet', 'rose', 'amber', 'orange', 'blue', 'teal', 'green', 'pink'] as const

function avatarTone(name: string): (typeof PALETTE)[number] {
  let h = 0
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`avatar avatar-${size} avatar-${avatarTone(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
