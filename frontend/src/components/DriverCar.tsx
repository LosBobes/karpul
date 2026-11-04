import { carBrand, carModel, carPowertrain, powertrainLabel } from '../lib/carModels'
import { factText } from '../lib/carState'
import { useT } from '../lib/i18n'
import type { CarState, Ride } from '../lib/types'
import { BrandLogo, CarArt, PowertrainIcon } from './CarArt'
import { CarIcon, PlugIcon, RoadIcon } from './icons'

interface Props {
  ride: Ride
  /** How the shared car stands (components/CarStatus.tsx), for the line under its name. */
  carState?: CarState | null
  onCarState?: () => void
  /** Opens the company-car guide; shown on company-car rides only. */
  onGuide?: () => void
}

/** The vehicle strip on the driver card: the picture or the make's mark, the name, the kind of car and how it stands. */
export function DriverCar({ ride, carState = null, onCarState, onGuide }: Props) {
  const t = useT()
  const model = carModel(ride.car_name)
  const brand = model ? null : carBrand(ride.car_name)
  const powertrain = carPowertrain(ride.car_name)
  return (
    <div className={model || brand ? 'driver-car driver-car-illustrated' : 'driver-car'}>
      {model && (
        <span className="driver-car-art" aria-hidden="true">
          <CarArt model={model.key} width={96} />
        </span>
      )}
      {brand && (
        <span className="driver-car-logo" title={brand.name}>
          <BrandLogo brand={brand.key} size={26} />
        </span>
      )}
      {!model && !brand && (
        <span className="driver-car-logo" aria-hidden="true">
          <CarIcon size={24} />
        </span>
      )}
      <span className="driver-car-text">
        <span className="driver-car-name">{ride.car_name}</span>
        <span className="driver-car-meta">
          {ride.car_type === 'corporate' ? t.detail.companyCar : t.detail.ownCar}
          {powertrain && (
            <span className={`driver-car-pt driver-car-pt-${powertrain}`}>
              <PowertrainIcon kind={powertrain} size={12} /> {powertrainLabel(powertrain)}
            </span>
          )}
        </span>
        {carState && (
          <button type="button" className="link driver-car-state" onClick={onCarState}>
            <RoadIcon size={13} />
            <span>{factText(carState.odometer, (v) => t.carState.km(v.toLocaleString())).value}</span>
            {carState.soc.value !== null && <span>{factText(carState.soc, (v) => t.carState.pct(v)).value}</span>}
            {carState.clean.value === false && <span>{t.carState.cleanNo}</span>}
            {carState.issues.value && <span className="driver-car-issue">{carState.issues.value}</span>}
          </button>
        )}
        {ride.car_type === 'corporate' && onGuide && (
          <button type="button" className="link driver-car-guide" onClick={onGuide}>
            <PlugIcon size={15} /> {t.detail.howTo}
          </button>
        )}
      </span>
    </div>
  )
}
