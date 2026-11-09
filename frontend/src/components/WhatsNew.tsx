import { useState, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import type { WhatsNewEntry } from '../lib/whatsNew'
import { Sheet } from './Sheet'
import { StackedLabel } from './StackedLabel'
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
 * Nothing moves from page to page: the art has one box, every page's words are
 * laid out in the same grid cell (the hidden ones keep their space, so the
 * sheet is as tall as its longest page), Back keeps its slot on the first page
 * and Next is as wide as its longest label (`StackedLabel`).
 * Opens by itself when something new has landed since this account last
 * looked, and from *What's new* in the drawer's Help group.
 */
export function WhatsNew({ entries, onClose }: Props) {
  const t = useT()
  const [page, setPage] = useState(0)
  const entry = entries[Math.min(page, entries.length - 1)]
  if (!entry) return null
  const lastPage = page >= entries.length - 1
  return (
    <Sheet
      id="whats-new-title"
      title={t.whatsNew.title}
      className="whats-new"
      onClose={onClose}
      footer={
        <div className="wn-foot">
          <button
            type="button"
            className={page > 0 ? 'btn btn-soft' : 'btn btn-soft is-ghost'}
            disabled={page === 0}
            aria-hidden={page === 0 || undefined}
            tabIndex={page === 0 ? -1 : undefined}
            onClick={() => setPage(page - 1)}
          >
            {t.whatsNew.back}
          </button>
          <span className="wn-step">{entries.length > 1 ? t.whatsNew.step(page + 1, entries.length) : null}</span>
          <button type="button" className="btn btn-primary" onClick={lastPage ? onClose : () => setPage(page + 1)}>
            <StackedLabel first={t.whatsNew.next} second={t.whatsNew.done} showSecond={lastPage} />
          </button>
        </div>
      }
    >
      <div className="wn-page">
        {/* Keyed, so each page's animation starts from the top. */}
        <WhatsNewArt key={entry.id} demo={entry.id} />
        <div className="one-cell">
          {entries.map((item) => {
            const current = item.id === entry.id
            const w = t.whatsNew.entries[item.id]
            return (
              <article key={item.id} className={current ? undefined : 'is-ghost'} aria-hidden={current ? undefined : true}>
                <h3 className="wn-title">{w.title}</h3>
                <p className="wn-body">{rich(w.body)}</p>
              </article>
            )
          })}
        </div>
      </div>
    </Sheet>
  )
}
