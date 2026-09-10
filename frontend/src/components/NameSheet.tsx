import { useState, type FormEvent } from 'react'
import { useT } from '../lib/i18n'
import { LanguageSwitch } from './LanguageSwitch'
import { Sheet } from './Sheet'

interface Props {
  name: string
  onChange: (name: string) => void
  onClose: () => void
}

/** First-run and "change name": the one thing this app ever asks of a person. */
export function NameSheet({ name, onChange, onClose }: Props) {
  const t = useT()
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
      title={name ? t.name.changeTitle : t.name.askTitle}
      as="form"
      onSubmit={submit}
      onClose={onClose}
      footer={
        <button type="submit" className="btn btn-primary btn-block" disabled={!draft.trim()}>
          {name ? t.common.save : t.common.continue}
        </button>
      }
    >
      <label className="field">
        <span className="field-label">{t.name.yourName}</span>
        <input
          autoFocus
          autoComplete="name"
          placeholder={t.name.placeholder}
          maxLength={80}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <p className="hint">{t.name.hint}</p>
      {/* A newcomer meets this sheet before the menu, so the language lives here too. */}
      {!name && <LanguageSwitch compact />}
    </Sheet>
  )
}
