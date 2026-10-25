import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { messages, useT } from '../lib/i18n'
import { intlTag } from '../lib/locale'
import { useMe } from '../lib/me'
import type { Ride, RideMessage } from '../lib/types'
import { Avatar } from './Avatar'
import { ChevronDownIcon, MessageIcon, SendIcon, XIcon } from './icons'

/** Server-side cap (backend: schemas.MAX_MESSAGE). */
const MAX_MESSAGE = 500

/** "08:12", or "Tue 08:12" when it was not today. */
function when(iso: string): string {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString(intlTag(), { hour: 'numeric', minute: '2-digit' })
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return time
  return `${d.toLocaleDateString(intlTag(), { weekday: 'short' })} ${time}`
}

interface Props {
  ride: Ride
  /** The driver may take any message back; everyone else only their own. */
  isDriver: boolean
  /** A failure, for the board's toast. */
  onError: (text: string) => void
}

/**
 * A ride's thread: "running five minutes late", "can you stop at Liman?".
 * Folded by default, as one line under the passengers saying how many
 * messages there are; unfolded it loads them and keeps them current: a new
 * message reaches every tab as the ride's `message_count`, which is the
 * signal to fetch again, so the socket never has to carry the texts.
 */
export function RideThread({ ride, isDriver, onError }: Props) {
  const t = useT()
  const me = useMe()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<RideMessage[] | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const list = useRef<HTMLOListElement>(null)

  const fail = useCallback(
    (e: unknown) => onError(e instanceof Error ? messages().apiError(e.message) : messages().common.somethingWrong),
    [onError],
  )

  useEffect(() => {
    if (!open) return
    let live = true
    api
      .messages(ride.id)
      .then((ms) => live && setItems(ms))
      .catch((e) => live && fail(e))
    return () => {
      live = false
    }
    // The count is the "something changed" signal; the list is fetched whole.
  }, [open, ride.id, ride.message_count, fail])

  // The newest message is at the bottom; keep it in view as they come in.
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const posted = await api.postMessage(ride.id, body)
      setItems((ms) => (ms ? [...ms.filter((m) => m.id !== posted.id), posted] : [posted]))
      setDraft('')
    } catch (err) {
      fail(err)
    } finally {
      setSending(false)
    }
  }

  async function remove(m: RideMessage) {
    try {
      await api.deleteMessage(ride.id, m.id)
      setItems((ms) => ms?.filter((x) => x.id !== m.id) ?? null)
    } catch (err) {
      fail(err)
    }
  }

  return (
    <section className={open ? 'thread thread-open' : 'thread'} aria-label={t.thread.title}>
      <button type="button" className="thread-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MessageIcon size={18} />
        <span>{open ? t.thread.hide : t.thread.show(ride.message_count)}</span>
        <ChevronDownIcon size={16} className="thread-chevron" />
      </button>

      {open && (
        // Unfolds as a grid row from 0fr, the way an Upcoming row opens its ride.
        <div className="thread-fold">
        <div className="thread-body">
          {items === null ? (
            <p className="hint">{t.common.loading}</p>
          ) : items.length === 0 ? (
            <p className="hint">{t.thread.empty}</p>
          ) : (
            <ol ref={list} className="thread-list">
              {items.map((m) => {
                const mine = m.author_id === me.id
                return (
                  <li key={m.id} className={mine ? 'thread-msg thread-msg-me' : 'thread-msg'}>
                    <Avatar name={m.author_name} size="sm" />
                    <div className="thread-msg-main">
                      <div className="thread-msg-head">
                        <strong>{mine ? t.detail.you : m.author_name}</strong>
                        <time dateTime={m.created_at}>{when(m.created_at)}</time>
                      </div>
                      <p className="thread-msg-body">{m.body}</p>
                    </div>
                    {(mine || isDriver) && (
                      <button
                        type="button"
                        className="icon-btn icon-btn-sm thread-msg-remove"
                        aria-label={t.thread.remove}
                        title={t.thread.remove}
                        onClick={() => void remove(m)}
                      >
                        <XIcon size={14} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          )}

          <form className="thread-form" onSubmit={send}>
            <textarea
              rows={1}
              aria-label={t.thread.placeholder}
              placeholder={t.thread.placeholder}
              maxLength={MAX_MESSAGE}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter is a new line, as in every chat.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <button type="submit" className="btn btn-primary thread-send" disabled={sending || !draft.trim()} aria-label={t.thread.send}>
              <SendIcon size={18} />
            </button>
          </form>
        </div>
        </div>
      )}
    </section>
  )
}
