import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AddCarCard } from './components/AddCarCard'
import { AddRideFab } from './components/AddRideButton'
import { CarAdmin, NEW_CAR_BUSY_ID } from './components/CarAdmin'
import { CarGuide } from './components/CarGuide'
import { CarCarousel } from './components/CarCarousel'
import { CarDetail } from './components/CarDetail'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DateCarousel } from './components/DateCarousel'
import { CalendarIcon, ListIcon, MenuIcon } from './components/icons'
import { Logo } from './components/Logo'
import { NameSheet } from './components/NameSheet'
import { RideForm } from './components/RideForm'
import { Sidebar } from './components/Sidebar'
import { SegThumb } from './components/Segmented'
import { Upcoming } from './components/Upcoming'
import { YouPanel } from './components/YouPanel'
import { api, ApiError } from './lib/api'
import { messages, useT } from './lib/i18n'
import { addDays, fmtShortDate, parseISODate, sameName, startOfWeek, toISODate, todayISO } from './lib/dates'
import { slideClass, useSlideDir } from './lib/motion'
import { grabPassenger, type DropTarget, type PassengerDrag } from './lib/dnd'
import { useLiveBoard, type LiveEvent } from './lib/live'
import { applyUpdate, useUpdateReady } from './lib/pwa'
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

/** An error as a toast line, in the app's language (server texts are English, see i18n). */
function errMsg(e: unknown): string {
  const t = messages()
  if (e instanceof ApiError) return t.apiError(e.message)
  if (e instanceof Error) return e.message
  return t.common.somethingWrong
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

export default function App() {
  const t = useT()
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
  const [carSel, setCarSel] = useState<number | null>(null)
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

  useEffect(() => {
    document.title = t.documentTitle
  }, [t])

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
        if (seq === loadSeq.current) setToast({ kind: 'error', text: messages().toasts.couldNotLoad(errMsg(e)) })
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
  // A newer build is installed and waiting (lib/pwa.ts); offered as a toast when no other shows.
  const updateReady = useUpdateReady()

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
      setToast({ kind: 'ok', text: t.toasts.youreIn(ride.driver_name) })
    })

  const onLeave = (ride: Ride, bookingId: number) =>
    withBusy(ride, async () => {
      upsertRide(await api.leave(ride.id, bookingId, userName))
    })

  /** The driver, or a passenger when the driver allows it, puts a colleague in. */
  const onAddPassenger = (ride: Ride, name: string) =>
    withBusy(ride, async () => {
      upsertRide(await api.join(ride.id, name, userName))
      setToast({ kind: 'ok', text: t.toasts.nameIn(name, ride.driver_name) })
    })

  /** The driver's switch: may the passengers add and remove each other? */
  const onTogglePassengersManage = (ride: Ride) =>
    withBusy(ride, async () => {
      const on = !ride.passengers_manage
      upsertRide(await api.updateRide(ride.id, { passengers_manage: on }, userName))
      setToast({ kind: 'ok', text: on ? t.toasts.manageOn : t.toasts.manageOff })
    })

  const onCancel = (ride: Ride) => {
    const n = ride.bookings.length
    setConfirm({
      title: t.confirm.removeRideTitle,
      body: n > 0 ? t.confirm.removeRidePax(n) : t.confirm.removeRideBody(ride.driver_name, ride.car_name, fmtShortDate(ride.ride_date)),
      label: t.common.remove,
      onConfirm: () => {
        setConfirm(null)
        void withBusy(ride, async () => {
          await api.deleteRide(ride.id, userName)
          setRides((rs) => rs.filter((r) => r.id !== ride.id))
          setToast({ kind: 'ok', text: t.toasts.rideRemoved })
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
      setToast({ kind: 'ok', text: t.toasts.youreIn(target.driver_name) })
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
        setToast({ kind: 'ok', text: t.toasts.rideUpdated })
        setCarSel(form.ride.id)
      } else {
        const created = await api.createRide(input)
        upsertRide(created)
        setToast({ kind: 'ok', text: t.toasts.rideAdded })
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
      setToast({ kind: 'ok', text: t.toasts.carAdded(input.name) })
    })

  const onUpdateCar = (id: number, patch: Partial<CorporateCarInput & { active: boolean }>) =>
    void withAdminBusy(id, () => api.updateCar(id, patch, adminPassword).then(() => undefined))

  const onDeleteCar = (car: CorporateCar) =>
    setConfirm({
      title: t.confirm.deleteCarTitle,
      body: t.confirm.deleteCarBody(car.name, car.plate),
      label: t.common.delete,
      onConfirm: () => {
        setConfirm(null)
        void withAdminBusy(car.id, async () => {
          await api.deleteCar(car.id, adminPassword)
          setToast({ kind: 'ok', text: t.toasts.carDeleted(car.name) })
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
  // car, else the first one; with no rides that day nothing is open and the
  // empty card shows instead.
  const selection: number | null =
    carSel !== null && dayRides.some((r) => r.id === carSel) ? carSel : (myRideToday?.id ?? dayRides[0]?.id ?? null)
  const openRide = selection !== null ? (dayRides.find((r) => r.id === selection) ?? null) : null
  // In the upcoming list only an explicit tap unfolds a car.
  const openUpcomingId = upcoming && carSel !== null && rides.some((r) => r.id === carSel) ? carSel : null

  const openNewCar = () => (userName ? setForm({ mode: 'create' }) : setNameOpen(true))

  // Motion (lib/motion.ts): Upcoming sits left of Week, so switching slides
  // the new view in from that side; the day board slides the way the
  // calendar moved (only while it is showing, so a date picked from the
  // upcoming list does not replay when you switch); the driver card slides
  // from the tile you tapped. Each is a keyed wrapper, so the slide plays
  // once, on mount.
  const viewDir = useSlideDir(view, (v) => (v === 'week' ? 1 : 0))
  const dayDir = useSlideDir(upcoming ? '' : selected, (iso) => (iso ? parseISODate(iso).getTime() : NaN))
  const tileDir = useSlideDir(selection === null ? '' : String(selection), (id) => {
    const i = dayRides.findIndex((r) => String(r.id) === id)
    return i < 0 ? NaN : i
  })

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
          aria-label={t.common.menu}
          aria-haspopup="dialog"
          aria-expanded={sidebarOpen}
          aria-controls={sidebarOpen ? 'app-sidebar' : undefined}
          onClick={() => setSidebarOpen(true)}
        >
          <MenuIcon size={22} />
        </button>
        <h1 className="topbar-title">
          <Logo /> Karpul
        </h1>
        <div className="topbar-right">
          <span className={`live live-${liveStatus}`} role="status" title={t.live.title[liveStatus]}>
            <span className="live-dot" aria-hidden="true" />
            <span className="sr-only">{t.live.label[liveStatus]}</span>
          </span>
        </div>
      </header>

      <main>
        <div className="segmented view-switch" role="radiogroup" aria-label={t.view.label}>
          <SegThumb count={2} index={upcoming ? 0 : 1} />
          <button
            type="button"
            role="radio"
            aria-checked={upcoming}
            className={upcoming ? 'seg seg-on' : 'seg'}
            onClick={() => setView('upcoming')}
          >
            <ListIcon size={16} /> {t.view.upcoming}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!upcoming}
            className={upcoming ? 'seg' : 'seg seg-on'}
            onClick={() => setView('week')}
          >
            <CalendarIcon size={16} /> {t.view.week}
          </button>
        </div>

        {upcoming && (
          <div key="upcoming" className={['stack', slideClass(viewDir)].filter(Boolean).join(' ')}>
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
                emptyTitle={t.empty.noUpcoming}
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
              </>
            )}
          </div>
        )}

        {!upcoming && (
          <div key="week" className={['stack', slideClass(viewDir)].filter(Boolean).join(' ')}>
            <DateCarousel selected={selected} rides={rides} onSelect={setSelected} />

            <div key={selected} className={['stack', slideClass(dayDir)].filter(Boolean).join(' ')}>
              {loading ? (
                <div className="cars cars-skeleton" aria-busy="true">
                  <span className="car-tile skeleton" />
                  <span className="car-tile skeleton" />
                  <span className="car-tile skeleton" />
                </div>
              ) : dayRides.length === 0 ? null : (
                <CarCarousel
                  rides={dayRides}
                  selected={selection}
                  userName={userName}
                  dragActive={drag !== null}
                  over={dragOver}
                  onSelect={setCarSel}
                />
              )}

              {!loading && openRide && (
                <div key={openRide.id} className={['stack', slideClass(tileDir)].filter(Boolean).join(' ')}>
                  {detailFor(openRide, false)}
                </div>
              )}

              {!loading && !openRide && (
                <AddCarCard userName={userName} isPast={isPast} onEditName={() => setNameOpen(true)} />
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
            </div>
          </div>
        )}
      </main>

      {canAdd && drag === null && <AddRideFab onClick={openNewCar} />}

      {sidebarOpen && (
        <Sidebar
          userName={userName}
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

      {toast ? (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      ) : (
        updateReady && (
          <button type="button" className="toast toast-update" onClick={applyUpdate}>
            {t.toasts.updateReady} <b>{t.toasts.updateAction}</b>
          </button>
        )
      )}
    </div>
  )
}
