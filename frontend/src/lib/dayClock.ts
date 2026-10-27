import { DAY_END } from './dayPlan'

/**
 * The day plan as a clock (components/DayClock.tsx): the whole day once round
 * a 24-hour dial, midnight at the top and noon at the bottom, one ring per car.
 * Everything here is in the dial's own units, a 1000 × 1000 box centred on
 * `CENTER`, so the SVG scales to whatever square the screen has to give.
 */
export const SIZE = 1000
export const CENTER = SIZE / 2
/** The outermost ring's outer edge; the hour labels sit outside it. */
export const R_OUT = 412
/** The inner edge of the innermost ring; inside it is the readout. */
export const R_IN = 196
/** The thickest a ring gets when there are only a few cars. */
export const MAX_BAND = 44
/** The gap between the company cars' rings and the own cars' rings, in bands. */
export const GROUP_GAP = 0.35

/** Radians clockwise from the top for a minute of the day. */
export function angleOf(min: number): number {
  return (min / DAY_END) * 2 * Math.PI
}

export interface Point {
  x: number
  y: number
}

/** The point on the circle of radius `r` at a minute of the day. */
export function pointAt(r: number, min: number): Point {
  const a = angleOf(min)
  return { x: CENTER + r * Math.sin(a), y: CENTER - r * Math.cos(a) }
}

const fmt = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`

/**
 * An arc of radius `r` from one minute to a later one, clockwise. A whole day
 * (or more) is drawn as two halves, because an SVG arc cannot end where it
 * started.
 */
export function arcPath(r: number, from: number, to: number): string {
  const span = Math.min(to - from, DAY_END)
  if (span >= DAY_END) {
    const mid = from + DAY_END / 2
    return `M ${fmt(pointAt(r, from))} A ${r} ${r} 0 1 1 ${fmt(pointAt(r, mid))} A ${r} ${r} 0 1 1 ${fmt(pointAt(r, from))}`
  }
  const large = span > DAY_END / 2 ? 1 : 0
  return `M ${fmt(pointAt(r, from))} A ${r} ${r} 0 ${large} 1 ${fmt(pointAt(r, from + span))}`
}

/** A filled slice of the ring between two radii, from one minute to a later one. */
export function sectorPath(rIn: number, rOut: number, from: number, to: number): string {
  const span = Math.min(to - from, DAY_END - 0.01)
  if (span <= 0) return ''
  const large = span > DAY_END / 2 ? 1 : 0
  const end = from + span
  return [
    `M ${fmt(pointAt(rOut, from))}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${fmt(pointAt(rOut, end))}`,
    `L ${fmt(pointAt(rIn, end))}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${fmt(pointAt(rIn, from))}`,
    'Z',
  ].join(' ')
}

export interface Ring {
  /** The radius the ring's road runs along. */
  r: number
  /** How thick the ring is; a ride is drawn a little thinner than this. */
  band: number
}

/**
 * The rings, outermost first: the company cars from the outside in, then a
 * small gap, then the own cars. The outside is where a ring is longest, so
 * the cars people book (the pool) get the room. With few cars the rings stop
 * growing at `MAX_BAND` and the readout in the middle gets the rest.
 */
export function ringLayout(pool: number, own: number): Ring[] {
  const n = pool + own
  if (n === 0) return []
  const gap = pool > 0 && own > 0 ? GROUP_GAP : 0
  const band = Math.min(MAX_BAND, (R_OUT - R_IN) / (n + gap))
  const rings: Ring[] = []
  let edge = R_OUT
  for (let i = 0; i < n; i++) {
    if (i === pool && gap) edge -= band * gap
    rings.push({ r: edge - band / 2, band })
    edge -= band
  }
  return rings
}

/** The innermost edge the rings reach, for sizing the readout inside them. */
export function innerEdge(rings: Ring[]): number {
  const last = rings[rings.length - 1]
  return last ? last.r - last.band / 2 : R_OUT
}

/** The minute of the day a point in the dial's units points at (its angle from the centre). */
export function minuteAtPoint(p: Point): number {
  const a = Math.atan2(p.x - CENTER, CENTER - p.y)
  const min = ((a < 0 ? a + 2 * Math.PI : a) / (2 * Math.PI)) * DAY_END
  return min >= DAY_END ? 0 : min
}

/** How far a point is from the centre, in the dial's units. */
export function radiusOf(p: Point): number {
  return Math.hypot(p.x - CENTER, p.y - CENTER)
}
