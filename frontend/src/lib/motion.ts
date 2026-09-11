import { useCallback, useEffect, useRef, useState, type AnimationEvent } from 'react'

/**
 * The two hooks behind the app's motion (the keyframes live in index.css).
 *
 * Nothing here fades: a view slides in from the side it lives on, a day
 * board slides the way the calendar moved, a sheet rises from the bottom
 * edge and a drawer from the left, and both go back the way they came.
 */

export type SlideDir = 'left' | 'right' | null

/**
 * Which way freshly keyed content should slide in. `rank` orders the values
 * (a tab index, a date); moving to a higher rank enters from the right,
 * to a lower one from the left. A rank of NaN on either side (nothing was
 * open, the value is not in the list any more) means no slide at all.
 * State is derived during render, the React way to remember the last prop.
 */
export function useSlideDir(value: string, rank: (v: string) => number): SlideDir {
  const [last, setLast] = useState<{ value: string; dir: SlideDir }>({ value, dir: null })
  if (last.value !== value) {
    const d = rank(value) - rank(last.value)
    const dir: SlideDir = Number.isNaN(d) || d === 0 ? null : d > 0 ? 'right' : 'left'
    setLast({ value, dir })
    return dir
  }
  return last.dir
}

/** The class that plays the slide on a keyed element; nothing when there is no direction. */
export function slideClass(dir: SlideDir): string | undefined {
  return dir ? `swap swap-${dir}` : undefined
}

/** Longer than any exit animation in index.css, so a lost `animationend` can never leave an overlay stuck. */
const EXIT_FALLBACK_MS = 400

/**
 * Lets an overlay play its exit animation before the parent unmounts it.
 * `requestClose` flips `closing` (render the `-closing` class from it) and
 * the parent's `onClose` runs when the panel's own animation ends, or after
 * a fallback timeout should no animation fire. A parent that unmounts the
 * overlay itself (a form that just saved) still closes on the spot.
 */
export function useClosing(onClose: () => void) {
  const [closing, setClosing] = useState(false)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  const requestClose = useCallback(() => setClosing(true), [])

  useEffect(() => {
    if (!closing) return
    const id = setTimeout(() => closeRef.current(), EXIT_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [closing])

  // Only the panel's own animation counts: a child's (a portalled popover's
  // pop-in bubbles through React) must not close the sheet.
  const onAnimationEnd = useCallback(
    (e: AnimationEvent<HTMLElement>) => {
      if (closing && e.target === e.currentTarget) closeRef.current()
    },
    [closing],
  )

  return { closing, requestClose, onAnimationEnd }
}
