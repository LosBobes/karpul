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
  /** The passenger's account; null for a colleague put in by name who has no account yet. */
  passenger_id: number | null
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
  /** Driver's switch: passengers may put new pickup points on the route. */
  passengers_add_stops: boolean
  /** Extra pickup points after `origin`, in the order the car reaches them. */
  stops: string[]
  /** Pickup points before `origin`: passengers collected on the way to the start. */
  stops_before: string[]
  /** One-way distance, the driver's estimate; feeds the "km shared" figures. */
  distance_km: number | null
  /** Free-text "chip in" note per seat ("300 din"); nothing is charged. */
  chip_in: string
  /** Shared by the rides of one "repeat weekly" series. */
  series_id: string | null
  created_at: string
  /** The driver's account; null only for a ride from before accounts nobody claimed. */
  driver_id: number | null
  /** A shared car is one ride a week per driver: "" within that, "pending" while
   * an admin has to approve one past it, "approved" once one did. */
  approval: '' | 'pending' | 'approved'
  /** The driver's mobile number, when their account has one. */
  driver_phone: string | null
  bookings: Booking[]
  /** Waiting for a seat while the car is full, first in line first. */
  waitlist: WaitlistEntry[]
  /** How many messages the ride's thread has; a change means "fetch it again". */
  message_count: number
  free_seats: number
  /** A shared car's odometer, stretch by stretch, in the order they were driven. */
  legs: DriveLeg[]
}

/** One stretch at the wheel of a shared car (backend: DriveLeg). */
export interface DriveLeg {
  id: number
  driver_id: number | null
  driver_name: string
  start_km: number
  /** null while this stretch is being driven. */
  end_km: number | null
  created_at: string
}

export interface WaitlistEntry {
  id: number
  user_id: number
  name: string
  /** Where they want to get in once a seat frees up: "" is the origin. */
  pickup: string
  /** Set while `pickup` is a new place, put on the route once the seat is theirs. */
  new_stop_before?: boolean | null
  created_at: string
}

/** One line in a ride's thread (GET /api/rides/{id}/messages). */
export interface RideMessage {
  id: number
  ride_id: number
  author_id: number | null
  author_name: string
  body: string
  created_at: string
}

/** "I need a ride Tuesday around 8" (backend: routers/requests.py). */
export interface RideRequest {
  id: number
  request_date: string
  user_id: number
  name: string
  origin: string
  destination: string
  /** Roughly when they would like to leave, "HH:MM[:SS]". */
  departure_time: string
  note: string
  /** The ride that answered it; null while it is open. */
  ride_id: number | null
  created_at: string
}

export interface RideRequestInput {
  request_date: string
  origin: string
  destination: string
  departure_time: string
  note: string
}

/** A line of the admin's log (GET /api/admin/log, backend: app/audit.py). */
export interface AdminAction {
  id: number
  at: string
  admin_id: number | null
  admin_name: string
  action: string
  /** Whose ride, which car or which account it was about. */
  subject: string
  ride_id: number | null
  ride_date: string | null
  /** "07:30 Novi Sad → HQ" */
  ride_label: string
  /** [field, before, after], each value in words ("" for nothing). */
  changes: [string, string, string][]
}

/** An account in the admin's People list (GET /api/admin/users). */
/** A profile photo (backend: routers/photos.py); the board draws avatars by name. */
export interface Photo {
  user_id: number
  name: string
  /** Served without a token and never changes: a new photo gets a new address. */
  url: string
}

export interface AdminUser {
  id: number
  username: string
  display_name: string
  email: string | null
  phone: string | null
  is_admin: boolean
  /** An admin through KARPUL_ADMINS on the server, which the app cannot change. */
  admin_by_config: boolean
  created_at: string
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
  passengers_add_stops: boolean
  stops: string[]
  stops_before: string[]
  distance_km: number | null
  chip_in: string
  /** Create only: one ride per week up to this date (inclusive). */
  repeat_until?: string | null
  /** Create only: the ride answers this request, and its requester gets a seat. */
  request_id?: number | null
  /** Create only, admins only: the account that drives it, when not the caller. */
  driver_id?: number | null
  /** Create only: a shared car past your share, added as pending for an admin to approve. */
  request_approval?: boolean
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

/** What a person can switch off, kind by kind (backend: CATEGORIES in app/push.py). */
export type PushCategory = 'seats' | 'changes' | 'reminders' | 'messages' | 'requests' | 'approvals' | 'cars'

export const PUSH_CATEGORIES: PushCategory[] = ['seats', 'changes', 'reminders', 'messages', 'requests', 'approvals', 'cars']

/** How long before departure the reminder comes (backend: reminders.LEAD_CHOICES). */
export type RemindBefore = 15 | 30 | 60
export const REMIND_CHOICES: RemindBefore[] = [15, 30, 60]

export interface PushPreferences {
  muted: PushCategory[]
  remind_before: RemindBefore
}

/** How a shared car was found or left (backend: models.CarReport); each field optional, absent means "not read". */
export interface CarReportInput {
  odometer_km?: number | null
  soc?: number | null
  /** true clean, false needs a wash. */
  clean?: boolean | null
  /** What is wrong; "" says nothing is. */
  issues?: string | null
}

export interface CarReport {
  id: number
  car_id: number
  ride_id: number | null
  user_id: number | null
  user_name: string
  odometer_km: number | null
  soc: number | null
  clean: boolean | null
  issues: string | null
  created_at: string
}

/** One thing known about a shared car (backend: app/carstate.py Fact). */
export interface Fact<T> {
  value: T | null
  at: string | null
  by: string | null
  /** A guess from the rides since the last reading, not a reading. */
  estimated: boolean
}

/** A shared car as it stands (GET /api/cars/corporate/state). */
export interface CarState {
  car: CorporateCar
  odometer: Fact<number>
  soc: Fact<number>
  clean: Fact<boolean>
  issues: Fact<string>
  recent: CarReport[]
}

export interface PushConfig {
  enabled: boolean
  public_key: string | null
}

/** PATCH /api/auth/me — every field optional; a new password needs the current one. */
export interface ProfilePatch {
  first_name?: string
  last_name?: string
  /** `''` removes it. */
  email?: string
  /** `''` removes it. */
  phone?: string
  current_password?: string
  new_password?: string
}
