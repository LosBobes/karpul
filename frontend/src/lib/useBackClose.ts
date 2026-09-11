import { useEffect, useRef } from 'react'

/**
 * Makes the browser's back button (and the swipe-back gesture) close the
 * topmost overlay instead of leaving the page. On a phone the hardware back
 * is how people dismiss a menu, and without this a tap on it threw them out
 * of Karpul with a sheet still open.
 *
 * The first overlay to open pushes ONE history entry; every overlay opened
 * on top of it (a confirm over a sheet, a menu inside a form) joins an
 * in-memory stack instead of pushing more. Back pops the entry: the topmost
 * overlay closes and, if others remain, the entry is pushed again so the next
 * back closes the next one. Closing an overlay any other way pops the entry
 * when it was the last one, so the history never carries a dead entry that
 * would swallow a back press.
 *
 * The pop after a programmatic close is deferred a tick: the drawer closes
 * and the sheet it picked opens in the same commit, and the sheet must take
 * over the entry rather than have it pulled from under it.
 */

interface Layer {
  close: () => void
}

const STATE = { karpulLayer: true }
const stack: Layer[] = []

function hasEntry(): boolean {
  return (history.state as { karpulLayer?: unknown } | null)?.karpulLayer === true
}

function onPopState() {
  if (hasEntry()) {
    // Only the forward button lands here: nothing is open, so bounce back to
    // the page entry rather than leave a dead one in front of it.
    if (stack.length === 0) history.back()
    return
  }
  const top = stack.pop()
  if (!top) return
  if (stack.length > 0) history.pushState(STATE, '')
  top.close()
}

// A reload with an overlay open keeps its entry as the current one; drop the
// marker so the next back press is not spent on it.
if (hasEntry()) history.replaceState(null, '')
window.addEventListener('popstate', onPopState)

/** Register the calling overlay as an open layer for as long as it is mounted. */
export function useBackClose(onClose: () => void) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const layer: Layer = { close: () => closeRef.current() }
    if (!hasEntry()) history.pushState(STATE, '')
    stack.push(layer)
    return () => {
      const i = stack.indexOf(layer)
      if (i >= 0) stack.splice(i, 1)
      queueMicrotask(() => {
        if (stack.length === 0 && hasEntry()) history.back()
      })
    }
  }, [])
}
