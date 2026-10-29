import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { useLocale } from '../lib/locale'
import { mapsOn, SEARCH_MIN, SEARCH_PAUSE_MS, useMapConfig } from '../lib/places'
import type { PlaceSuggestion, Point } from '../lib/types'
import { MapIcon, PinIcon } from './icons'
import { Popover } from './Popover'

interface Props {
  value: string
  /** The pin the place has, when it has one. */
  point: Point | null
  /** New words, and the pin that goes with them: a suggestion's, or none
   *  when the words were typed (a pin is about the words it was put on). */
  onChange: (value: string, point: Point | null) => void
  /** Another place of the route, so the search looks nearby first. */
  near?: Point | null
  /** Open the map picker for this place; without it there is no map entry. */
  onMap?: () => void
  label: string
  placeholder?: string
  required?: boolean
  autoFocus?: boolean
  maxLength?: number
}

/**
 * A place, typed: a text input that suggests as you type, the places Karpul
 * knows first (the offices, the shared cars' homes, places colleagues pinned)
 * and then what the server's place search finds, with *Pick on the map* last
 * (the list opens only when something is found).
 * Picking a suggestion sets the words and the pin together. Typing words
 * nobody suggested is fine too: the place is then just its words. The small
 * map button beside it says whether the place is pinned and opens the picker.
 * No native datalist: the suggestions are a `Popover`, like every other list.
 */
export function PlaceInput({ value, point, onChange, near, onMap, label, placeholder, required, autoFocus, maxLength = 120 }: Props) {
  const t = useT()
  const locale = useLocale()
  const config = useMapConfig()
  const id = useId()
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [found, setFound] = useState<PlaceSuggestion[]>([])
  const [active, setActive] = useState(-1)
  const [query, setQuery] = useState<string | null>(null)
  const map = onMap && mapsOn(config)

  // Ask once the typing pauses; a newer question cancels the one in flight.
  useEffect(() => {
    if (query === null) return
    const q = query.trim()
    if (q.length < SEARCH_MIN) return
    const ctl = new AbortController()
    const timer = window.setTimeout(() => {
      api.places(q, locale, near ?? null, ctl.signal).then(
        (list) => {
          setFound(list)
          setActive(-1)
        },
        () => {
          /* aborted, offline or throttled: no suggestions, the words still count */
        },
      )
    }, SEARCH_PAUSE_MS)
    return () => {
      window.clearTimeout(timer)
      ctl.abort()
    }
  }, [query, locale, near])

  const choices = found.length + (map ? 1 : 0)
  // Only real suggestions open the list (the map entry rides along at its
  // foot); the pin button beside the field is always the way to the map.
  const showing = open && query !== null && query.trim().length >= SEARCH_MIN && found.length > 0

  function choose(i: number) {
    if (i < found.length) {
      const place = found[i]
      onChange(place.name, { lat: place.lat, lng: place.lng })
    } else if (map) {
      onMap?.()
    }
    setOpen(false)
    setQuery(null)
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!showing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % choices)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a <= 0 ? choices - 1 : a - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      // A pick, not the form's submit.
      e.preventDefault()
      choose(active)
    }
  }

  const sourceLabel = (s: PlaceSuggestion['source']) =>
    s === 'office' ? t.map.sourceOffice : s === 'car_home' ? t.map.sourceCar : s === 'learned' ? t.map.sourceLearned : ''

  return (
    <span className="place-input">
      <input
        ref={setInput}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={showing ? id : undefined}
        aria-activedescendant={showing && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        required={required}
        autoFocus={autoFocus}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value, null)
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={onKey}
        // Leaving the field puts the list away; a pick keeps the focus (onMouseDown below).
        onBlur={() => setOpen(false)}
      />
      {map && (
        <button
          type="button"
          className={point ? 'place-pin place-pin-on' : 'place-pin'}
          aria-label={point ? t.map.movePin(value || label) : t.map.pickOnMap}
          title={point ? t.map.pinned : t.map.pickOnMap}
          onClick={onMap}
        >
          {point ? <PinIcon size={16} /> : <MapIcon size={16} />}
        </button>
      )}
      {showing && (
        <Popover id={id} role="listbox" aria-label={label} anchor={input} align="stretch" className="listbox place-list" onClose={() => setOpen(false)}>
          {found.map((place, i) => (
            <button
              key={`${place.name}-${i}`}
              id={`${id}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? 'option option-active' : 'option'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <PinIcon size={16} />
              <span className="option-text">
                {place.name}
                {sourceLabel(place.source) && <span className="control-hint">{sourceLabel(place.source)}</span>}
              </span>
            </button>
          ))}
          {map && (
            <button
              id={`${id}-${found.length}`}
              type="button"
              role="option"
              aria-selected={active === found.length}
              className={active === found.length ? 'option option-map option-active' : 'option option-map'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(found.length)}
            >
              <MapIcon size={16} />
              <span className="option-text">{t.map.pickOnMap}</span>
            </button>
          )}
        </Popover>
      )}
    </span>
  )
}
