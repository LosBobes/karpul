import type { ComponentType } from 'react'
import { carModel, type CarModelKey } from '../lib/carModels'
import { CarIcon } from './icons'

/**
 * Per-model artwork for the cars in the pool: `lib/carModels.ts` decides which
 * model a car name is, this file draws it. Anything unknown keeps the generic
 * line icon.
 */
interface ArtProps {
  /** Rendered width in px; the art is 2:1. */
  width: number
  className?: string
}

const ART: Record<CarModelKey, ComponentType<ArtProps>> = {
  mazda6e: Mazda6eArt,
}

/**
 * Mazda 6e: a white electric fastback, drawn side-on and facing left. The
 * outline follows `currentColor` so it takes the tile's muted/green state
 * like the line icons do; the body stays white because the car is white.
 * A green bolt sticker in the corner says "electric" at a glance.
 */
export function Mazda6eArt({ width, className }: ArtProps) {
  return (
    <svg
      className={className}
      width={width}
      height={width / 2}
      viewBox="0 0 64 32"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* ground shadow */}
      <ellipse cx="32" cy="29.2" rx="27" ry="1.4" fill="currentColor" opacity="0.14" />
      {/* body */}
      <path
        d="M2.5 23.5V18.5Q2.5 15.5 6.5 15L20 13.5 26.5 7.8Q29.5 5.5 34.5 5.5H41Q46.5 5.5 52.5 9.2L58.5 12.8Q61.5 14 61.5 17.5V23.5H54.5A6.5 6.5 0 0 0 41.5 23.5H22.5A6.5 6.5 0 0 0 9.5 23.5Z"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* glass */}
      <path
        d="M22 13.2 27.5 8.6Q30 7 34.5 7H40.5Q45.5 7 50.5 10.2L54.8 12.8Z"
        fill="#dfe8f0"
        stroke="currentColor"
        strokeWidth="0.9"
      />
      <path d="M38 7.2V13" stroke="currentColor" strokeWidth="0.9" />
      {/* mirror, lights */}
      <path d="M21.6 12.4h-1.8a0.8 0.8 0 0 0-0.8 0.8v0.7" stroke="currentColor" strokeWidth="0.9" />
      <path d="M3.2 16.2 8 15.4V16.9Z" fill="currentColor" opacity="0.55" />
      <path d="M58.2 14.4 61 15.9" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
      {/* wheels */}
      <circle cx="16" cy="23.5" r="4.6" fill="#343a42" />
      <circle cx="16" cy="23.5" r="2" fill="#e6e9ed" />
      <circle cx="48" cy="23.5" r="4.6" fill="#343a42" />
      <circle cx="48" cy="23.5" r="2" fill="#e6e9ed" />
      {/* electric sticker */}
      <circle cx="58" cy="5.5" r="5" fill="var(--green)" stroke="#fff" strokeWidth="1" />
      <path d="M58.6 2.2 55.8 6.2H58L57.4 8.8 60.2 4.8H58Z" fill="#fff" />
    </svg>
  )
}

interface GlyphProps {
  carName: string
  /** Line-icon size; a model illustration is drawn about twice as wide. */
  size?: number
  className?: string
}

/** The model illustration when there is one, else the generic car icon. */
export function CarGlyph({ carName, size = 22, className }: GlyphProps) {
  const model = carModel(carName)
  if (!model) return <CarIcon size={size} className={className} />
  const Art = ART[model.key]
  return <Art width={Math.round(size * 2.4)} className={className} />
}

/** The illustration for a known model, at a chosen width. */
export function CarArt({ model, width, className }: { model: CarModelKey; width: number; className?: string }) {
  const Art = ART[model]
  return <Art width={width} className={className} />
}
