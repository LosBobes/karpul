import { useEffect, useState } from 'react'

/** How long a form sits untouched before it starts to fidget. */
export const IDLE_MS = 4000

/**
 * True once nothing has been pressed, typed or dragged for `ms`: the form then
 * fidgets a little (styles under `.report-idle`), and stops at the next touch.
 */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), ms)
    const wake = () => {
      window.clearTimeout(timer)
      setIdle(false)
      timer = window.setTimeout(() => setIdle(true), ms)
    }
    const events = ['pointerdown', 'keydown', 'input', 'wheel'] as const
    for (const e of events) window.addEventListener(e, wake, true)
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, wake, true)
    }
  }, [ms])
  return idle
}
