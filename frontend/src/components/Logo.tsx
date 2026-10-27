import { useId, type SVGProps } from 'react'

interface LogoProps extends SVGProps<SVGSVGElement> {
  /** Rendered size in px (the mark is square). */
  size?: number
}

/**
 * The Karpul mark: a car, side-on, whose back half turns into a thunderbolt.
 * One thick white line on a tile that runs from mint to forest green with a
 * soft light in its top corner, the way the newer Fluent app icons are lit.
 * The same drawing as public/favicon.svg and the app icons
 * (scripts/render-icons.mjs renders those); the ids are per instance because
 * the mark shows twice at once (the top bar and the drawer).
 */
export function Logo({ size = 22, ...rest }: LogoProps) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" {...rest}>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3fd894" />
          <stop offset=".55" stopColor="#0f8a58" />
          <stop offset="1" stopColor="#0a4f39" />
        </linearGradient>
        <radialGradient id={`${id}l`} cx="18" cy="8" r="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${id}t)`} />
      <rect width="64" height="64" rx="14" fill={`url(#${id}l)`} />
      <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.5 39.5H10V32.5C10 29.5 12 27.8 15 27.5L26.5 26L34.5 17H49L42 29.5H53L40.5 46" />
        <path d="M26.5 39.5H35" />
        <circle cx="20" cy="41" r="5" />
      </g>
    </svg>
  )
}
