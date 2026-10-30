import { useEffect, useId, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { foldName } from '../lib/dates'
import { useT } from '../lib/i18n'
import { pinsFor } from '../lib/maps'
import { useClosing } from '../lib/motion'
import { MAX_STOPS, stopSlots } from '../lib/stops'
import type { Point, Ride, RideInput } from '../lib/types'
import { useBackClose } from '../lib/useBackClose'
import { ChevronRightIcon, PinIcon, PlusIcon, XIcon } from './icons'
import { PlaceDialog, type Picked } from './PlaceDialog'
import { Select } from './Select'

type RoutePatch = Pick<RideInput, 'origin' | 'destination' | 'stops' | 'stops_before' | 'points'>

interface Props {
  ride: Ride
  busy: boolean
  onSave: (patch: RoutePatch) => void
  onClose: () => void
}

/** The route being edited: the stops before the start, the start, the stops on the way, the end. */
interface Draft {
  before: string[]
  origin: string
  after: string[]
  destination: string
}

/** Which place the place picker is open for: the start, the end, a stop at its index in `places`, or a new one. */
type Editing = { kind: 'start' } | { kind: 'end' } | { kind: 'stop'; at: number } | { kind: 'new' }

const placesOf = (d: Draft) => [...d.before, d.origin, ...d.after, d.destination]

/** The route without the place at `at` (a stop: never the start or the end). */
function without(d: Draft, at: number): Draft {
  return at < d.before.length
    ? { ...d, before: d.before.filter((_, i) => i !== at) }
    : { ...d, after: d.after.filter((_, i) => i !== at - d.before.length - 1) }
}

/** The route with `place` in the gap `slot` of `stopSlots(d)`. */
function inserted(d: Draft, slot: number, place: string): Draft {
  const s = stopSlots({ stops_before: d.before, stops: d.after, origin: d.origin, destination: d.destination })[slot]
  if (!s) return d
  const into = (list: string[]) => [...list.slice(0, s.index), place, ...list.slice(s.index)]
  return s.before ? { ...d, before: into(d.before) } : { ...d, after: into(d.after) }
}

/**
 * The whole route of a ride on one screen, for whoever runs it (the same
 * full-screen panel as `PlaceDialog`): the start, every pickup point in the
 * order the car reaches them, with who gets in where, and the destination.
 * A tap on a place picks it again in `PlaceDialog` (a stop also says where on
 * the way it goes, so that is how one moves), × takes a stop off, and *Add a
 * pickup point* puts a new one in. Nothing is sent until *Save route*, which
 * is one PATCH of the route and its pins; a passenger whose pickup point is
 * gone gets in at the start (the server's `drop_orphaned_pickups`), which the
 * foot says before it happens.
 */
export function RouteEditor({ ride, busy, onSave, onClose }: Props) {
  const t = useT()
  const titleId = useId()
  const { closing, requestClose, onAnimationEnd } = useClosing(onClose)
  useBackClose(requestClose)

  const [draft, setDraft] = useState<Draft>(() => ({
    before: ride.stops_before ?? [],
    origin: ride.origin,
    after: ride.stops,
    destination: ride.destination,
  }))
  const [pins, setPins] = useState<Record<string, Point>>(() => ({ ...(ride.points ?? {}) }))
  const [editing, setEditing] = useState<Editing | null>(null)
  const [slot, setSlot] = useState(0)

  // Escape closes the route, but not while the place picker over it has it.
  useEffect(() => {
    if (editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      requestClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editing, requestClose])

  const places = placesOf(draft)
  const start = draft.before.length
  const last = places.length - 1
  const pinOf = (place: string): Point | null => pins[foldName(place)] ?? null
  const full = draft.before.length + draft.after.length >= MAX_STOPS
  const onRoute = new Set(places.map(foldName))

  const riders = (place: string, at: number) =>
    ride.bookings.filter((b) => (at === start ? !b.pickup : b.pickup && foldName(b.pickup) === foldName(place))).map((b) => b.passenger_name)
  // Seats at a pickup point that is no longer on the route go to the start.
  const keptStops = new Set([...draft.before, ...draft.after].map(foldName))
  const moved = ride.bookings.filter((b) => b.pickup && !keptStops.has(foldName(b.pickup))).map((b) => b.passenger_name)

  const saved = { before: ride.stops_before ?? [], origin: ride.origin, after: ride.stops, destination: ride.destination }
  const changed =
    placesOf(saved).join('\n') !== places.join('\n') ||
    places.some((p) => JSON.stringify(pinOf(p)) !== JSON.stringify(ride.points?.[foldName(p)] ?? null))

  function open(next: Editing) {
    if (next.kind === 'stop') setSlot(next.at)
    else if (next.kind === 'new') {
      // Just after the start, like a passenger's offer.
      setSlot(start + 1)
    }
    setEditing(next)
  }

  function pinned(name: string, point: Point | null) {
    if (point) setPins((p) => ({ ...p, [foldName(name)]: point }))
  }

  function apply(place: Picked) {
    if (!editing) return
    const name = place.name.trim().replace(/\s+/g, ' ')
    if (!name) return
    pinned(name, place.point)
    setDraft((d) => {
      if (editing.kind === 'start') return { ...d, origin: name }
      if (editing.kind === 'end') return { ...d, destination: name }
      const rest = editing.kind === 'stop' ? without(d, editing.at) : d
      // A place already on the route is not put on it twice.
      if (placesOf(rest).some((p) => foldName(p) === foldName(name))) return rest
      return inserted(rest, slot, name)
    })
    setEditing(null)
  }

  function save() {
    onSave({
      origin: draft.origin,
      destination: draft.destination,
      stops_before: draft.before,
      stops: draft.after,
      points: pinsFor(places, pins),
    })
  }

  // The gaps a stop being picked can go into: the route without it.
  const base = editing?.kind === 'stop' ? without(draft, editing.at) : draft
  const options = stopSlots({ stops_before: base.before, stops: base.after, origin: base.origin, destination: base.destination }).map((s, i) => ({
    value: i,
    label: s.after === null ? t.detail.slotFirst(s.next) : t.detail.slotBetween(s.after, s.next),
  }))

  const roleOf = (i: number) => (i === start ? t.detail.routeStart : i === last ? t.detail.routeEnd : t.detail.routeStop)
  const editingPlace = editing?.kind === 'start' ? draft.origin : editing?.kind === 'end' ? draft.destination : editing?.kind === 'stop' ? places[editing.at] : ''

  return createPortal(
    <div
      className={['backdrop', 'backdrop-top', 'backdrop-place', closing && 'backdrop-closing'].filter(Boolean).join(' ')}
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div className="panel panel-place" role="dialog" aria-modal="true" aria-labelledby={titleId} onAnimationEnd={onAnimationEnd}>
        <header className="panel-head place-dialog-top">
          <h2 id={titleId}>{t.detail.routeTitle}</h2>
          <button type="button" className="icon-btn" aria-label={t.common.close} onClick={requestClose}>
            <XIcon />
          </button>
        </header>
        <div className="panel-body place-dialog-body">
          <div className="place-dialog-scroll route-editor">
            <ol className="place-rows route-rows">
              {places.map((place, i) => {
                const who = riders(place, i)
                const stop = i !== start && i !== last
                return (
                  <li key={`${i}-${place}`} className={i === start ? 'route-row-start' : i === last ? 'route-row-end' : 'route-row-stop'}>
                    <button
                      type="button"
                      className="place-row"
                      onClick={() => open(i === start ? { kind: 'start' } : i === last ? { kind: 'end' } : { kind: 'stop', at: i })}
                    >
                      <span className={stop ? 'place-row-icon' : 'place-row-icon place-row-office'} aria-hidden="true">
                        <PinIcon size={18} />
                      </span>
                      <span className="place-row-text">
                        <span className="place-row-name">{place}</span>
                        <span className="place-row-kind">
                          {roleOf(i)}
                          {pinOf(place) ? ` · ${t.map.pinned}` : ''}
                        </span>
                        {who.length > 0 && i !== last && <span className="place-row-kind">{t.detail.gettingInHere(who)}</span>}
                      </span>
                      <ChevronRightIcon size={16} />
                    </button>
                    {stop && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t.detail.removeNamed(place)}
                        onClick={() => setDraft((d) => without(d, i))}
                      >
                        <XIcon size={18} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
            <button type="button" className="place-row place-row-map" disabled={full} onClick={() => open({ kind: 'new' })}>
              <span className="place-row-icon" aria-hidden="true">
                <PlusIcon size={18} />
              </span>
              <span className="place-row-text">
                <span className="place-row-name">{t.detail.addStop}</span>
                {full && <span className="place-row-kind">{t.detail.routeFull}</span>}
              </span>
            </button>
          </div>
          <div className="place-dialog-name">
            {moved.length > 0 && <p className="hint">{t.detail.toStart(moved)}</p>}
            <button type="button" className="btn btn-primary btn-block" disabled={!changed || busy} onClick={save}>
              {busy ? t.common.saving : t.detail.saveRoute}
            </button>
          </div>
        </div>
      </div>
      {editing && (
        <PlaceDialog
          title={editing.kind === 'start' ? t.form.pickup : editing.kind === 'end' ? t.form.dropoff : editing.kind === 'new' ? t.detail.newPickup : t.detail.routeStop}
          value={editingPlace}
          point={editingPlace ? pinOf(editingPlace) : null}
          near={pinOf(draft.origin) ?? pinOf(draft.destination)}
          freeText
          onClose={() => setEditing(null)}
          confirm={(place) => (
            <form
              className="add-stop"
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                apply(place)
              }}
            >
              {(editing.kind === 'stop' || editing.kind === 'new') && (
                <div className="field">
                  <span className="field-label" aria-hidden="true">
                    {t.detail.whereOnRoute}
                  </span>
                  <Select label={t.detail.whereOnRoute} icon={<PinIcon size={16} />} value={slot} options={options} onChange={setSlot} />
                </div>
              )}
              {editing.kind === 'new' && onRoute.has(foldName(place.name)) && <p className="hint">{t.detail.alreadyOnRoute(place.name)}</p>}
              <button type="submit" className="btn btn-primary btn-block">
                {t.common.done}
              </button>
            </form>
          )}
        />
      )}
    </div>,
    document.body,
  )
}
