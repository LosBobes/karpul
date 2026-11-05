import { useCallback, useEffect, useState } from 'react'
import { NEW_CAR_BUSY_ID } from '../components/SharedCars'
import { api } from './api'
import type { Confirm } from './confirm'
import { errMsg } from './errors'
import { useT } from './i18n'
import type { CorporateCarInput, Ride } from './types'

interface Deps {
  isAdmin: boolean
  /** The board's rides: a new ask arrives as a live ride event, so the counts are asked again when they change. */
  rides: readonly Ride[]
  /** The board's busy wrapper for one ride: toasts and reloads on failure. */
  withBusy: (id: number, fn: () => Promise<void>) => Promise<void>
  upsertRide: (ride: Ride) => void
  removeRides: (gone: (ride: Ride) => boolean) => void
  reloadCars: () => Promise<void>
  load: () => Promise<void>
  notice: (text: string) => void
  setConfirm: (confirm: Confirm | null) => void
}

/**
 * The admin's desk on the board: the shared-car rides waiting for approval
 * (components/Approvals.tsx), the own cars' plates the Beograd garage still
 * needs (components/GarageList.tsx), and the car pool's controls on the
 * Shared cars sheet. `waiting` and `plates` are the counts on the drawer's
 * items and the dot on the ☰; `tick` tells an open sheet to reload after a
 * decision. For anyone else the counts stay 0 and nothing is asked.
 */
export function useAdminDesk({ isAdmin, rides, withBusy, upsertRide, removeRides, reloadCars, load, notice, setConfirm }: Deps) {
  const t = useT()
  const [waiting, setWaiting] = useState(0)
  const [plates, setPlates] = useState(0)
  const [tick, setTick] = useState(0)
  const bump = () => setTick((n) => n + 1)

  // How many wait: asked again whenever the board changes or a decision is made.
  useEffect(() => {
    if (!isAdmin) return
    api
      .approvals()
      .then((list) => setWaiting(list.length))
      .catch(() => undefined)
  }, [isAdmin, rides, tick])

  useEffect(() => {
    if (!isAdmin) return
    api
      .garage()
      .then((list) => setPlates(list.filter((r) => !r.plate_registered).length))
      .catch(() => undefined)
  }, [isAdmin, rides, tick])

  // --- a shared car past the driver's share: the admin's call ---

  const onApprove = (ride: Ride) =>
    withBusy(ride.id, async () => {
      try {
        upsertRide(await api.approveRide(ride.id))
        notice(t.toasts.rideApproved(ride.driver_name))
      } finally {
        bump()
      }
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
            notice(t.toasts.rideDeclined)
          } finally {
            bump()
          }
        })
      },
    })

  // --- an own car's plate for the Beograd garage: the admin ticks it off ---

  const onMarkPlate = (ride: Ride, registered: boolean, standing = false) =>
    withBusy(ride.id, async () => {
      try {
        upsertRide(await api.setPlateRegistered(ride.id, registered, standing))
      } finally {
        bump()
      }
    })

  // --- the car pool ---

  const [poolError, setPoolError] = useState<string | null>(null)
  const [poolBusyId, setPoolBusyId] = useState<number | null>(null)

  /** The Shared cars sheet opened: an admin gets the whole pool, retired cars too. */
  const refreshPool = () => {
    if (!isAdmin) return
    setPoolError(null)
    reloadCars().catch((e) => setPoolError(errMsg(e)))
  }

  async function withPoolBusy(id: number, fn: () => Promise<void>) {
    setPoolBusyId(id)
    setPoolError(null)
    try {
      await fn()
      await reloadCars()
      // A car edit can rewrite `car_name` on rides already booked in it
      // (backend: relabel_rides_for_car), so the board has to be reloaded or it
      // keeps the old name and plate until the next event.
      await load()
    } catch (e) {
      setPoolError(errMsg(e))
    } finally {
      setPoolBusyId(null)
    }
  }

  const onCreateCar = (input: CorporateCarInput) =>
    void withPoolBusy(NEW_CAR_BUSY_ID, async () => {
      await api.createCar(input)
      notice(t.toasts.carAdded(input.name))
    })

  const onUpdateCar = (id: number, patch: Partial<CorporateCarInput & { active: boolean }>) =>
    void withPoolBusy(id, () => api.updateCar(id, patch).then(() => undefined))

  const onDeleteCar = (car: { id: number; name: string; plate: string }) =>
    setConfirm({
      title: t.confirm.deleteCarTitle,
      body: t.confirm.deleteCarBody(car.name, car.plate),
      label: t.common.delete,
      onConfirm: () => {
        setConfirm(null)
        void withPoolBusy(car.id, async () => {
          await api.deleteCar(car.id)
          notice(t.toasts.carDeleted(car.name))
        })
      },
    })

  const loadUsage = useCallback((days: number) => api.carUsage(days), [])
  const downloadUsage = useCallback((days: number) => api.downloadCarUsage(days), [])

  return {
    waiting,
    plates,
    tick,
    onApprove,
    onDecline,
    onMarkPlate,
    pool: { error: poolError, busyId: poolBusyId, refresh: refreshPool, onCreateCar, onUpdateCar, onDeleteCar, loadUsage, downloadUsage },
  }
}
