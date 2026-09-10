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
}
