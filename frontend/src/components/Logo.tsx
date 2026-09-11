import type { SVGProps } from 'react'

interface LogoProps extends SVGProps<SVGSVGElement> {
  /** Rendered size in px (the mark is square). */
  size?: number
}

/**
 * The Karpul mark: a car, side-on, whose back half turns into a thunderbolt.
 * One thick line, nothing else. The same drawing as public/favicon.svg and the
 * app icons (scripts/render-icons.mjs renders those); here the tile takes
 * `currentColor`, so `.topbar-title svg` paints it the accent green like the
 * other icons, and the line stays white.
 */
export function Logo({ size = 22, ...rest }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" {...rest}>
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.5 39.5H10V32.5C10 29.5 12 27.8 15 27.5L26.5 26L34.5 17H49L42 29.5H53L40.5 46" />
        <path d="M26.5 39.5H35" />
        <circle cx="20" cy="41" r="5" />
      </g>
    </svg>
  )
}
