import { useSyncExternalStore } from 'react'

/** Keep in step with the `min-width: 1024px` block at the end of index.css. */
const QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/**
 * True on a screen wide enough for two panes: the list (or the week's day
 * board) on the left and the open ride beside it, instead of one column.
 */
export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
