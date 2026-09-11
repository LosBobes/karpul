import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { useClosing } from '../lib/motion'
import { useBackClose } from '../lib/useBackClose'
import { Avatar } from './Avatar'
import { CarIcon, CarProfileIcon, InfoIcon, UserIcon, XIcon } from './icons'
import { LanguageSwitch } from './LanguageSwitch'

interface Props {
  userName: string
  onEditName: () => void
  onCompanyCars: () => void
  onGuide: () => void
  onClose: () => void
}

interface Item {
  label: string
  hint?: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
}

/**
 * The app menu: a drawer that slides in from the left edge under the ☰ in the
 * top bar. It holds the things that are not about one particular ride: who
 * you are, the company-car pool and its guide, and at the bottom the
 * language. Adding a ride is not here; that is the floating plus. Picking an item closes the drawer first, so the sheet
 * it opens is the only thing left on screen.
 */
export function Sidebar({ userName, onEditName, onCompanyCars, onGuide, onClose }: Props) {
  const t = useT()
  const panel = useRef<HTMLDivElement>(null)
  // The drawer slides back out before it unmounts, whichever way it is closed.
  const { closing, requestClose, onAnimationEnd } = useClosing(onClose)
  // The phone's back button closes the drawer instead of leaving the page.
  useBackClose(requestClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  // Same lock as a sheet: the page behind must not scroll under the drawer.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Keyboard users land inside the drawer; the ☰ gets focus back when it unmounts
  // because the browser restores it to the last focused element still in the DOM.
  useEffect(() => {
    panel.current?.focus()
  }, [])

  // Picking an item closes on the spot: the sheet it opens must own the
  // history entry and the body-scroll lock alone, so the drawer does not
  // linger under it playing its exit.
  const pick = (fn: () => void) => () => {
    onClose()
    fn()
  }

  const items: Item[] = [
    {
      label: userName ? t.sidebar.changeName : t.sidebar.enterName,
      hint: userName ? t.sidebar.nameHint : t.sidebar.nameNeeded,
      icon: <UserIcon size={20} />,
      onSelect: pick(onEditName),
    },
    {
      label: t.sidebar.cars,
      hint: t.sidebar.carsHint,
      icon: <CarProfileIcon size={22} />,
      onSelect: pick(onCompanyCars),
    },
    {
      label: t.sidebar.guide,
      hint: t.sidebar.guideHint,
      icon: <InfoIcon size={20} />,
      onSelect: pick(onGuide),
    },
  ]

  return (
    <div
      className={closing ? 'backdrop backdrop-drawer backdrop-closing' : 'backdrop backdrop-drawer'}
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div
        ref={panel}
        id="app-sidebar"
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sidebar-title"
        tabIndex={-1}
        onAnimationEnd={onAnimationEnd}
      >
        <header className="drawer-head">
          <h2 id="sidebar-title" className="topbar-title">
            <CarIcon size={20} /> Karpul
          </h2>
          <button type="button" className="icon-btn" aria-label={t.sidebar.closeMenu} onClick={requestClose}>
            <XIcon />
          </button>
        </header>

        <button type="button" className="drawer-me" onClick={pick(onEditName)}>
          <Avatar name={userName || '?'} size="lg" />
          <span className="drawer-me-text">
            <span className="drawer-me-name">{userName || t.sidebar.noName}</span>
            <span className="drawer-me-hint">{userName ? t.sidebar.youHere : t.sidebar.tapIntro}</span>
          </span>
        </button>

        <nav className="drawer-nav" aria-label={t.common.menu}>
          {items.map((it) => (
            <button key={it.label} type="button" className="drawer-item" disabled={it.disabled} onClick={it.onSelect}>
              <span className="drawer-item-icon">{it.icon}</span>
              <span className="drawer-item-text">
                <span className="drawer-item-label">{it.label}</span>
                {it.hint && <span className="drawer-item-hint">{it.hint}</span>}
              </span>
            </button>
          ))}
        </nav>

        <div className="drawer-foot">
          <LanguageSwitch />
        </div>
      </div>
    </div>
  )
}
