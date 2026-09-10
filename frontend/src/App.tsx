import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AddCarCard } from './components/AddCarCard'
import { CarAdmin, NEW_CAR_BUSY_ID } from './components/CarAdmin'
import { CarGuide } from './components/CarGuide'
import { CarCarousel, type CarSelection } from './components/CarCarousel'
import { CarDetail } from './components/CarDetail'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DateCarousel } from './components/DateCarousel'
import { CalendarIcon, CarIcon, ListIcon, MenuIcon, PlusIcon } from './components/icons'
import { NameSheet } from './components/NameSheet'
import { RideForm } from './components/RideForm'
import { Sidebar } from './components/Sidebar'
import { Upcoming } from './components/Upcoming'
import { YouPanel } from './components/YouPanel'
import { api, ApiError } from './lib/api'
import { addDays, fmtShortDate, parseISODate, sameName, startOfWeek, toISODate, todayISO } from './lib/dates'
import { grabPassenger, type DropTarget, type PassengerDrag } from './lib/dnd'
import { useLiveBoard, type LiveEvent } from './lib/live'
import type { CorporateCar, CorporateCarInput, Ride, RideInput } from './lib/types'
import { useAdminPassword } from './lib/useAdminPassword'
import { useUserName } from './lib/useUserName'

type FormState = { mode: 'create'; template?: Ride } | { mode: 'edit'; ride: Ride } | null

/**
 * "Upcoming" lists every session from today on; "Week" is the day board with
 * the date strip. The choice is remembered per browser.
 */
type View = 'upcoming' | 'week'
const VIEW_KEY = 'karpul.view'
/** How far ahead the upcoming list looks. The API caps a range at 92 days. */
const UPCOMING_DAYS = 90

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'upcoming'
  } catch {
    return 'upcoming'
  }
}

/** A pending "are you sure?" — the confirm card owns the wording, the caller the action. */
interface Confirm {
  title: string
  body: ReactNode
  label: string
  onConfirm: () => void
}

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

const LIVE_LABEL = { connecting: 'Connecting', live: 'Live', offline: 'Offline' } as const
const LIVE_TITLE = {
  connecting: 'Connecting to the board…',
  live: 'Changes made by others show up here as they happen.',
  offline: 'Live updates are down; the board refreshes itself every 30 s until they are back.',
} as const

export default function App() {
  const [userName, setUserName] = useUserName()
  const [view, setViewState] = useState<View>(loadView)
  const [selected, setSelectedDate] = useState(todayISO)
  const [rides, setRides] = useState<Ride[]>([])
  const [cars, setCars] = useState<CorporateCar[]>([])
  const [loadedRange, setLoadedRange] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [form, setForm] = useState<FormState>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmState, setConfirm] = useState<Confirm | null>(null)
  // Which car tile is open. null = "whatever makes sense for this day" (see `selection`).
  const [carSel, setCarSel] = useState<CarSelection | null>(null)
  // First visit: ask for the name straight away rather than hiding it in a menu.
  const [nameOpen, setNameOpen] = useState(() => !userName)
  // The app menu (components/Sidebar.tsx), a drawer under the ☰ in the top bar.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // The company-car help (components/CarGuide.tsx): from the sidebar or a ride's driver card.
  const [guideOpen, setGuideOpen] = useState(false)
  // The passenger chip in flight and what it is hovering over (lib/dnd.ts).
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

  const setSelected = useCallback((iso: string) => {
    setSelectedDate(iso)
    setCarSel(null)
  }, [])

  const setView = useCallback((v: View) => {
    setViewState(v)
    setCarSel(null)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* private mode etc. */
    }
  }, [])

  // What is loaded: the next UPCOMING_DAYS from today, or the Mon-Sun week
  // around the selected day.
  const range = useMemo(() => {
    if (view === 'upcoming') {
      const today = parseISODate(todayISO())
      return { from: toISODate(today), to: toISODate(addDays(today, UPCOMING_DAYS)) }
    }
    const monday = startOfWeek(parseISODate(selected))
    return { from: toISODate(monday), to: toISODate(addDays(monday, 6)) }
  }, [view, selected])
  const rangeKey = `${range.from}:${range.to}`

  // Loads overlap when twenty people are busy: a reconnect, a range change and a
  // `cars.changed` can all be in flight together, and a live event can land
  // between sending the request and getting the answer. Only the newest load
  // may set the board, and an answer that an event may have overtaken is
  // fetched once more instead of being trusted.
  const loadSeq = useRef(0)
  const eventDuringLoad = useRef(false)

  const load = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    let next: Ride[] | null = null
    // One more round trip whenever an event overtook the answer; a quiet one ends it.
    do {
      eventDuringLoad.current = false
      try {
        next = await api.rides(range.from, range.to)
      } catch (e) {
        if (seq === loadSeq.current) setToast({ kind: 'error', text: `Could not load rides: ${errMsg(e)}` })
        next = null
        break
      }
    } while (seq === loadSeq.current && eventDuringLoad.current)
    if (seq !== loadSeq.current) return // superseded; that load sets the board
    if (next) setRides(next)
    setLoadedRange(rangeKey)
  }, [range, rangeKey])

  useEffect(() => {
    // Data fetching: the state update happens after the await, not synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const loading = loadedRange !== rangeKey

  useEffect(() => {
    api.corporateCars().then(setCars).catch(() => setCars([]))
  }, [])

  /** The admin list is the superset; the ride form only ever sees active cars. */
  const applyCars = useCallback((all: CorporateCar[]) => {
    setAdminCars(all)
    setCars(all.filter((c) => c.active))
  }, [])

  /** Put a ride the server just returned (over REST or the socket) in its row.
   *  An edit can move a ride into or out of the loaded range. */
  const upsertRide = useCallback(
    (ride: Ride) =>
      setRides((rs) => {
        const inRange = ride.ride_date >= range.from && ride.ride_date <= range.to
        const rest = rs.filter((r) => r.id !== ride.id)
        return inRange ? sortRides([...rest, ride]) : rest
      }),
    [range],
  )

  // Live board: the server pushes every change anyone makes (lib/live.ts).
  const onLiveEvent = useCallback(
    (ev: LiveEvent) => {
      switch (ev.type) {
        case 'ride.created':
        case 'ride.updated':
          eventDuringLoad.current = true
          upsertRide(ev.ride)
          break
        case 'ride.deleted':
          eventDuringLoad.current = true
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
    [upsertRide, load, adminUnlocked, adminPassword, applyCars],
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
      upsertRide(await api.join(ride.id, userName, userName))
      setToast({ kind: 'ok', text: `You're in with ${ride.driver_name}.` })
    })

  const onLeave = (ride: Ride, bookingId: number) =>
    withBusy(ride, async () => {
      upsertRide(await api.leave(ride.id, bookingId, userName))
    })

  /** The driver, or a passenger when the driver allows it, puts a colleague in. */
  const onAddPassenger = (ride: Ride, name: string) =>
    withBusy(ride, async () => {
      upsertRide(await api.join(ride.id, name, userName))
      setToast({ kind: 'ok', text: `${name} is in with ${ride.driver_name}.` })
    })

  /** The driver's switch: may the passengers add and remove each other? */
  const onTogglePassengersManage = (ride: Ride) =>
    withBusy(ride, async () => {
      const on = !ride.passengers_manage
      upsertRide(await api.updateRide(ride.id, { passengers_manage: on }, userName))
      setToast({ kind: 'ok', text: on ? 'Passengers can now add and remove each other.' : 'Only you manage the passenger list now.' })
    })

  const onCancel = (ride: Ride) => {
    const n = ride.bookings.length
    setConfirm({
      title: 'Remove this ride?',
      body:
        n > 0
          ? `${n} passenger${n === 1 ? ' is' : 's are'} in this car. They will lose their seat.`
          : `${ride.driver_name}'s ride in the ${ride.car_name} will be removed from ${fmtShortDate(ride.ride_date)}.`,
      label: 'Remove',
      onConfirm: () => {
        setConfirm(null)
        void withBusy(ride, async () => {
          await api.deleteRide(ride.id, userName)
          setRides((rs) => rs.filter((r) => r.id !== ride.id))
          setToast({ kind: 'ok', text: 'Ride removed.' })
        })
      },
    })
  }

  /** Drop of the passenger chip onto a car: switch cars if already seated, else join. */
  const onDropPassenger = (target: Ride, drag: PassengerDrag) => {
    if (!sameName(drag.name, userName)) return
    setCarSel(target.id)
    void withBusy(target, async () => {
      if (drag.fromRideId !== null && drag.bookingId !== null && drag.fromRideId !== target.id) {
        upsertRide(await api.leave(drag.fromRideId, drag.bookingId, userName))
      }
      upsertRide(await api.join(target.id, userName, userName))
      setToast({ kind: 'ok', text: `You're in with ${target.driver_name}.` })
    })
  }

  /** Where the chip landed. Looked up against the *current* rides: the board
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

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const closeGuide = useCallback(() => setGuideOpen(false), [])

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
        upsertRide(await api.updateRide(form.ride.id, patch, userName))
        setToast({ kind: 'ok', text: 'Ride updated.' })
        setCarSel(form.ride.id)
      } else {
        const created = await api.createRide(input)
        upsertRide(created)
        setToast({ kind: 'ok', text: 'Ride added.' })
        setCarSel(created.id)
      }
      closeForm()
      // The response is the ride as saved, so the board needs no reload; a
      // date outside the loaded range changes `range` and loads on its own.
      setSelectedDate(input.ride_date)
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

  const onDeleteCar = (car: CorporateCar) =>
    setConfirm({
      title: 'Delete this car?',
      body: `${car.name} (${car.plate}) will be deleted from the pool. Retiring it instead keeps it on past rides.`,
      label: 'Delete',
      onConfirm: () => {
        setConfirm(null)
        void withAdminBusy(car.id, async () => {
          await api.deleteCar(car.id, adminPassword)
          setToast({ kind: 'ok', text: `${car.name} deleted.` })
        })
      },
    })

  const upcoming = view === 'upcoming'
  const dayRides = upcoming ? [] : rides.filter((r) => r.ride_date === selected)
  const isPast = !upcoming && selected < todayISO()
  const myRideToday = dayRides.find((r) => r.bookings.some((b) => sameName(b.passenger_name, userName))) ?? null
  const myBookingToday = myRideToday?.bookings.find((b) => sameName(b.passenger_name, userName)) ?? null
  const canAdd = !isPast

  // Resolve the open tile: an explicit pick that still exists, else your own
  // car, else the first one, else the "add" tile.
  const selection: CarSelection | null = (() => {
    if (carSel === 'new') return canAdd ? 'new' : (dayRides[0]?.id ?? null)
    if (carSel !== null && dayRides.some((r) => r.id === carSel)) return carSel
    return myRideToday?.id ?? dayRides[0]?.id ?? (canAdd ? 'new' : null)
  })()
  const openRide = typeof selection === 'number' ? (dayRides.find((r) => r.id === selection) ?? null) : null
  // In the upcoming list only an explicit tap unfolds a car.
  const openUpcomingId = upcoming && typeof carSel === 'number' && rides.some((r) => r.id === carSel) ? carSel : null

  const openNewCar = () => (userName ? setForm({ mode: 'create' }) : setNameOpen(true))

  /** Unfold a row in the upcoming list; the week view follows it, should you switch. */
  const openUpcoming = (rideId: number | null) => {
    setCarSel(rideId)
    const ride = rideId !== null ? rides.find((r) => r.id === rideId) : undefined
    if (ride) setSelectedDate(ride.ride_date)
  }

  const detailFor = (ride: Ride, inList: boolean) => (
    <CarDetail
      key={ride.id}
      ride={ride}
      userName={userName}
      busy={busyId === ride.id}
      isPast={isPast}
      onJoin={onJoin}
      onLeave={onLeave}
      onAddPassenger={onAddPassenger}
      onCancel={onCancel}
      onEdit={(r) => setForm({ mode: 'edit', ride: r })}
      onDuplicate={(r) => (userName ? setForm({ mode: 'create', template: r }) : setNameOpen(true))}
      onTogglePassengersManage={onTogglePassengersManage}
      onGuide={() => setGuideOpen(true)}
      dragActive={drag !== null}
      lifted={drag?.fromRideId === ride.id}
      over={dragOver?.kind === 'ride' && dragOver.rideId === ride.id}
      onGrab={onGrab}
      draggable={!inList}
    />
  )

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn topbar-menu"
          aria-label="Menu"
          aria-haspopup="dialog"
          aria-expanded={sidebarOpen}
          aria-controls={sidebarOpen ? 'app-sidebar' : undefined}
          onClick={() => setSidebarOpen(true)}
        >
          <MenuIcon size={22} />
        </button>
        <h1 className="topbar-title">
          <CarIcon size={20} /> Karpul
        </h1>
        <div className="topbar-right">
          <span className={`live live-${liveStatus}`} role="status" title={LIVE_TITLE[liveStatus]}>
            <span className="live-dot" aria-hidden="true" />
            <span className="sr-only">{LIVE_LABEL[liveStatus]}</span>
          </span>
        </div>
      </header>

      <main>
        <div className="segmented view-switch" role="radiogroup" aria-label="View">
          <button
            type="button"
            role="radio"
            aria-checked={upcoming}
            className={upcoming ? 'seg seg-on' : 'seg'}
            onClick={() => setView('upcoming')}
          >
            <ListIcon size={16} /> Upcoming
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!upcoming}
            className={upcoming ? 'seg' : 'seg seg-on'}
            onClick={() => setView('week')}
          >
            <CalendarIcon size={16} /> Week
          </button>
        </div>

        {upcoming && (
          <>
            {loading ? (
              <div className="session-list session-skeleton" aria-busy="true">
                <span className="card session skeleton" />
                <span className="card session skeleton" />
                <span className="card session skeleton" />
              </div>
            ) : rides.length === 0 ? (
              <AddCarCard
                userName={userName}
                isPast={false}
                hasCars={false}
                emptyTitle="No upcoming sessions yet"
                onAdd={openNewCar}
                onEditName={() => setNameOpen(true)}
              />
            ) : (
              <>
                <Upcoming
                  rides={rides}
                  userName={userName}
                  openId={openUpcomingId}
                  onOpen={openUpcoming}
                  renderDetail={(ride) => detailFor(ride, true)}
                />
                <button type="button" className="add-row" onClick={openNewCar}>
                  <PlusIcon size={18} />
                  Add a ride
                </button>
              </>
            )}
          </>
        )}

        {!upcoming && (
          <>
            <DateCarousel selected={selected} rides={rides} onSelect={setSelected} />

            {loading ? (
              <div className="cars cars-skeleton" aria-busy="true">
                <span className="car-tile skeleton" />
                <span className="car-tile skeleton" />
                <span className="car-tile skeleton" />
              </div>
            ) : dayRides.length === 0 && !canAdd ? null : (
              <CarCarousel
                rides={dayRides}
                selected={selection}
                userName={userName}
                dragActive={drag !== null}
                over={dragOver}
                canAdd={canAdd}
                onSelect={setCarSel}
              />
            )}

            {!loading && openRide && detailFor(openRide, false)}

            {!loading && !openRide && (
              <AddCarCard
                userName={userName}
                isPast={isPast}
                hasCars={dayRides.length > 0}
                onAdd={openNewCar}
                onEditName={() => setNameOpen(true)}
              />
            )}

            {!loading && (
              <YouPanel
                userName={userName}
                dayRides={dayRides}
                currentRide={myRideToday}
                currentBookingId={myBookingToday?.id ?? null}
                isPast={isPast}
                dragActive={drag !== null}
                over={dragOver?.kind === 'tray'}
                onGrab={onGrab}
                onOpenCar={setCarSel}
                onEditName={() => setNameOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {sidebarOpen && (
        <Sidebar
          userName={userName}
          canAdd={canAdd}
          onAddRide={openNewCar}
          onEditName={() => setNameOpen(true)}
          onCompanyCars={openAdmin}
          onGuide={() => setGuideOpen(true)}
          onClose={closeSidebar}
        />
      )}

      {guideOpen && <CarGuide onClose={closeGuide} />}

      {nameOpen && <NameSheet name={userName} onChange={setUserName} onClose={() => setNameOpen(false)} />}

      {form && (
        <RideForm
          key={form.mode === 'edit' ? form.ride.id : 'new'}
          date={selected}
          userName={userName}
          cars={cars}
          existing={form.mode === 'edit' ? form.ride : null}
          template={form.mode === 'create' ? form.template : null}
          submitting={submitting}
          error={formError}
          onSubmit={onSubmitForm}
          onDelete={
            form.mode === 'edit'
              ? () => {
                  const ride = form.ride
                  closeForm()
                  onCancel(ride)
                }
              : undefined
          }
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

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          body={confirmState.body}
          confirmLabel={confirmState.label}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirm(null)}
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
