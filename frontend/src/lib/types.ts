export type CarType = 'corporate' | 'own'

export interface CorporateCar {
  id: number
  name: string
  plate: string
  passenger_seats: number
  /** Retired cars stay in the DB (rides reference them) but leave the ride form. */
  active: boolean
}

export interface CorporateCarInput {
  name: string
  plate: string
  passenger_seats: number
}

export interface Booking {
  id: number
  passenger_name: string
  /** Where they get in: "" is the ride's origin, otherwise one of its stops. */
  pickup: string
  created_at: string
}

export interface Ride {
  id: number
  ride_date: string // YYYY-MM-DD
  car_type: CarType
  car_name: string
  corporate_car_id: number | null
  driver_name: string
  origin: string
  destination: string
  departure_time: string // HH:MM[:SS]
  return_time: string | null
  seats: number
  notes: string
  /** Driver's switch: passengers may add and remove each other. */
  passengers_manage: boolean
  /** Extra pickup points besides `origin`, in the driver's order. */
  stops: string[]
  /** One-way distance, the driver's estimate; feeds the "km shared" figures. */
  distance_km: number | null
  /** Free-text "chip in" note per seat ("300 din"); nothing is charged. */
  chip_in: string
  /** Shared by the rides of one "repeat weekly" series. */
  series_id: string | null
  created_at: string
  bookings: Booking[]
  free_seats: number
}

export interface RideInput {
  ride_date: string
  car_type: CarType
  car_name: string
  corporate_car_id: number | null
  driver_name: string
  origin: string
  destination: string
  departure_time: string
  return_time: string | null
  seats: number
  notes: string
  passengers_manage: boolean
  stops: string[]
  distance_km: number | null
  chip_in: string
  /** Create only: one ride per week up to this date (inclusive). */
  repeat_until?: string | null
}

/** GET /api/stats/me */
export interface PersonStats {
  month: StatBucket
  all: StatBucket
  history: HistoryRide[]
}

export interface StatBucket {
  rides_driven: number
  rides_ridden: number
  people_carried: number
  km_shared: number
}

export interface HistoryRide {
  id: number
  ride_date: string
  departure_time: string
  driver_name: string
  car_name: string
  origin: string
  destination: string
  role: 'driver' | 'passenger'
  passengers: number
  distance_km: number | null
}

/** GET /api/cars/corporate/usage (admin) */
export interface CarUsage {
  from: string
  to: string
  working_days: number
  cars: CarUsageRow[]
  totals: { rides: number; passengers: number; km: number; days_used: number }
  history: UsageRide[]
}

export interface CarUsageRow {
  car: CorporateCar
  rides: number
  days_used: number
  use_rate: number
  drivers: number
  passengers: number
  seats_offered: number
  km: number
  last_used: string | null
  upcoming: number
}

export interface UsageRide {
  id: number
  ride_date: string
  departure_time: string
  return_time: string | null
  car_id: number | null
  car_name: string
  driver_name: string
  origin: string
  destination: string
  passengers: number
  seats: number
  distance_km: number | null
}

export interface PushConfig {
  enabled: boolean
  public_key: string | null
}
