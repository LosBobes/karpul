import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CarAdmin, NEW_CAR_BUSY_ID } from './components/CarAdmin'
import { BoardText } from './components/BoardText'
import { NameBar } from './components/NameBar'
import { PassengerTray } from './components/PassengerTray'
import { RideCard } from './components/RideCard'
import { RideForm } from './components/RideForm'
import { WeekStrip } from './components/WeekStrip'
import { api, ApiError } from './lib/api'
import { addDays, fmtLongDate, parseISODate, sameName, startOfWeek, toISODate, todayISO } from './lib/dates'
import { grabPassenger, type DropTarget, type PassengerDrag } from './lib/dnd'
import { useLiveBoard, type LiveEvent } from './lib/live'
import type { CorporateCar, CorporateCarInput, Ride, RideInput } from './lib/types'
import { useAdminPassword } from './lib/useAdminPassword'
import { useUserName } from './lib/useUserName'

type FormState = { mode: 'create' } | { mode: 'edit'; ride: Ride } | null

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Something went wrong'
}

/** Same order the API lists in, so a ride pushed over the socket lands in the right row. */
function sortRides(rides: Ride[]): Ride[] {
  return [...rides].sort(
    (a, b) =>
      a.ride_date.localeCompare(b.ride_date) ||
      a.departure_time.localeCompare(b.departure_time) ||
      a.id - b.id,
  )
}

function isOverRide(over: DropTarget | null, rideId: number): boolean {
  return over?.kind === 'ride' && over.rideId === rideId
}

const LIVE_LABEL = { connecting: 'Connecting', live: 'Live', offline: 'Offline' } as const
const LIVE_TITLE = {
  connecting: 'Connecting to the board…',
  live: 'Changes made by others show up here as they happen.',
  offline: 'Live updates are down; the board refreshes itself every 30 s until they are back.',
} as const

export default function App() {
  const [userName, setUserName] = useUserName()
  const [selected, setSelected] = useState(todayISO)
  const [rides, setRides] = useState<Ride[]>([])
  const [cars, setCars] = useState<CorporateCar[]>([])
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [form, setForm] = useState<FormState>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // The passenger token in flight and what it is hovering over (lib/dnd.ts).
  const [drag, setDrag] = useState<PassengerDrag | null>(null)
  const [dragOver, setDragOver] = useState<DropTarget | null>(null)

  // Car-pool admin (shared password, see backend/app/admin.py). Everything else on
  // this board is honour-based; only editing the company cars is gated.
  const [adminPassword, setAdminPassword] = useAdminPassword()
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [adminCars, setAdminCars] = useState<CorporateCar[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminBusyId, setAdminBusyId] = useState<number | null>(null)

  const week = useMemo(() => {
    const monday = startOfWeek(parseISODate(selected))
    return { from: toISODate(monday), to: toISODate(addDays(monday, 6)) }
  }, [selected])

  const load = useCallback(async () => {
    try {
      setRides(await api.rides(week.from, week.to))
    } catch (e) {
      setToast({ kind: 'error', text: `Could not load rides: ${errMsg(e)}` })
    } finally {
      setLoadedWeek(week.from)
    }
  }, [week])

  useEffect(() => {
    // Data fetching: the state update happens after the await, not synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const loading = loadedWeek !== week.from

  useEffect(() => {
    api.corporateCars().then(setCars).catch(() => setCars([]))
  }, [])

  /** The admin list is the superset; the ride form only ever sees active cars. */
  const applyCars = useCallback((all: CorporateCar[]) => {
    setAdminCars(all)
    setCars(all.filter((c) => c.active))
  }, [])

  // Live board: the server pushes every change anyone makes (lib/live.ts).
  const onLiveEvent = useCallback(
    (ev: LiveEvent) => {
      switch (ev.type) {
        case 'ride.created':
        case 'ride.updated':
          setRides((rs) => {
            // An edit can move a ride into or out of the loaded week.
            const inWeek = ev.ride.ride_date >= week.from && ev.ride.ride_date <= week.to
            const rest = rs.filter((r) => r.id !== ev.ride.id)
            return inWeek ? sortRides([...rest, ev.ride]) : rest
          })
          break
        case 'ride.deleted':
          setRides((rs) => rs.filter((r) => r.id !== ev.ride_id))
          break
        case 'cars.changed':
          // A pool edit can relabel rides (backend: relabel_rides_for_car), so
          // both lists are reloaded rather than patched.
          if (adminUnlocked) api.allCorporateCars(adminPassword).then(applyCars).catch(() => undefined)
          else api.corporateCars().then(setCars).catch(() => undefined)
          void load()
          break
        default:
          break
      }
    },
    [week, load, adminUnlocked, adminPassword, applyCars],
  )
  const liveStatus = useLiveBoard({ onEvent: onLiveEvent, onConnect: load })

  // Keep the board fresh for people who leave the tab open. Polling is the
  // fallback for when the socket is down; a focus always re-syncs.
  useEffect(() => {
    const id = liveStatus === 'live' ? null : setInterval(() => void load(), 30_000)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      if (id !== null) clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [load, liveStatus])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), toast.kind === 'ok' ? 2500 : 6000)
    return () => clearTimeout(id)
  }, [toast])

  function replaceRide(updated: Ride) {
    setRides((rs) => rs.map((r) => (r.id === updated.id ? updated : r)))
  }

  async function withBusy(ride: Ride, fn: () => Promise<void>) {
    setBusyId(ride.id)
    try {
      await fn()
    } catch (e) {
      setToast({ kind: 'error', text: errMsg(e) })
      void load()
    } finally {
      setBusyId(null)
    }
  }

  const onJoin = (ride: Ride) =>
    withBusy(ride, async () => {
      replaceRide(await api.join(ride.id, userName))
      setToast({ kind: 'ok', text: `You're in with ${ride.driver_name}.` })
    })

  const onLeave = (ride: Ride, bookingId: number) =>
    withBusy(ride, async () => {
      replaceRide(await api.leave(ride.id, bookingId, userName))
    })

  const onCancel = (ride: Ride) => {
    if (!confirm(`Cancel your ride ${ride.origin} → ${ride.destination} on ${fmtLongDate(ride.ride_date)}?`)) return
    void withBusy(ride, async () => {
      await api.deleteRide(ride.id, userName)
      setRides((rs) => rs.filter((r) => r.id !== ride.id))
      setToast({ kind: 'ok', text: 'Ride cancelled.' })
    })
  }

  /** Drop of the passenger token onto a car: switch cars if already seated, else join. */
  const onDropPassenger = (target: Ride, drag: PassengerDrag) => {
    if (!sameName(drag.name, userName)) return
    void withBusy(target, async () => {
      if (drag.fromRideId !== null && drag.bookingId !== null && drag.fromRideId !== target.id) {
        replaceRide(await api.leave(drag.fromRideId, drag.bookingId, userName))
      }
      replaceRide(await api.join(target.id, userName))
      setToast({ kind: 'ok', text: `You're in with ${target.driver_name}.` })
    })
  }

  /** Where the token landed. Looked up against the *current* rides: the board
   *  can change under a drag (live updates), so this is read at drop time. */
  const dropPassenger = (drag: PassengerDrag, target: DropTarget) => {
    if (target.kind === 'tray') {
      const from = drag.fromRideId !== null ? rides.find((r) => r.id === drag.fromRideId) : undefined
      if (from && drag.bookingId !== null) void onLeave(from, drag.bookingId)
      return
    }
    const ride = rides.find((r) => r.id === target.rideId)
    if (ride) onDropPassenger(ride, drag)
  }
  const dropRef = useRef(dropPassenger)
  useEffect(() => {
    dropRef.current = dropPassenger
  })

  const onGrab = (e: React.PointerEvent<HTMLElement>, d: PassengerDrag) =>
    grabPassenger(e, d, {
      onStart: setDrag,
      onOver: setDragOver,
      onEnd: (dropped, target) => {
        setDrag(null)
        setDragOver(null)
        if (target) dropRef.current(dropped, target)
      },
    })

  const closeForm = useCallback(() => {
    setForm(null)
    setFormError(null)
  }, [])

  async function onSubmitForm(input: RideInput) {
    setSubmitting(true)
    setFormError(null)
    try {
      if (form?.mode === 'edit') {
        const { driver_name: _driver, ...patch } = input
        void _driver
        replaceRide(await api.updateRide(form.ride.id, patch, userName))
        setToast({ kind: 'ok', text: 'Ride updated.' })
      } else {
        await api.createRide(input)
        setToast({ kind: 'ok', text: 'Ride published.' })
      }
      closeForm()
      setSelected(input.ride_date)
      void load()
    } catch (e) {
      setFormError(errMsg(e))
    } finally {
      setSubmitting(false)
    }
  }

  const unlockAdmin = useCallback(
    async (password: string) => {
      setAdminLoading(true)
      setAdminError(null)
      try {
        applyCars(await api.allCorporateCars(password))
        setAdminPassword(password)
        setAdminUnlocked(true)
      } catch (e) {
        setAdminUnlocked(false)
        setAdminError(errMsg(e))
      } finally {
        setAdminLoading(false)
      }
    },
    [applyCars, setAdminPassword],
  )

  function openAdmin() {
    setAdminOpen(true)
    setAdminError(null)
    // A password remembered from last time unlocks straight away (or fails loudly).
    if (adminPassword && !adminUnlocked) void unlockAdmin(adminPassword)
  }

  function lockAdmin() {
    setAdminPassword('')
    setAdminUnlocked(false)
    setAdminCars([])
    setAdminError(null)
  }

  async function withAdminBusy(id: number, fn: () => Promise<void>) {
    setAdminBusyId(id)
    setAdminError(null)
    try {
      await fn()
      applyCars(await api.allCorporateCars(adminPassword))
      // A car edit can rewrite `car_name` on rides already booked in it
      // (backend: relabel_rides_for_car), so the board has to be reloaded or it
      // keeps the old name and plate until the 30 s poll comes round.
      await load()
    } catch (e) {
      setAdminError(errMsg(e))
    } finally {
      setAdminBusyId(null)
    }
  }

  const onCreateCar = (input: CorporateCarInput) =>
    void withAdminBusy(NEW_CAR_BUSY_ID, async () => {
      await api.createCar(input, adminPassword)
      setToast({ kind: 'ok', text: `${input.name} added to the pool.` })
    })

  const onUpdateCar = (id: number, patch: Partial<CorporateCarInput & { active: boolean }>) =>
    void withAdminBusy(id, () => api.updateCar(id, patch, adminPassword).then(() => undefined))

  const onDeleteCar = (car: CorporateCar) => {
    if (!confirm(`Delete ${car.name} (${car.plate}) from the pool? Retiring keeps it on past rides.`)) return
    void withAdminBusy(car.id, async () => {
      await api.deleteCar(car.id, adminPassword)
      setToast({ kind: 'ok', text: `${car.name} deleted.` })
    })
  }

  const dayRides = rides.filter((r) => r.ride_date === selected)
  const isPast = selected < todayISO()
  const myRideToday = dayRides.find((r) => r.bookings.some((b) => sameName(b.passenger_name, userName))) ?? null
  const myBookingToday = myRideToday?.bookings.find((b) => sameName(b.passenger_name, userName)) ?? null
  const drivingToday = dayRides.some((r) => sameName(r.driver_name, userName))
  const hasOpenRides = dayRides.some((r) => r.free_seats > 0 && !sameName(r.driver_name, userName))

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            KP
          </span>
          <span>Karpul</span>
          <span className="muted">Departures</span>
        </div>
        <div className="topbar-right">
          <span className={`live live-${liveStatus}`} role="status" title={LIVE_TITLE[liveStatus]}>
            <span className="live-dot" aria-hidden="true" />
            {LIVE_LABEL[liveStatus]}
          </span>
          <NameBar name={userName} onChange={setUserName} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Manage the company car pool"
            onClick={openAdmin}
          >
            Fleet
          </button>
        </div>
      </header>

      <main>
        <WeekStrip selected={selected} rides={rides} onSelect={setSelected} />

        <section className="day-head">
          <h1>
            {/* Keyed on the date so switching days replays the flip. */}
            <BoardText key={selected}>{fmtLongDate(selected)}</BoardText>
          </h1>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!userName}
            title={!userName ? 'Set your name first' : undefined}
            onClick={() => setForm({ mode: 'create' })}
          >
            + Offer a ride
          </button>
        </section>

        {loading ? (
          <p className="empty">Reading the board…</p>
        ) : dayRides.length === 0 ? (
          <div className="empty">
            <p>No departures {isPast ? 'were' : ''} scheduled for this day{isPast ? '.' : ' yet.'}</p>
            {!isPast && userName && (
              <button type="button" className="btn btn-link" onClick={() => setForm({ mode: 'create' })}>
                Be the first to offer one
              </button>
            )}
            {!userName && <p className="hint">Enter your name at the top to join or offer rides.</p>}
          </div>
        ) : (
          <>
            {!isPast && (
              <PassengerTray
                userName={userName}
                currentRide={myRideToday}
                currentBookingId={myBookingToday?.id ?? null}
                drivingToday={drivingToday}
                hasOpenRides={hasOpenRides}
                dragActive={drag !== null}
                over={dragOver?.kind === 'tray'}
                onGrab={onGrab}
              />
            )}
            <div className={`ride-list ${drag ? 'ride-list-dragging' : ''}`}>
              {dayRides.map((r) => (
                <RideCard
                  key={r.id}
                  ride={r}
                  userName={userName}
                  busy={busyId === r.id}
                  onJoin={onJoin}
                  onLeave={onLeave}
                  onCancel={onCancel}
                  onEdit={(ride) => setForm({ mode: 'edit', ride })}
                  dragActive={drag !== null}
                  lifted={drag?.fromRideId === r.id}
                  over={isOverRide(dragOver, r.id)}
                  onGrab={onGrab}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {form && (
        <RideForm
          key={form.mode === 'edit' ? form.ride.id : 'new'}
          date={selected}
          userName={userName}
          cars={cars}
          existing={form.mode === 'edit' ? form.ride : null}
          submitting={submitting}
          error={formError}
          onSubmit={onSubmitForm}
          onClose={closeForm}
        />
      )}

      {adminOpen && (
        <CarAdmin
          unlocked={adminUnlocked}
          cars={adminCars}
          loading={adminLoading}
          error={adminError}
          busyId={adminBusyId}
          onUnlock={(p) => void unlockAdmin(p)}
          onLock={lockAdmin}
          onCreate={onCreateCar}
          onUpdate={onUpdateCar}
          onDelete={onDeleteCar}
          onClose={() => setAdminOpen(false)}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
