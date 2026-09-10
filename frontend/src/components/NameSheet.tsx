import { useState, type FormEvent } from 'react'
import { Sheet } from './Sheet'

interface Props {
  name: string
  onChange: (name: string) => void
  onClose: () => void
}

/** First-run and "change name": the one thing this app ever asks of a person. */
export function NameSheet({ name, onChange, onClose }: Props) {
  const [draft, setDraft] = useState(name)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!draft.trim()) return
    onChange(draft)
    onClose()
  }

  return (
    <Sheet
      id="name-title"
      title={name ? 'Change your name' : "What's your name?"}
      as="form"
      onSubmit={submit}
      onClose={onClose}
      footer={
        <button type="submit" className="btn btn-primary btn-block" disabled={!draft.trim()}>
          {name ? 'Save' : 'Continue'}
        </button>
      }
    >
      <label className="field">
        <span className="field-label">Your name</span>
        <input
          autoFocus
          autoComplete="name"
          placeholder="e.g. Ana Petrović"
          maxLength={80}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <p className="hint">
        This is how you appear to your colleagues in a car. No account, no password — the name is only
        remembered in this browser.
      </p>
    </Sheet>
  )
}
