import type { GuideArtKey } from '../lib/i18n'

/**
 * One small picture per entry of the company car guide (CarGuide.tsx): the
 * flap and the charger, the card on the reader, the plug, the stalk, the P
 * button, the 80% battery, the frunk and so on. Drawn the way Fluent's own
 * icons are, only bigger: a 120×80 box shown at 96px, so the 1.875 stroke
 * lands on Fluent's 1.5px; generous round corners; soft neutral fills for the
 * surfaces; `currentColor` for the ink and the green accent (via the `accent`
 * classes in index.css) for the one thing the step is about, so a reader can
 * find it on the real car from the picture alone. Numbers and ticks sit on a
 * solid green disc, like a Fluent badge. Nothing here is
 * text that needs translating: the few letters (P, R, D, READY, 80%) are what
 * the car itself shows.
 */

interface ArtProps {
  /** Rendered width in px; the height is 2/3 of it. */
  width?: number
  className?: string
}

/** A car side-on, facing left, in a 110×40 box: body, glass, two wheels and the charging flap on the rear quarter. */
function Car({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className="soft" d="M5 32a2 2 0 0 1-2-2v-5.2a4 4 0 0 1 3.1-3.9L28 16.5l13.3-10.4A8 8 0 0 1 46.2 4.4H74a8 8 0 0 1 6.2 2.9L88 16.5l16.1 3.3A4.5 4.5 0 0 1 107.7 24v6a2 2 0 0 1-2 2Z" />
      <path className="glass" d="M33 16.5l10.6-8.3A5 5 0 0 1 46.7 7H54v9.5Z" />
      <path className="glass" d="M58 7h15.4a5 5 0 0 1 3.9 1.9L83 16.5H58Z" />
      <Wheel cx={27} cy={32} />
      <Wheel cx={85} cy={32} />
    </g>
  )
}

/** A wheel as Fluent draws one: a tyre ring over the surface and a hub ring. */
function Wheel({ cx, cy, r = 7.5 }: { cx: number; cy: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="var(--surface)" />
      <circle cx={cx} cy={cy} r={r * 0.4} />
    </>
  )
}

/** A CCS socket: two small pins above a wide oval with two big ones. */
function Socket({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="5" cy="4" r="3.5" />
      <circle cx="19" cy="4" r="3.5" />
      <rect x="-1" y="14" width="26" height="14" rx="7" />
      <circle cx="7" cy="21" r="3" />
      <circle cx="17" cy="21" r="3" />
    </g>
  )
}

/** The charging card: a rounded rectangle with a chip, tilted a little. */
function Card({ x, y, w = 30, tilt = -8 }: { x: number; y: number; w?: number; tilt?: number }) {
  const h = w * 0.64
  return (
    <g transform={`rotate(${tilt} ${x + w / 2} ${y + h / 2})`}>
      <rect className="accent-fill" x={x} y={y} width={w} height={h} rx="3.5" />
      <rect className="accent" x={x + w * 0.16} y={y + h * 0.3} width={w * 0.24} height={h * 0.28} rx="1.5" />
    </g>
  )
}

/** The plug: a grip, a nozzle and the cable trailing off to the left. */
function Plug({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 10C-8 10 -8 26 4 32" />
      <rect className="soft" x="0" y="0" width="24" height="20" rx="6" />
      <rect x="24" y="4" width="14" height="12" rx="3.5" />
    </g>
  )
}

/** A numbered badge for a two-step picture: Fluent's solid brand disc. */
function Badge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle className="accent-solid" cx={x} cy={y} r="6.5" />
      <text className="on-accent" x={x} y={y + 3} textAnchor="middle">
        {n}
      </text>
    </g>
  )
}

/** Done: a white tick on the same solid disc. */
function Tick({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle className="accent-solid" cx={x} cy={y} r="8" />
      <path d={`M${x - 3.5} ${y}l2.5 2.5l4.5-5`} stroke="#fff" />
    </g>
  )
}

function ParkFlap() {
  return (
    <>
      <path d="M4 66H116" opacity="0.4" />
      <Car x={2} y={30} s={0.8} />
      {/* the flap, popped open, ringed so it is the thing to look for */}
      <circle className="accent" cx="80" cy="46" r="8" strokeDasharray="2.5 2.5" />
      <rect className="accent-fill" x="76" y="43" width="6" height="5" rx="1" />
      <path className="accent" d="M82 43L88 36" />
      {/* the charger post and its short cable */}
      <rect x="98" y="16" width="16" height="50" rx="5" />
      <rect className="soft" x="101" y="21" width="10" height="8" rx="2.5" />
      <path d="M98 50C92 50 88 48 84 47" />
    </>
  )
}

function CardReader() {
  return (
    <>
      <rect x="38" y="8" width="44" height="66" rx="7" />
      <rect className="soft" x="44" y="14" width="32" height="16" rx="3.5" />
      <rect className="accent" x="48" y="38" width="24" height="18" rx="3.5" />
      <path className="accent" d="M64 43a5 5 0 0 1 0 8M68 40a10 10 0 0 1 0 14" />
      <Card x={10} y={42} />
      <Tick x={92} y={22} />
    </>
  )
}

function PlugIn() {
  return (
    <>
      <rect className="soft" x="70" y="14" width="42" height="52" rx="7" />
      <Socket x={79} y={26} />
      <circle className="accent-solid" cx="104" cy="21" r="3" />
      <Plug x={8} y={32} />
      <path className="accent" d="M50 42H64M60 38L64 42L60 46" />
    </>
  )
}

function CardThenUnplug() {
  return (
    <>
      <Badge x={14} y={22} n={1} />
      <rect x="24" y="8" width="22" height="26" rx="4.5" />
      <Card x={27} y={16} w={17} />
      <rect className="soft" x="72" y="10" width="42" height="60" rx="7" />
      <Socket x={81} y={22} />
      <Badge x={12} y={58} n={2} />
      <Plug x={22} y={48} />
      <path className="accent" d="M70 58H62M65 54L61 58L65 62" />
    </>
  )
}

function CardBack() {
  return (
    <>
      {/* the dashboard in section, with the glovebox open under it */}
      <path d="M4 20Q60 8 116 16" />
      <path d="M4 20V40Q4 42 6 42H36M116 16V42H84" />
      <rect className="glass" x="36" y="42" width="48" height="22" rx="3.5" />
      <path className="soft" d="M36 64L40 76H80L84 64Z" />
      <Card x={49} y={26} w={22} tilt={12} />
      <path className="accent" d="M60 12V20M56 16L60 20L64 16" />
    </>
  )
}

function NoStartButton() {
  return (
    <>
      <rect x="20" y="8" width="80" height="30" rx="7" />
      <text className="accent-text big" x="60" y="27" textAnchor="middle">
        READY
      </text>
      <path className="accent" d="M60 40V48M56 44L60 48L64 44" />
      <path d="M60 52V56" />
      <rect className="soft" x="44" y="56" width="32" height="16" rx="5" />
      <path d="M50 64H70" opacity="0.5" />
      {/* the start button that is not there */}
      <g opacity="0.55">
        <circle cx="104" cy="58" r="8" />
        <path d="M98 52L110 64" />
      </g>
    </>
  )
}

function Stalk() {
  return (
    <>
      <circle cx="40" cy="44" r="26" />
      <circle className="soft" cx="40" cy="44" r="8" />
      <path d="M40 36V18M40 52V70M14 44H32M48 44H66" opacity="0.5" />
      {/* the selector stalk on the right, with the P button on its tip */}
      <path d="M62 40H88" strokeWidth="4" />
      <circle className="accent-solid" cx="94" cy="40" r="6.5" />
      <text className="on-accent" x="94" y="43" textAnchor="middle">
        P
      </text>
      <path className="accent" d="M78 33V20M74 24L78 20L82 24" />
      <text className="label" x="88" y="24">
        R
      </text>
      <path className="accent" d="M78 47V60M74 56L78 60L82 56" />
      <text className="label" x="88" y="63">
        D
      </text>
    </>
  )
}

function SwitchOff() {
  return (
    <>
      <circle className="accent-solid" cx="30" cy="40" r="14" />
      <text className="on-accent big" x="30" y="45" textAnchor="middle">
        P
      </text>
      <path d="M50 40H66M62 36L66 40L62 44" />
      <path d="M92 36V28a8 8 0 0 0-16 0v8" />
      <rect className="soft" x="72" y="36" width="24" height="20" rx="5" />
      <circle className="ink" cx="84" cy="44" r="2.5" />
      <path d="M84 46V51" />
    </>
  )
}

function Regen() {
  return (
    <>
      {/* the accelerator, foot lifting off */}
      <rect className="soft" x="20" y="36" width="14" height="30" rx="5" transform="rotate(-18 27 51)" />
      <path d="M27 66V72" />
      <path className="accent" d="M46 40V24M42 28L46 24L50 28" />
      <path className="accent" d="M52 44H66M62 40L66 44L62 48" />
      <rect x="70" y="30" width="36" height="24" rx="5" />
      <rect className="ink" x="106" y="38" width="4" height="8" rx="1.5" />
      <rect className="accent-solid" x="74" y="34" width="8" height="16" rx="2" />
      <rect className="accent-solid" x="84" y="34" width="8" height="16" rx="2" />
      <path className="accent" d="M100 36L96 43H101L98 49" />
    </>
  )
}

function Touchscreen() {
  return (
    <>
      <path d="M6 30H26M94 30H114" strokeWidth="3" />
      <rect x="30" y="14" width="60" height="44" rx="7" />
      <rect className="soft" x="36" y="20" width="24" height="14" rx="3.5" />
      <rect className="soft" x="64" y="20" width="20" height="14" rx="3.5" />
      <rect className="soft" x="36" y="38" width="24" height="14" rx="3.5" />
      <rect className="soft" x="64" y="38" width="20" height="14" rx="3.5" />
      {/* climate, mirrors, regen strength, and the finger on the fourth tile */}
      <path d="M44 27H52M48 23V31M45 24L51 30M51 24L45 30" />
      <rect x="69" y="24" width="10" height="6" rx="1.5" />
      <path className="accent" d="M41 49V44M46 49V41M51 49V38" />
      <circle className="accent-solid" cx="74" cy="45" r="4" />
      <path className="accent" d="M74 49V66" />
    </>
  )
}

function Battery() {
  return (
    <>
      <rect x="14" y="24" width="84" height="32" rx="7" />
      <rect className="ink" x="98" y="34" width="6" height="12" rx="2" />
      <rect className="accent-fill" x="18" y="28" width="61" height="24" rx="4" />
      <path className="accent" d="M79 20V60" strokeDasharray="2.5 2.5" />
      <text className="accent-text big" x="48" y="44" textAnchor="middle">
        80%
      </text>
      <path d="M14 68H62M58 64L62 68L58 72" opacity="0.6" />
    </>
  )
}

function Flap() {
  return (
    <>
      {/* the rear quarter panel above the wheel arch */}
      <path className="soft" d="M6 10H114V70H70A30 30 0 0 0 10 70H6Z" />
      <path className="accent-fill" d="M78 24L70 14H92L100 24Z" />
      <rect className="accent" x="78" y="24" width="22" height="18" rx="3.5" />
      <circle cx="85" cy="31" r="2.5" />
      <circle cx="93" cy="31" r="2.5" />
      <rect x="82" y="35" width="14" height="5" rx="2.5" />
      <path className="accent" d="M113 53L103 43M103 51V43H111" />
      {/* unlock first: an open padlock */}
      <rect className="soft" x="12" y="24" width="16" height="12" rx="3" />
      <path d="M16 24V17a5 5 0 0 1 10 0v2" />
    </>
  )
}

/** The front of the car with the bonnet up and a cable coiled in the frunk. */
function Frunk() {
  return (
    <>
      {/* body, nose to the left, wheel arch on the right */}
      <path className="soft" d="M6 62V44Q6 38 12 36L34 32L48 20Q52 16 58 16H92Q100 16 106 22L114 34V62H74A16 16 0 0 0 42 62Z" />
      <Wheel cx={58} cy={62} r={9} />
      {/* the bonnet, swung open */}
      <path className="accent-fill" d="M48 24L12 6L8 13L44 31Z" />
      <path className="accent" d="M48 24L44 31" />
      {/* the well underneath with the coiled cable */}
      <rect className="accent" x="18" y="38" width="30" height="14" rx="3.5" />
      <path className="accent" d="M24 45a4 4 0 1 0 8 0a4 4 0 1 0-8 0M32 45h10" />
      <path className="accent" d="M42 45q4 0 4 3" />
      {/* no engine: crossed out */}
      <g opacity="0.55">
        <rect x="70" y="26" width="26" height="18" rx="3.5" />
        <path d="M66 22L100 48" />
      </g>
    </>
  )
}

const ART: Record<GuideArtKey, () => React.JSX.Element> = {
  'park-flap': ParkFlap,
  'card-reader': CardReader,
  'plug-in': PlugIn,
  'card-then-unplug': CardThenUnplug,
  'card-back': CardBack,
  'no-start-button': NoStartButton,
  stalk: Stalk,
  'switch-off': SwitchOff,
  regen: Regen,
  touchscreen: Touchscreen,
  battery: Battery,
  flap: Flap,
  frunk: Frunk,
}

/** The picture for one guide entry, in a 3:2 box of `width` px. */
export function GuideArt({ art, width = 96, className }: ArtProps & { art: GuideArtKey }) {
  const Picture = ART[art]
  return (
    <svg
      className={className}
      width={width}
      height={Math.round((width * 2) / 3)}
      viewBox="0 0 120 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.875"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <Picture />
    </svg>
  )
}
