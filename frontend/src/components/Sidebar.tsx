import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { useClosing } from '../lib/motion'
import { useBackClose } from '../lib/useBackClose'
import { Avatar } from './Avatar'
import { AccountIcon, AdminLogIcon, BellDotIcon, GarageIcon, PeopleIcon, PlugIcon, RouteIcon, TableIcon, XIcon } from './icons'
import { Logo } from './Logo'
import { LanguageSwitch } from './LanguageSwitch'
import { ThemeSwitch } from './ThemeSwitch'

interface Props {
  userName: string
  /** The account's username, shown under the name in the identity block. */
  handle: string
  /** An admin also sees the company-car pool and the people (backend: app/admin.py). */
  isAdmin: boolean
  onAccount: () => void
  onCompanyCars: () => void
  onPeople: () => void
  onRideLog: () => void
  onAdminLog: () => void
  onGuide: () => void
  onMyRides: () => void
  onNotifications: () => void
  onClose: () => void
}

interface Item {
  label: string
  hint?: string
  icon: ReactNode
  /** The tint of the icon's tile, one per item so the menu reads by colour too. */
  tone: 'blue' | 'violet' | 'amber' | 'green' | 'teal' | 'rose' | 'slate'
  onSelect: () => void
  disabled?: boolean
}

/**
 * The app menu: a drawer that slides in from the left edge under the ☰ in the
 * top bar. It holds the things that are not about one particular ride: your
 * account, your rides and figures, notifications, the company-car guide, and
 * for an admin the pool, the people and the table of every ride; at the bottom the appearance and the
 * language. Adding a ride is not here; that is the floating plus. Picking an item closes the drawer first, so the sheet
 * it opens is the only thing left on screen.
 */
export function Sidebar({ userName, handle, isAdmin, onAccount, onCompanyCars, onPeople, onRideLog, onAdminLog, onGuide, onMyRides, onNotifications, onClose }: Props) {
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
      label: t.sidebar.account,
      hint: t.sidebar.accountHint,
      icon: <AccountIcon size={20} />,
      tone: 'blue',
      onSelect: pick(onAccount),
    },
    {
      label: t.myRides.title,
      hint: t.myRides.hint,
      icon: <RouteIcon size={20} />,
      tone: 'violet',
      onSelect: pick(onMyRides),
    },
    {
      label: t.notif.title,
      hint: t.notif.hint,
      icon: <BellDotIcon size={20} />,
      tone: 'amber',
      onSelect: pick(onNotifications),
    },
    {
      label: t.sidebar.guide,
      hint: t.sidebar.guideHint,
      icon: <PlugIcon size={20} />,
      tone: 'teal',
      onSelect: pick(onGuide),
    },
    ...(isAdmin
      ? ([
          {
            label: t.sidebar.cars,
            hint: t.sidebar.carsHint,
            icon: <GarageIcon size={20} />,
            tone: 'green',
            onSelect: pick(onCompanyCars),
          },
          {
            label: t.sidebar.people,
            hint: t.sidebar.peopleHint,
            icon: <PeopleIcon size={20} />,
            tone: 'rose',
            onSelect: pick(onPeople),
          },
          {
            label: t.rideLog.title,
            hint: t.rideLog.hint,
            icon: <TableIcon size={20} />,
            tone: 'slate',
            onSelect: pick(onRideLog),
          },
          {
            label: t.adminLog.title,
            hint: t.adminLog.hint,
            icon: <AdminLogIcon size={20} />,
            tone: 'violet',
            onSelect: pick(onAdminLog),
          },
        ] satisfies Item[])
      : []),
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
            <Logo /> Karpul
          </h2>
          <button type="button" className="icon-btn" aria-label={t.sidebar.closeMenu} onClick={requestClose}>
            <XIcon />
          </button>
        </header>

        <button type="button" className="drawer-me" onClick={pick(onAccount)}>
          <Avatar name={userName || '?'} size="lg" />
          <span className="drawer-me-text">
            <span className="drawer-me-name">{userName}</span>
            <span className="drawer-me-hint">{t.sidebar.signedInAs(`@${handle}`)}</span>
          </span>
        </button>

        <nav className="drawer-nav" aria-label={t.common.menu}>
          {items.map((it) => (
            <button key={it.label} type="button" className="drawer-item" disabled={it.disabled} onClick={it.onSelect}>
              <span className={`drawer-item-icon drawer-tone-${it.tone}`}>{it.icon}</span>
              <span className="drawer-item-text">
                <span className="drawer-item-label">{it.label}</span>
                {it.hint && <span className="drawer-item-hint">{it.hint}</span>}
              </span>
            </button>
          ))}
        </nav>

        <div className="drawer-foot">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>
      </div>
    </div>
  )
}
