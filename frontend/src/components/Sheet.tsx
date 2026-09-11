import { useEffect, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { useBackClose } from '../lib/useBackClose'
import { XIcon } from './icons'

interface Props {
  title: string
  /** Aria id for the title; also the labelledby target. */
  id: string
  onClose: () => void
  children: ReactNode
  /** Centered card instead of a bottom sheet — for short confirmations. */
  variant?: 'sheet' | 'dialog'
  /** Sheets are forms most of the time; pass to render a <form> and get submit. */
  as?: 'div' | 'form'
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
  footer?: ReactNode
  className?: string
}

/**
 * Bottom sheet on a phone, centered panel on a desktop. Escape closes, so does
 * a tap on the backdrop; the body scrolls inside itself so a keyboard never
 * pushes the buttons off-screen.
 */
export function Sheet({ title, id, onClose, children, variant = 'sheet', as = 'div', onSubmit, footer, className }: Props) {
  const t = useT()
  // The phone's back button closes the sheet instead of leaving the page.
  useBackClose(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Body scroll is locked while a sheet is up, or the page behind scrolls on
  // a phone when the finger overshoots the sheet.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const inner = (
    <>
      <div className="panel-grab" aria-hidden="true" />
      <header className="panel-head">
        <h2 id={id}>{title}</h2>
        <button type="button" className="icon-btn" aria-label={t.common.close} onClick={onClose}>
          <XIcon />
        </button>
      </header>
      <div className="panel-body">{children}</div>
      {footer && <footer className="panel-foot">{footer}</footer>}
    </>
  )
  const panelClass = ['panel', `panel-${variant}`, className].filter(Boolean).join(' ')
  return (
    <div
      className={`backdrop backdrop-${variant}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {as === 'form' ? (
        <form className={panelClass} role="dialog" aria-modal="true" aria-labelledby={id} onSubmit={onSubmit}>
          {inner}
        </form>
      ) : (
        <div className={panelClass} role="dialog" aria-modal="true" aria-labelledby={id}>
          {inner}
        </div>
      )}
    </div>
  )
}
