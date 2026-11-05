/**
 * Who sees what on the ride card: the rules `CarDetail` mirrors from the
 * server (`may_run`, `may_manage_seats`, `join_ride` on an unconfirmed ride,
 * the claim of an account-less driver). Each is one render and a look for the
 * control by its label, so a regression shows here long before e2e/.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../lib/i18n'
import type { Me } from '../lib/me'
import type { Ride } from '../lib/types'
import { aRide, quietFetch, render } from '../test/render'
import { CarDetail } from './CarDetail'

const ANA: Me = { id: 1, name: 'Ana Anić' }
const BOJAN: Me = { id: 2, name: 'Bojan Bojić' }
const MILA: Me = { id: 3, name: 'Mila Milić' }
const BOSS: Me = { id: 9, name: 'Šef Šefić', admin: true }

const t = () => messages().detail

function card(ride: Ride, me: Me, extra: { isPast?: boolean } = {}) {
  const noop = vi.fn()
  const props = {
    ride,
    busy: false,
    isPast: extra.isPast ?? false,
    coming: true,
    dragActive: false,
    lifted: false,
    over: false,
    draggable: false,
    onJoin: noop,
    onLeave: noop,
    onMovePickup: noop,
    onAddStop: noop,
    onSaveRoute: vi.fn(async () => true),
    onShare: noop,
    onDownloadCalendar: noop,
    onCancelFollowing: noop,
    onAddPassenger: vi.fn(async () => undefined),
    onCancel: noop,
    onEdit: noop,
    onDuplicate: noop,
    onTogglePassengersManage: noop,
    onTogglePassengersAddStops: noop,
    onApprove: noop,
    onDecline: noop,
    onClaim: noop,
    onTakeOver: noop,
    onConfirmRide: noop,
    onAnswerChange: noop,
    onWithdrawChange: noop,
    onSuggestTime: vi.fn(async () => true),
    onLate: noop,
    onWait: noop,
    onLeaveLine: noop,
    onOdometer: noop,
    onError: noop,
    onGrab: noop,
  }
  return render(<CarDetail {...props} />, { me })
}

const withBojan = (overrides: Partial<Ride> = {}) =>
  aRide({
    bookings: [{ id: 11, passenger_id: 2, passenger_name: 'Bojan Bojić', pickup: '', created_at: '' }],
    free_seats: 1,
    ...overrides,
  })

beforeEach(quietFetch)

describe('CarDetail: running the ride', () => {
  it('gives the driver Edit and the seat controls', () => {
    const view = card(withBojan(), ANA)
    expect(view.host.querySelector('.driver-edit')).not.toBeNull()
    expect(view.button(t().removeName('Bojan Bojić'))).not.toBeNull()
    expect(view.button(t().getIn)).toBeNull()
  })

  it('gives an admin who does not drive the same', () => {
    const view = card(withBojan(), BOSS)
    expect(view.host.querySelector('.driver-edit')).not.toBeNull()
    expect(view.button(t().removeName('Bojan Bojić'))).not.toBeNull()
  })

  it('gives a passenger neither, only Leave for their own seat', () => {
    const view = card(withBojan(), BOJAN)
    expect(view.host.querySelector('.driver-edit')).toBeNull()
    expect(view.button(t().leave)).not.toBeNull()
  })
})

describe('CarDetail: the passenger list', () => {
  const twoIn = (manage: boolean) =>
    aRide({
      seats: 3,
      free_seats: 1,
      passengers_manage: manage,
      bookings: [
        { id: 11, passenger_id: 2, passenger_name: 'Bojan Bojić', pickup: '', created_at: '' },
        { id: 12, passenger_id: 3, passenger_name: 'Mila Milić', pickup: '', created_at: '' },
      ],
    })

  it('lets a passenger take others out only while the driver allows it', () => {
    expect(card(twoIn(false), BOJAN).button(t().removeName('Mila Milić'))).toBeNull()
    expect(card(twoIn(true), BOJAN).button(t().removeName('Mila Milić'))).not.toBeNull()
  })

  it('never lets someone outside the car take anyone out', () => {
    expect(card(twoIn(true), { id: 4, name: 'Vuk Vukić' }).button(t().removeName('Mila Milić'))).toBeNull()
  })

  it('offers a free seat to someone not in the car, and none in the past', () => {
    expect(card(withBojan(), MILA).button(t().getIn)).not.toBeNull()
    expect(card(withBojan(), MILA, { isPast: true }).button(t().getIn)).toBeNull()
  })

  it('holds the seats of a ride its driver has not confirmed', () => {
    const view = card(withBojan({ unconfirmed: true }), MILA)
    expect(view.button(t().getIn)).toBeNull()
    expect(view.text()).toContain(t().unconfirmedWait('Ana Anić'))
    // Whoever runs it confirms it.
    expect(card(withBojan({ unconfirmed: true }), ANA).button(t().confirm)).not.toBeNull()
  })
})

describe('CarDetail: the driver', () => {
  it('shows Call the driver to everyone but the driver', () => {
    const ride = aRide({ driver_phone: '+381 60 123' })
    expect(card(ride, MILA).button(t().callDriver)).not.toBeNull()
    expect(card(ride, ANA).button(t().callDriver)).toBeNull()
  })

  it('offers This is me on an account-less ride under a similar name, past rides included', () => {
    const logRide = aRide({ driver_id: null, driver_name: 'Mila Milic' })
    expect(card(logRide, MILA, { isPast: true }).button(t().claim)).not.toBeNull()
    expect(card(logRide, BOJAN).button(t().claim)).toBeNull()
  })

  it('shows an admin Approve on a pending shared car, and nobody else', () => {
    const pending = aRide({ approval: 'pending' })
    expect(card(pending, BOSS).button(t().approve)).not.toBeNull()
    expect(card(pending, MILA).button(t().approve)).toBeNull()
  })

  it('puts each passenger beside the place they get in at on the route, yours ringed', () => {
    const ride = aRide({
      stops: ['Zemun'],
      bookings: [
        { id: 11, passenger_id: 2, passenger_name: 'Bojan Bojić', pickup: '', created_at: '' },
        { id: 12, passenger_id: 3, passenger_name: 'Mila Milić', pickup: 'Zemun', created_at: '' },
      ],
    })
    const view = card(ride, MILA)
    const atStart = view.host.querySelector('.trip-start .trip-who')
    const atZemun = view.host.querySelector('.trip-via .trip-who')
    expect(atStart?.getAttribute('aria-label')).toBe(t().getInHere(['Bojan Bojić']))
    expect(atZemun?.getAttribute('aria-label')).toBe(t().getInHere(['Mila Milić']))
    expect(atZemun?.querySelector('.trip-face-me')).not.toBeNull()
    expect(atStart?.querySelector('.trip-face-me')).toBeNull()
  })
})
