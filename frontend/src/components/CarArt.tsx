import type { ComponentType } from 'react'
import {
  siAudi,
  siBmw,
  siChevrolet,
  siCitroen,
  siDacia,
  siDsautomobiles,
  siFiat,
  siFord,
  siHonda,
  siHyundai,
  siJeep,
  siKia,
  siLada,
  siMazda,
  siMg,
  siMini,
  siMitsubishi,
  siNissan,
  siOpel,
  siPeugeot,
  siPolestar,
  siPorsche,
  siRenault,
  siSeat,
  siSkoda,
  siSmart,
  siSubaru,
  siSuzuki,
  siTesla,
  siToyota,
  siVolkswagen,
  siVolvo,
  type SimpleIcon,
} from 'simple-icons'
import { carBrand, carModel, carPowertrain, powertrainLabel, type CarBrandKey, type CarModelKey, type Powertrain } from '../lib/carModels'
import { BoltIcon, CarIcon, LeafIcon } from './icons'

/**
 * Per-model artwork for the cars in the pool: `lib/carModels.ts` decides which
 * model a car name is, this file draws it. A car the board cannot draw but
 * whose make it recognises gets the make's logo instead (`BrandLogo`, marks
 * from the `simple-icons` package, drawn in `currentColor` so they sit in the
 * design like the line icons do). Anything else keeps the generic car icon.
 */
interface ArtProps {
  /** Rendered width in px; height follows `ART_RATIO`. */
  width: number
  className?: string
}

const ART: Record<CarModelKey, ComponentType<ArtProps>> = {
  mazda6e: Mazda6eArt,
}

/** The illustrations are drawn in a 128×48 box: long and low, like the car. */
const ART_RATIO = 48 / 128

/**
 * Mazda 6e: a white electric fastback, drawn side-on and facing left after
 * the press photo — long bonnet, one unbroken roofline into a ducktail, slim
 * light bars, dark glass, big twin-spoke wheels and a dark sill. The outline
 * follows `currentColor` so it takes the tile's muted/green state like the
 * line icons do; the body stays white because the car is white. That it is
 * electric is not drawn here: `PowertrainBadge` says so on top of every
 * picture, at a size that survives a phone screen.
 */
export function Mazda6eArt({ width, className }: ArtProps) {
  return (
    <svg
      className={className}
      width={width}
      height={Math.round(width * ART_RATIO)}
      viewBox="0 0 128 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* ground shadow */}
      <ellipse cx="64" cy="43.8" rx="58" ry="1.6" fill="currentColor" opacity="0.14" />
      {/* body */}
      <path
        d="M4.6 26.5Q4.4 21 9 20.1C20 18.7 34 17 44 16.1C50 11.2 56.5 8.7 63 8.3C70 7.8 78 7.7 84 8.4C94 9.7 104 13.4 114 16.4L122 17Q124 17.3 124 19V31Q124 35.2 121 36.6L111.3 37A12 12 0 0 0 88.7 37H37.3A12 12 0 0 0 14.7 37H9.5Q6.8 37 6.3 34.5Z"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* dark lower cladding: sill between the wheels and the bumper lips */}
      <path d="M37.3 35.4H88.7V37H37.3Z" fill="#343a42" />
      <path d="M9.5 36.5H14.2M111.8 36.5H120.5" stroke="#343a42" strokeWidth="1.3" />
      {/* glass: dark tint, one greenhouse from A-pillar to the fastback */}
      <path
        d="M46.5 17.2C50.5 12.6 56.5 10 63 9.7L81 9.4C90 10.2 100 13.2 108 16.3Z"
        fill="#3f4a55"
        stroke="currentColor"
        strokeWidth="0.9"
      />
      <path d="M70.5 9.5 69 17" stroke="currentColor" strokeWidth="0.9" />
      <path d="M97.5 12.1 96 16.5" stroke="currentColor" strokeWidth="0.9" />
      {/* window highlight */}
      <path d="M50 15.3C53.5 12 58 10.6 63 10.4" stroke="#8d98a3" strokeWidth="0.7" opacity="0.8" />
      {/* mirror */}
      <rect x="42" y="16.6" width="4.2" height="2.6" rx="0.9" fill="#fff" stroke="currentColor" strokeWidth="0.8" />
      {/* character line and flush door handles */}
      <path d="M38 26C58 25.2 78 24.2 98 23.6" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
      <path d="M58 21.3h5M86 20.5h5" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
      {/* slim light bars: headlight and tail light */}
      <path d="M5.2 22.6 13.5 20.4V21.7L6 24.2Z" fill="currentColor" opacity="0.6" />
      <path d="M115 18.9 122.8 17.7V19.1L115.6 20.2Z" fill="currentColor" opacity="0.6" />
      <Wheel cx={26} />
      <Wheel cx={100} />
    </svg>
  )
}

/** A big dark alloy with five machined twin spokes, as on the 6e. */
function Wheel({ cx }: { cx: number }) {
  const cy = 32
  const spokes = Array.from({ length: 5 }, (_, i) => i * 72 - 90)
  return (
    <g>
      <circle cx={cx} cy={cy} r="10.2" fill="#2a2f36" />
      <circle cx={cx} cy={cy} r="6.9" fill="#4b525b" />
      {spokes.map((deg) => (
        <path key={deg} d={`M${cx} ${cy}l0 -6.2`} stroke="#d5dae0" strokeWidth="1.7" transform={`rotate(${deg + 90} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r="1.7" fill="#d5dae0" />
    </g>
  )
}

const LOGOS: Record<CarBrandKey, SimpleIcon> = {
  audi: siAudi,
  bmw: siBmw,
  volkswagen: siVolkswagen,
  toyota: siToyota,
  honda: siHonda,
  ford: siFord,
  skoda: siSkoda,
  renault: siRenault,
  peugeot: siPeugeot,
  citroen: siCitroen,
  fiat: siFiat,
  opel: siOpel,
  hyundai: siHyundai,
  kia: siKia,
  mazda: siMazda,
  nissan: siNissan,
  volvo: siVolvo,
  tesla: siTesla,
  porsche: siPorsche,
  subaru: siSubaru,
  suzuki: siSuzuki,
  mitsubishi: siMitsubishi,
  jeep: siJeep,
  chevrolet: siChevrolet,
  mini: siMini,
  dacia: siDacia,
  seat: siSeat,
  smart: siSmart,
  polestar: siPolestar,
  mg: siMg,
  lada: siLada,
  dsautomobiles: siDsautomobiles,
}

/** A make's logo, filled with `currentColor`, in a square of `size` px. */
export function BrandLogo({ brand, size = 22, className }: { brand: CarBrandKey; size?: number; className?: string }) {
  const icon = LOGOS[brand]
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label={icon.title}
    >
      <path d={icon.path} />
    </svg>
  )
}

interface GlyphProps {
  carName: string
  /** Line-icon size; a model illustration is drawn about twice as wide. */
  size?: number
  className?: string
}

/**
 * The model illustration when there is one, else the make's logo when the
 * name gives one away, else the generic car icon.
 */
export function CarGlyph({ carName, size = 22, className }: GlyphProps) {
  const model = carModel(carName)
  if (model) {
    const Art = ART[model.key]
    return <Art width={Math.round(size * 2.8)} className={className} />
  }
  const brand = carBrand(carName)
  if (brand) return <BrandLogo brand={brand.key} size={size} className={className} />
  return <CarIcon size={size} className={className} />
}

/**
 * The round sticker that says what the car runs on: a bolt for electric, a
 * leaf for a hybrid, nothing for the rest. It sits in the corner of whatever
 * picture slot holds it (`.pt-badge` is absolutely positioned; the slot is
 * `position: relative`), so it is the same size on a tile, a list row and
 * the admin list whatever the artwork underneath, and `index.css` makes it
 * bigger on a phone. Pass a `carName` and it decides for itself, or a `kind`.
 */
export function PowertrainBadge({ carName, kind, className }: { carName?: string; kind?: Powertrain | null; className?: string }) {
  const pt = kind ?? (carName !== undefined ? carPowertrain(carName) : null)
  if (!pt) return null
  const label = powertrainLabel(pt)
  return (
    <span className={['pt-badge', `pt-badge-${pt}`, className].filter(Boolean).join(' ')} role="img" aria-label={label} title={label}>
      {pt === 'electric' ? <BoltIcon strokeWidth={2.5} /> : <LeafIcon strokeWidth={2.25} />}
    </span>
  )
}

/** The illustration for a known model, at a chosen width. */
export function CarArt({ model, width, className }: { model: CarModelKey; width: number; className?: string }) {
  const Art = ART[model]
  return <Art width={width} className={className} />
}
