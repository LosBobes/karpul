import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../lib/i18n'
import { TOUR_STEPS, tourTarget } from '../lib/tour'
import { XIcon } from './icons'
import { StackedLabel } from './StackedLabel'

interface Props {
  wide: boolean
  /** Finished or skipped: the caller remembers it (lib/tour.ts `setTourDone`). */
  onDone: () => void
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** Room round the control inside the hole, and between the hole and the card. */
const PAD = 6
const GAP = 12
/** The card never comes closer than this to the screen's edge. */
const EDGE = 12

function holeFor(el: Element | null): Box | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
}

/** Below the hole when it fits, else above, else centred; always on screen. */
function cardPlace(hole: Box | null, card: { width: number; height: number }): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), Math.max(EDGE, vw - card.width - EDGE))
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), Math.max(EDGE, vh - card.height - EDGE))
  if (!hole) return { top: clampY((vh - card.height) / 2), left: clampX((vw - card.width) / 2) }
  const below = hole.top + hole.height + GAP
  const above = hole.top - GAP - card.height
  // A tall target (the drawer item on a wide screen sits low; a bar across the
  // bottom on a phone): beside it is no option, so the card goes where it fits.
  const top = below + card.height <= vh - EDGE ? below : above >= EDGE ? above : clampY(hole.top + hole.height / 2 - card.height / 2)
  return { top, left: clampX(hole.left + hole.width / 2 - card.width / 2) }
}

/**
 * The first-login tour: the screen dims, a ring opens round the control a step
 * is about (finding a ride, offering one, the shared cars) and the card with
 * its words sits beside it. The ring and the card glide from step to step.
 *
 * Every step's words share one grid cell, so the card has one size on every
 * step and its buttons never move; Back keeps its slot on the first step.
 * Escape skips it, like the cross. The dimmed screen does not take clicks:
 * the tour is short, and Skip is always one tap away.
 */
export function Tour({ wide, onDone }: Props) {
  const t = useT()
  const [index, setIndex] = useState(0)
  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1
  const cardRef = useRef<HTMLElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [hole, setHole] = useState<Box | null>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)

  const measure = useCallback(() => {
    const target = document.querySelector(tourTarget(step, wide))
    const box = holeFor(target)
    setHole(box)
    const card = cardRef.current
    if (card) setPlace(cardPlace(box, { width: card.offsetWidth, height: card.offsetHeight }))
  }, [step, wide])

  // A target off screen (a long drawer) is brought into view first.
  // The card is laid out hidden first, so the frame after gives its size.
  useLayoutEffect(() => {
    document.querySelector(tourTarget(step, wide))?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [measure, step, wide])

  useEffect(() => {
    // Layout that settles after the first paint (fonts, the board loading).
    const settle = window.setTimeout(measure, 300)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDone()
      } else if (e.key === 'Tab') {
        // Focus stays in the card while the rest of the screen is dimmed.
        const card = cardRef.current
        if (!card) return
        const items = Array.from(card.querySelectorAll<HTMLElement>('button:not([disabled])'))
        if (!items.length) return
        const first = items[0]
        const end = items[items.length - 1]
        if (!card.contains(document.activeElement)) {
          e.preventDefault()
          first.focus()
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          end.focus()
        } else if (!e.shiftKey && document.activeElement === end) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  return createPortal(
    <div className="tour-layer">
      {hole ? <div className="tour-hole" aria-hidden="true" style={hole} /> : <div className="tour-dim" aria-hidden="true" />}
      <section
        ref={cardRef}
        className="card tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-live="polite"
        style={place ?? { visibility: 'hidden' }}
      >
        <div className="tour-head">
          <span className="tour-count">{t.tour.count(index + 1, TOUR_STEPS.length)}</span>
          <button type="button" className="icon-btn icon-btn-sm tour-close" aria-label={t.tour.skip} onClick={onDone}>
            <XIcon size={16} />
          </button>
        </div>
        <div className="one-cell tour-words">
          {TOUR_STEPS.map((s) => {
            const current = s === step
            const [title, body] = t.tour.steps[s]
            return (
              <div key={s} className={current ? undefined : 'is-ghost'} aria-hidden={current ? undefined : true}>
                <h2 id={current ? 'tour-title' : undefined}>{title}</h2>
                <p>{wide ? (t.tour.wide[s] ?? body) : body}</p>
              </div>
            )
          })}
        </div>
        <div className="tour-foot">
          <span className="tour-dots" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <span key={s} className={i === index ? 'tour-dot tour-dot-on' : 'tour-dot'} />
            ))}
          </span>
          <button
            type="button"
            className={index > 0 ? 'btn btn-sm' : 'btn btn-sm is-ghost'}
            disabled={index === 0}
            aria-hidden={index === 0 || undefined}
            tabIndex={index === 0 ? -1 : undefined}
            onClick={() => setIndex(index - 1)}
          >
            {t.tour.back}
          </button>
          <button ref={nextRef} type="button" className="btn btn-sm btn-primary" onClick={() => (last ? onDone() : setIndex(index + 1))}>
            <StackedLabel first={t.tour.next} second={t.tour.done} showSecond={last} />
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
