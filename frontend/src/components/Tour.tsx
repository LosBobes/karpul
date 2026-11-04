import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { TOUR_STEPS, tourTarget } from '../lib/tour'
import { XIcon } from './icons'

interface Props {
  wide: boolean
  /** Finished or skipped: the caller remembers it (lib/tour.ts `setTourDone`). */
  onDone: () => void
}

/**
 * The first-login tour: a card per step (finding a ride, offering one, the
 * shared cars), each putting a ring round its control (`.tour-spot`) while it
 * shows. It covers nothing, so the app can be used with it open: the card is
 * above the board on a phone and in the dock on a wide screen.
 */
export function Tour({ wide, onDone }: Props) {
  const t = useT()
  const [index, setIndex] = useState(0)
  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1
  const [title, body] = t.tour.steps[step]

  useEffect(() => {
    const el = document.querySelector(tourTarget(step, wide))
    el?.classList.add('tour-spot')
    return () => el?.classList.remove('tour-spot')
  }, [step, wide])

  return (
    <section className={wide ? 'card tour-card tour-card-dock' : 'card tour-card'} aria-labelledby="tour-title" aria-live="polite">
      <div className="tour-head">
        <span className="tour-count">{t.tour.count(index + 1, TOUR_STEPS.length)}</span>
        <button type="button" className="icon-btn icon-btn-sm tour-close" aria-label={t.tour.skip} onClick={onDone}>
          <XIcon size={16} />
        </button>
      </div>
      <h2 id="tour-title">{title}</h2>
      <p>{wide ? (t.tour.wide[step] ?? body) : body}</p>
      <div className="tour-foot">
        <span className="tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((s, i) => (
            <span key={s} className={i === index ? 'tour-dot tour-dot-on' : 'tour-dot'} />
          ))}
        </span>
        {index > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => setIndex(index - 1)}>
            {t.tour.back}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-primary" onClick={() => (last ? onDone() : setIndex(index + 1))}>
          {last ? t.tour.done : t.tour.next}
        </button>
      </div>
    </section>
  )
}
