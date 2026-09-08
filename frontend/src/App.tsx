import { useCallback, useEffect, useMemo, useState } from 'react'
import { NameBar } from './components/NameBar'
import { PassengerTray } from './components/PassengerTray'
import { RideCard } from './components/RideCard'
import { RideForm } from './components/RideForm'
import { WeekStrip } from './components/WeekStrip'
import { api, ApiError } from './lib/api'
import { addDays, fmtLongDate, parseISODate, sameName, startOfWeek, toISODate, todayISO } from './lib/dates'
import type { PassengerDrag } from './lib/dnd'
import type { CorporateCar, Ride, RideInput } from './lib/types'
import { useUserName } from './lib/useUserName'

type FormState = { mode: 'create' } | { mode: 'edit'; ride: Ride } | null

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Something went wrong'
}

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
  const [dragActive, setDragActive] = useState(false)

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

  // Keep the board fresh for people who leave the tab open.
  useEffect(() => {
    const id = setInterval(() => void load(), 30_000)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

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
            🚗
          </span>
          <span>
            <strong>Karpul</strong> <span className="muted">firm carpooling</span>
          </span>
        </div>
        <NameBar name={userName} onChange={setUserName} />
      </header>

      <main>
        <WeekStrip selected={selected} rides={rides} onSelect={setSelected} />

        <section className="day-head">
          <h1>{fmtLongDate(selected)}</h1>
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
          <p className="empty">Loading…</p>
        ) : dayRides.length === 0 ? (
          <div className="empty">
            <p>No rides on this day{isPast ? '.' : ' yet.'}</p>
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
                onDragState={setDragActive}
                onLeave={() => myRideToday && myBookingToday && void onLeave(myRideToday, myBookingToday.id)}
              />
            )}
            <div className={`ride-list ${dragActive ? 'ride-list-dragging' : ''}`}>
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
                  dragActive={dragActive}
                  onDragState={setDragActive}
                  onDropPassenger={onDropPassenger}
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

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
