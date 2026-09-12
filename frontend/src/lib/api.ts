import type { CarUsage, CorporateCar, CorporateCarInput, PersonStats, PushConfig, Ride, RideInput } from './types'

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function extractDetail(body: unknown): string | null {
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

/** Karpul has no sessions: the actor (or the shared admin password) rides on each request. */
interface Auth {
  userName?: string
  adminPassword?: string
}

async function request<T>(path: string, init: RequestInit = {}, auth: Auth = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (init.body) headers['Content-Type'] = 'application/json'
  // A header value cannot carry a ć or a š (fetch refuses anything past
  // Latin-1), so the name travels percent-encoded; the server decodes it.
  if (auth.userName) headers['X-User-Name'] = encodeURIComponent(auth.userName)
  if (auth.adminPassword) headers['X-Admin-Password'] = auth.adminPassword
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    throw new ApiError(res.status, extractDetail(body) ?? `${res.status} ${res.statusText}`)
  }
  return body as T
}

export const api = {
  corporateCars: () => request<CorporateCar[]>('/api/cars/corporate'),

  rides: (from: string, to: string) =>
    request<Ride[]>(`/api/rides?from=${from}&to=${to}`),

  createRide: (input: RideInput) =>
    request<Ride>('/api/rides', { method: 'POST', body: JSON.stringify(input) }),

  updateRide: (id: number, patch: Partial<RideInput>, userName: string) =>
    request<Ride>(`/api/rides/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }, { userName }),

  /** `following` also removes the later rides of the same weekly series. */
  deleteRide: (id: number, userName: string, scope: 'one' | 'following' = 'one') =>
    request<void>(`/api/rides/${id}?scope=${scope}`, { method: 'DELETE' }, { userName }),

  ride: (id: number) => request<Ride>(`/api/rides/${id}`),

  /**
   * Put `passengerName` in the car. `userName` is who is doing it: yourself
   * (a plain join), or the driver / a fellow passenger adding someone else,
   * which the server allows only when the ride's `passengers_manage` is on
   * (the driver may always).
   */
  join: (rideId: number, passengerName: string, userName: string, pickup = '') =>
    request<Ride>(
      `/api/rides/${rideId}/bookings`,
      { method: 'POST', body: JSON.stringify({ passenger_name: passengerName, pickup }) },
      { userName },
    ),

  leave: (rideId: number, bookingId: number, userName: string) =>
    request<Ride>(`/api/rides/${rideId}/bookings/${bookingId}`, { method: 'DELETE' }, { userName }),

  /** Move a passenger to another of the ride's pickup points ("" = the origin). */
  movePickup: (rideId: number, bookingId: number, pickup: string, userName: string) =>
    request<Ride>(
      `/api/rides/${rideId}/bookings/${bookingId}`,
      { method: 'PATCH', body: JSON.stringify({ pickup }) },
      { userName },
    ),

  /** Where the ride's .ics lives; a plain link, the browser downloads it. */
  rideCalendarUrl: (rideId: number) => `${BASE}/api/rides/${rideId}/calendar.ics`,

  /** The subscribable calendar of everything `name` drives or rides in. */
  calendarFeedUrl: (name: string) => `${BASE}/api/calendar/${encodeURIComponent(name)}.ics`,

  myStats: (name: string) => request<PersonStats>(`/api/stats/me?name=${encodeURIComponent(name)}`),

  // --- push notifications (see backend/app/push.py) ---

  pushConfig: () => request<PushConfig>('/api/push/config'),

  subscribePush: (subscription: PushSubscriptionJSON, locale: string, userName: string) =>
    request<{ ok: boolean }>(
      '/api/push/subscriptions',
      { method: 'POST', body: JSON.stringify({ ...subscription, locale }) },
      { userName },
    ),

  unsubscribePush: (endpoint: string) =>
    request<void>('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),

  // --- car pool admin (shared password, see backend/app/admin.py) ---

  /** Every car including retired ones. Doubles as the password check: 401 = wrong. */
  allCorporateCars: (adminPassword: string) =>
    request<CorporateCar[]>('/api/cars/corporate?include_inactive=true', {}, { adminPassword }),

  createCar: (input: CorporateCarInput, adminPassword: string) =>
    request<CorporateCar>(
      '/api/cars/corporate',
      { method: 'POST', body: JSON.stringify(input) },
      { adminPassword },
    ),

  updateCar: (id: number, patch: Partial<CorporateCarInput & { active: boolean }>, adminPassword: string) =>
    request<CorporateCar>(
      `/api/cars/corporate/${id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
      { adminPassword },
    ),

  deleteCar: (id: number, adminPassword: string) =>
    request<void>(`/api/cars/corporate/${id}`, { method: 'DELETE' }, { adminPassword }),

  /** How the pool cars were used over the last `days` days, with the rides as history. */
  carUsage: (days: number, adminPassword: string) =>
    request<CarUsage>(`/api/cars/corporate/usage?days=${days}`, {}, { adminPassword }),
}
