import { authToken, clearSession, type AuthUser, type Session } from './auth'
import type { NewStop } from './stops'
import type {
  AdminAction,
  AdminUser,
  CarReport,
  CarReportInput,
  CarState,
  CarUsage,
  CorporateCar,
  CorporateCarInput,
  KnownPlace,
  MapConfig,
  PersonStats,
  Photo,
  PlaceSuggestion,
  Point,
  ProfilePatch,
  PushConfig,
  PushPreferences,
  Ride,
  RideInput,
  RideMessage,
  RideRequest,
  RideRequestInput,
  Road,
} from './types'

const BASE = import.meta.env.VITE_API_URL ?? ''

/** A path the API serves, as the browser has to ask for it (an `<img src>`). */
export const apiUrl = (path: string) => `${BASE}${path}`

/** POST /api/auth/register */
export interface RegisterInput {
  username: string
  email?: string
  phone?: string
  first_name: string
  last_name: string
  password: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * What a call fails with when no answer came back at all: offline, or a phone
 * whose radio is still waking up after the app was asleep. The browsers word it
 * each their own way ("Failed to fetch", "Load failed", "NetworkError when
 * attempting to fetch resource"), so it is replaced by this one sentence with
 * status 0, which `isNetworkError` recognises and `apiError` translates.
 */
export const NETWORK_ERROR = 'No connection to the server'

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0
}

export function extractDetail(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('detail' in body)) return null
  const detail = (body as { detail: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== 'body').join('.') : ''
        const msg = (d.msg ?? '').replace(/^Value error, /, '')
        return field ? `${field}: ${msg}` : msg
      })
      .join('; ')
  }
  return null
}

/**
 * Every call carries the signed-in browser's token (lib/auth.ts); the server
 * shows nothing to a request without one. `anonymous` is for the door itself
 * (register, sign in, a reset link), which brings its own credentials.
 */
interface Opts {
  anonymous?: boolean
}

async function send(path: string, init: RequestInit = {}, opts: Opts = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const token = opts.anonymous ? '' : authToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, NETWORK_ERROR)
  }
  if (!res.ok) {
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    // The token we sent is dead (expired, or signed out elsewhere). Drop it so
    // the app falls back to the sign-in screen instead of failing every call.
    if (res.status === 401 && token) clearSession()
    throw new ApiError(res.status, extractDetail(body) ?? `${res.status} ${res.statusText}`)
  }
  return res
}

async function request<T>(path: string, init: RequestInit = {}, opts: Opts = {}): Promise<T> {
  const res = await send(path, init, opts)
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

/**
 * Fetch a file the API serves as an attachment (a ride's .ics, the usage
 * spreadsheet) and hand it to the browser as a download. A plain link cannot
 * do it any more: the request has to carry the token.
 */
async function download(path: string, fallbackName: string): Promise<void> {
  const res = await send(path)
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const api = {
  // --- places on the map (backend: app/geo.py, routers/places.py) ---

  /** Where the map's tiles come from; open, like the push config. */
  mapConfig: () => request<MapConfig>('/api/map/config', {}, { anonymous: true }),

  /** Suggestions for a place being typed, the known places first; `near` biases the search. */
  places: (q: string, lang: string, near: Point | null, signal?: AbortSignal) => {
    const params = new URLSearchParams({ q, lang })
    if (near) {
      params.set('lat', String(near.lat))
      params.set('lng', String(near.lng))
    }
    return request<PlaceSuggestion[]>(`/api/places?${params}`, { signal })
  },

  /** The places Karpul knows, for a picker's list before anything is typed. */
  savedPlaces: (signal?: AbortSignal) => request<PlaceSuggestion[]>('/api/places/saved', { signal }),

  /** A name for a pin dropped on the map. */
  placeName: (point: Point, lang: string) =>
    request<{ name: string | null }>(`/api/places/reverse?lat=${point.lat}&lng=${point.lng}&lang=${lang}`),

  /** The road through the pins, in order (404 when the server has no router). */
  road: (points: Point[], signal?: AbortSignal) =>
    request<Road>(`/api/places/road?via=${points.map((p) => `${p.lat},${p.lng}`).join(';')}`, { signal }),

  knownPlaces: () => request<KnownPlace[]>('/api/admin/places'),

  updateKnownPlace: (id: number, patch: { name?: string; point?: Point }) =>
    request<KnownPlace>(`/api/admin/places/${id}`, json('PATCH', patch)),

  deleteKnownPlace: (id: number) => request<void>(`/api/admin/places/${id}`, { method: 'DELETE' }),

  // --- accounts (backend: app/auth.py, routers/auth.py) ---

  register: (input: RegisterInput) => request<Session>('/api/auth/register', json('POST', input), { anonymous: true }),

  login: (login: string, password: string) =>
    request<Session>('/api/auth/login', json('POST', { login, password }), { anonymous: true }),

  /** Tell the server to forget this browser's token. The caller clears it locally. */
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  /** Sign every other browser of this account out; says how many. */
  logoutOthers: () => request<{ ended: number }>('/api/auth/logout-others', { method: 'POST' }),

  me: () => request<AuthUser>('/api/auth/me'),

  /** Change your own name, email, phone or password; a new name follows you onto the board. */
  updateMe: (patch: ProfilePatch) => request<AuthUser>('/api/auth/me', json('PATCH', patch)),

  /** A new secret for your calendar feed; the old address stops working. */
  rotateCalendarToken: () => request<AuthUser>('/api/auth/me/calendar-token', { method: 'POST' }),

  /** Everyone who has a profile photo, by name (lib/photos.ts). */
  photos: () => request<Photo[]>('/api/avatars'),

  /** Your photo, already cropped and shrunk (lib/photos.ts `squarePhoto`); replaces any older one. */
  uploadPhoto: (image: Blob) =>
    request<Photo>('/api/auth/me/photo', { method: 'PUT', body: image, headers: { 'Content-Type': image.type || 'application/octet-stream' } }),

  removeMyPhoto: () => request<void>('/api/auth/me/photo', { method: 'DELETE' }),

  /** Whose reset link this is (404 when it has expired or was used). */
  resetInfo: (token: string) =>
    request<{ username: string; display_name: string }>(`/api/auth/reset/${encodeURIComponent(token)}`, {}, { anonymous: true }),

  /** Set a new password with a reset link; signs this browser in. */
  resetPassword: (token: string, newPassword: string) =>
    request<Session>('/api/auth/reset', json('POST', { token, new_password: newPassword }), { anonymous: true }),

  // --- the board ---

  corporateCars: () => request<CorporateCar[]>('/api/cars/corporate'),

  /** Every shared car as it stands: odometer, battery, cleanliness, issues (backend: app/carstate.py). */
  carStates: () => request<CarState[]>('/api/cars/corporate/state'),

  /** Say how a shared car is, with or without a ride. */
  reportCar: (carId: number, report: CarReportInput) => request<CarReport>(`/api/cars/corporate/${carId}/reports`, json('POST', report)),

  rides: (from: string, to: string) => request<Ride[]>(`/api/rides?from=${from}&to=${to}`),

  ride: (id: number) => request<Ride>(`/api/rides/${id}`),

  createRide: (input: RideInput) => request<Ride>('/api/rides', json('POST', input)),

  updateRide: (id: number, patch: Partial<RideInput>) => request<Ride>(`/api/rides/${id}`, json('PATCH', patch)),
  /** Admin: a shared-car ride past the driver's share, let through or refused (refused: the ride goes). */
  approveRide: (id: number) => request<Ride>(`/api/rides/${id}/approve`, { method: 'POST' }),
  takeOver: (id: number) => request<Ride>(`/api/rides/${id}/takeover`, { method: 'POST' }),
  /** "This is me": every ride under that account-less driver name, the one asked about first. */
  claimRide: (id: number) => request<Ride[]>(`/api/rides/${id}/claim`, { method: 'POST' }),
  declineRide: (id: number) => request<void>(`/api/rides/${id}/decline`, { method: 'POST' }),

  /** `following` also removes the later rides of the same weekly series. */
  deleteRide: (id: number, scope: 'one' | 'following' = 'one') =>
    request<void>(`/api/rides/${id}?scope=${scope}`, { method: 'DELETE' }),

  /**
   * Put `passengerName` in the car: yourself (a plain join), or someone else,
   * which the server allows the driver, and the passengers while the ride's
   * `passengers_manage` is on.
   */
  join: (rideId: number, passengerName: string, pickup = '', newStop: NewStop | null = null) =>
    request<Ride>(`/api/rides/${rideId}/bookings`, json('POST', { passenger_name: passengerName, pickup, new_stop: newStop })),

  leave: (rideId: number, bookingId: number) => request<Ride>(`/api/rides/${rideId}/bookings/${bookingId}`, { method: 'DELETE' }),

  /** Move a passenger to another of the ride's pickup points ("" = the origin),
   * or to a new one put on the route at `newStop`. */
  movePickup: (rideId: number, bookingId: number, pickup: string, newStop: NewStop | null = null) =>
    request<Ride>(`/api/rides/${rideId}/bookings/${bookingId}`, json('PATCH', { pickup, new_stop: newStop })),

  /** Take the wheel of a shared car at `km`: the ride's driver (`bookingId` null) or a passenger; a handover while someone drives. */
  takeWheel: (rideId: number, km: number, bookingId: number | null) =>
    request<Ride>(`/api/rides/${rideId}/legs`, json('POST', { km, booking_id: bookingId })),

  /** The shared car is back, at `km`, and how it was left (its battery, whether it is clean, what is wrong). */
  bringBack: (rideId: number, km: number, report: CarReportInput = {}) =>
    request<Ride>(`/api/rides/${rideId}/legs/end`, json('POST', { km, ...report })),

  /** Take back the last odometer entry (driver or admin). */
  undoLeg: (rideId: number) => request<Ride>(`/api/rides/${rideId}/legs/last`, { method: 'DELETE' }),

  /** Queue for a seat in a full car; the first seat that frees up is yours. */
  joinWaitlist: (rideId: number, pickup = '', newStop: NewStop | null = null) =>
    request<Ride>(`/api/rides/${rideId}/waitlist`, json('POST', { pickup, new_stop: newStop })),

  leaveWaitlist: (rideId: number, entryId: number) =>
    request<Ride>(`/api/rides/${rideId}/waitlist/${entryId}`, { method: 'DELETE' }),

  messages: (rideId: number) => request<RideMessage[]>(`/api/rides/${rideId}/messages`),

  postMessage: (rideId: number, body: string) => request<RideMessage>(`/api/rides/${rideId}/messages`, json('POST', { body })),
  runningLate: (rideId: number, minutes: number) => request<RideMessage>(`/api/rides/${rideId}/late`, json('POST', { minutes })),

  deleteMessage: (rideId: number, messageId: number) =>
    request<void>(`/api/rides/${rideId}/messages/${messageId}`, { method: 'DELETE' }),

  /** The ride as an .ics file: downloaded, which on a phone opens the calendar. */
  downloadRideCalendar: (rideId: number) => download(`/api/rides/${rideId}/calendar.ics`, `karpul-ride-${rideId}.ics`),

  /** The subscribable calendar of everything you drive or ride in; the secret is the credential. */
  calendarFeedUrl: (token: string) => `${BASE}/api/calendar/${encodeURIComponent(token)}.ics`,

  myStats: () => request<PersonStats>('/api/stats/me'),

  // --- ride requests (backend: routers/requests.py) ---

  requests: (from: string, to: string) => request<RideRequest[]>(`/api/requests?from=${from}&to=${to}`),

  createRequest: (input: RideRequestInput) => request<RideRequest>('/api/requests', json('POST', input)),

  deleteRequest: (id: number) => request<void>(`/api/requests/${id}`, { method: 'DELETE' }),

  // --- push notifications (see backend/app/push.py) ---

  pushConfig: () => request<PushConfig>('/api/push/config'),
  /** The kinds of push this account switched off and its reminder lead (backend: app/push.py, app/reminders.py). */
  pushPreferences: () => request<PushPreferences>('/api/push/preferences'),
  setPushPreferences: (prefs: PushPreferences) => request<PushPreferences>('/api/push/preferences', json('PUT', prefs)),

  subscribePush: (subscription: PushSubscriptionJSON, locale: string) =>
    request<{ ok: boolean }>('/api/push/subscriptions', json('POST', { ...subscription, locale })),

  unsubscribePush: (endpoint: string) => request<void>('/api/push/subscriptions', json('DELETE', { endpoint })),

  // --- admin: the car pool and the people (backend: app/admin.py) ---

  /** Every car including retired ones. */
  allCorporateCars: () => request<CorporateCar[]>('/api/cars/corporate?include_inactive=true'),

  createCar: (input: CorporateCarInput) => request<CorporateCar>('/api/cars/corporate', json('POST', input)),

  updateCar: (id: number, patch: Partial<CorporateCarInput & { active: boolean }>) =>
    request<CorporateCar>(`/api/cars/corporate/${id}`, json('PATCH', patch)),

  deleteCar: (id: number) => request<void>(`/api/cars/corporate/${id}`, { method: 'DELETE' }),

  /** How the pool cars were used over the last `days` days, with the rides as history. */
  carUsage: (days: number) => request<CarUsage>(`/api/cars/corporate/usage?days=${days}`),

  /** The same window's company-car rides as a spreadsheet. */
  downloadCarUsage: (days: number) => download(`/api/cars/corporate/usage.csv?days=${days}`, 'karpul-company-cars.csv'),

  users: () => request<AdminUser[]>('/api/admin/users'),
  approvals: () => request<Ride[]>('/api/admin/approvals'),
  adminLog: (before?: number) => request<AdminAction[]>(`/api/admin/log${before ? `?before=${before}` : ''}`),

  setAdmin: (userId: number, isAdmin: boolean) => request<AdminUser>(`/api/admin/users/${userId}`, json('PATCH', { is_admin: isAdmin })),

  /** Delete an account: its coming rides, seats and requests go, its past stays. */
  deleteUser: (userId: number) => request<void>(`/api/admin/users/${userId}`, { method: 'DELETE' }),

  /** Admin: take someone's profile photo down. */
  removePhoto: (userId: number) => request<void>(`/api/admin/users/${userId}/photo`, { method: 'DELETE' }),

  /** Every ride from `from` to `to`, past ones included (the admin's table, components/RideLog.tsx). */
  rideLog: (from: string, to: string) => request<Ride[]>(`/api/admin/rides?from=${from}&to=${to}`),

  /** A one-time link for someone who forgot their password; any older one stops working. */
  resetLink: (userId: number) =>
    request<{ path: string; expires_at: string }>(`/api/admin/users/${userId}/reset-link`, { method: 'POST' }),
}
