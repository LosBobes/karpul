import { useState, type FormEvent } from 'react'

interface Props {
  name: string
  onChange: (name: string) => void
}

export function NameBar({ name, onChange }: Props) {
  const [editing, setEditing] = useState(!name)
  const [draft, setDraft] = useState(name)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    onChange(draft)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="namebar">
        <span>
          You are <strong>{name}</strong>
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setDraft(name)
            setEditing(true)
          }}
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <form className="namebar namebar-edit" onSubmit={submit}>
      <label htmlFor="user-name">Your name</label>
      <input
        id="user-name"
        autoFocus
        placeholder="e.g. Ana Petrović"
        value={draft}
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.trim()}>
        Save
      </button>
      {name && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      )}
      <p className="hint">No account needed. Your name is only remembered in this browser.</p>
    </form>
  )
}
