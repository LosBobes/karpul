import type { ReactNode, SVGProps } from 'react'

/**
 * The app's icons, drawn here rather than taken from a pack: one 24px grid,
 * one stroke, round ends, and only as many lines as the idea needs. A pack
 * icon carries the pack's habits (Phosphor's duotone slabs, its rounded
 * boxes around everything), and next to the car illustrations and the
 * brand marks those habits read as stock. Every icon takes `size` (px) and
 * an optional `weight`; the names below are the contract the components
 * render against, so changing a drawing means editing this file only.
 */
type IconWeight = 'light' | 'regular' | 'bold'
type IconProps = Omit<SVGProps<SVGSVGElement>, 'strokeWidth'> & {
  size?: number
  weight?: IconWeight
  /** A heavier stroke for one use (2.25 and up reads as bold). */
  strokeWidth?: number
}

const STROKE: Record<IconWeight, number> = { light: 1.4, regular: 1.7, bold: 2.3 }

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
    <path d="M3.5 16.5h-.25A.75.75 0 0 1 2.5 15.75V13.4c0-.6.37-1.12.93-1.33L6 11l2.3-3.4A2 2 0 0 1 9.96 6.7h4.3c.6 0 1.17.27 1.55.73L18.5 11l1.9.48c.65.16 1.1.74 1.1 1.4v2.87a.75.75 0 0 1-.75.75h-.25" />
    <path d="M9.2 16.5h5.6" />
    <path d="M6 11h12.5" />
    <circle cx="6.75" cy="16.5" r="2" />
    <circle cx="17.25" cy="16.5" r="2" />
  </>
)

/** The generic car, side-on: the fallback for a car the board cannot draw. */
export const CarIcon = icon(car)
/** The same car: the vehicle pool. */
export const CarProfileIcon = icon(car)

export const BoltIcon = icon(<path d="M13.2 3 5.5 13.2h5.8L10.8 21l7.7-10.2h-5.8L13.2 3Z" />)
/** A leaf, the usual "hybrid" mark. */
export const LeafIcon = icon(
  <>
    <path d="M5 19.5c-.4-8.6 4.6-14 14.5-14.5.4 9.4-4.6 14.6-13 14.5H5Z" />
    <path d="M5 19.5c2.6-4.2 5.6-7 9-9" />
  </>,
)
/** A fuel pump: petrol. */
export const PumpIcon = icon(
  <>
    <path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20" />
    <path d="M3.5 20h12" />
    <path d="M7.5 8h4" />
    <path d="M14 10h1.25c.69 0 1.25.56 1.25 1.25v4.5a1.5 1.5 0 0 0 3 0V8.6L17.5 6.5" />
  </>,
)
/** A drop: diesel. */
export const DropIcon = icon(<path d="M12 3.5c3.1 3.7 5.75 6.9 5.75 10.25a5.75 5.75 0 0 1-11.5 0C6.25 10.4 8.9 7.2 12 3.5Z" />)

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />, 'bold')
export const MinusIcon = icon(<path d="M5 12h14" />, 'bold')
/** Two bars, the lower one shorter: the drawer. */
export const MenuIcon = icon(<path d="M4 8.5h16M4 15.5h10" />)
export const KebabIcon = icon(
  <>
    {dot(12, 5.5, 1.5)}
    {dot(12, 12, 1.5)}
    {dot(12, 18.5, 1.5)}
  </>,
)
export const ChevronLeftIcon = icon(<path d="M14.5 6 8.5 12l6 6" />)
export const ChevronRightIcon = icon(<path d="m9.5 6 6 6-6 6" />)
export const ChevronDownIcon = icon(<path d="m6 9.5 6 6 6-6" />)
export const ArrowRightIcon = icon(<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />)
export const ArrowLeftIcon = icon(<path d="M19 12H5M10.5 6.5 5 12l5.5 5.5" />)
export const PinIcon = icon(
  <>
    <path d="M12 21c-3.6-3.4-6.5-6.9-6.5-10.7a6.5 6.5 0 0 1 13 0C18.5 14.1 15.6 17.6 12 21Z" />
    <circle cx="12" cy="10.25" r="2.25" />
  </>,
)
export const GripIcon = icon(
  <>
    {dot(9, 6)}
    {dot(15, 6)}
    {dot(9, 12)}
    {dot(15, 12)}
    {dot(9, 18)}
    {dot(15, 18)}
  </>,
)
export const TrashIcon = icon(
  <>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    <path d="m6.5 7 .85 11.6A2 2 0 0 0 9.34 20.5h5.32a2 2 0 0 0 2-1.9L17.5 7" />
  </>,
)
export const PencilIcon = icon(
  <>
    <path d="M15.6 4.6a2 2 0 0 1 2.83 0l1 1a2 2 0 0 1 0 2.83L8.5 19.4 4 20l.6-4.5L15.6 4.6Z" />
    <path d="m14 6.2 3.8 3.8" />
  </>,
)
export const CopyIcon = icon(
  <>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" />
    <path d="M15.5 8.5V6.5A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2" />
  </>,
)
export const XIcon = icon(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />)
export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />, 'bold')
export const CheckCircleIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.75" />
    <path d="m8.4 12.3 2.5 2.5 4.8-5" />
  </>,
)
export const CalendarIcon = icon(
  <>
    <rect x="3.75" y="5.25" width="16.5" height="15" rx="3" />
    <path d="M3.75 10h16.5M8.25 3.25v3.5M15.75 3.25v3.5" />
  </>,
)
/** Rows with a bullet each: the list view. */
export const ListIcon = icon(
  <>
    <path d="M9 6.5h11M9 12h11M9 17.5h7" />
    {dot(4.75, 6.5)}
    {dot(4.75, 12)}
    {dot(4.75, 17.5)}
  </>,
)
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 7.5V12l3 1.75" />
  </>,
)
export const UserIcon = icon(
  <>
    <circle cx="12" cy="8.25" r="3.75" />
    <path d="M4.75 20c.9-3.6 3.75-5.75 7.25-5.75S18.35 16.4 19.25 20" />
  </>,
)
export const UsersIcon = icon(
  <>
    <circle cx="9" cy="8.5" r="3.25" />
    <path d="M3 19.5c.65-3.1 3-5 6-5s5.35 1.9 6 5" />
    <path d="M15.25 5.4a3.25 3.25 0 0 1 0 6.2" />
    <path d="M17.6 14.8c1.8.66 3 2.3 3.4 4.7" />
  </>,
)
export const LogoutIcon = icon(
  <>
    <path d="M13.5 4.5h-6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6" />
    <path d="M10.5 12H20M16.5 8.5 20 12l-3.5 3.5" />
  </>,
)
export const KeyIcon = icon(
  <>
    <circle cx="8" cy="15.5" r="3.75" />
    <path d="M10.7 12.8 19 4.5M15.75 7.75l2.5 2.5M17.75 5.75l2 2" />
  </>,
)
export const SearchIcon = icon(
  <>
    <circle cx="10.75" cy="10.75" r="6.25" />
    <path d="m15.4 15.4 4.6 4.6" />
  </>,
)
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 11v5" />
    {dot(12, 7.9, 1.1)}
  </>,
)
/** An arrow out of a tray: hand the ride to someone else. */
export const ShareIcon = icon(
  <>
    <path d="M12 14V3.75M8.25 7.5 12 3.75l3.75 3.75" />
    <path d="M8.5 10.5H7.5a2.5 2.5 0 0 0-2.5 2.5v5a2.5 2.5 0 0 0 2.5 2.5h9a2.5 2.5 0 0 0 2.5-2.5v-5a2.5 2.5 0 0 0-2.5-2.5h-1" />
  </>,
)
export const RepeatIcon = icon(
  <>
    <path d="M4.5 11.5V10a3 3 0 0 1 3-3H19M16 4l3 3-3 3" />
    <path d="M19.5 12.5V14a3 3 0 0 1-3 3H5M8 20l-3-3 3-3" />
  </>,
)
/** A road running away from you: the distance of a ride. */
export const RoadIcon = icon(
  <>
    <path d="M6.5 20 10 4M17.5 20 14 4" />
    <path d="M12 7v1.5M12 11.25v1.5M12 15.5v2" />
  </>,
)
/** Two coins: the "chip in" note. */
export const CoinsIcon = icon(
  <>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M14.48 9.52A5.5 5.5 0 1 1 9.52 14.48" />
  </>,
)
export const PhoneIcon = icon(
  <path d="M8.6 4.25 6.4 4A1.9 1.9 0 0 0 4.3 6c.5 7.25 6.45 13.2 13.7 13.7a1.9 1.9 0 0 0 2-2.1l-.25-2.2a1.5 1.5 0 0 0-1.1-1.3l-2.55-.7a1.5 1.5 0 0 0-1.5.4l-1.25 1.25a11.5 11.5 0 0 1-4.9-4.9L9.7 8.9a1.5 1.5 0 0 0 .4-1.5l-.7-2.55a1.5 1.5 0 0 0-.8-.6Z" />,
)
export const BellIcon = icon(
  <>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5Z" />
    <path d="M10 20.5a2.1 2.1 0 0 0 4 0" />
  </>,
)
export const ChartIcon = icon(<path d="M5.5 20v-7M12 20V5M18.5 20v-10" />)
export const FilterIcon = icon(<path d="M4 7h16M7 12h10M10 17h4" />)
export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="3.75" />
    <path d="M12 3v1.75M12 19.25V21M3 12h1.75M19.25 12H21M5.64 5.64l1.24 1.24M17.12 17.12l1.24 1.24M5.64 18.36l1.24-1.24M17.12 6.88l1.24-1.24" />
  </>,
)
export const MoonIcon = icon(<path d="M19.5 14.6A7.75 7.75 0 0 1 9.4 4.5 7.75 7.75 0 1 0 19.5 14.6Z" />)

/* The drawer's own marks: one drawing per place it leads to, so the menu
   reads by shape before it reads by word. */

/** A badge with a face and two lines: your account. */
export const AccountIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <circle cx="8.75" cy="10.75" r="2" />
    <path d="M5.75 16c.5-1.5 1.6-2.25 3-2.25s2.5.75 3 2.25" />
    <path d="M14.5 10h3.5M14.5 13.5h2.5" />
  </>,
)
/** A winding road between where you start and where you end: your rides. */
export const RouteIcon = icon(
  <>
    <circle cx="6" cy="18" r="2.25" />
    <path d="M8.25 18H15a3.25 3.25 0 0 0 0-6.5H9a3.25 3.25 0 0 1 0-6.5h6.5" />
    <path d="M18.5 7.25c-1.1-1.15-1.65-2.1-1.65-2.85a1.65 1.65 0 0 1 3.3 0c0 .75-.55 1.7-1.65 2.85Z" />
  </>,
)
/** A bell with something waiting on it: notifications. */
export const BellDotIcon = icon(
  <>
    <path d="M13.2 5.1A6 6 0 0 0 6 11v5.5L4.5 18h15L18 16.5v-4" />
    <path d="M10 20.5a2.1 2.1 0 0 0 4 0" />
    <circle cx="18" cy="6.5" r="2.5" />
  </>,
)
/** A car parked under a roof: the company pool. */
export const GarageIcon = icon(
  <>
    <path d="M3 20.5V9.6c0-.5.25-.95.66-1.22l7.5-4.9a1.5 1.5 0 0 1 1.68 0l7.5 4.9c.41.27.66.72.66 1.22v10.9" />
    <path d="M7 20.5v-4.25l1.3-2.85A1.5 1.5 0 0 1 9.66 12.5h4.68c.59 0 1.12.34 1.36.88L17 16.25v4.25" />
    <path d="M7 17.5h10" />
  </>,
)
/** A sheet of rows and columns: the admin's table of every ride. */
export const TableIcon = icon(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
  </>,
)
/** A charging plug on its cable: the company car guide. */
export const PlugIcon = icon(
  <>
    <path d="M9 3.5V7M15 3.5V7" />
    <path d="M6.75 7h10.5v3a5.25 5.25 0 0 1-10.5 0V7Z" />
    <path d="M12 15.25V17a3.5 3.5 0 0 0 3.5 3.5H18" />
  </>,
)
/** Three people, one standing forward: the admin's list of accounts. */
export const PeopleIcon = icon(
  <>
    <circle cx="12" cy="8" r="3" />
    <path d="M6.5 19.5c.55-3 2.6-4.75 5.5-4.75s4.95 1.75 5.5 4.75" />
    <circle cx="5" cy="9.5" r="2" />
    <path d="M2.5 16.5c.3-1.5 1.2-2.4 2.5-2.6" />
    <circle cx="19" cy="9.5" r="2" />
    <path d="M21.5 16.5c-.3-1.5-1.2-2.4-2.5-2.6" />
  </>,
)

/* The board's newer actions. */

/** A speech bubble with two lines: a ride's thread. */
export const MessageIcon = icon(
  <>
    <path d="M5.5 4.75h13a2.25 2.25 0 0 1 2.25 2.25v8.25a2.25 2.25 0 0 1-2.25 2.25H11l-4.25 3.25V17.5H5.5a2.25 2.25 0 0 1-2.25-2.25V7A2.25 2.25 0 0 1 5.5 4.75Z" />
    <path d="M7.75 9.25h8.5M7.75 12.75h5.5" />
  </>,
)
/** A paper plane: send. */
export const SendIcon = icon(
  <>
    <path d="M20.5 3.5 3.75 10.4l6.6 2.6 2.6 6.6L20.5 3.5Z" />
    <path d="m10.35 13 4.4-4.4" />
  </>,
)
/** A raised hand: asking for a ride. */
export const HandIcon = icon(
  <>
    <path d="M8.5 12V5.75a1.5 1.5 0 0 1 3 0V11" />
    <path d="M11.5 11V4.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M14.5 11V6a1.5 1.5 0 0 1 3 0v7.5a7 7 0 0 1-7 7h-.4a6 6 0 0 1-4.6-2.15L3.4 15.8a1.5 1.5 0 0 1 2.3-1.9L8.5 16" />
  </>,
)
/** An hourglass: waiting for a seat. */
export const HourglassIcon = icon(
  <>
    <path d="M6.5 3.75h11M6.5 20.25h11" />
    <path d="M7.5 3.75v2.5c0 2 1.5 3.5 4.5 5.75 3-2.25 4.5-3.75 4.5-5.75v-2.5" />
    <path d="M7.5 20.25v-2.5c0-2 1.5-3.5 4.5-5.75 3 2.25 4.5 3.75 4.5 5.75v2.5" />
  </>,
)
/** An arrow into a tray: download. */
export const DownloadIcon = icon(
  <>
    <path d="M12 3.75V14M8.25 10.25 12 14l3.75-3.75" />
    <path d="M4.5 14.5v2.75a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5V14.5" />
  </>,
)
/** A shield with a tick: an admin. */
/** A shield with clock hands: what the admins did, and when (the admin's log). */
export const AdminLogIcon = icon(
  <>
    <path d="M12 3.5 5 6v5.5c0 4.25 2.9 7.6 7 9 4.1-1.4 7-4.75 7-9V6l-7-2.5Z" />
    <path d="M12 8.5v3.75l2.5 1.5" />
  </>,
)
export const ShieldIcon = icon(
  <>
    <path d="M12 3.5 5 6v5.5c0 4.25 2.9 7.6 7 9 4.1-1.4 7-4.75 7-9V6l-7-2.5Z" />
    <path d="m9.25 12 2 2 3.75-4" />
  </>,
)
