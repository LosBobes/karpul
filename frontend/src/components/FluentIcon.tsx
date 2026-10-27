import { useId, type ReactNode, type SVGProps } from 'react'

/* --- Fluent marks --------------------------------------------------------
   The drawer's items and the phone's tab bar, drawn in Fluent 2's grammar: a
   20px grid, a 1.5px round stroke, and each drawing split into a body (the
   shapes a filled icon fills), details (the lines a filled icon cuts out of
   the body) and extras (lines that stay lines). That split is what gives each
   mark its three styles from one drawing: `regular` (outline, the default),
   `filled` (a selected tab) and `color` (a two-stop gradient, the drawer). */
interface FluentDrawing {
  body: ReactNode
  detail?: ReactNode
  extra?: ReactNode
  /** The colour style's gradient, light end first. */
  tone: [string, string]
}

const FLUENT = {
  route: {
    body: (
      <>
        <circle cx="4.75" cy="5" r="2" />
        <circle cx="15.25" cy="15" r="2" />
      </>
    ),
    extra: <path d="M6.75 5H12a2.75 2.75 0 0 1 0 5.5H8a2.25 2.25 0 0 0 0 4.5h5.25" />,
    tone: ['#a58bff', '#5b3fd6'],
  },
  bell: {
    body: <path d="M10 2.75a5 5 0 0 0-5 5v3.1L3.6 13.6a.6.6 0 0 0 .54.9h11.72a.6.6 0 0 0 .54-.9L15 10.85V7.75a5 5 0 0 0-5-5Z" />,
    extra: <path d="M8 16.75a2.1 2.1 0 0 0 4 0" />,
    tone: ['#ffd25e', '#ef8300'],
  },
  plug: {
    body: <path d="M5.5 7h9v1.75a4.5 4.5 0 0 1-9 0Z" />,
    detail: <path d="M8.5 9.25h3" />,
    extra: <path d="M7.75 3.25V7M12.25 3.25V7M10 13.25v3.5" />,
    tone: ['#4fe3a3', '#0b7a50'],
  },
  lifebuoy: {
    body: <circle cx="10" cy="10" r="7.25" />,
    detail: (
      <>
        <circle cx="10" cy="10" r="2.75" />
        <path d="M5 5l3.05 3.05M15 5l-3.05 3.05M5 15l3.05-3.05M15 15l-3.05-3.05" />
      </>
    ),
    tone: ['#6cb6ff', '#2453d4'],
  },
  bug: {
    body: (
      <>
        <path d="M7.5 6.75a2.5 2.5 0 0 1 5 0Z" />
        <rect x="6" y="6.75" width="8" height="10.5" rx="4" />
      </>
    ),
    detail: <path d="M10 9.5v6" />,
    extra: <path d="M6 10.5H3.25M14 10.5h2.75M6.3 14H4M13.7 14H16M6.4 7.9 4.5 6.25M13.6 7.9l1.9-1.65" />,
    tone: ['#ff8aa8', '#cc2257'],
  },
  approvals: {
    body: (
      <>
        <rect x="4.25" y="3.75" width="11.5" height="13.75" rx="2" />
        <rect x="7.25" y="2.25" width="5.5" height="3" rx="1" />
      </>
    ),
    detail: <path d="m7.5 11.25 1.75 1.75 3.5-3.75" />,
    tone: ['#ffb46b', '#de5a14'],
  },
  car: {
    body: <path d="M3.5 12.25 5.2 7.7A2 2 0 0 1 7.07 6.4h5.86a2 2 0 0 1 1.87 1.3l1.7 4.55V15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" />,
    detail: <path d="M5.5 12h9M6.25 14h1M12.75 14h1" />,
    extra: <path d="M5.5 16v1.25M14.5 16v1.25" />,
    tone: ['#5fe0d2', '#0c7488'],
  },
  people: {
    body: (
      <>
        <circle cx="7.5" cy="6.75" r="2.75" />
        <path d="M2.75 16.25a4.75 4.75 0 0 1 9.5 0Z" />
        <circle cx="14" cy="7.5" r="2" />
      </>
    ),
    extra: <path d="M13.25 11.9a3.9 3.9 0 0 1 4.25 3.85" />,
    tone: ['#f79ae0', '#9b34bd'],
  },
  table: {
    body: <rect x="3" y="4" width="14" height="12" rx="2" />,
    detail: <path d="M3 8h14M3 12h14M8 8v8" />,
    tone: ['#9cc0e6', '#3a6595'],
  },
  log: {
    body: <path d="M10 2.5 16 4.6v4.65c0 3.75-2.55 6.6-6 8.25-3.45-1.65-6-4.5-6-8.25V4.6Z" />,
    detail: <path d="M10 6.75V10l2.1 1.3" />,
    tone: ['#b49cff', '#6a39d6'],
  },
  list: {
    body: <rect x="3" y="3.5" width="14" height="13" rx="2" />,
    detail: <path d="M6.5 7.5h7M6.5 10h7M6.5 12.5h4" />,
    tone: ['#4fe3a3', '#0b7a50'],
  },
  calendar: {
    body: <rect x="3" y="4.25" width="14" height="12.75" rx="2.25" />,
    detail: <path d="M3 8.25h14M6.75 11.25h.5M9.75 11.25h.5M12.75 11.25h.5M6.75 14h.5M9.75 14h.5" />,
    extra: <path d="M6.75 2.75v2.5M13.25 2.75v2.5" />,
    tone: ['#6cb6ff', '#2453d4'],
  },
  clock: {
    body: <circle cx="10" cy="10" r="7.25" />,
    detail: <path d="M10 6v4.25l2.75 1.75" />,
    tone: ['#5fe0d2', '#0c7488'],
  },
} satisfies Record<string, FluentDrawing>

export type FluentName = keyof typeof FLUENT
export type FluentVariant = 'regular' | 'filled' | 'color'

interface FluentProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: FluentName
  variant?: FluentVariant
  size?: number
}

/**
 * One Fluent mark in one of its three styles. A filled mark cuts its details
 * out with `--icon-knock` (the surface it sits on, which the CSS sets where
 * that is not a card); the colour mark draws them in white.
 */
export function FluentIcon({ name, variant = 'regular', size = 20, ...rest }: FluentProps) {
  const id = useId()
  const d: FluentDrawing = FLUENT[name]
  const line = { strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  const grad = `url(#${CSS.escape(id)})`
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false" {...rest}>
      {variant === 'regular' ? (
        <g fill="none" stroke="currentColor" {...line}>
          {d.body}
          {d.detail}
          {d.extra}
        </g>
      ) : (
        <>
          {variant === 'color' && (
            <defs>
              <linearGradient id={id} x1="3" y1="2" x2="17" y2="18" gradientUnits="userSpaceOnUse">
                <stop stopColor={d.tone[0]} />
                <stop offset="1" stopColor={d.tone[1]} />
              </linearGradient>
            </defs>
          )}
          <g fill={variant === 'color' ? grad : 'currentColor'} stroke={variant === 'color' ? grad : 'currentColor'} {...line}>
            {d.body}
          </g>
          <g fill="none" stroke={variant === 'color' ? '#fff' : 'var(--icon-knock, var(--surface))'} {...line}>
            {d.detail}
          </g>
          <g fill="none" stroke={variant === 'color' ? d.tone[1] : 'currentColor'} {...line}>
            {d.extra}
          </g>
        </>
      )}
    </svg>
  )
}
