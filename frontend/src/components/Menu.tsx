import { useId, useState, type ReactNode } from 'react'
import { Popover } from './Popover'

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

/** The ⋮ popover menu. */
export function Menu({ trigger, label, items, align = 'right', className }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const id = useId()

  return (
    <div className={['menu', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        aria-controls={anchor ? id : undefined}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        {trigger}
      </button>
      {anchor && (
        <Popover id={id} role="menu" anchor={anchor} align={align} className="menu-pop" onClose={() => setAnchor(null)}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.danger ? 'menu-item menu-item-danger' : 'menu-item'}
              disabled={it.disabled}
              onClick={() => {
                setAnchor(null)
                it.onSelect()
              }}
            >
              {it.icon && <span className="menu-item-icon">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </Popover>
      )}
    </div>
  )
}
