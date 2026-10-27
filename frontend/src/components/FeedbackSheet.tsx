import { useState, type FormEvent } from 'react'
import { useT } from '../lib/i18n'
import { feedbackMail, type FeedbackKind } from '../lib/support'
import { SegThumb } from './Segmented'
import { SendIcon } from './icons'
import { Sheet } from './Sheet'

const KINDS: FeedbackKind[] = ['bug', 'idea']

interface Props {
  /** Who is writing and where they are in the app, added under the text. */
  user: string
  view: string
  onClose: () => void
}

/**
 * A bug or an idea, written here and sent as a mail from the person's own
 * mail app (`feedbackMail` in lib/support.ts), so it needs nothing on the
 * server and the reply comes back to them. The mail carries the account,
 * the view, the browser and the screen size under the text.
 */
export function FeedbackSheet({ user, view, onClose }: Props) {
  const t = useT()
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [text, setText] = useState('')

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!text.trim()) return
    window.location.href = feedbackMail(kind, text, { user, view })
    onClose()
  }

  return (
    <Sheet
      id="feedback-title"
      title={t.feedback.title}
      onClose={onClose}
      as="form"
      onSubmit={submit}
      footer={
        <button type="submit" className="btn btn-primary btn-block" disabled={!text.trim()}>
          <SendIcon size={18} /> {t.feedback.send}
        </button>
      }
    >
      <div className="segmented" role="radiogroup" aria-label={t.feedback.kind}>
        <SegThumb count={KINDS.length} index={KINDS.indexOf(kind)} />
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={k === kind}
            className={k === kind ? 'seg seg-on' : 'seg'}
            onClick={() => setKind(k)}
          >
            {t.feedback[k]}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">{kind === 'bug' ? t.feedback.bugLabel : t.feedback.ideaLabel}</span>
        <textarea
          rows={6}
          maxLength={2000}
          placeholder={kind === 'bug' ? t.feedback.bugPlaceholder : t.feedback.ideaPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p className="muted feedback-hint">{t.feedback.hint}</p>
    </Sheet>
  )
}
