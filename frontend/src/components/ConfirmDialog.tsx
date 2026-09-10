import { useEffect, type ReactNode } from 'react'
import { TrashIcon } from './icons'

interface Props {
  title: string
  body: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** The "Remove this ride?" card: a red trash badge, one line of consequence, two stacked buttons. */
export function ConfirmDialog({ title, body, confirmLabel, busy, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="backdrop backdrop-dialog backdrop-top" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
        <span className="confirm-badge" aria-hidden="true">
          <TrashIcon size={26} />
        </span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <button type="button" className="btn btn-danger btn-block" autoFocus disabled={busy} onClick={onConfirm}>
          {busy ? 'Removing…' : confirmLabel}
        </button>
        <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
