import { useState } from 'react'
import { initials } from '../lib/dates'
import { usePhoto } from '../lib/photos'
import { avatarTone } from '../lib/tone'

/**
 * The person's photo (lib/photos.ts), else a pastel initials disc. The hue is
 * a stable function of the name, so the same person gets the same colour in
 * every list and on the drag ghost; it stays under a photo while it loads.
 */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const photo = usePhoto(name)
  // A photo that would not load (offline, just replaced) falls back to the initials.
  const [broken, setBroken] = useState<string | null>(null)
  const shown = photo && photo !== broken ? photo : null
  return (
    <span className={`avatar avatar-${size} avatar-${avatarTone(name)}`} aria-hidden="true">
      {shown ? <img src={shown} alt="" decoding="async" draggable={false} onError={() => setBroken(shown)} /> : initials(name)}
    </span>
  )
}
