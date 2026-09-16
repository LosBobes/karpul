import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useT } from '../lib/i18n'
import { useClosing } from '../lib/motion'
import { applyUpdate } from '../lib/pwa'
import { useBackClose } from '../lib/useBackClose'
import { BoltTrace, type Point } from './BoltTrace'
import { XIcon } from './icons'

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
 * It takes the whole screen rather than a sheet: the bolt is the screen, the
 * words and the way out float over it, and the finger may start the stroke
 * anywhere the bolt reaches. This is the one place in the app that is its own
 * screen, which is the point. It rises from the bottom edge the way a sheet
 * does, because it comes out of the toast down there, and carries the sheets'
 * own manners with it (escape, the phone's back button, a locked body).
 *
 * The trace is the way in, not the only way: the button at the foot is the
 * same update for anyone who would rather not draw, or cannot.
 */
export function UpdateScreen({ onClose }: Props) {
  const t = useT()
  const { closing, requestClose, onAnimationEnd } = useClosing(onClose)
  const [charged, setCharged] = useState(false)
  const [slipped, setSlipped] = useState(false)
  // Where the bolt ended, in viewport percentages; null if it could not be
  // measured, and then the flare falls back to the middle of the screen.
  const [from, setFrom] = useState<Point | null>(null)
  const fired = useRef(false)

  // The phone's back button closes the screen instead of leaving the page.
  useBackClose(requestClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  // Nothing behind this should move while a finger is drawing across it.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

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
    <div
      className={['update-screen', closing && 'update-screen-closing'].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
      onAnimationEnd={onAnimationEnd}
    >
      <BoltTrace
        charged={charged}
        onSlip={() => setSlipped(true)}
        onComplete={(tail) => {
          setSlipped(false)
          setFrom(tail)
          setCharged(true)
        }}
      />
      {/* The words sit over the bolt and let the finger through; only the two
          buttons take a tap of their own. */}
      <div className="update-chrome">
        <header className="update-head">
          <h2 id="update-title">{t.update.title}</h2>
          <button type="button" className="icon-btn update-close" aria-label={t.common.close} onClick={requestClose}>
            <XIcon />
          </button>
        </header>
        <p className="update-lead" role="status" aria-live="polite">
          {charged ? t.update.charged : slipped ? t.update.slip : t.update.lead}
        </p>
        <footer className="update-foot">
          <button type="button" className="btn btn-soft update-plain" onClick={go} disabled={charged}>
            {t.update.plain}
          </button>
        </footer>
      </div>
      {charged && (
        <div
          className="update-flare"
          aria-hidden="true"
          style={from ? ({ '--flare-x': `${from.x}%`, '--flare-y': `${from.y}%` } as CSSProperties) : undefined}
          onAnimationEnd={go}
        />
      )}
    </div>
  )
}
