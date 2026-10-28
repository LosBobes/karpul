import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { slideClass, type SlideDir } from '../lib/motion'

interface Props {
  /** What is on screen; a change plays the switch. */
  id: string
  /** Which side the new content comes in from (lib/motion.ts useSlideDir); null swaps on the spot. */
  dir: SlideDir
  children: ReactNode
  /** Classes for the inner wrapper, next to `stack`. */
  className?: string
}

/** Longer than the exit animation in index.css, in case `animationend` never comes. */
const LEAVE_FALLBACK_MS = 600

/**
 * Keyed content that slides both ways: the old content leaves to one side as
 * the new one comes in from the other, instead of vanishing the frame the
 * new one appears (the view switch, the day board, the open ride; the
 * keyframes are in index.css, "Motion").
 *
 * The leaving content is a DOM snapshot (`cloneNode`), not a second React
 * render: the old elements are never mounted again, so nothing in them
 * fetches or runs effects, and what slides out is exactly what was on screen.
 * The keyed wrapper (`Leaf`) takes the snapshot as it unmounts, while its
 * DOM is still attached, and leaves it in the host; the host's own layout
 * effect, in the same commit and before paint, gives it the direction and
 * the animation, so no frame ever shows the new content alone.
 */
export function SlideSwitch({ id, dir, children, className }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const leaving = useRef<HTMLElement | null>(null)

  const onLeave = (node: HTMLElement) => {
    const where = host.current
    if (!where) return
    const snap = node.cloneNode(true) as HTMLElement
    snap.className = 'stack swap-leave'
    snap.setAttribute('aria-hidden', 'true')
    snap.setAttribute('inert', '')
    where.appendChild(snap)
    leaving.current?.remove()
    leaving.current = snap
  }

  useLayoutEffect(() => {
    const snap = leaving.current
    leaving.current = null
    if (!snap) return
    if (!dir) {
      snap.remove()
      return
    }
    // The old content goes the way the new one is not coming from.
    snap.classList.add(dir === 'right' ? 'swap-leave-left' : 'swap-leave-right')
    const done = () => snap.remove()
    snap.addEventListener('animationend', done, { once: true })
    const timer = setTimeout(done, LEAVE_FALLBACK_MS)
    return () => {
      clearTimeout(timer)
      snap.remove()
    }
  }, [id, dir])

  return (
    <div ref={host} className="swap-host">
      <Leaf key={id} className={['stack', slideClass(dir), className].filter(Boolean).join(' ')} onLeave={onLeave}>
        {children}
      </Leaf>
    </div>
  )
}

/** The keyed wrapper, which hands its DOM to `onLeave` on its way out. */
function Leaf({ className, onLeave, children }: { className: string; onLeave: (node: HTMLElement) => void; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  const leave = useRef(onLeave)
  useLayoutEffect(() => {
    leave.current = onLeave
  })
  useLayoutEffect(() => {
    const node = el.current
    return () => {
      if (node) leave.current(node)
    }
  }, [])
  return (
    <div ref={el} className={className}>
      {children}
    </div>
  )
}
