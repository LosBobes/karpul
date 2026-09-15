import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useT } from '../lib/i18n'
import { applyUpdate } from '../lib/pwa'
import { BoltTrace, type Point } from './BoltTrace'
import { Sheet } from './Sheet'

/** Longer than the flare in index.css, so a lost `animationend` never strands a charged bolt. */
const FLARE_FALLBACK_MS = 1800

interface Props {
  onClose: () => void
}

/**
 * Taking a new build (lib/pwa.ts). A waiting build is not urgent and the
 * refresh throws the board away and fetches it again, so applying it is a
 * thing you do rather than a thing you tap by accident: you trace the app's
 * own thunderbolt to charge it, the bolt flashes over, a green flare opens out
 * of the point the finger finished on and washes the screen, and the hard
 * refresh happens behind it, which is also what hides the reload's blank
 * frame. The flare picking the trace up where it ended is what makes the two
 * one gesture rather than a drawing followed by an effect.
 *
 * The trace is the way in, not the only way: the button under the pad is the
 * same update for anyone who would rather not draw, or cannot.
 */
export function UpdateSheet({ onClose }: Props) {
  const t = useT()
  const [charged, setCharged] = useState(false)
  const [slipped, setSlipped] = useState(false)
  // Where the bolt ended, in viewport percentages; null if it could not be
  // measured, and then the flare falls back to the middle of the screen.
  const [from, setFrom] = useState<Point | null>(null)
  const fired = useRef(false)

  const go = () => {
    if (fired.current) return
    fired.current = true
    applyUpdate()
  }

  // The flare's own end is what starts the refresh (reduced motion collapses
  // it and the refresh comes at once); the timer is there for a lost event.
  useEffect(() => {
    if (!charged) return
    const id = setTimeout(go, FLARE_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [charged])

  return (
    <Sheet id="update-title" title={t.update.title} onClose={onClose} className="update-sheet">
      <p className="update-lead" role="status" aria-live="polite">
        {charged ? t.update.charged : slipped ? t.update.slip : t.update.lead}
      </p>
      <BoltTrace
        charged={charged}
        onSlip={() => setSlipped(true)}
        onComplete={(tail) => {
          setSlipped(false)
          setFrom(tail)
          setCharged(true)
        }}
      />
      <button type="button" className="btn btn-soft btn-block update-plain" onClick={go} disabled={charged}>
        {t.update.plain}
      </button>
      {charged && (
        <div
          className="update-flare"
          aria-hidden="true"
          style={from ? ({ '--flare-x': `${from.x}%`, '--flare-y': `${from.y}%` } as CSSProperties) : undefined}
          onAnimationEnd={go}
        />
      )}
    </Sheet>
  )
}
