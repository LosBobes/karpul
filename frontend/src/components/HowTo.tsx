import type { ReactNode } from 'react'
import { useT, type HowToTopic } from '../lib/i18n'
import { ChevronRightIcon, LifebuoyIcon } from './icons'
import { Sheet } from './Sheet'

/** A step's text with its `**control names**` set in bold. */
function rich(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))
}

/**
 * The app's own how-to: a topic per thing people come to do, each folding
 * open to a few numbered steps that name the controls as the screen does.
 * The words are `howTo` in `lib/i18n.ts` (both languages; the longer version
 * is docs/user-guide.md, keep them in step); the admin topic shows to admins
 * only. Its foot is the way to a person (`SupportSheet`).
 */
export function HowTo({ isAdmin, onSupport, onClose }: { isAdmin: boolean; onSupport: () => void; onClose: () => void }) {
  const t = useT()
  const topics = t.howTo.topics.filter((topic: HowToTopic) => isAdmin || !topic.admin)
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
        {topics.map((topic: HowToTopic, i: number) => (
          <details key={topic.title} className="howto-topic" open={i === 0}>
            <summary className="howto-head">
              <span className="drawer-group-chevron howto-chevron" aria-hidden="true">
                <ChevronRightIcon size={14} />
              </span>
              <span>{topic.title}</span>
            </summary>
            <ol className="howto-steps">
              {topic.steps.map((step) => (
                <li key={step}>{rich(step)}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </Sheet>
  )
}
