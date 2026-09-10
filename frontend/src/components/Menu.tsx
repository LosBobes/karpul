import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

interface Props {
  /** The trigger, rendered as-is inside the button. */
  trigger: ReactNode
  label: string
  items: MenuItem[]
  align?: 'left' | 'right'
  className?: string
}

/**
 * The ⋮ popover. Plain absolute positioning under the trigger; closes on an
 * outside tap, Escape, or choosing an item.
 */
export function Menu({ trigger, label, items, align = 'right', className }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className={['menu', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div id={id} role="menu" className={`menu-pop menu-pop-${align}`}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.danger ? 'menu-item menu-item-danger' : 'menu-item'}
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
            >
              {it.icon && <span className="menu-item-icon">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
