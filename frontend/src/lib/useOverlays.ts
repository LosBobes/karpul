import { useCallback, useMemo, useRef } from 'react'
import { useKept } from './keep'

/**
 * Which sheets and drawers are open, by name. One open set instead of a
 * boolean per overlay: `show`/`hide` are stable, and `closer(name)` is a
 * stable callback for a sheet's `onClose` (useClosing keeps it in a ref, but
 * a new function every render would still re-run effects that depend on it).
 *
 * With a `keepKey` the open set comes back after a reload (lib/keep.ts), all
 * but the names in `transient` (a screen that only makes sense this visit).
 */
export function useOverlays<K extends string>(keepKey = 'overlays', transient: readonly K[] = []) {
  const [kept, setKept] = useKept<K[]>(keepKey, [], (names) => names.filter((k) => !transient.includes(k)))
  const open = useMemo<ReadonlySet<K>>(() => new Set(kept), [kept])
  const show = useCallback((name: K) => setKept((prev) => (prev.includes(name) ? prev : [...prev, name])), [setKept])
  const hide = useCallback((name: K) => setKept((prev) => (prev.includes(name) ? prev.filter((k) => k !== name) : prev)), [setKept])
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
