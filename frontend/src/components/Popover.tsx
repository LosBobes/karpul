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
 * flips above when the viewport runs out, but never leaves the viewport; it
 * follows the anchor every frame, because the board can reflow under it (a
 * live update) without anything scrolling. Closes on an outside tap or
 * Escape. It grows out of the anchor's edge (the
 * `popover-up` class and `transform-origin` say which), so placement reads
 * the layout size (`offsetWidth`) rather than the scaled bounding box.
 */
export function Popover({ anchor, onClose, children, align = 'left', className, role, id, ...aria }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // The phone's back button closes the popover, and the sheet under it
  // stays open: the popover is the topmost layer.
  useBackClose(onClose)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !anchor) return
    const place = (a: DOMRect) => {
      if (align === 'stretch') el.style.minWidth = `${a.width}px`
      const width = el.offsetWidth
      const height = el.offsetHeight
      const pad = 8
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = align === 'right' ? a.right - width : a.left
      left = Math.max(pad, Math.min(left, vw - pad - width))
      let top = a.bottom + 4
      const up = top + height > vh - pad
      if (up) top = Math.max(pad, Math.min(a.top - 4 - height, vh - pad - height))
      el.style.top = `${top}px`
      el.style.left = `${left}px`
      el.style.transformOrigin = `${up ? 'bottom' : 'top'} ${align === 'right' ? 'right' : 'left'}`
      el.classList.toggle('popover-up', up)
      el.style.visibility = 'visible'
    }
    // Scrolling, a resize or a reflow moves the anchor; place again only when it moved.
    let last = ''
    let frame = 0
    const follow = () => {
      const a = anchor.getBoundingClientRect()
      const key = `${a.left} ${a.top} ${a.width} ${a.height} ${window.innerWidth} ${window.innerHeight}`
      if (key !== last) {
        last = key
        place(a)
      }
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
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
    <div
      ref={ref}
      id={id}
      role={role}
      {...aria}
      className={['popover', className].filter(Boolean).join(' ')}
      style={{ visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}
