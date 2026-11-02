import { useState, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import type { WhatsNewEntry } from '../lib/whatsNew'
import { Sheet } from './Sheet'
import { WhatsNewArt } from './WhatsNewArt'

/** `**words**` in bold, as in the how-to. */
function rich(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))
}

interface Props {
  /** Newest first (lib/whatsNew.ts). */
  entries: readonly WhatsNewEntry[]
  /** Closed by any route: what was shown counts as seen. */
  onClose: () => void
}

/**
 * What's new: one page per entry, each with its moving picture
 * (`WhatsNewArt`), its title and a few lines, stepped with Next and Back.
 * Opens by itself when something new has landed since this account last
 * looked, and from *What's new* in the drawer's Help group.
 */
export function WhatsNew({ entries, onClose }: Props) {
  const t = useT()
  const [page, setPage] = useState(0)
  const entry = entries[Math.min(page, entries.length - 1)]
  if (!entry) return null
  const words = t.whatsNew.entries[entry.id]
  const lastPage = page >= entries.length - 1
  return (
    <Sheet
      id="whats-new-title"
      title={t.whatsNew.title}
      className="whats-new"
      onClose={onClose}
      footer={
        <div className="wn-foot">
          {page > 0 && (
            <button type="button" className="btn btn-soft" onClick={() => setPage(page - 1)}>
              {t.whatsNew.back}
            </button>
          )}
          {entries.length > 1 && <span className="wn-step">{t.whatsNew.step(page + 1, entries.length)}</span>}
          <button type="button" className="btn btn-primary" onClick={lastPage ? onClose : () => setPage(page + 1)}>
            {lastPage ? t.whatsNew.done : t.whatsNew.next}
          </button>
        </div>
      }
    >
      {/* Keyed, so each page's animation starts from the top. */}
      <article key={entry.id} className="wn-page">
        <WhatsNewArt demo={entry.id} />
        <h3 className="wn-title">{words.title}</h3>
        <p className="wn-body">{rich(words.body)}</p>
      </article>
    </Sheet>
  )
}
