import type { ReactNode, SVGProps } from 'react'

/**
 * The app's icons, drawn here in Fluent 2's grammar rather than taken from a
 * pack: the 24px grid with its 3px margin, a 1.5px round stroke, rounded
 * corners on every box, long thin chevrons and arrows, a person as a head over
 * a rounded shoulder, and only as many lines as the idea needs. Every icon
 * takes `size` (px) and an optional `weight`; the names below are the
 * contract the components render against, so changing a drawing means
 * editing this file only. The drawer and the tab bar use the three-style
 * marks in FluentIcon.tsx.
 */
type IconWeight = 'light' | 'regular' | 'bold'
type IconProps = Omit<SVGProps<SVGSVGElement>, 'strokeWidth'> & {
  size?: number
  weight?: IconWeight
  /** A heavier stroke for one use (2.25 and up reads as bold). */
  strokeWidth?: number
}

const STROKE: Record<IconWeight, number> = { light: 1.25, regular: 1.5, bold: 2 }

/**
 * The stroke in grid units. A 24-unit drawing shown at 12px halves every
 * line, so small icons get a slightly heavier stroke to land near one
 * device pixel instead of going grey.
 */
function stroke(size: number, weight: IconWeight, strokeWidth?: number): number {
  const base = strokeWidth ?? STROKE[weight]
  if (size <= 13) return base * 1.3
  if (size <= 16) return base * 1.12
  return base
}

function icon(body: ReactNode, fallback: IconWeight = 'regular') {
  return ({ size = 20, weight, strokeWidth, ...rest }: IconProps) => {
    const w = weight ?? (strokeWidth !== undefined && strokeWidth >= 2.25 ? 'bold' : fallback)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke(size, w, strokeWidth !== undefined && strokeWidth < 2.25 ? strokeWidth : undefined)}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {body}
      </svg>
    )
  }
}

/** A filled dot, for the glyphs that are dots (kebab, grip, the i of info). */
const dot = (cx: number, cy: number, r = 1.25) => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />

const car = (
  <>
    <path d="M4.25 16.75h-.5a1 1 0 0 1-1-1v-2.6c0-.78.53-1.46 1.29-1.65L7.25 10.7l2.2-3.1A2.5 2.5 0 0 1 11.5 6.5h3.65a2.5 2.5 0 0 1 1.93.9l2.67 3.25.98.24c.7.18 1.2.8 1.2 1.53v3.33a1 1 0 0 1-1 1h-.25" />
    <path d="M9.25 16.75h5.5" />
    <path d="M7.25 10.75h12.5" />
    <circle cx="6.75" cy="16.75" r="2.25" />
    <circle cx="17.25" cy="16.75" r="2.25" />
  </>
)

/** The generic car, side-on: the fallback for a car the board cannot draw. */
export const CarIcon = icon(car)
/** The same car: the vehicle pool. */
export const CarProfileIcon = icon(car)

/** Fluent's Flash: the electric mark. */
export const BoltIcon = icon(<path d="M13.75 3.25 6.1 13.1a.5.5 0 0 0 .4.8h5l-1.25 6.85 7.65-9.85a.5.5 0 0 0-.4-.8h-5l1.25-6.85Z" />)
/** A leaf, the usual "hybrid" mark. */
export const LeafIcon = icon(
  <>
    <path d="M5.25 19.25C4.75 10.6 9.6 5 19.25 4.75c.5 9.2-4.4 14.5-12.75 14.5H5.25Z" />
    <path d="M5.25 19.25c2.5-4.1 5.6-7 9.25-9" />
  </>,
)
/** A fuel pump: petrol. */
export const PumpIcon = icon(
  <>
    <path d="M5.25 19.75V6.25a2.5 2.5 0 0 1 2.5-2.5h4a2.5 2.5 0 0 1 2.5 2.5v13.5" />
    <path d="M3.75 19.75h12" />
    <path d="M7.75 8.25h4" />
    <path d="M14.25 10.25h1.25c.69 0 1.25.56 1.25 1.25v4.25a1.5 1.5 0 0 0 3 0V8.5l-2-2" />
  </>,
)
/** A drop: diesel. */
export const DropIcon = icon(<path d="M12 3.5c3.15 3.65 5.75 6.85 5.75 10.25a5.75 5.75 0 0 1-11.5 0C6.25 10.35 8.85 7.15 12 3.5Z" />)

export const PlusIcon = icon(<path d="M12 4.75v14.5M4.75 12h14.5" />)
export const MinusIcon = icon(<path d="M4.75 12h14.5" />)
/** Fluent's Navigation: three equal bars, the drawer. */
export const MenuIcon = icon(<path d="M3.75 6.25h16.5M3.75 12h16.5M3.75 17.75h16.5" />)
export const KebabIcon = icon(
  <>
    {dot(12, 5.75, 1.35)}
    {dot(12, 12, 1.35)}
    {dot(12, 18.25, 1.35)}
  </>,
)
export const ChevronLeftIcon = icon(<path d="M15.25 4.75 8 12l7.25 7.25" />)
export const ChevronRightIcon = icon(<path d="M8.75 4.75 16 12l-7.25 7.25" />)
export const ChevronDownIcon = icon(<path d="M4.75 8.75 12 16l7.25-7.25" />)
export const ArrowRightIcon = icon(<path d="M4 12h16M13.5 5.5 20 12l-6.5 6.5" />)
export const ArrowLeftIcon = icon(<path d="M20 12H4M10.5 5.5 4 12l6.5 6.5" />)
/** Fluent's Location. */
export const PinIcon = icon(
  <>
    <path d="M12 21.25s-6.75-5.9-6.75-11.5a6.75 6.75 0 0 1 13.5 0c0 5.6-6.75 11.5-6.75 11.5Z" />
    <circle cx="12" cy="9.75" r="2.5" />
  </>,
)
/** Fluent's ReOrderDots. */
export const GripIcon = icon(
  <>
    {dot(9, 5.75)}
    {dot(15, 5.75)}
    {dot(9, 12)}
    {dot(15, 12)}
    {dot(9, 18.25)}
    {dot(15, 18.25)}
  </>,
)
/** Fluent's Delete: a lidded bin with two ribs. */
export const TrashIcon = icon(
  <>
    <path d="M4.25 6.25h15.5" />
    <path d="M9.75 6.25V5.5a2.25 2.25 0 0 1 4.5 0v.75" />
    <path d="m6 6.25.95 12.4a2.5 2.5 0 0 0 2.5 2.35h5.1a2.5 2.5 0 0 0 2.5-2.35L18 6.25" />
    <path d="M10.25 10.25v6.25M13.75 10.25v6.25" />
  </>,
)
/** Fluent's Edit: a pencil at a slant, its nib down to the left. */
export const PencilIcon = icon(
  <>
    <path d="M4.25 19.75 5.4 15.2 15.85 4.75a2.12 2.12 0 0 1 3 0l.4.4a2.12 2.12 0 0 1 0 3L8.8 18.6l-4.55 1.15Z" />
    <path d="m14.25 6.35 3.4 3.4" />
  </>,
)
export const CopyIcon = icon(
  <>
    <rect x="8.25" y="8.25" width="12" height="12" rx="2.75" />
    <path d="M15.75 8.25v-.75a2.75 2.75 0 0 0-2.75-2.75H6.5A2.75 2.75 0 0 0 3.75 7.5V14a2.75 2.75 0 0 0 2.75 2.75h1.75" />
  </>,
)
/** Fluent's Dismiss. */
export const XIcon = icon(<path d="M5.75 5.75l12.5 12.5M18.25 5.75l-12.5 12.5" />)
export const CheckIcon = icon(<path d="m4.75 12.75 4.5 4.5L19.25 7" />)
export const CheckCircleIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.75" />
    <path d="m8.5 12.25 2.5 2.5 4.75-5" />
  </>,
)
/** Fluent's Calendar: a rounded sheet with its header ruled off. */
export const CalendarIcon = icon(
  <>
    <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3.25" />
    <path d="M3.75 8.75h16.5" />
    {dot(8, 12.75, 1.1)}
    {dot(12, 12.75, 1.1)}
    {dot(16, 12.75, 1.1)}
    {dot(8, 16.5, 1.1)}
    {dot(12, 16.5, 1.1)}
  </>,
)
/** Fluent's TextBulletList: the list view. */
export const ListIcon = icon(
  <>
    <path d="M9.25 6.25h11M9.25 12h11M9.25 17.75h11" />
    {dot(4.75, 6.25)}
    {dot(4.75, 12)}
    {dot(4.75, 17.75)}
  </>,
)
/** Fluent's Clock: the hand runs up and then across. */
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 7v5h3.5" />
  </>,
)
/** The day plan drawn as roads: two lines across, a stretch taken on each. */
export const TimelineIcon = icon(
  <>
    <path d="M3.75 8h16.5M3.75 16h16.5" />
    <path d="M6 8h7M11 16h6.5" strokeWidth={3.25} />
  </>,
)
/** Fluent's Person: a head over a rounded shoulder. */
export const UserIcon = icon(
  <>
    <circle cx="12" cy="7.75" r="4" />
    <path d="M5.25 19.75v-.5a4 4 0 0 1 4-4h5.5a4 4 0 0 1 4 4v.5" />
  </>,
)
/** Fluent's People: one in front, one behind on the right. */
export const UsersIcon = icon(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 19.5v-.25A3.75 3.75 0 0 1 6.75 15.5h4.5A3.75 3.75 0 0 1 15 19.25v.25" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17.5 15.5h.25A3.25 3.25 0 0 1 21 18.75v.75" />
  </>,
)
/** Fluent's SignOut: a door with the arrow leaving it. */
export const LogoutIcon = icon(
  <>
    <path d="M13.25 4.25h-5.5a2.75 2.75 0 0 0-2.75 2.75v10a2.75 2.75 0 0 0 2.75 2.75h5.5" />
    <path d="M10.75 12h9.5M16.75 8.5l3.5 3.5-3.5 3.5" />
  </>,
)
/** Fluent's Key: a round head with a pip, the shaft down to the left. */
export const KeyIcon = icon(
  <>
    <circle cx="15" cy="9" r="5.25" />
    {dot(16.5, 7.5, 1.2)}
    <path d="M11.3 12.7 4.25 19.75M6.5 17.5l2 2M8.75 15.25l1.75 1.75" />
  </>,
)
export const SearchIcon = icon(
  <>
    <circle cx="10.25" cy="10.25" r="6.5" />
    <path d="m15 15 5.25 5.25" />
  </>,
)
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 10.75v5.5" />
    {dot(12, 7.75, 1.1)}
  </>,
)
/** Fluent's Share iOS: an arrow up out of a tray. */
export const ShareIcon = icon(
  <>
    <path d="M12 14.25V3.75M8 7.5l4-3.75 4 3.75" />
    <path d="M8.75 10.25h-1A2.75 2.75 0 0 0 5 13v4.5a2.75 2.75 0 0 0 2.75 2.75h8.5A2.75 2.75 0 0 0 19 17.5V13a2.75 2.75 0 0 0-2.75-2.75h-1" />
  </>,
)
/** Fluent's ArrowRepeatAll. */
export const RepeatIcon = icon(
  <>
    <path d="M16.75 4.25 19.5 7l-2.75 2.75M19.5 7H8a3.5 3.5 0 0 0-3.5 3.5v.75" />
    <path d="M7.25 19.75 4.5 17l2.75-2.75M4.5 17H16a3.5 3.5 0 0 0 3.5-3.5v-.75" />
  </>,
)
/** A steering wheel: whoever is at the wheel of a shared car (Odometer). */
export const SteeringIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.75" />
    <circle cx="12" cy="12" r="2.25" />
    <path d="M3.5 10.75h6.25M14.25 10.75h6.25M12 14.25v6.5" />
  </>,
)
/** A road running away from you: the distance of a ride. */
export const RoadIcon = icon(
  <>
    <path d="M6.25 20.25 9.75 3.75M17.75 20.25 14.25 3.75" />
    <path d="M12 6.75v1.5M12 11.25v1.5M12 15.75v2" />
  </>,
)
/** Fluent's Money: a note with its coin in the middle, the "chip in". */
export const CoinsIcon = icon(
  <>
    <rect x="2.75" y="6" width="18.5" height="12" rx="2.75" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 9.25v.01M18 14.75v.01" strokeWidth={2.25} />
  </>,
)
/** Fluent's Call: the handset. */
export const PhoneIcon = icon(
  <path d="m7.9 3.9-1.5.2a2.6 2.6 0 0 0-2.25 2.95c.95 6.8 6 11.85 12.8 12.8a2.6 2.6 0 0 0 2.95-2.25l.2-1.5a1.5 1.5 0 0 0-.98-1.62l-2.6-.95a1.5 1.5 0 0 0-1.6.35l-1.2 1.2a10.4 10.4 0 0 1-4.6-4.6l1.2-1.2a1.5 1.5 0 0 0 .35-1.6l-.95-2.6A1.5 1.5 0 0 0 7.9 3.9Z" />,
)
/** Fluent's Mail: a rounded envelope, the flap as a shallow V. */
export const MailIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="m3.75 8.25 8.25 5 8.25-5" />
  </>,
)
/** Fluent's Alert: a bell on a flat base. */
const bell = (
  <>
    <path d="M12 3.75a6 6 0 0 0-6 6v3.65l-1.4 2.85a.75.75 0 0 0 .67 1.08h13.46a.75.75 0 0 0 .67-1.08L18 13.4V9.75a6 6 0 0 0-6-6Z" />
    <path d="M9.75 19.75a2.3 2.3 0 0 0 4.5 0" />
  </>
)
export const BellIcon = icon(bell)
/** Fluent's DataBarVertical: three rounded bars. */
export const ChartIcon = icon(
  <>
    <rect x="4" y="12" width="4" height="8.25" rx="1.25" />
    <rect x="10" y="3.75" width="4" height="16.5" rx="1.25" />
    <rect x="16" y="8" width="4" height="12.25" rx="1.25" />
  </>,
)
export const FilterIcon = icon(<path d="M4.25 6.75h15.5M7.25 12h9.5M10.25 17.25h3.5" />)
export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.75v1.5M12 19.75v1.5M2.75 12h1.5M19.75 12h1.5M5.45 5.45l1.06 1.06M17.49 17.49l1.06 1.06M5.45 18.55l1.06-1.06M17.49 6.51l1.06-1.06" />
  </>,
)
export const MoonIcon = icon(<path d="M20 14.5A8.25 8.25 0 0 1 9.5 4a8.25 8.25 0 1 0 10.5 10.5Z" />)

/* The drawer's own marks, kept for the places outside the drawer that show
   them (the guide, the support sheet, the notification centre). The drawer
   itself draws the colour versions from FluentIcon.tsx. */

/** A winding road between where you start and where you end: your rides. */
export const RouteIcon = icon(
  <>
    <circle cx="5.75" cy="6" r="2.25" />
    <circle cx="18.25" cy="18" r="2.25" />
    <path d="M8 6h6.25a3.25 3.25 0 0 1 0 6.5h-4.5a2.75 2.75 0 0 0 0 5.5H16" />
  </>,
)
/** A bell with something waiting on it: notifications. */
export const BellDotIcon = icon(
  <>
    {bell}
    <circle cx="18.5" cy="5.25" r="2.25" />
  </>,
)
/** Fluent's VehicleCar, front on: the company pool. */
export const GarageIcon = icon(
  <>
    <path d="M4.25 14.5 6.3 9.15a2.5 2.5 0 0 1 2.33-1.6h6.74a2.5 2.5 0 0 1 2.33 1.6l2.05 5.35v3.25a1.25 1.25 0 0 1-1.25 1.25H5.5a1.25 1.25 0 0 1-1.25-1.25Z" />
    <path d="M6.5 14.25h11M7.5 16.75h1M15.5 16.75h1" />
    <path d="M6.5 19v1.5M17.5 19v1.5" />
  </>,
)
/** Fluent's Table: rows and columns, the admin's table of every ride. */
export const TableIcon = icon(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.75" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
  </>,
)
/** A charging plug: the company car guide. */
export const PlugIcon = icon(
  <>
    <path d="M6.5 8.25h11v2.25a5.5 5.5 0 0 1-11 0Z" />
    <path d="M9.25 3.75v4.5M14.75 3.75v4.5M12 16v4.25" />
  </>,
)
/** A life ring: who to ask when something does not work. */
export const LifebuoyIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.75" />
    <circle cx="12" cy="12" r="3.25" />
    <path d="m5.8 5.8 3.9 3.9M18.2 5.8l-3.9 3.9M5.8 18.2l3.9-3.9M18.2 18.2l-3.9-3.9" />
  </>,
)
/** Fluent's Bug: reporting a bug, or any thought about the app. */
export const BugIcon = icon(
  <>
    <path d="M9 8a3 3 0 0 1 6 0" />
    <rect x="7.25" y="8" width="9.5" height="12.75" rx="4.75" />
    <path d="M12 11.5v6.5M7.25 12.5h-3.5M16.75 12.5h3.5M7.5 16.75H4.75M16.5 16.75h2.75M7.7 9.5 5.5 7.5M16.3 9.5l2.2-2" />
  </>,
)
/** Fluent's People Team: the admin's list of accounts. */
export const PeopleIcon = icon(
  <>
    <circle cx="12" cy="7.5" r="3" />
    <path d="M7.25 19.5v-1A3.5 3.5 0 0 1 10.75 15h2.5a3.5 3.5 0 0 1 3.5 3.5v1" />
    <circle cx="5.25" cy="9.25" r="2" />
    <path d="M2.75 17.5v-.5a2.5 2.5 0 0 1 2.5-2.5h.5" />
    <circle cx="18.75" cy="9.25" r="2" />
    <path d="M21.25 17.5v-.5a2.5 2.5 0 0 0-2.5-2.5h-.5" />
  </>,
)

/* The board's newer actions. */

/** Fluent's Chat: a round bubble with its tail down to the left. */
export const MessageIcon = icon(
  <>
    <path d="M12 3.25a8.75 8.75 0 0 0-7.6 13.08l-1.13 3.75a.55.55 0 0 0 .68.68l3.75-1.13A8.75 8.75 0 1 0 12 3.25Z" />
    <path d="M8.5 10.25h7M8.5 13.75h4.5" />
  </>,
)
/** Fluent's Send: a dart pointing right. */
export const SendIcon = icon(
  <>
    <path d="m4.6 4.2 15.8 7.35a.5.5 0 0 1 0 .9L4.6 19.8a.5.5 0 0 1-.68-.6L5.75 12 3.92 4.8a.5.5 0 0 1 .68-.6Z" />
    <path d="M5.75 12h6.5" />
  </>,
)
/** A raised hand: asking for a ride. */
export const HandIcon = icon(
  <>
    <path d="M8.5 12V5.75a1.5 1.5 0 0 1 3 0V11" />
    <path d="M11.5 11V4.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M14.5 11V6.25a1.5 1.5 0 0 1 3 0v7.5a7 7 0 0 1-7 7h-.4a6 6 0 0 1-4.6-2.15L3.4 16.05a1.5 1.5 0 0 1 2.3-1.9L8.5 16.25" />
  </>,
)
/** An hourglass: waiting for a seat. */
export const HourglassIcon = icon(
  <>
    <path d="M6.25 3.75h11.5M6.25 20.25h11.5" />
    <path d="M7.5 3.75v2.5c0 2 1.5 3.5 4.5 5.75 3-2.25 4.5-3.75 4.5-5.75v-2.5" />
    <path d="M7.5 20.25v-2.5c0-2 1.5-3.5 4.5-5.75 3 2.25 4.5 3.75 4.5 5.75v2.5" />
  </>,
)
/** Fluent's ArrowDownload: an arrow onto a line. */
export const DownloadIcon = icon(<path d="M12 3.75v11.5M7 10.5l5 5 5-5M5 20.25h14" />)
/** A clipboard with a tick: the rides waiting for an admin's yes. */
export const ApprovalIcon = icon(
  <>
    <path d="M9 4.5H7.75A2.75 2.75 0 0 0 5 7.25v10.5a2.75 2.75 0 0 0 2.75 2.75h8.5A2.75 2.75 0 0 0 19 17.75V7.25a2.75 2.75 0 0 0-2.75-2.75H15" />
    <rect x="9" y="3" width="6" height="3.25" rx="1.25" />
    <path d="m9 13.25 2.25 2.25 4-4.5" />
  </>,
)
/** Fluent's Shield, the same outline as ShieldIcon. */
const shield = <path d="M12 3.25c2.4 1.6 4.8 2.4 7.25 2.4v5.85c0 4.5-2.55 7.75-7.25 9.25-4.7-1.5-7.25-4.75-7.25-9.25V5.65c2.45 0 4.85-.8 7.25-2.4Z" />
/** A shield with clock hands: what the admins did, and when (the admin's log). */
export const AdminLogIcon = icon(
  <>
    {shield}
    <path d="M12 8.25V12h2.75" />
  </>,
)
/** A shield with a tick: an admin. */
export const ShieldIcon = icon(
  <>
    {shield}
    <path d="m9.25 12.25 2 2 3.75-4" />
  </>,
)
