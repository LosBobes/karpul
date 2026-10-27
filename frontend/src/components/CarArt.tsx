import { useId, type ComponentType } from 'react'
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
import { BoltIcon, CarIcon, DropIcon, LeafIcon, PumpIcon } from './icons'

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
 * the press photo (long bonnet, one unbroken roofline into a ducktail, slim
 * light bars, dark glass, big twin-spoke wheels and a dark sill), in Fluent's
 * illustration manner: no outline, the shapes modelled by soft gradients, a
 * sheen across the glass and a blurred shadow under it. The body stays white
 * because the car is white; the light bars take `currentColor`, so the tile's
 * muted or green state still reaches the picture. That it is electric is not
 * drawn here: `PowertrainMark` says so beside the car's name.
 */
export function Mazda6eArt({ width, className }: ArtProps) {
  const id = useId()
  const g = (name: string) => `url(#${CSS.escape(id + name)})`
  const BODY = 'M4.6 26.5Q4.4 21 9 20.1C20 18.7 34 17 44 16.1C50 11.2 56.5 8.7 63 8.3C70 7.8 78 7.7 84 8.4C94 9.7 104 13.4 114 16.4L122 17Q124 17.3 124 19V31Q124 35.2 121 36.6L111.3 37A12 12 0 0 0 88.7 37H37.3A12 12 0 0 0 14.7 37H9.5Q6.8 37 6.3 34.5Z'
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
      <defs>
        <linearGradient id={`${id}body`} x1="0" y1="8" x2="0" y2="37" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset=".55" stopColor="#f4f6f8" />
          <stop offset="1" stopColor="#c9d0d7" />
        </linearGradient>
        <linearGradient id={`${id}side`} x1="0" y1="24" x2="0" y2="37" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5c6b7a" stopOpacity="0" />
          <stop offset="1" stopColor="#5c6b7a" stopOpacity=".28" />
        </linearGradient>
        <linearGradient id={`${id}glass`} x1="50" y1="9" x2="100" y2="17" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b6b7c" />
          <stop offset=".6" stopColor="#2f3a46" />
          <stop offset="1" stopColor="#222a33" />
        </linearGradient>
        <linearGradient id={`${id}sheen`} x1="0" y1="9" x2="0" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}tyre`} cx="0.5" cy="0.4" r="0.6">
          <stop stopColor="#3d4550" />
          <stop offset="1" stopColor="#15191e" />
        </radialGradient>
        <radialGradient id={`${id}rim`} cx="0.4" cy="0.35" r="0.7">
          <stop stopColor="#8a949f" />
          <stop offset="1" stopColor="#3c434c" />
        </radialGradient>
        <radialGradient id={`${id}shadow`} cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#000" stopOpacity=".22" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* the blurred shadow it stands in */}
      <ellipse cx="64" cy="43.4" rx="62" ry="3.2" fill={g('shadow')} />
      {/* body, modelled from a lit roof to the shaded flank */}
      <path d={BODY} fill={g('body')} />
      <path d={BODY} fill={g('side')} />
      {/* the shoulder catching the light */}
      <path d="M14 21.2C30 19.4 44 18.2 52 17.6M100 17.4C107 19 113 20.2 121 19.6" stroke="#fff" strokeWidth="1" opacity=".9" />
      {/* dark lower cladding: sill between the wheels and the bumper lips */}
      <path d="M37.3 35.2H88.7V37H37.3Z" fill="#2f363e" />
      <path d="M9.5 36.4H14.2M111.8 36.4H120.5" stroke="#2f363e" strokeWidth="1.3" />
      {/* glass: one greenhouse from A-pillar to the fastback, with a sheen */}
      <path d="M46.5 17.2C50.5 12.6 56.5 10 63 9.7L81 9.4C90 10.2 100 13.2 108 16.3Z" fill={g('glass')} />
      <path d="M49 15.6C53 11.9 58 10.4 63 10.2L81 9.9C86 10.3 91 11.3 96 12.7L62 14.6Z" fill={g('sheen')} />
      <path d="M70.5 9.5 69 17M97.5 12.1 96 16.5" stroke="#eef1f4" strokeWidth="1.1" />
      {/* mirror */}
      <rect x="42" y="16.6" width="4.2" height="2.6" rx="1.1" fill="#e3e8ec" />
      {/* character line and flush door handles, as soft creases */}
      <path d="M38 26C58 25.2 78 24.2 98 23.6" stroke="#9aa5b0" strokeWidth="0.6" opacity=".55" />
      <path d="M58 21.3h5M86 20.5h5" stroke="#8c97a2" strokeWidth="1" opacity=".7" />
      {/* slim light bars: headlight and tail light */}
      <path d="M5.2 22.6 13.5 20.4V21.7L6 24.2Z" fill="currentColor" opacity=".75" />
      <path d="M115 18.9 122.8 17.7V19.1L115.6 20.2Z" fill="#e0475a" opacity=".85" />
      <Wheel cx={26} tyre={g('tyre')} rim={g('rim')} />
      <Wheel cx={100} tyre={g('tyre')} rim={g('rim')} />
    </svg>
  )
}

/** A big dark alloy with five machined spokes, as on the 6e, lit from above. */
function Wheel({ cx, tyre, rim }: { cx: number; tyre: string; rim: string }) {
  const cy = 32
  const spokes = Array.from({ length: 5 }, (_, i) => i * 72 - 90)
  return (
    <g>
      <circle cx={cx} cy={cy} r="10.2" fill={tyre} />
      <circle cx={cx} cy={cy} r="6.9" fill={rim} />
      {spokes.map((deg) => (
        <path key={deg} d={`M${cx} ${cy}l0 -6.2`} stroke="#e6eaee" strokeWidth="1.8" transform={`rotate(${deg + 90} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r="1.8" fill="#f2f4f6" />
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

/** The glyph for what a car runs on: bolt, leaf, drop or pump. */
export function PowertrainIcon({ kind, size = 12 }: { kind: Powertrain; size?: number }) {
  const sw = 2.25
  if (kind === 'electric') return <BoltIcon size={size} strokeWidth={sw} />
  if (kind === 'hybrid') return <LeafIcon size={size} strokeWidth={sw} />
  if (kind === 'diesel') return <DropIcon size={size} strokeWidth={sw} />
  return <PumpIcon size={size} strokeWidth={sw} />
}

/**
 * A small mark beside the car's name saying what it runs on, nothing when
 * the name does not say. It lives in the text line, never over the picture,
 * so it can stay small (`.pt-mark`, 12px) without hiding the car. Electric
 * and hybrid are green, the fuel-burners muted. Pass a `carName` and it
 * decides for itself, or a `kind`.
 */
export function PowertrainMark({ carName, kind, className }: { carName?: string; kind?: Powertrain | null; className?: string }) {
  const pt = kind ?? (carName !== undefined ? carPowertrain(carName) : null)
  if (!pt) return null
  const label = powertrainLabel(pt)
  return (
    <span className={['pt-mark', `pt-mark-${pt}`, className].filter(Boolean).join(' ')} role="img" aria-label={label} title={label}>
      <PowertrainIcon kind={pt} />
    </span>
  )
}

/** The illustration for a known model, at a chosen width. */
export function CarArt({ model, width, className }: { model: CarModelKey; width: number; className?: string }) {
  const Art = ART[model]
  return <Art width={width} className={className} />
}
