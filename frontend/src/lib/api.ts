import type { CorporateCar, CorporateCarInput, Ride, RideInput } from './types'

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
  if (auth.userName) headers['X-User-Name'] = auth.userName
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

  deleteRide: (id: number, userName: string) =>
    request<void>(`/api/rides/${id}`, { method: 'DELETE' }, { userName }),

  /**
   * Put `passengerName` in the car. `userName` is who is doing it: yourself
   * (a plain join), or the driver / a fellow passenger adding someone else,
   * which the server allows only when the ride's `passengers_manage` is on
   * (the driver may always).
   */
  join: (rideId: number, passengerName: string, userName: string) =>
    request<Ride>(
      `/api/rides/${rideId}/bookings`,
      { method: 'POST', body: JSON.stringify({ passenger_name: passengerName }) },
      { userName },
    ),

  leave: (rideId: number, bookingId: number, userName: string) =>
    request<Ride>(`/api/rides/${rideId}/bookings/${bookingId}`, { method: 'DELETE' }, { userName }),

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
}
