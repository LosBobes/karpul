import { useState, type FormEvent } from 'react'
import { useT } from '../lib/i18n'
import { pointOf } from '../lib/maps'
import { defaultSlot, stopSlots, type NewStop } from '../lib/stops'
import type { Ride } from '../lib/types'
import { PinIcon } from './icons'
import { PlaceDialog, type Picked } from './PlaceDialog'
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
 * A pickup point that is not on the route yet, chosen in the same full-screen
 * `PlaceDialog` as a ride form's places: the saved places, the addresses found
 * and a pin dropped on the map, or the words typed as they are (a place nobody
 * pinned is fine). Its last step names the place picked and asks which stretch
 * of the route it is on, from ahead of the first point (before the start) to
 * the last stretch before the destination.
 */
export function AddStop({ ride, submitLabel, busy, onSubmit, onCancel }: Props) {
  const t = useT()
  const slots = stopSlots(ride)
  const near = pointOf(ride, ride.origin) ?? pointOf(ride, ride.destination)
  const [slot, setSlot] = useState(() => defaultSlot(slots))
  const options = slots.map((s, i) => ({
    value: i,
    label: s.after === null ? t.detail.slotFirst(s.next) : t.detail.slotBetween(s.after, s.next),
  }))

  function submit(e: FormEvent<HTMLFormElement>, place: Picked) {
    e.preventDefault()
    const where = slots[slot] ?? slots[defaultSlot(slots)]
    if (!where) return
    onSubmit(place.name, { before: where.before, index: where.index, point: place.point })
  }

  return (
    <PlaceDialog
      title={t.detail.newPickup}
      value=""
      point={null}
      near={near}
      freeText
      onClose={onCancel}
      confirm={(place) => (
        <form className="add-stop" onSubmit={(e) => submit(e, place)}>
          <div className="field">
            <span className="field-label" aria-hidden="true">
              {t.detail.whereOnRoute}
            </span>
            <Select label={t.detail.whereOnRoute} icon={<PinIcon size={16} />} value={slot} options={options} onChange={setSlot} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {submitLabel}
          </button>
        </form>
      )}
    />
  )
}
