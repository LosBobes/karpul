import { useEffect, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { useClosing } from '../lib/motion'
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
 * pushes the buttons off-screen. Every close from inside the sheet plays the
 * exit animation first (`useClosing`); a parent that unmounts it outright,
 * after a save, skips it.
 */
export function Sheet({ title, id, onClose, children, variant = 'sheet', as = 'div', onSubmit, footer, className }: Props) {
  const t = useT()
  const { closing, requestClose, onAnimationEnd } = useClosing(onClose)
  // The phone's back button closes the sheet instead of leaving the page.
  useBackClose(requestClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

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
        <button type="button" className="icon-btn" aria-label={t.common.close} onClick={requestClose}>
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
      className={['backdrop', `backdrop-${variant}`, closing && 'backdrop-closing'].filter(Boolean).join(' ')}
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      {as === 'form' ? (
        <form
          className={panelClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby={id}
          onSubmit={onSubmit}
          onAnimationEnd={onAnimationEnd}
        >
          {inner}
        </form>
      ) : (
        <div className={panelClass} role="dialog" aria-modal="true" aria-labelledby={id} onAnimationEnd={onAnimationEnd}>
          {inner}
        </div>
      )}
    </div>
  )
}
