import { useT, type GuideEntry } from '../lib/i18n'
import { GuideArt } from './GuideArt'
import { BoltIcon, KeyIcon } from './icons'
import { Sheet } from './Sheet'

/**
 * The help panel for the company cars: how to charge one with the company
 * card, step by step, then where the Mazda 6e keeps the things a first-time
 * EV driver looks for in the wrong place. The words live in `lib/i18n.ts`
 * (`guide`, in both languages), one picture per entry in `GuideArt.tsx`;
 * edit those when the fleet or the chargers change, nothing else needs to
 * know.
 */
export function CarGuide({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <Sheet id="guide-title" title={t.guide.title} onClose={onClose} className="guide">
      <section className="guide-section">
        <h3 className="section-title">
          <KeyIcon size={16} /> {t.guide.chargingTitle}
        </h3>
        <ol className="guide-steps">
          {t.guide.charging.map((s: GuideEntry, i: number) => (
            <li key={s.art} className="guide-step">
              <span className="guide-art" aria-hidden="true">
                <GuideArt art={s.art} width={96} />
                <span className="guide-step-no">{i + 1}</span>
              </span>
              <span className="guide-step-text">
                <b>{s.title}</b>
                <span>{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-section">
        <h3 className="section-title">
          <BoltIcon size={16} /> {t.guide.mazdaTitle}
        </h3>
        <dl className="guide-list">
          {t.guide.mazda.map((q: GuideEntry) => (
            <div key={q.art} className="guide-row">
              <span className="guide-art guide-art-row" aria-hidden="true">
                <GuideArt art={q.art} width={96} />
              </span>
              <div className="guide-row-text">
                <dt>{q.title}</dt>
                <dd>{q.body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>
    </Sheet>
  )
}
