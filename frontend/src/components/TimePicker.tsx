import { useEffect, useId, useRef, useState } from 'react'
import { fmtTime } from '../lib/dates'
import { ClockIcon } from './icons'
import { Popover } from './Popover'

interface Props {
  /** "HH:MM", 24-hour, as the API speaks it. */
  value: string
  onChange: (hhmm: string) => void
  label: string
  disabled?: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Does this browser's locale write clock times with AM/PM? */
const TWELVE_HOUR = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === true

/** Hour and minute columns in a popover, replacing the native time input. Always the same UI. */
export function TimePicker({ value, onChange, label, disabled }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const id = useId()

  return (
    <>
      <button
        type="button"
        className="control"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-controls={anchor ? id : undefined}
        disabled={disabled}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <span className="control-icon">
          <ClockIcon size={16} />
        </span>
        <span className="control-value">{fmtTime(value)}</span>
      </button>
      {anchor && (
        <Popover id={id} role="dialog" aria-label={label} anchor={anchor} className="time-pop" onClose={() => setAnchor(null)}>
          <Columns value={value} onChange={onChange} />
          <div className="popover-foot">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAnchor(null)}>
              Done
            </button>
          </div>
        </Popover>
      )}
    </>
  )
}

function Columns({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const [h, m] = value.split(':').map(Number)
  const set = (hour: number, minute: number) => onChange(`${pad(hour)}:${pad(minute)}`)

  // Five-minute steps, plus the stored minute if it is off the grid so it stays selectable.
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5)
  if (!minutes.includes(m)) {
    minutes.push(m)
    minutes.sort((a, b) => a - b)
  }

  if (!TWELVE_HOUR) {
    return (
      <div className="timepick">
        <Column label="Hour" items={Array.from({ length: 24 }, (_, i) => ({ v: i, text: pad(i) }))} value={h} onPick={(v) => set(v, m)} />
        <Column label="Minute" items={minutes.map((v) => ({ v, text: pad(v) }))} value={m} onPick={(v) => set(h, v)} />
      </div>
    )
  }

  const pm = h >= 12
  const h12 = h % 12 === 0 ? 12 : h % 12
  const to24 = (hour12: number, isPm: boolean) => (hour12 % 12) + (isPm ? 12 : 0)
  return (
    <div className="timepick">
      <Column
        label="Hour"
        items={[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((v) => ({ v, text: String(v) }))}
        value={h12}
        onPick={(v) => set(to24(v, pm), m)}
      />
      <Column label="Minute" items={minutes.map((v) => ({ v, text: pad(v) }))} value={m} onPick={(v) => set(h, v)} />
      <Column
        label="AM or PM"
        items={[
          { v: 0, text: 'AM' },
          { v: 1, text: 'PM' },
        ]}
        value={pm ? 1 : 0}
        onPick={(v) => set(to24(h12, v === 1), m)}
      />
    </div>
  )
}

function Column({ label, items, value, onPick }: { label: string; items: { v: number; text: string }[]; value: number; onPick: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Open with the current value in view rather than at 00.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' })
  }, [])
  return (
    <div ref={ref} className="timepick-col" role="listbox" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.v}
          type="button"
          role="option"
          aria-selected={it.v === value}
          className={it.v === value ? 'option option-on' : 'option'}
          onClick={() => onPick(it.v)}
        >
          {it.text}
        </button>
      ))}
    </div>
  )
}
