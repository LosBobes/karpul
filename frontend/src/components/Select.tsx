import { useId, useState, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { CheckIcon, ChevronDownIcon } from './icons'
import { Popover } from './Popover'

export interface SelectOption<T> {
  value: T
  label: string
  /** Secondary text after the label (a plate, a seat count). */
  hint?: string
}

interface Props<T> {
  value: T | null
  options: SelectOption<T>[]
  onChange: (value: T) => void
  label: string
  placeholder?: string
  disabled?: boolean
  icon?: ReactNode
}

/** A dropdown that looks the same on every platform: a control and a listbox popover. */
export function Select<T extends string | number>({ value, options, onChange, label, placeholder, disabled, icon }: Props<T>) {
  const t = useT()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const id = useId()
  const current = options.find((o) => o.value === value) ?? null

  return (
    <>
      <button
        type="button"
        className="control"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={anchor !== null}
        aria-controls={anchor ? id : undefined}
        disabled={disabled}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        {icon && <span className="control-icon">{icon}</span>}
        <span className={current ? 'control-value' : 'control-value control-placeholder'}>
          {current ? (
            <>
              {current.label}
              {current.hint && <span className="control-hint">{current.hint}</span>}
            </>
          ) : (
            (placeholder ?? t.common.choose)
          )}
        </span>
        <ChevronDownIcon size={18} className="control-chevron" />
      </button>
      {anchor && (
        <Popover id={id} role="listbox" aria-label={label} anchor={anchor} align="stretch" className="listbox" onClose={() => setAnchor(null)}>
          {options.map((o) => {
            const on = o.value === value
            return (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={on}
                className={on ? 'option option-on' : 'option'}
                onClick={() => {
                  onChange(o.value)
                  setAnchor(null)
                }}
              >
                <span className="option-text">
                  {o.label}
                  {o.hint && <span className="control-hint">{o.hint}</span>}
                </span>
                {on && <CheckIcon size={18} />}
              </button>
            )
          })}
        </Popover>
      )}
    </>
  )
}
