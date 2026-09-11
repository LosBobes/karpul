import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBackClose } from '../lib/useBackClose'

interface Props {
  /** The element the popover hangs off. */
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  /** Which edge of the anchor to line up with; `stretch` also matches its width. */
  align?: 'left' | 'right' | 'stretch'
  className?: string
  role?: string
  'aria-label'?: string
  id?: string
}

/**
 * A floating panel rendered on <body> and positioned against its anchor, so
 * it is never clipped by a scrolling sheet body. Sits below the anchor and
 * flips above when the viewport runs out; closes on an outside tap, Escape,
 * or when the anchor scrolls away.
 */
export function Popover({ anchor, onClose, children, align = 'left', className, role, id, ...aria }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // The phone's back button closes the popover, and the sheet under it
  // stays open: the popover is the topmost layer.
  useBackClose(onClose)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !anchor) return
    const place = () => {
      const a = anchor.getBoundingClientRect()
      if (align === 'stretch') el.style.minWidth = `${a.width}px`
      const p = el.getBoundingClientRect()
      const pad = 8
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = align === 'right' ? a.right - p.width : a.left
      left = Math.max(pad, Math.min(left, vw - pad - p.width))
      let top = a.bottom + 4
      if (top + p.height > vh - pad) top = Math.max(pad, a.top - 4 - p.height)
      el.style.top = `${top}px`
      el.style.left = `${left}px`
      el.style.visibility = 'visible'
    }
    place()
    window.addEventListener('resize', place)
    // Scrolling the page or a sheet body moves the anchor; follow it.
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, align])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Both this and the sheet's Escape handler live on window, so only
        // stopImmediatePropagation keeps the sheet open when a popover closes.
        e.stopImmediatePropagation()
        onClose()
      }
    }
    document.addEventListener('pointerdown', onDown)
    // Capture phase, so the sheet behind does not also close on the same Escape.
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [anchor, onClose])

  return createPortal(
    <div ref={ref} id={id} role={role} {...aria} className={['popover', className].filter(Boolean).join(' ')} style={{ visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  )
}
