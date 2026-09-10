import type { SVGProps } from 'react'

/**
 * Inline line icons (24px grid, 1.75 stroke), the outlined style the design
 * uses. Kept here rather than pulled from an icon package so the bundle only
 * carries the dozen glyphs the board needs.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const CarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 16.5V11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11v5.5" />
    <path d="M3.5 11h17" />
    <rect x="3.5" y="11" width="17" height="6" rx="1.5" />
    <path d="M6 17v1.5M18 17v1.5" />
    <circle cx="7.5" cy="14" r="1" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="14" r="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const BoltIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 3L5 13.5h6L10.5 21 19 10.5h-6z" />
  </Icon>
)

/** A leaf, the usual "hybrid" mark. */
export const LeafIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 4.5c0 9-4 15.5-13 15.5-1.6 0-2.6-.3-3.5-.8C5 10 11 4.5 20 4.5z" />
    <path d="M4.5 19.5C7 14 11 10 16 7.5" />
  </Icon>
)

/** A fuel pump: petrol. */
export const PumpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20" />
    <path d="M3.5 20h12M5.5 11h8" />
    <path d="M14 9h2a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0v-5.5L18 8" />
  </Icon>
)

/** A drop: diesel. */
export const DropIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z" />
  </Icon>
)

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
)

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

export const KebabIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <circle cx="12" cy="5.5" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="18.5" r="1.6" />
  </Icon>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Icon>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Icon>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
)

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Icon>
)

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Icon>
)

export const GripIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
)

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L17.5 5.5a2.1 2.1 0 0 0-3 0L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
)

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Icon>
)

export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)

export const CheckCircleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.7 2.7L16 9.5" />
  </Icon>
)

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
)

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.5} />
  </Icon>
)

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
)

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Icon>
)

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19.5a6 6 0 0 1 12 0" />
    <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6M17.5 13.6a6 6 0 0 1 3.5 5.9" />
  </Icon>
)

export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 5h4a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19h-4" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </Icon>
)

export const KeyIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="14" r="4" />
    <path d="M11 11l8.5-8.5M15 7l2.5 2.5M17.5 4.5L20 7" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </Icon>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Icon>
)
