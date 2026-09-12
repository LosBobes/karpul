import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useT } from '../lib/i18n'
import { PlusIcon } from './icons'

/** How long the pressed look is held at least, so a quick tap still shows the
 * full contraction before the spring back (the CSS press takes 80ms). */
const MIN_PRESS_MS = 90

/**
 * The pressed state, driven by pointer and key events instead of `:active`.
 * Touch browsers hold `:active` back until they are sure the finger is not
 * about to scroll, and Chrome then keeps it on for a while after the finger
 * lifts as its own tap feedback, so on a phone the plus reacted late on the
 * way down and hung at the pressed size on the way up; pointerdown fires on
 * the first touch and pointerup the moment it lifts. The keyboard (space or
 * enter on the button) goes through the same state.
 */
function usePressed() {
  const [pressed, setPressed] = useState(false)
  const downAt = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const down = useCallback(() => {
    window.clearTimeout(timer.current)
    downAt.current = performance.now()
    setPressed(true)
  }, [])
  const up = useCallback(() => {
    window.clearTimeout(timer.current)
    const left = MIN_PRESS_MS - (performance.now() - downAt.current)
    if (left > 0) timer.current = window.setTimeout(() => setPressed(false), left)
    else setPressed(false)
  }, [])
  const isPressKey = (e: KeyboardEvent<HTMLElement>) => e.key === ' ' || e.key === 'Enter'
  return {
    pressed,
    onPointerDown: down,
    onPointerUp: up,
    onPointerCancel: up,
    onPointerLeave: up,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (isPressKey(e) && !e.repeat) down()
    },
    onKeyUp: (e: KeyboardEvent<HTMLElement>) => {
      if (isPressKey(e)) up()
    },
  }
}

/**
 * The one way to add a ride: a white plus in a green circle, floating at the
 * bottom right of the column on both views whenever a ride can be added. It
 * is deliberately the only add control on the screen (no tile in the
 * carousel, no plus in the empty card, no drawer item), so there is one place
 * to look for it.
 */
function PlusCircle({ size }: { size: number }) {
  return (
    <span className="plus-circle" style={{ width: size, height: size }} aria-hidden="true">
      <PlusIcon size={Math.round(size * 0.5)} weight="bold" />
    </span>
  )
}

export function AddRideFab({ onClick }: { onClick: () => void }) {
  const t = useT()
  const { pressed, ...press } = usePressed()
  return (
    <button
      type="button"
      className={pressed ? 'fab fab-pressed' : 'fab'}
      aria-label={t.fab.addRide}
      title={t.fab.addRide}
      onClick={onClick}
      {...press}
    >
      <PlusCircle size={60} />
    </button>
  )
}
