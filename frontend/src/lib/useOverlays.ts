import { useCallback, useRef, useState } from 'react'

/**
 * Which sheets and drawers are open, by name. One open set instead of a
 * boolean per overlay: `show`/`hide` are stable, and `closer(name)` is a
 * stable callback for a sheet's `onClose` (useClosing keeps it in a ref, but
 * a new function every render would still re-run effects that depend on it).
 */
export function useOverlays<K extends string>() {
  const [open, setOpen] = useState<ReadonlySet<K>>(() => new Set())
  const show = useCallback((name: K) => setOpen((prev) => (prev.has(name) ? prev : new Set(prev).add(name))), [])
  const hide = useCallback(
    (name: K) =>
      setOpen((prev) => {
        if (!prev.has(name)) return prev
        const next = new Set(prev)
        next.delete(name)
        return next
      }),
    [],
  )
  const closers = useRef(new Map<K, () => void>())
  const closer = useCallback(
    (name: K) => {
      const known = closers.current.get(name)
      if (known) return known
      const fn = () => hide(name)
      closers.current.set(name, fn)
      return fn
    },
    [hide],
  )
  const is = useCallback((name: K) => open.has(name), [open])
  return { is, show, hide, closer }
}
