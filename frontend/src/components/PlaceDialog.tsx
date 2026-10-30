import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { useLocale } from '../lib/locale'
import { useClosing } from '../lib/motion'
import { HOME_VIEW } from '../lib/maps'
import { mapsOn, SEARCH_MIN, SEARCH_PAUSE_MS, useMapConfig } from '../lib/places'
import type { PlaceSuggestion, Point } from '../lib/types'
import { useBackClose } from '../lib/useBackClose'
import { useCoarsePointer } from '../lib/useCoarsePointer'
import { ArrowLeftIcon, CarIcon, ChevronRightIcon, PencilIcon, MapIcon, PinIcon, SearchIcon, XIcon } from './icons'
import { MapPicker } from './MapPicker'

interface Props {
  /** What the place is, for the title ("Drop-off location"). */
  title: string
  /** The words the place has now, and its pin. */
  value: string
  point: Point | null
  /** Another place of the route: the search looks there first and the map opens there. */
  near?: Point | null
  onPick?: (name: string, point: Point) => void
  onClose: () => void
  /** The words typed may be the place as they are, with no pin. */
  freeText?: boolean
  /**
   * One more step after the pick, in the same panel: what is shown under the
   * place picked (its form and button). Without it the pick is `onPick`.
   */
  confirm?: (place: Picked) => ReactNode
}

/** A place picked: its words, and its pin when it has one. */
export interface Picked {
  name: string
  point: Point | null
}

/** A found place goes to the map with the name it was found under. */
interface Spot {
  name: string
  point: Point | null
}

/**
 * Choosing a place, given the whole screen (a sheet on a desktop): a search
 * at the top, and under it the places Karpul knows (the offices, the shared
 * cars' homes, the places colleagues pinned) before anything is typed, the
 * matches and the addresses found once something is. A saved place is the
 * pick at once; an address, or *Pick on the map*, goes on to a big map with
 * a ring in the middle, to be nudged onto the exact spot and named.
 * Portalled to `<body>`: the form it opens from must not take its Enter.
 */
export function PlaceDialog({ title, value, point, near = null, onPick, onClose, freeText = false, confirm }: Props) {
  const t = useT()
  const locale = useLocale()
  const config = useMapConfig()
  const coarse = useCoarsePointer()
  const titleId = useId()
  const { closing, requestClose, onAnimationEnd } = useClosing(onClose)
  useBackClose(requestClose)

  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState<PlaceSuggestion[] | null>(null)
  const [found, setFound] = useState<{ q: string; list: PlaceSuggestion[] } | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [centre, setCentre] = useState<Point | null>(null)
  const [name, setName] = useState('')
  const [naming, setNaming] = useState(false)
  const [nameNeeded, setNameNeeded] = useState(false)
  const [chosen, setChosen] = useState<Picked | null>(null)

  // With a `confirm` step the pick goes there; else it is the answer.
  function done(words: string, pin: Point | null) {
    if (confirm) setChosen({ name: words, point: pin })
    else if (pin) onPick?.(words, pin)
  }

  // Escape steps back from the map, else closes; captured, so the form behind stays open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      if (chosen) setChosen(null)
      else if (spot) setSpot(null)
      else requestClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [chosen, spot, requestClose])

  useEffect(() => {
    const ctl = new AbortController()
    api.savedPlaces(ctl.signal).then(setSaved, () => setSaved([]))
    return () => ctl.abort()
  }, [])

  const q = query.trim()
  useEffect(() => {
    if (q.length < SEARCH_MIN) return
    const ctl = new AbortController()
    const timer = window.setTimeout(() => {
      api.places(q, locale, near, ctl.signal).then(
        (list) => setFound({ q, list }),
        () => {
          /* aborted, offline or throttled: the saved places still show */
        },
      )
    }, SEARCH_PAUSE_MS)
    return () => {
      window.clearTimeout(timer)
      ctl.abort()
    }
  }, [q, locale, near])

  const searching = q.length >= SEARCH_MIN
  const results = searching && found?.q === q ? found.list : null
  // While typing, the saved places that match stay in view until the answer comes.
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const shownSaved = searching
    ? (results?.filter((p) => p.source !== 'search') ?? (saved ?? []).filter((p) => fold(p.name).includes(fold(q))))
    : (saved ?? [])
  const addresses = results?.filter((p) => p.source === 'search') ?? []

  function toMap(next: Spot) {
    setSpot(next)
    // Where the map opens (MapPicker): the ring is on it before anything moves.
    setCentre(next.point ?? near ?? HOME_VIEW)
    setName(next.name)
    setNaming(false)
    setNameNeeded(false)
  }

  async function confirmPoint() {
    if (!centre) return
    let words = name.trim()
    if (!words) {
      setNaming(true)
      try {
        words = (await api.placeName(centre, locale)).name?.trim() ?? ''
      } catch {
        words = ''
      }
      setNaming(false)
    }
    if (!words) {
      // Nothing to call it by: the name field asks for one.
      setNameNeeded(true)
      document.getElementById(`${titleId}-name`)?.focus()
      return
    }
    done(words, centre)
  }

  const sourceLabel = (s: PlaceSuggestion['source']) =>
    s === 'office' ? t.map.sourceOffice : s === 'car_home' ? t.map.sourceCar : s === 'learned' ? t.map.sourceLearned : ''
  const hasMap = mapsOn(config)

  const row = (place: PlaceSuggestion, i: number, onClick: () => void) => (
    <li key={`${place.source}-${place.name}-${i}`}>
      <button type="button" className="place-row" onClick={onClick}>
        <span className={`place-row-icon place-row-${place.source}`} aria-hidden="true">
          {place.source === 'car_home' ? <CarIcon size={18} /> : place.source === 'search' ? <SearchIcon size={18} /> : <PinIcon size={18} />}
        </span>
        <span className="place-row-text">
          <span className="place-row-name">{place.name}</span>
          {sourceLabel(place.source) && <span className="place-row-kind">{sourceLabel(place.source)}</span>}
        </span>
        {place.source === 'search' && hasMap && <ChevronRightIcon size={16} />}
      </button>
    </li>
  )

  const pickSaved = (place: PlaceSuggestion) => done(place.name, { lat: place.lat, lng: place.lng })
  const typed = freeText ? query.trim().replace(/\s+/g, ' ') : ''
  // An address is only roughly where the door is: nudge it on the map, when there is one.
  const pickAddress = (place: PlaceSuggestion) =>
    hasMap ? toMap({ name: place.name, point: { lat: place.lat, lng: place.lng } }) : pickSaved(place)

  const body = chosen && confirm ? (
    <div className="place-dialog-confirm">
      <div className="place-row place-dialog-chosen">
        <span className="place-row-icon place-row-office" aria-hidden="true">
          <PinIcon size={18} />
        </span>
        <span className="place-row-text">
          <span className="place-row-name">{chosen.name}</span>
          <span className="place-row-kind">{chosen.point ? t.map.pinned : t.map.unpinned}</span>
        </span>
        <button type="button" className="link link-sm" onClick={() => setChosen(null)}>
          {t.common.edit}
        </button>
      </div>
      {confirm(chosen)}
    </div>
  ) : spot ? (
    <div className="place-dialog-map">
      <MapPicker
        embedded
        initial={spot.point}
        near={near}
        onMove={(p) => {
          setCentre(p)
          // Moved off the address it was found under (a zoom stays on it): the name is the person's to give.
          const off = !spot.point || Math.abs(p.lat - spot.point.lat) > 3e-4 || Math.abs(p.lng - spot.point.lng) > 3e-4
          if (off && spot.point && name === spot.name) setName(value.trim())
        }}
      />
      <div className="place-dialog-name">
        <label className="field">
          <span className="field-label">{t.map.placeName}</span>
          <input
            id={`${titleId}-name`}
            maxLength={120}
            placeholder={t.map.namePlaceholder}
            value={name}
            aria-invalid={nameNeeded || undefined}
            onChange={(e) => {
              setName(e.target.value)
              setNameNeeded(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void confirmPoint()
              }
            }}
          />
        </label>
        {nameNeeded && (
          <p className="error" role="alert">
            {t.map.nameNeeded}
          </p>
        )}
        <button type="button" className="btn btn-primary btn-block" disabled={!centre || naming} onClick={() => void confirmPoint()}>
          {t.map.usePoint}
        </button>
      </div>
    </div>
  ) : (
    <div className="place-dialog-list">
      <div className="place-dialog-search">
        <SearchIcon size={18} className="place-dialog-search-icon" />
        <input
          type="search"
          aria-label={t.map.searchPlaces}
          placeholder={t.map.searchPlacesPlaceholder}
          autoFocus={!coarse}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={120}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const first = shownSaved[0] ?? addresses[0]
            if (first) (first.source === 'search' ? pickAddress : pickSaved)(first)
            else if (typed) done(typed, null)
          }}
        />
        {query && (
          <button type="button" className="icon-btn icon-btn-sm" aria-label={t.common.clear} onClick={() => setQuery('')}>
            <XIcon size={16} />
          </button>
        )}
      </div>
      <div className="place-dialog-scroll">
        {typed && (
          <button type="button" className="place-row place-row-map" onClick={() => done(typed, null)}>
            <span className="place-row-icon" aria-hidden="true">
              <PencilIcon size={18} />
            </span>
            <span className="place-row-text">
              <span className="place-row-name">{t.map.useWords(typed)}</span>
            </span>
            <ChevronRightIcon size={16} />
          </button>
        )}
        {hasMap && (
          <button
            type="button"
            className="place-row place-row-map"
            onClick={() => toMap({ name: value.trim() || (searching ? query.trim() : ''), point: point ?? null })}
          >
            <span className="place-row-icon" aria-hidden="true">
              <MapIcon size={18} />
            </span>
            <span className="place-row-text">
              <span className="place-row-name">{point ? t.map.movePinShort : t.map.pickOnMap}</span>
            </span>
            <ChevronRightIcon size={16} />
          </button>
        )}
        {shownSaved.length > 0 && (
          <section aria-labelledby={`${titleId}-saved`}>
            <h3 className="place-dialog-head" id={`${titleId}-saved`}>
              {t.map.savedPlaces}
            </h3>
            <ul className="place-rows">{shownSaved.map((p, i) => row(p, i, () => pickSaved(p)))}</ul>
          </section>
        )}
        {addresses.length > 0 && (
          <section aria-labelledby={`${titleId}-found`}>
            <h3 className="place-dialog-head" id={`${titleId}-found`}>
              {t.map.addresses}
            </h3>
            <ul className="place-rows">{addresses.map((p, i) => row(p, i, () => pickAddress(p)))}</ul>
          </section>
        )}
        {saved === null && !searching && <p className="hint">{t.map.loading}</p>}
        {saved !== null && !searching && saved.length === 0 && <p className="hint">{t.map.noSaved}</p>}
        {searching && results !== null && shownSaved.length === 0 && addresses.length === 0 && <p className="hint">{t.map.nothingFound}</p>}
      </div>
    </div>
  )

  return createPortal(
    <div
      className={['backdrop', 'backdrop-top', 'backdrop-place', closing && 'backdrop-closing'].filter(Boolean).join(' ')}
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div className="panel panel-place" role="dialog" aria-modal="true" aria-labelledby={titleId} onAnimationEnd={onAnimationEnd}>
        <header className="panel-head place-dialog-top">
          {spot || chosen ? (
            <button type="button" className="icon-btn" aria-label={t.common.back} onClick={() => (chosen ? setChosen(null) : setSpot(null))}>
              <ArrowLeftIcon />
            </button>
          ) : null}
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label={t.common.close} onClick={requestClose}>
            <XIcon />
          </button>
        </header>
        <div className="panel-body place-dialog-body">{body}</div>
      </div>
    </div>,
    document.body,
  )
}
