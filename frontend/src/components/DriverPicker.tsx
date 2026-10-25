import { useEffect, useId, useState } from 'react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import type { AdminUser } from '../lib/types'
import { Avatar } from './Avatar'
import { CheckIcon, ChevronDownIcon, SearchIcon } from './icons'
import { Popover } from './Popover'

export interface Driver {
  id: number
  name: string
}

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

interface Props {
  value: Driver
  /** The admin filling in the form: listed first, as "you". */
  meId: number
  onChange: (driver: Driver) => void
}

/**
 * The form's driver line, for an admin adding a ride: the same line that
 * says who drives, made into a control. A tap lists everyone with an account,
 * with a search box, so a company car can be booked in a colleague's name.
 * Everyone else gets the plain line (the ride is theirs).
 */
export function DriverPicker({ value, meId, onChange }: Props) {
  const t = useT()
  const id = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [people, setPeople] = useState<AdminUser[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!anchor || people !== null) return
    api
      .users()
      .then(setPeople)
      .catch(() => setFailed(true))
  }, [anchor, people])

  const q = fold(query.trim())
  const shown = (people ?? [])
    .filter((p) => !q || fold(`${p.display_name} ${p.username}`).includes(q))
    // You first, then everyone by name.
    .sort((a, b) => Number(b.id === meId) - Number(a.id === meId) || a.display_name.localeCompare(b.display_name))

  return (
    <>
      <button
        type="button"
        className="form-driver form-driver-pick"
        aria-haspopup="listbox"
        aria-expanded={anchor !== null}
        aria-controls={anchor ? id : undefined}
        aria-label={t.form.pickDriver(value.name)}
        onClick={(e) => {
          setQuery('')
          setAnchor(anchor ? null : e.currentTarget)
        }}
      >
        <Avatar name={value.name} size="sm" />
        <span className="form-driver-name">{value.name}</span>
        <span className="form-driver-role">{value.id === meId ? t.form.driver : t.form.drivenBy}</span>
        <ChevronDownIcon size={18} className="control-chevron" />
      </button>
      {anchor && (
        <Popover id={id} role="dialog" aria-label={t.form.pickDriverTitle} anchor={anchor} align="stretch" className="people-pick" onClose={() => setAnchor(null)}>
          <label className="input-icon people-pick-search">
            <SearchIcon size={16} />
            <input
              type="search"
              autoFocus
              placeholder={t.form.searchPeople}
              aria-label={t.form.searchPeople}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="listbox people-pick-list" role="listbox" aria-label={t.form.pickDriverTitle}>
            {people === null ? (
              <p className="people-pick-note">{failed ? t.common.somethingWrong : t.common.loading}</p>
            ) : shown.length === 0 ? (
              <p className="people-pick-note">{t.form.noPeople}</p>
            ) : (
              shown.map((p) => {
                const on = p.id === value.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={on ? 'option option-on people-pick-option' : 'option people-pick-option'}
                    onClick={() => {
                      onChange({ id: p.id, name: p.display_name })
                      setAnchor(null)
                    }}
                  >
                    <Avatar name={p.display_name} size="sm" />
                    <span className="option-text">
                      {p.display_name}
                      <span className="control-hint">{p.id === meId ? t.detail.you : `@${p.username}`}</span>
                    </span>
                    {on && <CheckIcon size={18} />}
                  </button>
                )
              })
            )}
          </div>
        </Popover>
      )}
    </>
  )
}
