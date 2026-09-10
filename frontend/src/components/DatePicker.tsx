import { useId, useState } from 'react'
import { addDays, fmtShortDate, parseISODate, startOfWeek, toISODate, todayISO } from '../lib/dates'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { Popover } from './Popover'

interface Props {
  value: string
  onChange: (iso: string) => void
  label: string
  disabled?: boolean
  /** `control` is a form field; `link` is the small "Jump to…" text button. */
  variant?: 'control' | 'link'
  linkText?: string
}

/** A month calendar in a popover, replacing the native date input. */
export function DatePicker({ value, onChange, label, disabled, variant = 'control', linkText = 'Jump to…' }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const id = useId()

  return (
    <>
      <button
        type="button"
        className={variant === 'link' ? 'link' : 'control'}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-controls={anchor ? id : undefined}
        disabled={disabled}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        {variant === 'link' ? (
          linkText
        ) : (
          <>
            <span className="control-icon">
              <CalendarIcon size={16} />
            </span>
            <span className="control-value">{fmtShortDate(value)}</span>
          </>
        )}
      </button>
      {anchor && (
        <Popover id={id} role="dialog" aria-label={label} anchor={anchor} align={variant === 'link' ? 'right' : 'left'} className="cal-pop" onClose={() => setAnchor(null)}>
          <Calendar
            value={value}
            onPick={(iso) => {
              onChange(iso)
              setAnchor(null)
            }}
          />
        </Popover>
      )}
    </>
  )
}

function Calendar({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const selected = parseISODate(value)
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  const today = todayISO()

  // Six rows from the Monday on or before the 1st, so the grid never jumps in height.
  const first = startOfWeek(view)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i))
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays(first, i).toLocaleDateString(undefined, { weekday: 'narrow' }))
  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1))

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeftIcon />
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="cal-grid" role="grid">
        {weekdays.map((w, i) => (
          <span key={i} className="cal-wd" aria-hidden="true">
            {w}
          </span>
        ))}
        {cells.map((d) => {
          const iso = toISODate(d)
          const cls = [
            'cal-day',
            d.getMonth() !== view.getMonth() && 'cal-day-out',
            iso === today && 'cal-day-today',
            iso === value && 'cal-day-selected',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button key={iso} type="button" className={cls} aria-pressed={iso === value} aria-label={fmtShortDate(iso)} onClick={() => onPick(iso)}>
              {d.getDate()}
            </button>
          )
        })}
      </div>
      <div className="cal-foot">
        <button
          type="button"
          className="link"
          onClick={() => {
            setView(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
            onPick(today)
          }}
        >
          Today
        </button>
      </div>
    </div>
  )
}
