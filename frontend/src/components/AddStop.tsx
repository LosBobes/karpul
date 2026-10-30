import { useState, type FormEvent } from 'react'
import { useT } from '../lib/i18n'
import { pointOf } from '../lib/maps'
import { defaultSlot, stopSlots, type NewStop } from '../lib/stops'
import type { Point, Ride } from '../lib/types'
import { PinIcon, XIcon } from './icons'
import { PlaceDialog } from './PlaceDialog'
import { PlaceInput } from './PlaceInput'
import { Select } from './Select'

interface Props {
  ride: Ride
  /** The verb on the button: "Get in" for a passenger, "Add" for the driver. */
  submitLabel: string
  busy: boolean
  onSubmit: (place: string, where: NewStop) => void
  onCancel: () => void
}

/**
 * A pickup point that is not on the route yet: the place, and which stretch of
 * the route it is on, from ahead of the first point (before the start) to the
 * last stretch before the destination. The place field is the ride form's:
 * suggestions as you type, and with the maps on a *Map* chip that opens the
 * same `PlaceDialog` (saved places, addresses, a pin dropped on the map),
 * whose pick is the words and the pin (`point` on the `NewStop`). A place
 * nobody pinned is fine.
 */
export function AddStop({ ride, submitLabel, busy, onSubmit, onCancel }: Props) {
  const t = useT()
  const slots = stopSlots(ride)
  const [place, setPlace] = useState('')
  const [point, setPoint] = useState<Point | null>(null)
  const [picking, setPicking] = useState(false)
  const near = pointOf(ride, ride.origin) ?? pointOf(ride, ride.destination)
  const [slot, setSlot] = useState(() => defaultSlot(slots))
  const options = slots.map((s, i) => ({
    value: i,
    label: s.after === null ? t.detail.slotFirst(s.next) : t.detail.slotBetween(s.after, s.next),
  }))

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = place.trim().replace(/\s+/g, ' ')
    const where = slots[slot] ?? slots[defaultSlot(slots)]
    if (!name || !where) return
    onSubmit(name, { before: where.before, index: where.index, point })
  }

  return (
    <form className="add-stop" onSubmit={submit}>
      <span className="pax-add">
        <PlaceInput
          autoFocus
          required
          label={t.detail.newPickup}
          placeholder={t.detail.newPickupPlaceholder}
          value={place}
          point={point}
          near={near}
          onChange={(value, pin) => {
            setPlace(value)
            setPoint(pin)
          }}
          onMap={() => setPicking(true)}
        />
        <button type="button" className="icon-btn" aria-label={t.common.cancel} onClick={onCancel}>
          <XIcon size={18} />
        </button>
      </span>
      {picking && (
        <PlaceDialog
          title={t.detail.newPickup}
          value={place}
          point={point}
          near={near}
          onClose={() => setPicking(false)}
          onPick={(name, pin) => {
            setPlace(name)
            setPoint(pin)
            setPicking(false)
          }}
        />
      )}
      <span className="pax-add">
        <Select label={t.detail.whereOnRoute} icon={<PinIcon size={16} />} value={slot} options={options} onChange={setSlot} />
        <button type="submit" className="btn btn-primary" disabled={busy || !place.trim()}>
          {submitLabel}
        </button>
      </span>
    </form>
  )
}
