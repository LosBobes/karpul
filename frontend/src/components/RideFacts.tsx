import { firstName } from '../lib/dates'
import { useT } from '../lib/i18n'
import type { Ride } from '../lib/types'
import { CoffeeIcon, CoinsIcon, GarageIcon, RoadIcon, ShieldIcon } from './icons'

/** The small facts under the car (distance, chip-in, coffee, the garage plate, who added it) and the driver's note. */
export function RideFacts({ ride, isDriver, showPlate }: { ride: Ride; isDriver: boolean; showPlate: boolean }) {
  const t = useT()
  return (
    <>
      {(ride.chip_in || ride.distance_km != null || ride.coffee_please || showPlate || ride.added_by_name) && (
        <dl className="facts">
          {ride.distance_km != null && (
            <div className="fact">
              <dt>
                <RoadIcon size={14} /> {t.form.distance}
              </dt>
              <dd>{t.detail.distance(ride.distance_km)}</dd>
            </div>
          )}
          {ride.chip_in && (
            <div className="fact">
              <dt>
                <CoinsIcon size={14} /> {t.form.chipIn}
              </dt>
              <dd>{t.detail.chipIn(ride.chip_in)}</dd>
            </div>
          )}
          {ride.coffee_please && (
            <div className="fact">
              <dt>
                <CoffeeIcon size={14} /> {t.detail.coffee}
              </dt>
              <dd>{isDriver ? t.detail.coffeeYou : t.detail.coffeePlease(firstName(ride.driver_name))}</dd>
            </div>
          )}
          {showPlate && (
            <div className="fact">
              <dt>
                <GarageIcon size={14} /> {t.detail.garage}
              </dt>
              <dd>
                {ride.plate} · {ride.plate_registered ? t.detail.plateOnList : t.detail.plateWaiting}
              </dd>
            </div>
          )}
          {ride.added_by_name && (
            <div className="fact">
              <dt>
                <ShieldIcon size={14} /> {t.detail.addedBy}
              </dt>
              <dd>{ride.added_by_name}</dd>
            </div>
          )}
        </dl>
      )}
      {ride.notes && <p className="driver-notes">{ride.notes}</p>}
    </>
  )
}
