import type { Dispatch, SetStateAction } from 'react'
import { api } from './api'
import type { Confirm } from './confirm'
import { errMsg } from './errors'
import { fmtShortDate, fmtTime } from './dates'
import { useT } from './i18n'
import { drives, handsOver, isMyBooking, placeInLine, type Me } from './me'
import type { NewStop } from './stops'
import type { Ride, RideInput } from './types'
import type { Toast } from './useToast'

/** An edit came back as a new ask of the passengers rather than made (backend: rides.update_ride). */
export function newlyAsked(before: Ride, after: Ride): boolean {
  return !!after.proposal && JSON.stringify(after.proposal) !== JSON.stringify(before.proposal)
}

interface Deps {
  me: Me
  /** The rides on the board, for "remove this and following". */
  rides: readonly Ride[]
  /** The board's busy wrapper for one ride: toasts and reloads on failure. */
  withBusy: (id: number, fn: () => Promise<void>) => Promise<void>
  upsertRide: (ride: Ride) => void
  removeRides: (gone: (ride: Ride) => boolean) => void
  setToast: Dispatch<SetStateAction<Toast | null>>
  setConfirm: (confirm: Confirm | null) => void
}

/**
 * Everything a ride card (components/CarDetail.tsx) can do, as calls that
 * patch the board with the ride the server sends back (`upsertRide`) and say
 * so in a toast: getting in, out and across, the queue, the pickup points and
 * the route, the driver's switches, sharing, removal (a shared car with people
 * in it is handed to them, lib/me.ts `handsOver`), the driver's asks and the
 * passengers' answers, taking the wheel, claiming a ride, running late.
 */
export function useRideActions({ me, rides, withBusy, upsertRide, removeRides, setToast, setConfirm }: Deps) {
  const t = useT()

  const onJoin = (ride: Ride, pickup = '', newStop: NewStop | null = null) =>
    withBusy(ride.id, async () => {
      upsertRide(await api.join(ride.id, me.name, pickup, newStop))
      setToast({ kind: 'ok', text: t.toasts.youreIn(ride.driver_name) })
    })

  /** A ride waiting for a driver goes once nobody with an account is left to ask. */
  const afterLeave = (r: Ride) => {
    if (r.needs_driver && !r.bookings.some((b) => b.passenger_id !== null)) removeRides((x) => x.id === r.id)
    else upsertRide(r)
  }

  const leave = (ride: Ride, bookingId: number, done?: () => void) =>
    withBusy(ride.id, async () => {
      afterLeave(await api.leave(ride.id, bookingId))
      done?.()
    })

  /** Your own seat goes at once; someone else's only after "are you sure?",
   *  because they lose it (and are told who took it away). */
  const onLeave = (ride: Ride, bookingId: number) => {
    const booking = ride.bookings.find((b) => b.id === bookingId)
    if (!booking || isMyBooking(booking, me)) return leave(ride, bookingId)
    setConfirm({
      title: t.confirm.takeOutTitle,
      body: t.confirm.takeOutBody(booking.passenger_name),
      label: t.common.remove,
      onConfirm: () => {
        setConfirm(null)
        void leave(ride, bookingId, () => setToast({ kind: 'ok', text: t.toasts.takenOut(booking.passenger_name) }))
      },
    })
  }

  /** The keyboard's way of dragging the chip to another car: leave one, join the other. */
  const onSwitch = (target: Ride, from: { ride: Ride; bookingId: number }, pickup = '', newStop: NewStop | null = null) =>
    withBusy(target.id, async () => {
      afterLeave(await api.leave(from.ride.id, from.bookingId))
      upsertRide(await api.join(target.id, me.name, pickup, newStop))
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

  /** The driver (or an admin) saves the route edited in `RouteEditor`; true when it went through. */
  const onSaveRoute = async (ride: Ride, patch: Partial<RideInput>) => {
    let saved = false
    await withBusy(ride.id, async () => {
      const updated = await api.updateRide(ride.id, patch)
      upsertRide(updated)
      setToast({ kind: 'ok', text: newlyAsked(ride, updated) ? t.toasts.changeAsked : t.toasts.routeSaved })
      saved = true
    })
    return saved
  }

  /** A shared car's odometer (components/Odometer.tsx): the call returns the ride. */
  const onOdometer = (ride: Ride, call: () => Promise<Ride>) =>
    withBusy(ride.id, async () => {
      upsertRide(await call())
    })

  /** Queue for a seat in a full car. */
  const onWait = (ride: Ride, pickup: string, newStop: NewStop | null = null) =>
    withBusy(ride.id, async () => {
      const updated = await api.joinWaitlist(ride.id, pickup, newStop)
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
    // A shared car with people in it is offered to them rather than taken away.
    const handed = handsOver(ride, me)
    setConfirm({
      title: t.confirm.removeRideTitle,
      body: handed
        ? t.confirm.handOverPax(n)
        : n > 0
          ? t.confirm.removeRidePax(n)
          : t.confirm.removeRideBody(ride.driver_name, ride.car_name, fmtShortDate(ride.ride_date)),
      label: t.common.remove,
      onConfirm: () => {
        setConfirm(null)
        void withBusy(ride.id, async () => {
          await api.deleteRide(ride.id)
          if (handed) upsertRide(await api.ride(ride.id))
          else removeRides((r) => r.id === ride.id)
          setToast({ kind: 'ok', text: handed ? t.toasts.handedOver : t.toasts.rideRemoved })
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
          // The ones offered to their passengers stay; the live update marks them.
          // Decided before the call, as that update may land first.
          const kept = new Set(rides.filter((r) => handsOver(r, me)).map((r) => r.id))
          await api.deleteRide(ride.id, 'following')
          removeRides((r) => r.series_id === ride.series_id && r.ride_date >= ride.ride_date && !kept.has(r.id))
          setToast({ kind: 'ok', text: t.toasts.ridesRemoved })
        })
      },
    })

  // --- a ride under a name with no account: "this is me" ---

  // --- a shared car whose driver cancelled: a passenger takes the wheel ---

  // --- a change to the ride that waits on people (`Ride.proposal`) ---

  const onAnswerChange = (ride: Ride, agree: boolean) =>
    withBusy(ride.id, async () => {
      const updated = await api.answerChange(ride.id, agree)
      upsertRide(updated)
      const made = !updated.proposal && agree
      // Taking a passenger's suggestion asks the others, unless nobody is left to ask.
      const took = agree && !!ride.proposal?.suggested
      const text = made ? t.toasts.changeMade : took ? t.toasts.changeAsked : agree ? t.toasts.changeAgreed : t.toasts.changeDropped
      setToast({ kind: 'ok', text })
    })

  const onWithdrawChange = (ride: Ride) =>
    withBusy(ride.id, async () => {
      upsertRide(await api.withdrawChange(ride.id))
      setToast({ kind: 'ok', text: t.toasts.changeWithdrawn })
    })

  const onSuggestTime = async (ride: Ride, times: { departure_time?: string; return_time?: string }) => {
    let sent = false
    await withBusy(ride.id, async () => {
      upsertRide(await api.suggestTime(ride.id, times))
      setToast({ kind: 'ok', text: t.toasts.suggestionSent })
      sent = true
    })
    return sent
  }

  const onTakeOver = (ride: Ride) =>
    withBusy(ride.id, async () => {
      upsertRide(await api.takeOver(ride.id))
      setToast({ kind: 'ok', text: t.toasts.tookOver })
    })

  /** The driver (or an admin) confirms a ride from the shared car's paper log. */
  const onConfirmRide = (ride: Ride) =>
    withBusy(ride.id, async () => {
      upsertRide(await api.confirmRide(ride.id))
      setToast({ kind: 'ok', text: t.toasts.rideConfirmed })
    })

  const onClaim = (ride: Ride) =>
    withBusy(ride.id, async () => {
      const claimed = await api.claimRide(ride.id)
      for (const r of claimed) upsertRide(r)
      setToast({ kind: 'ok', text: t.toasts.claimed(claimed.length) })
    })

  // The driver's "running late": a line in the thread and a push to the car;
  // the ride comes back over the socket with its new message count.
  const onLate = (ride: Ride, minutes: number) =>
    withBusy(ride.id, async () => {
      await api.runningLate(ride.id, minutes)
      setToast({ kind: 'ok', text: t.toasts.lateSaid(minutes) })
    })

  return { onJoin, afterLeave, onLeave, onSwitch, onMovePickup, onAddStop, onSaveRoute, onOdometer, onWait, onLeaveLine, onShare, onDownloadCalendar, onAddPassenger, onTogglePassengersManage, onTogglePassengersAddStops, onCancel, onCancelFollowing, onAnswerChange, onWithdrawChange, onSuggestTime, onTakeOver, onConfirmRide, onClaim, onLate }
}
