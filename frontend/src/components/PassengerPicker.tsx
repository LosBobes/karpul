import { useEffect, useId, useState } from 'react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { addable, type Person } from '../lib/people'
import type { Ride } from '../lib/types'
import { Avatar } from './Avatar'
import { SearchIcon, XIcon } from './icons'

interface Props {
  ride: Ride
  busy: boolean
  onPick: (person: Person) => void
  onCancel: () => void
}

/** At most this many names under the search box; typing narrows it down. */
const SHOWN = 8

/**
 * Putting a colleague in the car: a search over the people with an account,
 * never a typed name (backend: join_ride refuses one nobody answers to).
 */
export function PassengerPicker({ ride, busy, onPick, onCancel }: Props) {
  const t = useT()
  const listId = useId()
  const [people, setPeople] = useState<Person[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    api
      .people()
      .then((p) => live && setPeople(p))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  const matches = people ? addable(people, ride, query) : []
  const shown = matches.slice(0, SHOWN)

  return (
    <div className="pax-pick people-pick">
      <div className="pax-add">
        <label className="input-icon people-pick-search">
          <SearchIcon size={16} />
          <input
            type="text"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={t.detail.findColleague}
            placeholder={t.detail.findColleague}
            maxLength={80}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter takes the only match left, the way a search box should.
              if (e.key === 'Enter') {
                e.preventDefault()
                if (shown.length === 1 && !busy) onPick(shown[0])
              }
            }}
          />
        </label>
        <button type="button" className="icon-btn" aria-label={t.common.cancel} onClick={onCancel}>
          <XIcon size={18} />
        </button>
      </div>
      <div id={listId} className="listbox people-pick-list" role="listbox" aria-label={t.detail.findColleague}>
        {people === null ? (
          <p className="people-pick-note">{failed ? t.common.somethingWrong : t.common.loading}</p>
        ) : shown.length === 0 ? (
          <p className="people-pick-note">{t.form.noPeople}</p>
        ) : (
          shown.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={false}
              className="option people-pick-option"
              disabled={busy}
              onClick={() => onPick(p)}
            >
              <Avatar name={p.display_name} size="sm" />
              <span className="option-text">{p.display_name}</span>
            </button>
          ))
        )}
        {matches.length > SHOWN && <p className="people-pick-note">{t.detail.moreColleagues(matches.length - SHOWN)}</p>}
      </div>
    </div>
  )
}
