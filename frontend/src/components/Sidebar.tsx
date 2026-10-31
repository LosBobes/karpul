import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { useClosing } from '../lib/motion'
import { useBackClose } from '../lib/useBackClose'
import { Avatar } from './Avatar'
import { FluentIcon, type FluentName } from './FluentIcon'
import { ChevronRightIcon, ChevronUpIcon, XIcon } from './icons'
import { Logo } from './Logo'
import { LanguageSwitch } from './LanguageSwitch'
import { ThemeSwitch } from './ThemeSwitch'

interface Content {
  userName: string
  /** The account's username, shown under the name in the identity block. */
  handle: string
  /** An admin also sees the company-car pool and the people (backend: app/admin.py). */
  isAdmin: boolean
  onAccount: () => void
  onPeople: () => void
  /** The places Karpul knows: the offices, the cars' homes, the suggestions. */
  onPlaces: () => void
  onRideLog: () => void
  onAdminLog: () => void
  onApprovals: () => void
  /** Admins: how many shared-car rides wait for approval (a count on the item). */
  approvals: number
  onGuide: () => void
  /** How to use the app (components/HowTo.tsx). */
  onHowTo: () => void
  onSupport: () => void
  onFeedback: () => void
  onMyRides: () => void
  onNotifications: () => void
  /** Present while this browser can install the app (lib/install.ts). */
  onInstall?: () => void
  /** The shared cars (components/SharedCars.tsx): how they stand, for everyone; the pool and its usage for admins. */
  onSharedCars: () => void
}

interface Props extends Content {
  onClose: () => void
}

interface Item {
  label: string
  /** The item's Fluent mark, in the regular (outline) style. */
  icon: FluentName
  onSelect: () => void
  /** Something waiting on you there: an amber count after the label. */
  count?: number
}

type GroupKey = 'admin' | 'help' | 'settings'

/** Which groups are folded, remembered per browser; settings start folded. */
const GROUPS_KEY = 'karpul.drawerGroups'
const DEFAULT_OPEN: Record<GroupKey, boolean> = { admin: true, help: true, settings: false }

function loadOpen(): Record<GroupKey, boolean> {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    if (raw) return { ...DEFAULT_OPEN, ...(JSON.parse(raw) as Partial<Record<GroupKey, boolean>>) }
  } catch {
    // Private mode or a broken value: the defaults will do.
  }
  return DEFAULT_OPEN
}

/**
 * What the menu holds, drawer or dock alike: who you are, the two things
 * opened most (your rides, the shared car guide) with no heading over them,
 * then *Manage* for admins, *Help*, and *Settings* folded at the foot. `pick` wraps each item's
 * action (the drawer closes itself first; the dock has nothing to close).
 */
function SidebarBody({ userName, handle, isAdmin, onAccount, onPeople, onPlaces, onRideLog, onAdminLog, onApprovals, approvals, onGuide, onHowTo, onSupport, onFeedback, onMyRides, onNotifications, onInstall, onSharedCars, pick }: Content & { pick: (fn: () => void) => () => void }) {
  const t = useT()
  const [open, setOpen] = useState(loadOpen)
  const toggle = (key: GroupKey) =>
    setOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next))
      } catch {
        // Not remembered, still toggled.
      }
      return next
    })

  // Every day: what you would open most, straight under your name.
  const daily: Item[] = [
    {
      label: t.myRides.title,
      icon: 'route',
      onSelect: pick(onMyRides),
    },
    {
      label: t.sidebar.cars,
      icon: 'car',
      onSelect: pick(onSharedCars),
    },
    {
      label: t.sidebar.guide,
      icon: 'plug',
      onSelect: pick(onGuide),
    },
  ]
  // When something goes wrong, or there is something to say.
  const help: Item[] = [
    {
      label: t.howTo.menu,
      icon: 'book',
      onSelect: pick(onHowTo),
    },
    {
      label: t.support.title,
      icon: 'lifebuoy',
      onSelect: pick(onSupport),
    },
    {
      label: t.feedback.title,
      icon: 'bug',
      onSelect: pick(onFeedback),
    },
  ]
  // How the app behaves on this device and for this account.
  const settings: Item[] = [
    {
      label: t.notif.title,
      icon: 'bell',
      onSelect: pick(onNotifications),
    },
    ...(onInstall ? [{ label: t.install.menu, icon: 'install' as const, onSelect: pick(onInstall) }] : []),
  ]
  const admin: Item[] = isAdmin
    ? [
          {
            label: t.approvals.title,
            icon: 'approvals',
            onSelect: pick(onApprovals),
            count: approvals,
          },
          {
            label: t.sidebar.people,
            icon: 'people',
            onSelect: pick(onPeople),
          },
          {
            label: t.sidebar.places,
            icon: 'map',
            onSelect: pick(onPlaces),
          },
          {
            label: t.rideLog.title,
            icon: 'table',
            onSelect: pick(onRideLog),
          },
          {
            label: t.adminLog.title,
            icon: 'log',
            onSelect: pick(onAdminLog),
          },
      ]
    : []

  const renderItem = (it: Item) => (
    <button key={it.label} type="button" className="drawer-item" onClick={it.onSelect}>
      <span className="drawer-item-icon">
        <FluentIcon name={it.icon} size={20} />
      </span>
      <span className="drawer-item-label">
        {it.label}
        {!!it.count && <span className="drawer-count" aria-label={t.approvals.count(it.count)}>{it.count}</span>}
      </span>
    </button>
  )

  const group = (key: GroupKey, title: string, body: ReactNode, count = 0) => (
    <section className="drawer-group" aria-label={title}>
      <button
        type="button"
        className="drawer-group-head"
        aria-expanded={open[key]}
        aria-controls={`drawer-group-${key}`}
        onClick={() => toggle(key)}
      >
        <span className="drawer-group-chevron" aria-hidden="true">
          <ChevronRightIcon size={14} weight="bold" />
        </span>
        <span className="drawer-group-title">{title}</span>
        {!open[key] && count > 0 && <span className="drawer-count" aria-label={t.approvals.count(count)}>{count}</span>}
      </button>
      <div id={`drawer-group-${key}`} className={open[key] ? 'drawer-group-body' : 'drawer-group-body drawer-group-shut'} inert={!open[key]}>
        <div className="drawer-group-clip">{body}</div>
      </div>
    </section>
  )

  // Settings are their own card pinned to the foot, folding *upwards* out of
  // its head: the menu above gives up the room (it scrolls), so nothing ever
  // opens past the bottom edge.
  const settingsOpen = open.settings
  const settingsCard = (
    <section className={settingsOpen ? 'settings-card settings-card-open' : 'settings-card'} aria-label={t.sidebar.settings}>
      <div id="drawer-group-settings" className="settings-card-body" inert={!settingsOpen}>
        <div className="settings-card-clip">
          <div className="settings-card-items">{settings.map(renderItem)}</div>
          <div className="drawer-settings">
            <ThemeSwitch />
            <LanguageSwitch />
          </div>
        </div>
      </div>
      <button
        type="button"
        className="settings-card-head"
        aria-expanded={settingsOpen}
        aria-controls="drawer-group-settings"
        onClick={() => toggle('settings')}
      >
        <span className="drawer-item-icon">
          <FluentIcon name="settings" size={20} />
        </span>
        <span className="drawer-group-title">{t.sidebar.settings}</span>
        <span className="settings-card-chevron" aria-hidden="true">
          <ChevronUpIcon size={16} weight="bold" />
        </span>
      </button>
    </section>
  )

  return (
    <>
        <div className="drawer-scroll">
          <button type="button" className="drawer-me" onClick={pick(onAccount)}>
            <Avatar name={userName || '?'} size="lg" />
            <span className="drawer-me-text">
              <span className="drawer-me-name">{userName}</span>
              <span className="drawer-me-hint">@{handle}</span>
            </span>
            <ChevronRightIcon size={18} className="drawer-me-chevron" />
          </button>

          <nav className="drawer-nav" aria-label={t.common.menu}>
            <div className="drawer-daily">{daily.map(renderItem)}</div>
            {admin.length > 0 && group('admin', t.sidebar.admin, admin.map(renderItem), approvals)}
            {group('help', t.sidebar.help, help.map(renderItem))}
          </nav>
        </div>

        <div className="drawer-foot">{settingsCard}</div>
    </>
  )
}

/**
 * The same menu on a wide screen: always there down the left edge, the way a
 * desktop app keeps its sidebar, instead of a drawer behind the ☰. Nothing
 * to close, no backdrop, no history entry; an item opens its sheet directly.
 */
export function Dock(props: Content) {
  const pick = (fn: () => void) => fn
  return (
    <aside id="app-sidebar" className="drawer dock" aria-label="Karpul">
      <header className="drawer-head dock-head">
        <span className="topbar-title">
          <Logo /> Karpul
        </span>
      </header>
      <SidebarBody {...props} pick={pick} />
    </aside>
  )
}

/**
 * The app menu: a drawer that slides in from the left edge under the ☰ in the
 * top bar. It holds the things that are not about one particular ride: your
 * rides and the shared car guide on their own, then collapsible groups for
 * the admins' work (approvals, the pool, the people, every ride, the log),
 * help (who to call, a bug or an idea) and the settings (notifications,
 * installing the app, appearance, language). Your account is the identity
 * block on top.
 * Adding a ride is not here; that is the plus. Picking an item closes
 * the drawer first, so the sheet it opens is the only thing left on screen.
 */
export function Sidebar({ onClose, ...props }: Props) {
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

        <SidebarBody {...props} pick={pick} />
      </div>
    </div>
  )
}
