import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The bolt you trace to take a new build (components/UpdateScreen.tsx).
 *
 * It is the thunderbolt the app's mark ends in, straightened into three
 * strokes a finger can follow. The drag is pointer-event based for the same
 * reason the passenger chips are (lib/dnd.ts): HTML5 drag never worked with a
 * finger, and the pad carries `touch-action: none` so the browser scrolls the
 * screen instead of stealing the gesture.
 *
 * Following it is meant to be satisfying, not a test. The finger is matched
 * against a window of points ahead of where it has got to, so it may cut a
 * corner, wander a little off the line or stop dead, and only a real departure
 * from the bolt (or lifting early) starts it over. Every drag in this app has
 * a button equivalent, and this one's lives at the foot of the screen.
 */

/**
 * The bolt in its own box: down the right, a jog back across, down again. It
 * falls the way a bolt falls, steeply, because it has a phone screen's height
 * to use and a stroke pulled down one is the gesture a thumb makes without
 * thinking. The two long strokes are parallel and 53 units apart, so `STRAY_R`
 * below can be generous and a finger on one is still never nearer a point on
 * the other; that gap is also what sets how thick the lane can be drawn.
 */
const BOLT_D = 'M108 14L40 120L104 120L36 226'
const BOX = { w: 140, h: 240 }
/** How thick the lane is drawn, in the box's own units (index.css matches it). */
const LANE = 26
/** Points the finger is matched against. More is smoother and no slower. */
const STEPS = 200
/** How near the head of the bolt a finger must land to pick it up. */
const START_R = 38
/**
 * How far off the line the finger may drift and still pull the trace along.
 * It stays under the gap between the two long strokes (53 units), so a finger
 * on one of them is never nearer a point on the other.
 */
const STRAY_R = 30
/**
 * Past this the finger has left the bolt and the trace starts over. Between
 * the two the trace simply holds where it is, so a wobble costs nothing and
 * only a deliberate departure does.
 */
const LOST_R = 66
/** How far along the bolt the finger may jump in one move, as a fraction. */
const REACH = 0.18
/** The last stretch is a formality; reaching here counts as the whole bolt. */
const FINISH = STEPS - 3
/** Long enough for the nudge to be seen, short enough to retry at once. */
const SLIP_MS = 420

export interface Point {
  x: number
  y: number
}

interface Props {
  /**
   * The finger followed the whole bolt. Carries the bolt's tail as a
   * percentage of the viewport, so whatever plays next can start from the
   * point the finger finished on rather than the middle of the screen.
   */
  onComplete: (tail: Point | null) => void
  /** The finger left the line, or landed away from the start. */
  onSlip?: () => void
  /** Traced: the bolt stays full, flashes over and stops taking input. */
  charged: boolean
}

function far(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function BoltTrace({ onComplete, onSlip, charged }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  // Walked once on mount; state rather than a ref because the head of the bolt
  // is drawn from it, so the first walk has to reach the screen.
  const [points, setPoints] = useState<Point[]>([])
  // The traced point is a ref as well as state: a pointermove reads where the
  // last one got to, and a move can outrun a render.
  const atRef = useRef(0)
  const [at, setAt] = useState(0)
  const [tracing, setTracing] = useState(false)
  const [slipped, setSlipped] = useState(false)

  // Walk the bolt once and keep the points; the browser's own path maths is
  // the only thing that knows where a curve or a join actually is.
  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const total = path.getTotalLength()
    const walked: Point[] = []
    for (let i = 0; i <= STEPS; i++) {
      const p = path.getPointAtLength((total * i) / STEPS)
      walked.push({ x: p.x, y: p.y })
    }
    setPoints(walked)
  }, [])

  useEffect(() => {
    if (!slipped) return
    const id = setTimeout(() => setSlipped(false), SLIP_MS)
    return () => clearTimeout(id)
  }, [slipped])

  const set = useCallback((i: number) => {
    atRef.current = i
    setAt(i)
  }, [])

  const slip = useCallback(() => {
    set(0)
    setTracing(false)
    setSlipped(true)
    onSlip?.()
  }, [onSlip, set])

  /** Where the finger is, in the bolt's own coordinates. */
  const local = (e: React.PointerEvent): Point | null => {
    const svg = svgRef.current
    const m = svg?.getScreenCTM()
    if (!svg || !m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  /**
   * The tail of the bolt as a percentage of the viewport: the last place the
   * finger was, and so where the flare belongs. It goes the other way through
   * the same matrix `local` uses, and is measured while the pad still sits
   * where the finger left it, before the charge pops it.
   */
  const tail = (): Point | null => {
    const svg = svgRef.current
    const m = svg?.getScreenCTM()
    const end = points[STEPS]
    if (!svg || !m || !end) return null
    const p = new DOMPoint(end.x, end.y).matrixTransform(m)
    return { x: (p.x / window.innerWidth) * 100, y: (p.y / window.innerHeight) * 100 }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (charged || !points.length) return
    const p = local(e)
    if (!p) return
    // Landing anywhere but the head of the bolt is a nudge, not a failure.
    if (far(p, points[0]) > START_R) {
      slip()
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    set(0)
    setTracing(true)
    setSlipped(false)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // `tracing` is a render behind a move that has already finished the bolt,
    // so the traced point, which is not, is what says the work is done.
    if (!tracing || charged || atRef.current >= STEPS) return
    const p = local(e)
    if (!p) return
    const from = atRef.current
    const to = Math.min(STEPS, from + Math.round(REACH * STEPS))
    // The nearest point in the window ahead, ties going to the furthest, so a
    // finger moving along the line pulls the trace with it and one moving back
    // simply leaves it where it was.
    let best = from
    let bestGap = Infinity
    for (let i = from; i <= to; i++) {
      const gap = far(points[i], p)
      if (gap <= bestGap) {
        bestGap = gap
        best = i
      }
    }
    if (bestGap > LOST_R) {
      slip()
      return
    }
    // Between STRAY_R and LOST_R the finger is off the line but has not left
    // the bolt: hold the trail where it is and let it be picked back up.
    if (bestGap <= STRAY_R && best > from) set(best)
    if (atRef.current >= FINISH) {
      const origin = tail()
      set(STEPS)
      setTracing(false)
      onComplete(origin)
    }
  }

  const onPointerUp = () => {
    if (!tracing || charged) return
    // Lifting anywhere short of the tail starts the bolt over.
    if (atRef.current < FINISH) slip()
    setTracing(false)
  }

  const head = points[at]
  const start = points[0]
  const end = points[STEPS]
  const done = charged || at >= STEPS
  // How much of the bolt is lit, as the percentage `pathLength` normalises to.
  const drawn = 100 - (at / STEPS) * 100
  const cls = ['bolt-pad', tracing && 'bolt-pad-live', slipped && 'bolt-pad-slip', charged && 'bolt-pad-charged']
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      ref={svgRef}
      className={cls}
      viewBox={`0 0 ${BOX.w} ${BOX.h}`}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        {/* Everything that is only allowed to show on the part already drawn
            rides this mask: the lit lane paints it white as the finger goes. */}
        <mask id="bolt-drawn" maskUnits="userSpaceOnUse" x="0" y="0" width={BOX.w} height={BOX.h}>
          <path
            d={BOLT_D}
            fill="none"
            stroke="#fff"
            strokeWidth={LANE}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={drawn}
          />
        </mask>
      </defs>
      {/* The bolt waiting to be drawn, with a spark running down it to say
          which way it goes. */}
      <path ref={pathRef} className="bolt-track" d={BOLT_D} />
      {!done && !tracing && <path className="bolt-hint" d={BOLT_D} pathLength={100} />}
      {/* The lit part, three times over: the haze it throws, the lane itself,
          and the current running inside it. `pathLength` normalises the dashes
          to 100, so every offset here is a percentage of the bolt. */}
      <path className="bolt-glow" d={BOLT_D} pathLength={100} strokeDasharray={100} strokeDashoffset={drawn} />
      <path className="bolt-trail" d={BOLT_D} pathLength={100} strokeDasharray={100} strokeDashoffset={drawn} />
      <g mask="url(#bolt-drawn)">
        <path className="bolt-current-aura" d={BOLT_D} pathLength={100} />
        <path className="bolt-current" d={BOLT_D} pathLength={100} />
      </g>
      {charged && <path className="bolt-flash" d={BOLT_D} pathLength={100} />}
      {/* The bolt landing: a ring thrown off the tail the finger stopped on. */}
      {charged && end && <circle className="bolt-burst" cx={end.x} cy={end.y} r="18" />}
      {/* Where to put the finger. It has said its piece once the finger is down. */}
      {!done && !tracing && start && <circle className="bolt-start" cx={start.x} cy={start.y} r="12" />}
      {tracing && head && (
        <>
          <circle className="bolt-halo" cx={head.x} cy={head.y} r="20" />
          <circle className="bolt-head" cx={head.x} cy={head.y} r="12" />
        </>
      )}
    </svg>
  )
}
