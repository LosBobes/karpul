/**
 * Rendering a component into jsdom for a test, with React's own `act` (no
 * extra library): `render(<X />, { me })` mounts it under `MeContext` and
 * hands back the container and two finders by accessible text. Everything
 * mounted is unmounted after each test.
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, vi } from 'vitest'
import { MeContext, type Me } from '../lib/me'
import type { Ride } from '../lib/types'

// React's act() needs this flag outside a test renderer.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no media queries: every one answers "no" (a phone-width, fine-pointer, light screen).
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

const mounted: { root: Root; host: HTMLElement }[] = []

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
  vi.unstubAllGlobals()
})

/** Every call to the server answers an empty list, so a component that fetches on mount (the thread, the map config) stays quiet. */
export function quietFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
}

export function render(node: ReactNode, { me }: { me: Me }) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(<MeContext.Provider value={me}>{node}</MeContext.Provider>))
  const buttons = () => Array.from(host.querySelectorAll('button, a')) as HTMLElement[]
  const named = (el: HTMLElement) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()
  return {
    host,
    /** A button or link whose label (aria-label, else text) contains `text`, or null. */
    button: (text: string) => buttons().find((b) => named(b).includes(text)) ?? null,
    text: () => host.textContent ?? '',
  }
}

/** A ride with nothing on it: tomorrow, own car, Ana (id 1) drives, two seats free. */
export function aRide(overrides: Partial<Ride> = {}): Ride {
  const tomorrow = new Date(Date.now() + 86_400_000)
  const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  return {
    id: 7,
    ride_date: iso,
    car_type: 'own',
    car_name: 'Blue Golf',
    corporate_car_id: null,
    driver_name: 'Ana Anić',
    origin: 'Novi Sad',
    destination: 'Beograd',
    departure_time: '07:30',
    return_time: '16:30',
    seats: 2,
    notes: '',
    passengers_manage: false,
    passengers_add_stops: true,
    stops: [],
    stops_before: [],
    distance_km: null,
    chip_in: '',
    series_id: null,
    created_at: '2026-01-01T00:00:00',
    driver_id: 1,
    approval: '',
    needs_driver: false,
    unconfirmed: false,
    coffee_please: false,
    added_by_name: '',
    plate: '',
    plate_registered: false,
    proposal: null,
    driver_phone: null,
    bookings: [],
    waitlist: [],
    message_count: 0,
    free_seats: 2,
    legs: [],
    points: {},
    ...overrides,
  }
}
