import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { useClosing } from '../lib/motion'
import { useBackClose } from '../lib/useBackClose'
import { Avatar } from './Avatar'
import { AdminLogIcon, ApprovalIcon, BellDotIcon, ChevronDownIcon, ChevronRightIcon, GarageIcon, PeopleIcon, PlugIcon, RouteIcon, TableIcon, XIcon } from './icons'
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
  onCompanyCars: () => void
  onPeople: () => void
  onRideLog: () => void
  onAdminLog: () => void
  onApprovals: () => void
  /** Admins: how many shared-car rides wait for approval (a count on the item). */
  approvals: number
  onGuide: () => void
  onMyRides: () => void
  onNotifications: () => void
}

interface Props extends Content {
  onClose: () => void
}

interface Item {
  label: string
  icon: ReactNode
  /** The tint of the icon's tile, one per item so the menu reads by colour too. */
  tone: 'blue' | 'violet' | 'amber' | 'orange' | 'green' | 'teal' | 'rose' | 'slate'
  onSelect: () => void
  /** Something waiting on you there: an amber count after the label. */
  count?: number
}

type GroupKey = 'me' | 'admin' | 'settings'

/** Which groups are folded, remembered per browser; settings start folded. */
const GROUPS_KEY = 'karpul.drawerGroups'
const DEFAULT_OPEN: Record<GroupKey, boolean> = { me: true, admin: true, settings: false }

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
 * What the menu holds, drawer or dock alike: who you are, then the items in
 * collapsible groups, the settings at the foot. `pick` wraps each item's
 * action (the drawer closes itself first; the dock has nothing to close).
 */
function SidebarBody({ userName, handle, isAdmin, onAccount, onCompanyCars, onPeople, onRideLog, onAdminLog, onApprovals, approvals, onGuide, onMyRides, onNotifications, pick }: Content & { pick: (fn: () => void) => () => void }) {
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

  const mine: Item[] = [
    {
      label: t.myRides.title,
      icon: <RouteIcon size={20} />,
      tone: 'violet',
      onSelect: pick(onMyRides),
    },
    {
      label: t.notif.title,
      icon: <BellDotIcon size={20} />,
      tone: 'amber',
      onSelect: pick(onNotifications),
    },
    {
      label: t.sidebar.guide,
      icon: <PlugIcon size={20} />,
      tone: 'teal',
      onSelect: pick(onGuide),
    },
  ]
  const admin: Item[] = isAdmin
    ? [
          {
            label: t.approvals.title,
            icon: <ApprovalIcon size={20} />,
            tone: 'orange',
            onSelect: pick(onApprovals),
            count: approvals,
          },
          {
            label: t.sidebar.cars,
            icon: <GarageIcon size={20} />,
            tone: 'green',
            onSelect: pick(onCompanyCars),
          },
          {
            label: t.sidebar.people,
            icon: <PeopleIcon size={20} />,
            tone: 'rose',
            onSelect: pick(onPeople),
          },
          {
            label: t.rideLog.title,
            icon: <TableIcon size={20} />,
            tone: 'slate',
            onSelect: pick(onRideLog),
          },
          {
            label: t.adminLog.title,
            icon: <AdminLogIcon size={20} />,
            tone: 'violet',
            onSelect: pick(onAdminLog),
          },
      ]
    : []

  const renderItem = (it: Item) => (
    <button key={it.label} type="button" className="drawer-item" onClick={it.onSelect}>
      <span className={`drawer-item-icon drawer-tone-${it.tone}`}>{it.icon}</span>
      <span className="drawer-item-label">
        {it.label}
        {!!it.count && <span className="drawer-count" aria-label={t.approvals.count(it.count)}>{it.count}</span>}
      </span>
    </button>
  )

  const group = (key: GroupKey, title: string, body: ReactNode, count = 0, className = '') => (
    <section className={`drawer-group ${className}`} aria-label={title}>
      <button
        type="button"
        className="drawer-group-head"
        aria-expanded={open[key]}
        aria-controls={`drawer-group-${key}`}
        onClick={() => toggle(key)}
      >
        <span>{title}</span>
        {!open[key] && count > 0 && <span className="drawer-count" aria-label={t.approvals.count(count)}>{count}</span>}
        <ChevronDownIcon size={16} className="drawer-group-chevron" />
      </button>
      <div id={`drawer-group-${key}`} className={open[key] ? 'drawer-group-body' : 'drawer-group-body drawer-group-shut'} inert={!open[key]}>
        <div className="drawer-group-clip">{body}</div>
      </div>
    </section>
  )

  return (
    <>
          <button type="button" className="drawer-me" onClick={pick(onAccount)}>
            <Avatar name={userName || '?'} size="lg" />
            <span className="drawer-me-text">
              <span className="drawer-me-name">{userName}</span>
              <span className="drawer-me-hint">@{handle}</span>
            </span>
            <ChevronRightIcon size={18} className="drawer-me-chevron" />
          </button>

          <nav className="drawer-nav" aria-label={t.common.menu}>
            {group('me', t.sidebar.mine, mine.map(renderItem))}
            {admin.length > 0 && group('admin', t.sidebar.admin, admin.map(renderItem), approvals)}
          </nav>

          {group(
            'settings',
            t.sidebar.settings,
            <div className="drawer-settings">
              <ThemeSwitch />
              <LanguageSwitch />
            </div>,
            0,
            'drawer-foot',
          )}
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
 * top bar. It holds the things that are not about one particular ride, in
 * collapsible groups: yours (rides, notifications, the shared-car guide), the
 * admin's (approvals, the pool, the people, every ride, the log) and the
 * settings (appearance, language). Your account is the identity block on top.
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
