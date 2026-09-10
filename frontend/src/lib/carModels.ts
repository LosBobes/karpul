/**
 * The car models the board knows how to draw. The match runs on
 * `Ride.car_name` ("Mazda 6e (BG-123-XY)") as well as on the pool's own
 * `CorporateCar.name`, so the plate suffix must be tolerated. The artwork
 * itself lives in `components/CarArt.tsx`, keyed by `key`.
 */
export type CarModelKey = 'mazda6e'

export interface CarModel {
  key: CarModelKey
  name: string
  electric: boolean
}

const MODELS: { test: RegExp; model: CarModel }[] = [
  { test: /mazda\s*6\s*e\b/i, model: { key: 'mazda6e', name: 'Mazda 6e', electric: true } },
]

export function carModel(carName: string): CarModel | null {
  return MODELS.find((m) => m.test.test(carName))?.model ?? null
}
