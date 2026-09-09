import { useEffect, useState } from 'react'
import VerticalCutReveal from '../fancy/text/vertical-cut-reveal'

/**
 * Text that flips into place like a split-flap board — but only when that can
 * actually happen.
 *
 * VerticalCutReveal clips its characters with `overflow-hidden` and slides them
 * up from y:100%, so anything that stops the animation from running leaves the
 * text *invisible* rather than merely static. Two cases do exactly that:
 *
 *  - a background tab, where the browser throttles requestAnimationFrame and
 *    the spring freezes part-way (open the app with cmd-click and the headline
 *    would never appear);
 *  - `prefers-reduced-motion`, which the library animates straight through
 *    because motion drives transforms from JS, not CSS.
 *
 * So plain text is the baseline and the reveal is the enhancement: we mount it
 * only once the page is visible and motion is welcome.
 */
/** Animate only where it will actually finish and is actually wanted. */
function canAnimate(): boolean {
  return (
    document.visibilityState === 'visible' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function BoardText({
  children,
  splitBy = 'characters',
  staggerDuration = 0.018,
  stiffness = 220,
}: {
  children: string
  splitBy?: 'characters' | 'words'
  staggerDuration?: number
  stiffness?: number
}) {
  const [animate, setAnimate] = useState(canAnimate)

  useEffect(() => {
    if (animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setAnimate(true)
      document.removeEventListener('visibilitychange', onVisible)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [animate])

  if (!animate) return <>{children}</>

  return (
    <VerticalCutReveal
      splitBy={splitBy}
      staggerDuration={staggerDuration}
      staggerFrom="first"
      transition={{ type: 'spring', stiffness, damping: 24 }}
    >
      {children}
    </VerticalCutReveal>
  )
}
