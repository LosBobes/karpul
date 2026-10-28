import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AccountSheet } from './components/AccountSheet'
import { AddCarCard } from './components/AddCarCard'
import { AddRideFab, AddRideToolbarButton } from './components/AddRideButton'
import { AdminLog } from './components/AdminLog'
import { Approvals } from './components/Approvals'
import { AuthGate } from './components/AuthGate'
import { CarAdmin, NEW_CAR_BUSY_ID } from './components/CarAdmin'
import { CarGuide } from './components/CarGuide'
import { CarStatus } from './components/CarStatus'
import { CarCarousel } from './components/CarCarousel'
import { CarDetail } from './components/CarDetail'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DateCarousel } from './components/DateCarousel'
import { DayPlan, type Slot } from './components/DayPlan'
import { FeedbackSheet } from './components/FeedbackSheet'
import { FluentIcon, type FluentName } from './components/FluentIcon'
import { ArrowRightIcon, CalendarIcon, ClockIcon, ListIcon, MenuIcon } from './components/icons'
import { Logo } from './components/Logo'
import { MyRides } from './components/MyRides'
import { NotificationsSheet } from './components/NotificationsSheet'
import { PeopleAdmin } from './components/PeopleAdmin'
import { RideLog } from './components/RideLog'
import { RequestForm } from './components/RequestForm'
import { RequestList } from './components/RequestList'
import { UpdateScreen } from './components/UpdateScreen'
import { RideForm } from './components/RideForm'
import { Dock, Sidebar } from './components/Sidebar'
import { SlideSwitch } from './components/SlideSwitch'
import { SupportSheet } from './components/SupportSheet'
import { SegThumb } from './components/Segmented'
import { Upcoming } from './components/Upcoming'
import { YouPanel } from './components/YouPanel'
import { api, ApiError } from './lib/api'
import { setUser, useSession, type Session } from './lib/auth'
import { messages, useT } from './lib/i18n'
import { fmtShortDate, fmtTime, parseISODate, todayISO } from './lib/dates'
import { useSlideDir } from './lib/motion'
import type { PassengerDrag } from './lib/dnd'
import { drives, isMyRequest, MeContext, myBooking, placeInLine, type Me } from './lib/me'
import { resubscribePush } from './lib/push'
import { useUpdateNotices, useUpdateReady } from './lib/pwa'
import type { CorporateCarInput, Ride, RideInput, RideRequest, RideRequestInput } from './lib/types'
import { boardRange, daySelection, upcomingSelection, VIEWS, type View } from './lib/selection'
import type { NewStop } from './lib/stops'
import { useBoard } from './lib/useBoard'
import { useOverlays } from './lib/useOverlays'
import { usePassengerDrag } from './lib/usePassengerDrag'
import { useToast } from './lib/useToast'
import { useWide } from './lib/useWide'
import { promptInstall, setInstallDismissed, useInstallDismissed, useInstallMode } from './lib/install'
import { InstallCard } from './components/InstallCard'

type FormState = { mode: 'create'; template?: Ride; request?: RideRequest; slot?: Slot } | { mode: 'edit'; ride: Ride } | null

/**
 * "Upcoming" lists every session from today on; "Week" is the day board with
 * the date strip; "Day" is one day as a timeline of who has which car when
 * (components/DayPlan.tsx). The choice is remembered per browser.
 */
const VIEW_KEY = 'karpul.view'

/** The sheets and drawers, by name (lib/useOverlays.ts); each renders at the foot of the board. */
type Overlay =
  | 'sidebar'
  | 'account'
  | 'guide'
  | 'carState'
  | 'myRides'
  | 'notif'
  | 'support'
  | 'feedback'
  | 'update'
  | 'cars'
  | 'people'
  | 'rideLog'
  | 'adminLog'
  | 'approvals'

function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'week' || v === 'day' ? v : 'upcoming'
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

/**
 * The board, for a signed-in person. Who they are travels down as `MeContext`
 * (lib/me.ts): the account's id is what rides and seats point at, its display
 * name is what the board shows.
 */
function Board({ session }: { session: Session }) {
  const t = useT()
  const user = session.user
  const userName = user.display_name
  const me = useMemo<Me>(
    () => ({ id: user.id, name: user.display_name, admin: user.is_admin }),
    [user.id, user.display_name, user.is_admin],
  )
  const [view, setViewState] = useState<View>(loadView)
  const [selected, setSelectedDate] = useState(todayISO)
  const [busyId, setBusyId] = useState<number | null>(null)
  const { toast, setToast, notice, failure } = useToast()
  const [form, setForm] = useState<FormState>(null)
  const [formError, setFormError] = useState<string | null>(null)
  // The error is the shared-car share: the form offers to ask an admin instead.
  const [formAsk, setFormAsk] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // "Ask for a ride" (components/RequestForm.tsx): the day it opens on, or closed.
  const [askDate, setAskDate] = useState<string | null>(null)
  const [askError, setAskError] = useState<string | null>(null)
  const [confirmState, setConfirm] = useState<Confirm | null>(null)
  // Which car tile is open. null = "whatever makes sense for this day" (see `selection`).
  const [carSel, setCarSel] = useState<number | null>(null)
  // The sheets and drawers: your account (AccountSheet), the app menu
  // (Sidebar, under the ☰), the company-car help (CarGuide, from the drawer
  // or a ride's driver card), how the shared cars stand (CarStatus), your
  // figures (MyRides), the push switch (NotificationsSheet), who to ask
  // (SupportSheet) and the bug form (FeedbackSheet), the update screen, and
  // the admin's sheets (CarAdmin, PeopleAdmin, RideLog, AdminLog, Approvals).
  const { is, show, hide, closer } = useOverlays<Overlay>()

  // Admin (backend: app/admin.py): the company-car pool and the people. The
  // drawer offers them to admins only; the server checks every call anyway.
  const isAdmin = user.is_admin
  // The shared-car rides waiting for an admin (components/Approvals.tsx):
  // how many wait (a count in the drawer and a dot on the ☰), and a tick
  // that tells the open sheet to reload after a decision.
  const [waiting, setWaiting] = useState(0)
  const [approvalsTick, setApprovalsTick] = useState(0)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminBusyId, setAdminBusyId] = useState<number | null>(null)

  useEffect(() => {
    document.title = t.documentTitle
  }, [t])

  // The account as the server sees it now: an admin may have been made one,
  // or a session saved by an older build lacks the newer fields.
  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => undefined)
  }, [])

  // This browser may still be subscribed to pushes under whoever used it last
  // (backend: app/push.py files a subscription under an account), so every
  // sign-in files it again. A no-op when nothing is subscribed.
  useEffect(() => {
    void resubscribePush()
  }, [user.id])

  // A shared link, /ride/{id}: open that ride on its day, then tidy the URL so
  // a reload does not replay it. The server sent the shell with a preview.
  useEffect(() => {
    const m = window.location.pathname.match(/^\/ride\/(\d+)\/?$/)
    if (!m) return
    window.history.replaceState(null, '', '/')
    api
      .ride(Number(m[1]))
      .then((ride) => {
        setViewState('week')
        setSelectedDate(ride.ride_date)
        setCarSel(ride.id)
      })
      .catch(() => setToast({ kind: 'error', text: messages().toasts.rideNotFound }))
  }, [setToast])

  /** A line of the admin's log opens its ride on the day plan, where it sits among that day's cars. */
  const openLoggedRide = (rideId: number) => {
    hide('adminLog')
    hide('approvals')
    api
      .ride(rideId)
      .then((ride) => {
        setViewState('day')
        setSelectedDate(ride.ride_date)
        setCarSel(ride.id)
      })
      .catch(() => setToast({ kind: 'error', text: messages().toasts.rideNotFound }))
  }

  const setSelected = useCallback((iso: string) => {
    setSelectedDate(iso)
    setCarSel(null)
  }, [])

  const setView = useCallback((v: View) => {
    setViewState(v)
    setCarSel(null)
    // The day plan is about today first; its arrows and calendar go elsewhere.
    if (v === 'day') setSelectedDate(todayISO())
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* private mode etc. */
    }
  }, [])

  // What is loaded: the days ahead, the selected day for the day plan, or
  // the Mon-Sun week around the selected day (lib/selection.ts).
  const range = useMemo(() => boardRange(view, selected), [view, selected])

  const onLoadError = useCallback((e: unknown) => setToast({ kind: 'error', text: messages().toasts.couldNotLoad(errMsg(e)) }), [setToast])
  const board = useBoard(range, { isAdmin, onLoadError })
  const { rides, requests, cars, adminCars, carStates, reloadCarStates, loading, liveStatus, load, upsertRide, removeRides, upsertRequest, removeRequest, reloadCars } = board
  const openRequests = useMemo(() => requests.filter((r) => r.ride_id === null), [requests])

  // A newer build is installed and waiting (lib/pwa.ts); offered as a toast when no other shows.
  // ... unless this browser switched the notice off (the Notifications sheet).
  const updateNotices = useUpdateNotices()
  const updateReady = useUpdateReady() && updateNotices

  async function withBusy(id: number, fn: () => Promise<void>) {
    setBusyId(id)
    try {
      await fn()
    } catch (e) {
      setToast({ kind: 'error', text: errMsg(e) })
      void load()
    } finally {
      setBusyId(null)
    }
  }

  const onJoin = (ride: Ride, pickup = '', newStop: NewStop | null = null) =>
    withBusy(ride.id, async () => {
      upsertRide(await api.join(ride.id, userName, pickup, newStop))
      setToast({ kind: 'ok', text: t.toasts.youreIn(ride.driver_name) })
    })

  const onLeave = (ride: Ride, bookingId: number) =>
    withBusy(ride.id, async () => {
      upsertRide(await api.leave(ride.id, bookingId))
    })

  /** The keyboard's way of dragging the chip to another car: leave one, join the other. */
  const onSwitch = (target: Ride, from: { ride: Ride; bookingId: number }, pickup = '', newStop: NewStop | null = null) =>
    withBusy(target.id, async () => {
      upsertRide(await api.leave(from.ride.id, from.bookingId))
      upsertRide(await api.join(target.id, userName, pickup, newStop))
      setToast({ kind: 'ok', text: t.toasts.youreIn(target.driver_name) })
    })

  const onMovePickup = (ride: Ride, bookingId: number, pickup: string, newStop: NewStop | null = null) =>
    withBusy(ride.id, async () => {
      upsertRide(await api.movePickup(ride.id, bookingId, pickup, newStop))
      setToast({ kind: 'ok', text: t.toasts.pickupChanged(pickup || ride.origin) })
    })

  /** The driver (or an admin) puts another pickup point on the route. */
  const onAddStop = (ride: Ride, stop: string, where: NewStop) =>
    withBusy(ride.id, async () => {
      upsertRide(await api.addStop(ride.id, stop, where))
      setToast({ kind: 'ok', text: t.toasts.stopAdded(stop) })
    })

  /** A shared car's odometer (components/Odometer.tsx): the call returns the ride. */
  const onOdometer = (ride: Ride, call: () => Promise<Ride>) =>
    withBusy(ride.id, async () => {
      upsertRide(await call())
    })

  /** Queue for a seat in a full car. */
  const onWait = (ride: Ride, pickup: string) =>
    withBusy(ride.id, async () => {
      const updated = await api.joinWaitlist(ride.id, pickup)
      upsertRide(updated)
      setToast({ kind: 'ok', text: t.toasts.waiting(placeInLine(updated, me)) })
    })

  /** Leave the queue yourself, or (the driver) take someone off it. */
  const onLeaveLine = (ride: Ride, entryId: number) =>
    withBusy(ride.id, async () => {
      const mine = ride.waitlist.find((w) => w.id === entryId)?.user_id === me.id
      upsertRide(await api.leaveWaitlist(ride.id, entryId))
      if (mine) setToast({ kind: 'ok', text: t.toasts.stoppedWaiting })
    })

  /** The system share sheet where there is one, else the link goes to the clipboard. */
  const onShare = async (ride: Ride) => {
    const url = `${window.location.origin}/ride/${ride.id}`
    const title = t.share.title(ride.driver_name, ride.origin, ride.destination)
    const text = t.detail.shareText(ride.driver_name, ride.origin, ride.destination, `${fmtShortDate(ride.ride_date)} ${fmtTime(ride.departure_time)}`)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url })
        return
      } catch {
        /* dismissed, or not allowed here: fall back to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setToast({ kind: 'ok', text: t.toasts.linkCopied })
    } catch {
      setToast({ kind: 'error', text: url })
    }
  }

  const onDownloadCalendar = (ride: Ride) => {
    api.downloadRideCalendar(ride.id).catch((e) => setToast({ kind: 'error', text: errMsg(e) }))
  }

  /** The driver, or a passenger when the driver allows it, puts a colleague in. */
  const onAddPassenger = (ride: Ride, name: string) =>
    withBusy(ride.id, async () => {
      upsertRide(await api.join(ride.id, name))
      setToast({ kind: 'ok', text: t.toasts.nameIn(name, ride.driver_name) })
    })

  /** The driver's switch: may the passengers add and remove each other? */
  const onTogglePassengersManage = (ride: Ride) =>
    withBusy(ride.id, async () => {
      const on = !ride.passengers_manage
      upsertRide(await api.updateRide(ride.id, { passengers_manage: on }))
      setToast({ kind: 'ok', text: on ? t.toasts.manageOn : drives(ride, me) ? t.toasts.manageOff : t.toasts.manageOffFor(ride.driver_name) })
    })

  /** The driver's switch: may the passengers put new pickup points on the route? */
  const onTogglePassengersAddStops = (ride: Ride) =>
    withBusy(ride.id, async () => {
      const on = !ride.passengers_add_stops
      upsertRide(await api.updateRide(ride.id, { passengers_add_stops: on }))
      setToast({ kind: 'ok', text: on ? t.toasts.addStopsOn : t.toasts.addStopsOff })
    })

  const onCancel = (ride: Ride) => {
    const n = ride.bookings.length
    setConfirm({
      title: t.confirm.removeRideTitle,
      body: n > 0 ? t.confirm.removeRidePax(n) : t.confirm.removeRideBody(ride.driver_name, ride.car_name, fmtShortDate(ride.ride_date)),
      label: t.common.remove,
      onConfirm: () => {
        setConfirm(null)
        void withBusy(ride.id, async () => {
          await api.deleteRide(ride.id)
          removeRides((r) => r.id === ride.id)
          setToast({ kind: 'ok', text: t.toasts.rideRemoved })
        })
      },
    })
  }

  /** "Remove this and following": the rest of a weekly series goes with this ride. */
  const onCancelFollowing = (ride: Ride) =>
    setConfirm({
      title: t.confirm.removeFollowingTitle,
      body: t.confirm.removeFollowingBody,
      label: t.common.remove,
      onConfirm: () => {
        setConfirm(null)
        void withBusy(ride.id, async () => {
          await api.deleteRide(ride.id, 'following')
          removeRides((r) => r.series_id === ride.series_id && r.ride_date >= ride.ride_date)
          setToast({ kind: 'ok', text: t.toasts.ridesRemoved })
        })
      },
    })

  /** Drop of the passenger chip onto a car: switch cars if already seated, else join. */
  const onDropPassenger = (target: Ride, drag: PassengerDrag) => {
    setCarSel(target.id)
    void withBusy(target.id, async () => {
      if (drag.fromRideId !== null && drag.bookingId !== null && drag.fromRideId !== target.id) {
        upsertRide(await api.leave(drag.fromRideId, drag.bookingId))
      }
      upsertRide(await api.join(target.id, userName))
      setToast({ kind: 'ok', text: t.toasts.youreIn(target.driver_name) })
    })
  }

  // Where the chip lands is looked up against the *current* rides: the board
  // can change under a drag (live updates), so the hook reads them at drop time.
  const { drag, dragOver, onGrab } = usePassengerDrag({
    onDropOnRide: (rideId, dragged) => {
      const ride = rides.find((r) => r.id === rideId)
      if (ride) onDropPassenger(ride, dragged)
    },
    onDropOnTray: (dragged) => {
      const from = dragged.fromRideId !== null ? rides.find((r) => r.id === dragged.fromRideId) : undefined
      if (from && dragged.bookingId !== null) void onLeave(from, dragged.bookingId)
    },
  })

  const closeForm = useCallback(() => {
    setForm(null)
    setFormError(null)
    setFormAsk(false)
  }, [])

  async function onSubmitForm(input: RideInput, wayBack?: RideInput) {
    setSubmitting(true)
    setFormError(null)
    setFormAsk(false)
    try {
      if (form?.mode === 'edit') {
        // The driver of a ride never changes, and the API has no field for it.
        const { driver_name: _driver, driver_id: _driverId, request_id: _request, ...patch } = input
        void _driver
        void _driverId
        void _request
        upsertRide(await api.updateRide(form.ride.id, patch))
        setToast({ kind: 'ok', text: t.toasts.rideUpdated })
        setCarSel(form.ride.id)
      } else {
        const created = await api.createRide(input)
        upsertRide(created)
        const answered = form?.mode === 'create' ? form.request : undefined
        // The way back is a second ride; the first is in by now, so its
        // failure (the shared car's share, a clash) is a toast, not the form's error.
        let backFailed: string | null = null
        if (wayBack) {
          try {
            upsertRide(await api.createRide(wayBack))
          } catch (e) {
            backFailed = errMsg(e)
          }
        }
        if (input.repeat_until) {
          // The other weeks reach this tab over the socket; a reload catches up if it is down.
          void load()
          const weeks = Math.floor((parseISODate(input.repeat_until).getTime() - parseISODate(input.ride_date).getTime()) / (7 * 86_400_000)) + 1
          setToast({ kind: 'ok', text: t.toasts.ridesAdded(weeks) })
        } else if (wayBack) {
          setToast(backFailed ? { kind: 'error', text: t.toasts.wayBackFailed(backFailed) } : { kind: 'ok', text: t.toasts.bothAdded })
        } else {
          setToast({
            kind: 'ok',
            text:
              created.approval === 'pending'
                ? t.toasts.rideAwaiting
                : answered
                  ? t.toasts.requestAnswered(answered.name)
                  : input.driver_id
                    ? t.toasts.rideAddedFor(input.driver_name)
                    : t.toasts.rideAdded,
          })
        }
        // The request is answered now; the socket brings that too, this is just sooner.
        if (answered) upsertRequest({ ...answered, ride_id: created.id })
        setCarSel(created.id)
      }
      closeForm()
      // The response is the ride as saved, so the board needs no reload; a
      // date outside the loaded range changes `range` and loads on its own.
      setSelectedDate(input.ride_date)
    } catch (e) {
      setFormError(errMsg(e))
      // The share's refusal (backend: services.LIMIT_WEEK / LIMIT_DAY) names its own way out.
      setFormAsk(e instanceof ApiError && /An admin can approve (another|it)$/.test(e.message))
    } finally {
      setSubmitting(false)
    }
  }

  // --- a shared car past the driver's share: the admin's call ---

  const onApprove = (ride: Ride) =>
    withBusy(ride.id, async () => {
      try {
        upsertRide(await api.approveRide(ride.id))
        setToast({ kind: 'ok', text: t.toasts.rideApproved(ride.driver_name) })
      } finally {
        setApprovalsTick((n) => n + 1)
      }
    })

  // --- a ride under a name with no account: "this is me" ---

  const onClaim = (ride: Ride) =>
    withBusy(ride.id, async () => {
      const claimed = await api.claimRide(ride.id)
      for (const r of claimed) upsertRide(r)
      setToast({ kind: 'ok', text: t.toasts.claimed(claimed.length) })
    })

  const onDecline = (ride: Ride) =>
    setConfirm({
      title: t.confirm.declineTitle,
      body: t.confirm.declineBody(ride.driver_name),
      label: t.detail.decline,
      onConfirm: () => {
        setConfirm(null)
        void withBusy(ride.id, async () => {
          try {
            await api.declineRide(ride.id)
            removeRides((r) => r.id === ride.id)
            setToast({ kind: 'ok', text: t.toasts.rideDeclined })
          } finally {
            setApprovalsTick((n) => n + 1)
          }
        })
      },
    })

  // How many wait, for the drawer's count: asked again whenever the board
  // changes (a new ask arrives as a live ride event) or a decision is made.
  useEffect(() => {
    if (!isAdmin) return
    api
      .approvals()
      .then((list) => setWaiting(list.length))
      .catch(() => undefined)
  }, [isAdmin, rides, approvalsTick])

  // --- asking for a ride ---

  const openAsk = (date: string) => {
    setAskError(null)
    setAskDate(date)
  }
  const closeAsk = useCallback(() => setAskDate(null), [])

  async function onSubmitAsk(input: RideRequestInput) {
    setSubmitting(true)
    setAskError(null)
    try {
      upsertRequest(await api.createRequest(input))
      setAskDate(null)
      setToast({ kind: 'ok', text: t.toasts.requestAdded })
    } catch (e) {
      setAskError(errMsg(e))
    } finally {
      setSubmitting(false)
    }
  }

  const onOffer = (request: RideRequest) => setForm({ mode: 'create', request })

  const onWithdraw = (request: RideRequest) =>
    withBusy(-request.id, async () => {
      await api.deleteRequest(request.id)
      removeRequest(request.id)
      setToast({ kind: 'ok', text: t.toasts.requestWithdrawn })
    })

  // --- admin: the car pool ---

  function openAdmin() {
    show('cars')
    setAdminError(null)
    reloadCars().catch((e) => setAdminError(errMsg(e)))
  }

  async function withAdminBusy(id: number, fn: () => Promise<void>) {
    setAdminBusyId(id)
    setAdminError(null)
    try {
      await fn()
      await reloadCars()
      // A car edit can rewrite `car_name` on rides already booked in it
      // (backend: relabel_rides_for_car), so the board has to be reloaded or it
      // keeps the old name and plate until the next event.
      await load()
    } catch (e) {
      setAdminError(errMsg(e))
    } finally {
      setAdminBusyId(null)
    }
  }

  const onCreateCar = (input: CorporateCarInput) =>
    void withAdminBusy(NEW_CAR_BUSY_ID, async () => {
      await api.createCar(input)
      setToast({ kind: 'ok', text: t.toasts.carAdded(input.name) })
    })

  const onUpdateCar = (id: number, patch: Partial<CorporateCarInput & { active: boolean }>) =>
    void withAdminBusy(id, () => api.updateCar(id, patch).then(() => undefined))

  const loadUsage = useCallback((days: number) => api.carUsage(days), [])
  const downloadUsage = useCallback((days: number) => api.downloadCarUsage(days), [])

  const onDeleteCar = (car: { id: number; name: string; plate: string }) =>
    setConfirm({
      title: t.confirm.deleteCarTitle,
      body: t.confirm.deleteCarBody(car.name, car.plate),
      label: t.common.delete,
      onConfirm: () => {
        setConfirm(null)
        void withAdminBusy(car.id, async () => {
          await api.deleteCar(car.id)
          setToast({ kind: 'ok', text: t.toasts.carDeleted(car.name) })
        })
      },
    })

  const upcoming = view === 'upcoming'
  const dayRides = upcoming ? [] : rides.filter((r) => r.ride_date === selected)
  const dayRequests = upcoming ? [] : openRequests.filter((r) => r.request_date === selected)
  const isPast = !upcoming && selected < todayISO()
  const myRideToday = dayRides.find((r) => myBooking(r, me) !== undefined) ?? null
  const myBookingToday = myRideToday ? (myBooking(myRideToday, me) ?? null) : null
  const askedToday = dayRequests.some((r) => isMyRequest(r, me))
  const canAdd = !isPast

  // Which tile is open on the day, and which row in the upcoming list (lib/selection.ts).
  const wide = useWide()
  const selection = daySelection(carSel, dayRides, me)
  const openRide = selection !== null ? (dayRides.find((r) => r.id === selection) ?? null) : null
  // The home-screen install offer (lib/install.ts): a card once, the drawer item after.
  const installMode = useInstallMode()
  const installDismissed = useInstallDismissed()
  const installDone = () => notice(messages().install.done)
  const installCard = installMode && !installDismissed && (
    <InstallCard mode={installMode} floating={wide} onInstalled={installDone} />
  )
  const openUpcomingId = upcoming ? upcomingSelection(carSel, rides, me, wide) : null
  const openUpcomingRide = openUpcomingId !== null ? (rides.find((r) => r.id === openUpcomingId) ?? null) : null

  const openNewCar = () => setForm({ mode: 'create' })

  // Motion (lib/motion.ts): Upcoming sits left of Week, so switching slides
  // the new view in from that side; the day board slides the way the
  // calendar moved (only while it is showing, so a date picked from the
  // upcoming list does not replay when you switch); the driver card slides
  // from the tile you tapped. Each is a keyed wrapper, so the slide plays
  // once, on mount.
  const viewDir = useSlideDir(view, (v) => VIEWS.indexOf(v as View))
  const dayDir = useSlideDir(view === 'week' ? selected : '', (iso) => (iso ? parseISODate(iso).getTime() : NaN))
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

  /** Your seat in another car on the same day, if any: the card offers a switch. */
  const seatElsewhere = (ride: Ride) => {
    const other = rides.find((r) => r.ride_date === ride.ride_date && r.id !== ride.id && myBooking(r, me) !== undefined)
    const booking = other ? myBooking(other, me) : undefined
    return other && booking ? { ride: other, bookingId: booking.id } : null
  }

  const detailFor = (ride: Ride, inList: boolean) => (
    <CarDetail
      key={ride.id}
      ride={ride}
      busy={busyId === ride.id}
      isPast={isPast}
      onJoin={onJoin}
      onLeave={onLeave}
      switchFrom={seatElsewhere(ride)}
      onSwitch={onSwitch}
      onMovePickup={onMovePickup}
      onAddStop={onAddStop}
      onShare={(r) => void onShare(r)}
      onDownloadCalendar={onDownloadCalendar}
      onCancelFollowing={onCancelFollowing}
      onAddPassenger={onAddPassenger}
      onCancel={onCancel}
      onEdit={(r) => setForm({ mode: 'edit', ride: r })}
      onDuplicate={(r) => setForm({ mode: 'create', template: r })}
      onTogglePassengersManage={onTogglePassengersManage}
      onTogglePassengersAddStops={onTogglePassengersAddStops}
      onApprove={onApprove}
      onDecline={onDecline}
      onClaim={(r) => void onClaim(r)}
      onGuide={() => show('guide')}
      carState={ride.corporate_car_id !== null ? (carStates?.find((s) => s.car.id === ride.corporate_car_id) ?? null) : null}
      onCarState={() => show('carState')}
      onWait={onWait}
      onLeaveLine={onLeaveLine}
      onOdometer={onOdometer}
      coming={ride.ride_date > todayISO()}
      onError={failure}
      dragActive={drag !== null}
      lifted={drag?.fromRideId === ride.id}
      over={dragOver?.kind === 'ride' && dragOver.rideId === ride.id}
      onGrab={onGrab}
      draggable={!inList}
    />
  )

  // The week view's three parts: one column on a phone, the tiles and your
  // own place beside the open ride on a wide screen.
  const dayTiles = loading ? (
    <div className="cars cars-skeleton" aria-busy="true">
      <span className="car-tile skeleton" />
      <span className="car-tile skeleton" />
      <span className="car-tile skeleton" />
    </div>
  ) : dayRides.length === 0 ? null : (
    <CarCarousel rides={dayRides} selected={selection} dragActive={drag !== null} over={dragOver} onSelect={setCarSel} vertical={wide} />
  )
  const dayDetail = loading ? null : openRide ? (
    <SlideSwitch id={String(openRide.id)} dir={tileDir}>
      {detailFor(openRide, false)}
    </SlideSwitch>
  ) : (
    <AddCarCard isPast={isPast} />
  )
  const dayYou = loading ? null : (
    <>
      <YouPanel
        dayRides={dayRides}
        currentRide={myRideToday}
        currentBookingId={myBookingToday?.id ?? null}
        isPast={isPast}
        dragActive={drag !== null}
        over={dragOver?.kind === 'tray'}
        onGrab={onGrab}
        onOpenCar={setCarSel}
        onAsk={() => openAsk(selected)}
        asked={askedToday}
      />
      <RequestList requests={dayRequests} isPast={isPast} busy={busyId !== null} onOffer={onOffer} onWithdraw={(r) => void onWithdraw(r)} />
    </>
  )

  const viewIcons: Record<View, ReactNode> = {
    upcoming: <ListIcon size={16} />,
    week: <CalendarIcon size={16} />,
    day: <ClockIcon size={16} />,
  }
  // On a phone the views are a Fluent bottom tab bar instead: the same radio
  // group, the active tab's mark filled. One green pill glides under the marks
  // to the picked tab, and the mark it lands on pops (keyed, so it replays).
  const tabMarks: Record<View, FluentName> = { upcoming: 'list', week: 'calendar', day: 'clock' }
  const tabBar = (
    <nav className="tabbar" role="radiogroup" aria-label={t.view.label}>
      <div className="tabbar-track" style={{ '--tab': VIEWS.indexOf(view) } as CSSProperties}>
        <span className="tab-glider" aria-hidden="true" />
        {VIEWS.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'tab tab-on' : 'tab'} onClick={() => setView(v)}>
            <span className="tab-pill" aria-hidden="true">
              <FluentIcon key={view === v ? 'on' : 'off'} className="tab-icon" name={tabMarks[v]} variant={view === v ? 'filled' : 'regular'} size={26} />
            </span>
            <span className="tab-label">{t.view[v]}</span>
          </button>
        ))}
      </div>
    </nav>
  )
  const viewSwitch = (
    <div className="segmented view-switch" role="radiogroup" aria-label={t.view.label}>
      <SegThumb count={VIEWS.length} index={VIEWS.indexOf(view)} />
      {VIEWS.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'seg seg-on' : 'seg'} onClick={() => setView(v)}>
          {viewIcons[v]} {t.view[v]}
        </button>
      ))}
    </div>
  )

  // The day plan: the timeline, and the ride a bar was tapped for under it
  // (beside it on a wide screen).
  const dayPlan = (
    <DayPlan
      date={selected}
      rides={dayRides}
      cars={cars}
      loading={loading}
      isPast={isPast}
      selectedId={carSel !== null && dayRides.some((r) => r.id === carSel) ? carSel : null}
      onSelect={setCarSel}
      onDate={setSelected}
      onBook={(slot) => setForm({ mode: 'create', slot })}
      onEdit={(ride) => setForm({ mode: 'edit', ride })}
    />
  )
  const planPicked = carSel !== null ? (dayRides.find((r) => r.id === carSel) ?? null) : null
  const planDetail = planPicked && <SlideSwitch id={String(planPicked.id)} dir="right">{detailFor(planPicked, true)}</SlideSwitch>

  // The app menu's items: a drawer under the ☰ on a phone, docked down the
  // left edge on a wide screen.
  const menu = {
    userName,
    handle: user.username,
    isAdmin,
    onAccount: () => show('account'),
    onCompanyCars: openAdmin,
    onPeople: () => show('people'),
    onRideLog: () => show('rideLog'),
    onAdminLog: () => show('adminLog'),
    onApprovals: () => show('approvals'),
    approvals: waiting,
    onGuide: () => show('guide'),
    onSupport: () => show('support'),
    onFeedback: () => show('feedback'),
    onMyRides: () => show('myRides'),
    onNotifications: () => show('notif'),
    onCarState: () => show('carState'),
    onInstall: installMode
      ? () => {
          if (installMode === 'prompt') void promptInstall().then((ok) => ok && installDone())
          else setInstallDismissed(false)
        }
      : undefined,
  }
  // On a wide screen each pane scrolls on its own (index.css, "Wide screens").
  const wrapSide = (node: ReactNode) =>
    wide ? (
      <div className="split-side" data-scroll-pane="">
        {node}
      </div>
    ) : (
      node
    )

  return (
    <MeContext.Provider value={me}>
      <div className={wide ? 'app app-wide' : 'app'}>
        {wide && <Dock {...menu} />}
        <div className="workspace">
          <header className="topbar">
            {wide ? (
              <h1 className="toolbar-title">{t.view[view]}</h1>
            ) : (
              <>
                <button
                  type="button"
                  className="icon-btn topbar-menu"
                  aria-label={t.common.menu}
                  aria-haspopup="dialog"
                  aria-expanded={is('sidebar')}
                  aria-controls={is('sidebar') ? 'app-sidebar' : undefined}
                  onClick={() => show('sidebar')}
                >
                  <MenuIcon size={22} />
                  {isAdmin && waiting > 0 && <span className="topbar-dot" aria-label={t.approvals.count(waiting)} />}
                </button>
                <h1 className="topbar-title">
                  <Logo /> Karpul
                </h1>
              </>
            )}
            {wide && <div className="topbar-center">{viewSwitch}</div>}
            <div className="topbar-right">
              <span className={`live live-${liveStatus}`} role="status" title={t.live.title[liveStatus]}>
                <span className="live-dot" aria-hidden="true" />
                <span className="sr-only">{t.live.label[liveStatus]}</span>
              </span>
              {wide && <AddRideToolbarButton onClick={openNewCar} disabled={!canAdd} />}
            </div>
          </header>

          <main>
            {!wide && installCard}

            {/* One switch for the three views, so the one leaving slides out as the next comes in. */}
            <SlideSwitch id={view} dir={viewDir}>
              {upcoming &&
                (loading ? (
                  <div className="session-list session-skeleton" aria-busy="true">
                    <span className="card session skeleton" />
                    <span className="card session skeleton" />
                    <span className="card session skeleton" />
                  </div>
                ) : rides.length === 0 && openRequests.length === 0 ? (
                  <>
                    <AddCarCard isPast={false} emptyTitle={t.empty.noUpcoming} />
                    <button type="button" className="add-row add-row-quiet" onClick={() => openAsk(todayISO())}>
                      {t.requests.ask}
                    </button>
                  </>
                ) : (
                  <div className={wide ? 'split' : undefined}>
                    {wrapSide(
                      <Upcoming
                        rides={rides}
                        requests={openRequests}
                        busy={busyId !== null}
                        onAsk={() => openAsk(todayISO())}
                        onOffer={onOffer}
                        onWithdraw={(r) => void onWithdraw(r)}
                        openId={openUpcomingId}
                        onOpen={wide ? (id) => id !== null && openUpcoming(id) : openUpcoming}
                        renderDetail={wide ? undefined : (ride) => detailFor(ride, true)}
                      />,
                    )}
                    {wide && openUpcomingRide && (
                      <aside className="split-pane" data-scroll-pane="" aria-label={openUpcomingRide.car_name}>
                        <SlideSwitch id={String(openUpcomingRide.id)} dir="right">{detailFor(openUpcomingRide, true)}</SlideSwitch>
                      </aside>
                    )}
                  </div>
                ))}

              {view === 'day' &&
                (wide ? (
                  <div className="split split-day">
                    <div className="split-side" data-scroll-pane="">{dayPlan}</div>
                    <aside className="split-pane" data-scroll-pane="" aria-label={planPicked?.car_name ?? t.plan.label}>
                      {planDetail ?? <div className="card empty-card empty-card-short plan-pick">{t.plan.pick}</div>}
                    </aside>
                  </div>
                ) : (
                  <>
                    {dayPlan}
                    {planDetail}
                  </>
                ))}

              {view === 'week' &&
                (wide ? (
                  <div className="split split-week">
                    <div className="split-side" data-scroll-pane="">
                      <DateCarousel selected={selected} rides={rides} onSelect={setSelected} />
                      <SlideSwitch id={selected} dir={dayDir}>
                        {dayTiles}
                        {dayYou}
                      </SlideSwitch>
                    </div>
                    <div className="split-pane" data-scroll-pane="">
                      <SlideSwitch id={selected} dir={dayDir}>{dayDetail}</SlideSwitch>
                    </div>
                  </div>
                ) : (
                  <>
                    <DateCarousel selected={selected} rides={rides} onSelect={setSelected} />
                    <SlideSwitch id={selected} dir={dayDir}>
                      {dayTiles}
                      {dayDetail}
                      {dayYou}
                    </SlideSwitch>
                  </>
                ))}
            </SlideSwitch>
          </main>
        </div>

        {!wide && canAdd && drag === null && <AddRideFab onClick={openNewCar} />}

        {!wide && tabBar}

        {wide && installCard}

        {is('sidebar') && !wide && <Sidebar {...menu} onClose={closer('sidebar')} />}

        {is('guide') && <CarGuide onSupport={() => show('support')} onClose={closer('guide')} />}

        {is('carState') && <CarStatus states={carStates} onNotice={notice} onReported={() => reloadCarStates().catch(() => undefined)} onClose={closer('carState')} />}

        {is('support') && <SupportSheet onFeedback={() => show('feedback')} onClose={closer('support')} />}

        {is('feedback') && <FeedbackSheet user={`${userName} (@${user.username})`} view={view} onClose={closer('feedback')} />}

        {is('myRides') && <MyRides user={user} onNotice={notice} onClose={closer('myRides')} />}

        {is('notif') && (
          <NotificationsSheet onChanged={(on) => setToast({ kind: 'ok', text: on ? t.toasts.notifOn : t.toasts.notifOff })} onClose={closer('notif')} />
        )}

        {is('update') && <UpdateScreen onClose={closer('update')} />}

        {is('account') && (
          <AccountSheet
            user={user}
            // A rename rewrites the name on every ride the person is in
            // (backend: services.rename_person) and those come over the socket;
            // the reload is for a socket that is down.
            onRenamed={() => void load()}
            onSaved={() => setToast({ kind: 'ok', text: t.account.saved })}
            onNotice={notice}
            onClose={closer('account')}
          />
        )}

        {form && (
          <RideForm
            key={form.mode === 'edit' ? form.ride.id : form.request ? `request-${form.request.id}` : 'new'}
            date={form.mode === 'create' && form.slot ? form.slot.date : selected}
            userName={userName}
            cars={cars}
            existing={form.mode === 'edit' ? form.ride : null}
            template={form.mode === 'create' ? form.template : null}
            request={form.mode === 'create' ? form.request : null}
            slot={form.mode === 'create' ? form.slot : null}
            submitting={submitting}
            error={formError}
            canAskApproval={formAsk}
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

        {askDate !== null && <RequestForm date={askDate} submitting={submitting} error={askError} onSubmit={onSubmitAsk} onClose={closeAsk} />}

        {is('cars') && isAdmin && (
          <CarAdmin
            cars={adminCars}
            loading={adminCars.length === 0}
            error={adminError}
            busyId={adminBusyId}
            onCreate={onCreateCar}
            onUpdate={onUpdateCar}
            onDelete={onDeleteCar}
            onLoadUsage={loadUsage}
            onDownloadUsage={downloadUsage}
            onClose={closer('cars')}
          />
        )}

        {is('people') && isAdmin && <PeopleAdmin onNotice={notice} onClose={closer('people')} />}

        {is('rideLog') && isAdmin && <RideLog onClose={closer('rideLog')} />}

        {is('adminLog') && isAdmin && <AdminLog onOpenRide={openLoggedRide} onClose={closer('adminLog')} />}

        {is('approvals') && isAdmin && (
          <Approvals
            version={approvalsTick + waiting}
            busyId={busyId}
            onApprove={(r) => void onApprove(r)}
            onDecline={onDecline}
            onOpen={(r) => openLoggedRide(r.id)}
            onClose={closer('approvals')}
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

        {/* The live region is always in the tree, so a screen reader hears each toast
            as it lands; the visible toast itself comes and goes. */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {toast?.text ?? ''}
        </div>
        {toast ? (
          <div className={`toast toast-${toast.kind}`} aria-hidden="true">
            {toast.text}
          </div>
        ) : (
          updateReady && (
            <button type="button" className="toast toast-update" onClick={() => show('update')}>
              <span className="update-toast-mark" aria-hidden="true">
                <Logo size={38} />
              </span>
              <span className="update-toast-text">
                <strong>{t.toasts.updateReady}</strong>
                <span>{t.toasts.updateHint}</span>
              </span>
              <span className="update-toast-go">
                {t.toasts.updateAction}
                <ArrowRightIcon size={14} />
              </span>
            </button>
          )
        )}
      </div>
    </MeContext.Provider>
  )
}

/** `/reset/<token>`: the app was opened on an admin's password reset link. */
function readResetToken(): string | null {
  const m = window.location.pathname.match(/^\/reset\/([A-Za-z0-9_-]+)\/?$/)
  return m ? m[1] : null
}

/**
 * The door. Without a session there is nothing to show and nothing to load, so
 * the sign-in screen is the whole app; signing in swaps the board in, keyed by
 * account so switching people never leaves the last one's state behind. A
 * password reset link takes the door's place, signed in or not: it is for
 * whoever it was made for.
 */
export default function App() {
  const session = useSession()
  const [resetToken, setResetToken] = useState(readResetToken)
  const doneResetting = useCallback(() => {
    window.history.replaceState(null, '', '/')
    setResetToken(null)
  }, [])
  if (resetToken) return <AuthGate resetToken={resetToken} onResetDone={doneResetting} />
  if (!session) return <AuthGate />
  return <Board key={session.user.id} session={session} />
}
