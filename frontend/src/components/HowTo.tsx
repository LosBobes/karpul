import { useState, type CSSProperties, type ReactNode } from 'react'
import { useT, type HowToTopic } from '../lib/i18n'
import { useMapsAllowed } from '../lib/places'
import { ChevronRightIcon, LifebuoyIcon } from './icons'
import { Sheet } from './Sheet'

/** A step's text with its `**control names**` set in bold. */
function rich(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))
}

/**
 * The app's own how-to: a topic per thing people come to do, each folding
 * open to a few numbered steps that name the controls as the screen does.
 * A topic unfolds the way a drawer group does (a grid row from 0fr to 1fr,
 * inert while shut) and its steps follow one after another.
 * The words are `howTo` in `lib/i18n.ts` (both languages; the longer version
 * is docs/user-guide.md, keep them in step); the admin topic shows to admins
 * only. Its foot is the way to a person (`SupportSheet`).
 */
export function HowTo({ isAdmin, onSupport, onClose }: { isAdmin: boolean; onSupport: () => void; onClose: () => void }) {
  const t = useT()
  const maps = useMapsAllowed()
  const topics = t.howTo.topics.filter((topic: HowToTopic) => (isAdmin || !topic.admin) && (maps || !topic.maps))
  // The first topic opens with the sheet; any number may be open at once.
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set([0]))
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })
  return (
    <Sheet
      id="howto-title"
      title={t.howTo.title}
      onClose={onClose}
      className="howto"
      footer={
        <button type="button" className="btn btn-soft btn-block guide-support" onClick={onSupport}>
          <LifebuoyIcon size={18} />
          <span>
            {t.howTo.more} <b>{t.support.title}</b>
          </span>
        </button>
      }
    >
      <div className="howto-list">
        {topics.map((topic: HowToTopic, i: number) => {
          const shown = open.has(i)
          return (
            <div key={topic.title} className={shown ? 'howto-topic howto-open' : 'howto-topic'}>
              <button type="button" className="howto-head" aria-expanded={shown} aria-controls={`howto-${i}`} onClick={() => toggle(i)}>
                <span className="drawer-group-chevron howto-chevron" aria-hidden="true">
                  <ChevronRightIcon size={14} />
                </span>
                <span>{topic.title}</span>
              </button>
              <div id={`howto-${i}`} className="howto-body" inert={!shown}>
                <div className="howto-clip">
                  <ol className="howto-steps">
                    {topic.steps.map((step, n) => (
                      <li key={step} style={{ '--i': n } as CSSProperties}>
                        {rich(step)}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}
