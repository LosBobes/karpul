/**
 * Pointer-event drag-and-drop for moving a passenger between cars.
 *
 * Native HTML5 drag-and-drop is mouse-only in practice: iOS Safari and Android
 * Chrome never fire `dragstart` for a finger. So the token is moved with pointer
 * events instead — one code path for mouse, pen and touch — and the drop target
 * is whatever `[data-drop]` element sits under the pointer at release.
 *
 * Feel:
 *  - mouse: the chip lifts as soon as it is dragged a few pixels;
 *  - touch: the chip lifts after a short press-and-hold, so a tap stays a tap.
 *    Handles carry `touch-action: none` (index.css), otherwise the browser would
 *    claim the gesture for scrolling and cancel the pointer mid-way;
 *  - a floating ghost of the chip follows the pointer (above the finger on
 *    touch, where the finger would otherwise hide it), the board auto-scrolls
 *    when the pointer nears the top or bottom edge, and Escape cancels.
 *
 * The ghost is a plain DOM node owned by this module, so tracking the pointer
 * never re-renders the React tree; components only learn about the discrete
 * moments — lifted, over a new target, dropped.
 */

export interface PassengerDrag {
  name: string
  /** Ride the passenger is currently booked on, if any. */
  fromRideId: number | null
  bookingId: number | null
}

export type DropTarget = { kind: 'ride'; rideId: number } | { kind: 'tray' }

export interface DragHandlers {
  /** The chip has lifted. */
  onStart: (drag: PassengerDrag) => void
  /** The pointer moved onto a different target (or off any). */
  onOver: (target: DropTarget | null) => void
  /** Released. `target` is null when dropped on nothing or cancelled. */
  onEnd: (drag: PassengerDrag, target: DropTarget | null) => void
}

const DROP_ATTR = 'data-drop'
/** Touch: how long to hold before the chip lifts. */
const HOLD_MS = 180
/** Movement tolerated before a mouse drag starts / during a touch hold. */
const SLOP_PX = 6
/** Auto-scroll band at the top and bottom of the viewport, and its top speed. */
const EDGE_PX = 64
const EDGE_SPEED_PX = 12

/**
 * How far to scroll this frame: nothing outside the band, then a quadratic
 * ramp so the inner edge of the band barely creeps and the screen edge moves
 * at full speed. A linear ramp drifts the board noticeably under a finger
 * that is merely resting on a card near the bottom of a phone screen.
 */
function edgeScroll(y: number): number {
  const fromTop = Math.max(y, 0)
  const fromBottom = Math.max(window.innerHeight - y, 0)
  if (fromTop < EDGE_PX) return -EDGE_SPEED_PX * (1 - fromTop / EDGE_PX) ** 2
  if (fromBottom < EDGE_PX) return EDGE_SPEED_PX * (1 - fromBottom / EDGE_PX) ** 2
  return 0
}

/** Spread onto an element to make it a drop zone. Pass null when it can't receive. */
export function dropZone(target: DropTarget | null): Record<string, string> {
  if (!target) return {}
  return { [DROP_ATTR]: target.kind === 'ride' ? `ride:${target.rideId}` : 'tray' }
}

export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  return a.kind === 'tray' || b.kind === 'tray' || a.rideId === b.rideId
}

function targetAt(x: number, y: number): DropTarget | null {
  const zone = document.elementFromPoint(x, y)?.closest(`[${DROP_ATTR}]`)
  const value = zone?.getAttribute(DROP_ATTR)
  if (!value) return null
  if (value === 'tray') return { kind: 'tray' }
  const rideId = Number(value.slice('ride:'.length))
  return Number.isFinite(rideId) ? { kind: 'ride', rideId } : null
}

function makeGhost(name: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'drag-ghost'
  el.setAttribute('aria-hidden', 'true')
  const grip = document.createElement('span')
  grip.className = 'grip'
  grip.textContent = '⠿'
  el.append(grip, document.createTextNode(name))
  document.body.append(el)
  return el
}

/**
 * Call from a chip's `onPointerDown`. Returns immediately; the drag itself is
 * driven by window-level pointer events until release.
 */
export function grabPassenger(
  e: React.PointerEvent<HTMLElement>,
  drag: PassengerDrag,
  handlers: DragHandlers,
): void {
  if (e.button !== 0 || !e.isPrimary) return
  // The driver's "remove" button lives inside the chip; leave clicks on it alone.
  if ((e.target as Element).closest('button')) return

  const handle = e.currentTarget
  const pointerId = e.pointerId
  const touch = e.pointerType !== 'mouse'
  const start = { x: e.clientX, y: e.clientY }
  let pos = { ...start }
  let lifted = false
  let over: DropTarget | null = null
  let ghost: HTMLElement | null = null
  let holdTimer: number | null = null
  let frame: number | null = null

  // A mouse-down on text would otherwise start a selection or a native drag.
  if (!touch) e.preventDefault()

  const prevent = (ev: Event) => ev.preventDefault()

  function lift() {
    lifted = true
    try {
      handle.setPointerCapture(pointerId)
    } catch {
      /* the pointer is gone already; the up/cancel handler will clean up */
    }
    if ('vibrate' in navigator) navigator.vibrate(10)
    document.body.classList.add('dragging')
    ghost = makeGhost(drag.name)
    handlers.onStart(drag)
    tick()
  }

  function tick() {
    // Auto-scroll at the edges, then re-read what is under the pointer: a
    // scrolling board moves targets under a finger that is standing still.
    const dy = edgeScroll(pos.y)
    if (dy) window.scrollBy(0, dy)
    if (ghost) {
      const { width, height } = ghost.getBoundingClientRect()
      const x = pos.x - width / 2
      const y = touch ? pos.y - height - 28 : pos.y - height / 2
      ghost.style.transform = `translate(${x}px, ${y}px)`
    }
    const next = targetAt(pos.x, pos.y)
    if (!sameTarget(next, over)) {
      over = next
      handlers.onOver(over)
    }
    frame = requestAnimationFrame(tick)
  }

  function finish(target: DropTarget | null) {
    const wasLifted = lifted
    cleanup()
    if (wasLifted) handlers.onEnd(drag, target)
  }

  function onMove(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    pos = { x: ev.clientX, y: ev.clientY }
    if (lifted) return
    const moved = Math.hypot(pos.x - start.x, pos.y - start.y) > SLOP_PX
    if (!moved) return
    // Touch: moving before the hold elapsed was a swipe, not a pick-up.
    if (touch) cleanup()
    else lift()
  }

  function onUp(ev: PointerEvent) {
    if (ev.pointerId === pointerId) finish(over)
  }

  function onCancel(ev: PointerEvent) {
    if (ev.pointerId === pointerId) finish(null)
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') finish(null)
  }

  function cleanup() {
    if (holdTimer !== null) clearTimeout(holdTimer)
    if (frame !== null) cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKey)
    handle.removeEventListener('contextmenu', prevent)
    try {
      handle.releasePointerCapture(pointerId)
    } catch {
      /* never captured */
    }
    document.body.classList.remove('dragging')
    ghost?.remove()
    ghost = null
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey)
  // Android shows a context menu on long-press; that is our pick-up gesture.
  handle.addEventListener('contextmenu', prevent)
  if (touch) holdTimer = window.setTimeout(lift, HOLD_MS)
}
