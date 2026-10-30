import { useState, type FormEvent } from 'react'
import { carBrand, carModel, carPowertrain, powertrainLabel } from '../lib/carModels'
import { factText } from '../lib/carState'
import { firstName, fmtTime, toISODate } from '../lib/dates'
import { dropZone, type PassengerDrag } from '../lib/dnd'
import { useT } from '../lib/i18n'
import { drives, inRide, isMyBooking, mayClaim, myBooking as findMyBooking, myWaitlistEntry, placeInLine, runs, useMe } from '../lib/me'
import { hasPins, mapsSearchUrl, pointOf, routeUrl, stopHint } from '../lib/maps'
import { useArrivals } from '../lib/motion'
import { keepsKm } from '../lib/odometer'
import { mapsOn, useMapConfig, useMapsAllowed } from '../lib/places'
import { allStops, MAX_STOPS, type NewStop } from '../lib/stops'
import { telHref } from '../lib/support'
import type { CarState, Ride, RideInput, RideRequest } from '../lib/types'
import { useCoarsePointer } from '../lib/useCoarsePointer'
import { useWide } from '../lib/useWide'
import { AddStop } from './AddStop'
import { RouteEditor } from './RouteEditor'
import { Avatar } from './Avatar'
import { BrandLogo, CarArt, PowertrainIcon } from './CarArt'
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  CarIcon,
  ChevronRightIcon,
  CoffeeIcon,
  CoinsIcon,
  CopyIcon,
  GripIcon,
  HourglassIcon,
  KebabIcon,
  MapIcon,
  NavigateIcon,
  PencilIcon,
  PhoneIcon,
  PinIcon,
  PlugIcon,
  PlusIcon,
  RepeatIcon,
  RoadIcon,
  ShareIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from './icons'
import { Menu } from './Menu'
import { Odometer } from './Odometer'
import { RideThread } from './RideThread'
import { RideMap, RouteMapSheet } from './RouteMap'
import { Select } from './Select'

interface Props {
  ride: Ride
  busy: boolean
  isPast: boolean
  /** Get in, at the origin ("") or one of the ride's stops, or at a new one put on the route at `newStop`. */
  onJoin: (ride: Ride, pickup: string, newStop?: NewStop | null) => void
  onLeave: (ride: Ride, bookingId: number) => void
  /** Your seat in another car that day; offered as "switch to this car". */
  switchFrom?: { ride: Ride; bookingId: number } | null
  onSwitch?: (ride: Ride, from: { ride: Ride; bookingId: number }, pickup: string, newStop?: NewStop | null) => void
  /** Move a passenger (yourself, or anyone if you may manage seats) to another pickup point, or a new one. */
  onMovePickup: (ride: Ride, bookingId: number, pickup: string, newStop?: NewStop | null) => void
  /** The driver (or an admin) puts another pickup point on the route. */
  /** The driver (or an admin) puts a pickup point on the route straight from `AddStop`. */
  onAddStop: (ride: Ride, stop: string, where: NewStop) => void
  /** The route edited in `RouteEditor`, saved; resolves true when it went through. */
  onSaveRoute: (ride: Ride, patch: Partial<RideInput>) => Promise<boolean>
  onShare: (ride: Ride) => void
  /** "Add to calendar": the ride's .ics, as a download. */
  onDownloadCalendar: (ride: Ride) => void
  /** Remove this ride and the later ones of its weekly series. */
  onCancelFollowing: (ride: Ride) => void
  /** Put somebody else in the car (driver, or a passenger when the driver allows it). */
  /** Settles once the call is done, so the form can stay until the passenger is in. */
  onAddPassenger: (ride: Ride, name: string) => Promise<void>
  onCancel: (ride: Ride) => void
  onEdit: (ride: Ride) => void
  onDuplicate: (ride: Ride) => void
  /** The driver's switch: may the passengers add and remove each other? */
  onTogglePassengersManage: (ride: Ride) => void
  /** The driver's switch: may the passengers put new pickup points on the route? */
  onTogglePassengersAddStops: (ride: Ride) => void
  /** Admin: a shared car past the driver's one a week, let through or refused. */
  onApprove: (ride: Ride) => void
  onDecline: (ride: Ride) => void
  /** "This is me": take over a ride whose driver is a name with no account. */
  onClaim: (ride: Ride) => void
  /** A passenger drives a shared car whose driver cancelled (`needs_driver`). */
  onTakeOver: (ride: Ride) => void
  /** The driver's one tap on the day: tell the car the ride leaves `minutes` late. */
  onLate: (ride: Ride, minutes: number) => void
  /** Opens the company-car guide (charging, the Mazda 6e); shown on company-car rides only. */
  onGuide?: () => void
  /** How the shared car stands (components/CarStatus.tsx), for the line under its name. */
  carState?: CarState | null
  onCarState?: () => void
  /** Queue for a seat in this full car, getting in at `pickup` once one frees up
   * (a new place, with `newStop`, goes on the route when the seat is yours). */
  onWait: (ride: Ride, pickup: string, newStop?: NewStop | null) => void
  /** Leave the queue (yourself), or take someone off it (the driver). */
  onLeaveLine: (ride: Ride, entryId: number) => void
  /** A shared car's odometer: runs the call and puts the ride it returns on the board. */
  onOdometer: (ride: Ride, call: () => Promise<Ride>) => void
  /** The ride's day is after today: its odometer waits for the day. */
  coming: boolean
  /** Your own open request that day, for the "on your way" hint (lib/maps.ts `stopHint`). */
  myRequest?: RideRequest
  /** Show the ride's map inline (a wide pane), rather than behind *Show on map*. */
  inlineMap?: boolean
  /** Something in the thread failed; the board says so in its toast. */
  onError: (text: string) => void
  dragActive: boolean
  /** The chip in flight was picked up from this car. */
  lifted: boolean
  /** The chip is hovering over this card. */
  over: boolean
  onGrab: (e: React.PointerEvent<HTMLElement>, drag: PassengerDrag) => void
  /** False where there is nowhere to drag the chip to (the upcoming list). */
  draggable?: boolean
}

/** The driver's "running late" choices (backend: schemas.LateIn). */
const LATE_CHOICES = [5, 10, 15]
/** How long after departure the driver may still say so. */
const LATE_AFTER_MIN = 60

/** Is it the ride's day, and not yet an hour past its departure? The server
 * takes a late notice all day (routers/thread.py); the row goes once it is moot. */
function lateWindow(ride: Ride, now = new Date()): boolean {
  if (ride.ride_date !== toISODate(now)) return false
  const [h, m] = ride.departure_time.split(':').map(Number)
  return now.getHours() * 60 + now.getMinutes() < h * 60 + m + LATE_AFTER_MIN
}

function openRoute(ride: Ride) {
  window.open(routeUrl(ride), '_blank', 'noopener,noreferrer')
}

/** The pickup choice that opens a field for a place not on the route yet. */
const ELSEWHERE = '\u0000elsewhere'

/**
 * The selected ride: who drives, when it leaves and comes back, where from and
 * to, and who is in the car. The passenger list doubles as the drop zone.
 */
export function CarDetail({
  ride,
  busy,
  isPast,
  onJoin,
  onLeave,
  switchFrom = null,
  onSwitch,
  onMovePickup,
  onAddStop,
  onSaveRoute,
  onShare,
  onDownloadCalendar,
  onCancelFollowing,
  onAddPassenger,
  onCancel,
  onEdit,
  onDuplicate,
  onTogglePassengersManage,
  onTogglePassengersAddStops,
  onApprove,
  onDecline,
  onClaim,
  onTakeOver,
  onLate,
  onGuide,
  carState = null,
  onCarState,
  onWait,
  onLeaveLine,
  onOdometer,
  coming,
  myRequest,
  inlineMap,
  onError,
  dragActive,
  lifted,
  over,
  onGrab,
  draggable = true,
}: Props) {
  const t = useT()
  const me = useMe()
  const coarse = useCoarsePointer()
  const isDriver = drives(ride, me)
  // The driver runs the ride; so may an admin, who schedules the cars (backend: _may_run).
  const runsIt = runs(ride, me)
  const model = carModel(ride.car_name)
  const brand = model ? null : carBrand(ride.car_name)
  const powertrain = carPowertrain(ride.car_name)
  const myBooking = findMyBooking(ride, me)
  const full = ride.free_seats <= 0
  // A seat on offer stays on screen while a call is out (its buttons only go
  // disabled), so the card never flickers through "No passengers yet" before
  // the passenger arrives; `canJoin` is whether it can be taken right now.
  const seatOnOffer = !isDriver && !myBooking && !full && !isPast
  const canJoin = seatOnOffer && !busy
  const receives = dragActive && canJoin
  // Who may put other people in and take them out: the driver (or an admin)
  // always, the passengers while the driver has switched it on (backend: _may_manage_seats).
  const canManage = !isPast && (runsIt || (ride.passengers_manage && !!myBooking))
  const canAddOther = canManage && !full
  // A full car has a queue: the first seat that frees up goes to the first in line.
  const myEntry = myWaitlistEntry(ride, me)
  const line = placeInLine(ride, me)
  const canWait = full && !isDriver && !myBooking && !myEntry && !isPast && ride.seats > 0

  const [adding, setAdding] = useState(false)
  const arrived = useArrivals(ride.bookings.map((b) => b.id))
  const [newName, setNewName] = useState('')
  // Where you get in: the start, one of the stops, or somewhere new you put on the route.
  const [pickup, setPickup] = useState('')
  const [movingPickup, setMovingPickup] = useState<false | 'pick' | 'new'>(false)
  // Whoever runs the ride: straight to a new pickup point, or the whole route.
  const [routing, setRouting] = useState<'add' | 'edit' | null>(null)
  const [showMap, setShowMap] = useState(false)
  const mapConfig = useMapConfig()
  // Without the maps (KARPUL_MAPS) none of this shows.
  const mapsAllowed = useMapsAllowed()
  const wide = useWide()
  const pinned = hasPins(ride) && mapsOn(mapConfig)
  const mapInline = pinned && (inlineMap ?? wide)
  // Your request that day starts near this route: offer to get in there.
  const hint = mapsAllowed && seatOnOffer ? stopHint(ride, myRequest) : null
  const hasStops = allStops(ride).length > 0
  const roomForStop = allStops(ride).length < MAX_STOPS
  // Off, a passenger picks from the route as it is; the driver still adds places.
  const mayAddStop = roomForStop && (ride.passengers_add_stops || runsIt)
  const pickupOptions = [
    ...ride.stops_before.map((s) => ({ value: s, label: s, hint: t.detail.beforeStart })),
    { value: '', label: ride.origin, hint: t.detail.start },
    ...ride.stops.map((s) => ({ value: s, label: s })),
  ]
  const withElsewhere = mayAddStop ? [...pickupOptions, { value: ELSEWHERE, label: t.detail.elsewhere }] : pickupOptions
  const choosingPlace = pickup === ELSEWHERE
  // A passenger's own *Add a pickup point*: getting in, queueing or moving their seat to a new place.
  const passengerAddsStop = !isPast && !isDriver && mayAddStop && (seatOnOffer || canWait || !!myBooking)
  const switching = !!switchFrom && !!onSwitch
  const getIn = () => (switching ? onSwitch!(ride, switchFrom!, pickup) : onJoin(ride, pickup))
  const getInAt = (place: string, where: NewStop) => {
    setPickup('')
    if (switching) onSwitch!(ride, switchFrom!, place, where)
    else onJoin(ride, place, where)
  }
  // Where you get in is a pill on the button that takes the seat, so it never reads as the route.
  const pickupChip = (prefix?: string) => (
    <Select
      variant="chip"
      label={t.detail.pickup}
      prefix={prefix}
      icon={<PinIcon size={14} />}
      value={pickup}
      options={withElsewhere}
      onChange={setPickup}
    />
  )
  const getInLabel = dragActive ? t.detail.dropToGetIn : switching ? t.detail.switchTo : t.detail.getIn

  // Every place opens in the maps app: by its pin when it has one, else by its words.
  const placeLink = (place: string) =>
    mapsAllowed ? (
      <a
        className={pointOf(ride, place) ? 'trip-map trip-map-pinned' : 'trip-map'}
        href={mapsSearchUrl(place, pointOf(ride, place))}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t.map.openPlace(place)}
        title={t.map.openPlace(place)}
      >
        <MapIcon size={14} />
      </a>
    ) : null

  function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newName.trim().replace(/\s+/g, ' ')
    if (!name || busy) return
    // The form stays until the new row is there, so the two swap in one step.
    void onAddPassenger(ride, name).then(() => {
      setNewName('')
      setAdding(false)
    })
  }

  const shareItems = [
    { label: t.detail.share, icon: <ShareIcon size={18} />, onSelect: () => onShare(ride) },
    {
      label: t.detail.addToCalendar,
      icon: <CalendarIcon size={18} />,
      // The .ics is an attachment that needs the token: fetched, then handed
      // to the browser as a download, which a phone opens in its calendar.
      onSelect: () => onDownloadCalendar(ride),
    },
  ]
  const mapItems = mapsAllowed ? [{ label: t.map.navigate, icon: <NavigateIcon size={18} />, onSelect: () => openRoute(ride) }] : []
  const menuItems = runsIt
    ? [
        { label: t.detail.editRide, icon: <PencilIcon size={18} />, onSelect: () => onEdit(ride), disabled: busy },
        {
          label: ride.passengers_manage ? t.detail.stopManage : t.detail.letManage,
          icon: <UsersIcon size={18} />,
          onSelect: () => onTogglePassengersManage(ride),
          disabled: busy || isPast,
        },
        {
          label: ride.passengers_add_stops ? t.detail.stopAddStops : t.detail.letAddStops,
          icon: <PinIcon size={18} />,
          onSelect: () => onTogglePassengersAddStops(ride),
          disabled: busy || isPast,
        },
        { label: t.detail.duplicate, icon: <CopyIcon size={18} />, onSelect: () => onDuplicate(ride), disabled: busy },
        ...shareItems,
        ...mapItems,
        { label: t.detail.removeRide, icon: <TrashIcon size={18} />, onSelect: () => onCancel(ride), danger: true, disabled: busy },
        ...(ride.series_id
          ? [{ label: t.detail.removeFollowing, icon: <RepeatIcon size={18} />, onSelect: () => onCancelFollowing(ride), danger: true, disabled: busy }]
          : []),
      ]
    : [
        { label: t.detail.duplicateMine, icon: <CopyIcon size={18} />, onSelect: () => onDuplicate(ride) },
        ...shareItems,
        ...mapItems,
      ]

  return (
    <div className="detail">
      <article className="card driver-card">
        <header className="driver-head">
          <Avatar name={ride.driver_name} size="lg" />
          <div className="driver-id">
            <strong>{ride.driver_name}</strong>
            <span className="driver-role">
              {t.detail.driver}
              {isDriver && <span className="tag">{t.detail.you}</span>}
              {ride.driver_id === null && <span className="tag tag-muted">{t.detail.noAccount}</span>}
              {ride.needs_driver && <span className="tag tag-amber">{t.detail.needsDriver}</span>}
              {ride.approval === 'pending' && <span className="tag tag-amber">{t.detail.awaiting}</span>}
              {ride.approval === 'approved' && <span className="tag tag-green">{t.detail.approved}</span>}
              {ride.series_id && (
                <span className="driver-weekly" title={t.form.repeatWeekly}>
                  <RepeatIcon size={13} /> {t.detail.weekly}
                </span>
              )}
            </span>
          </div>
          <Menu trigger={<KebabIcon />} label={t.detail.rideOptions} items={menuItems} />
        </header>

        {ride.approval === 'pending' && me.admin && !isPast && (
          <div className="approval-row">
            <span className="approval-ask">{t.detail.approvalAsk(ride.driver_name)}</span>
            <span className="approval-actions">
              <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => onDecline(ride)}>
                {t.detail.decline}
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onApprove(ride)}>
                <CheckIcon size={16} /> {t.detail.approve}
              </button>
            </span>
          </div>
        )}

        {ride.needs_driver && !isPast && (
          <div className="approval-row">
            <span className="approval-ask">
              {myBooking ? t.detail.takeOverAsk(ride.driver_name) : t.detail.takeOverWait(ride.driver_name)}
            </span>
            {myBooking && (
              <span className="approval-actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onTakeOver(ride)}>
                  <CarIcon size={16} /> {t.detail.takeOver}
                </button>
              </span>
            )}
          </div>
        )}

        {mayClaim(ride, me) && (
          <div className="claim-row">
            <span className="claim-ask">{t.detail.claimAsk(ride.driver_name)}</span>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onClaim(ride)}>
              <CheckIcon size={16} /> {t.detail.claim}
            </button>
          </div>
        )}

        {ride.driver_phone && !isDriver && (
          <a className="btn btn-soft btn-block driver-call" href={telHref(ride.driver_phone)}>
            <PhoneIcon size={18} />
            {t.detail.callDriver}
            <span className="driver-call-number">{ride.driver_phone}</span>
          </a>
        )}

        <div className="driver-times">
          <div className="when">
            <span className="when-label">{t.detail.leaves}</span>
            <span className="when-value">{fmtTime(ride.departure_time)}</span>
          </div>
          <span className="when-sep" aria-hidden="true">
            <ArrowRightIcon size={16} />
          </span>
          <div className="when">
            <span className="when-label">{t.detail.returns}</span>
            <span className="when-value">{ride.return_time ? fmtTime(ride.return_time) : t.detail.oneWay}</span>
          </div>
        </div>

        {isDriver && lateWindow(ride) && (
          <div className="late-row" role="group" aria-label={t.detail.lateAsk}>
            <span className="late-ask">
              <HourglassIcon size={16} /> {t.detail.lateAsk}
            </span>
            <span className="late-actions">
              {LATE_CHOICES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  aria-label={t.detail.lateTell(minutes)}
                  onClick={() => onLate(ride, minutes)}
                >
                  {t.detail.lateChoice(minutes)}
                </button>
              ))}
            </span>
          </div>
        )}

        <ol className="trip" aria-label={ride.return_time ? `${ride.origin}, ${ride.destination}, ${ride.origin}` : `${ride.origin}, ${ride.destination}`}>
          {ride.stops_before.map((stop) => (
            <li key={stop} className="trip-stop trip-via">
              <span className="trip-dot" aria-hidden="true" />
              <span className="trip-place">{stop}</span>
              <span className="trip-note">{t.detail.pickup}</span>
              {placeLink(stop)}
            </li>
          ))}
          <li className="trip-stop trip-start">
            <span className="trip-dot" aria-hidden="true" />
            <span className="trip-place">{ride.origin}</span>
            {placeLink(ride.origin)}
          </li>
          {ride.stops.map((stop) => (
            <li key={stop} className="trip-stop trip-via">
              <span className="trip-dot" aria-hidden="true" />
              <span className="trip-place">{stop}</span>
              <span className="trip-note">{t.detail.pickup}</span>
              {placeLink(stop)}
            </li>
          ))}
          <li className="trip-stop trip-end">
            <span className="trip-dot" aria-hidden="true" />
            <span className="trip-place">{ride.destination}</span>
            {placeLink(ride.destination)}
          </li>
          {/* A ride with a return comes back where it started: the last dot of the way. */}
          {ride.return_time && (
            <li className="trip-stop trip-back">
              <span className="trip-dot" aria-hidden="true" />
              <span className="trip-place">{ride.origin}</span>
              <span className="trip-note">{t.detail.backAt(fmtTime(ride.return_time))}</span>
            </li>
          )}
        </ol>
        {mapInline && <RideMap ride={ride} className="ride-map-inline" />}
        {pinned && !mapInline && (
          <button type="button" className="btn btn-block trip-map-open" onClick={() => setShowMap(true)}>
            <MapIcon size={18} />
            {t.map.showMap}
            <ChevronRightIcon size={16} className="trip-map-open-chevron" />
          </button>
        )}
        {showMap && <RouteMapSheet ride={ride} onClose={() => setShowMap(false)} />}
        {!runsIt && passengerAddsStop && (
          <span className="trip-actions">
            <button
              type="button"
              className="link link-sm trip-add"
              disabled={busy}
              onClick={() => (myBooking ? setMovingPickup('new') : setPickup(ELSEWHERE))}
            >
              <PlusIcon size={14} /> {t.detail.addStop}
            </button>
          </span>
        )}
        {runsIt && !isPast && (
          <span className="trip-actions">
            {roomForStop && (
              <button type="button" className="link link-sm trip-add" disabled={busy} onClick={() => setRouting('add')}>
                <PlusIcon size={14} /> {t.detail.addStop}
              </button>
            )}
            <button type="button" className="link link-sm trip-add" disabled={busy} onClick={() => setRouting('edit')}>
              <PencilIcon size={14} /> {t.detail.editRoute}
            </button>
          </span>
        )}
        {runsIt && !isPast && routing === 'add' && (
          <AddStop
            ride={ride}
            submitLabel={t.common.add}
            busy={busy}
            onCancel={() => setRouting(null)}
            onSubmit={(place, where) => {
              setRouting(null)
              onAddStop(ride, place, where)
            }}
          />
        )}
        {runsIt && !isPast && routing === 'edit' && (
          <RouteEditor
            ride={ride}
            busy={busy}
            onClose={() => setRouting(null)}
            onSave={async (patch) => {
              if (await onSaveRoute(ride, patch)) setRouting(null)
            }}
          />
        )}

        <div className={model || brand ? 'driver-car driver-car-illustrated' : 'driver-car'}>
          {model && (
            <span className="driver-car-art" aria-hidden="true">
              <CarArt model={model.key} width={96} />
            </span>
          )}
          {brand && (
            <span className="driver-car-logo" title={brand.name}>
              <BrandLogo brand={brand.key} size={26} />
            </span>
          )}
          {!model && !brand && (
            <span className="driver-car-logo" aria-hidden="true">
              <CarIcon size={24} />
            </span>
          )}
          <span className="driver-car-text">
            <span className="driver-car-name">{ride.car_name}</span>
            <span className="driver-car-meta">
              {ride.car_type === 'corporate' ? t.detail.companyCar : t.detail.ownCar}
              {powertrain && (
                <span className={`driver-car-pt driver-car-pt-${powertrain}`}>
                  <PowertrainIcon kind={powertrain} size={12} /> {powertrainLabel(powertrain)}
                </span>
              )}
            </span>
            {carState && (
              <button type="button" className="link driver-car-state" onClick={onCarState}>
                <RoadIcon size={13} />
                <span>{factText(carState.odometer, (v) => t.carState.km(v.toLocaleString())).value}</span>
                {carState.soc.value !== null && <span>{factText(carState.soc, (v) => t.carState.pct(v)).value}</span>}
                {carState.clean.value === false && <span>{t.carState.cleanNo}</span>}
                {carState.issues.value && <span className="driver-car-issue">{carState.issues.value}</span>}
              </button>
            )}
            {ride.car_type === 'corporate' && onGuide && (
              <button type="button" className="link driver-car-guide" onClick={onGuide}>
                <PlugIcon size={15} /> {t.detail.howTo}
              </button>
            )}
          </span>
        </div>

        {(ride.chip_in || ride.distance_km != null || ride.coffee_please) && (
          <dl className="facts">
            {ride.distance_km != null && (
              <div className="fact">
                <dt>
                  <RoadIcon size={14} /> {t.form.distance}
                </dt>
                <dd>{t.detail.distance(ride.distance_km)}</dd>
              </div>
            )}
            {ride.chip_in && (
              <div className="fact">
                <dt>
                  <CoinsIcon size={14} /> {t.form.chipIn}
                </dt>
                <dd>{t.detail.chipIn(ride.chip_in)}</dd>
              </div>
            )}
            {ride.coffee_please && (
              <div className="fact">
                <dt>
                  <CoffeeIcon size={14} /> {t.detail.coffee}
                </dt>
                <dd>{isDriver ? t.detail.coffeeYou : t.detail.coffeePlease(firstName(ride.driver_name))}</dd>
              </div>
            )}
          </dl>
        )}
        {ride.notes && <p className="driver-notes">{ride.notes}</p>}
      </article>

      {/* The kilometres: kept by whoever is in the car, read by the admins. */}
      {keepsKm(ride) && (me.admin || inRide(ride, me)) && (!coming || ride.legs.length > 0) && (
        <Odometer ride={ride} busy={busy} coming={coming} onOdometer={onOdometer} />
      )}

      <section
        className={[
          'pax',
          receives && 'pax-droppable',
          dragActive && !receives && !lifted && 'pax-nodrop',
          receives && over && 'pax-over',
        ]
          .filter(Boolean)
          .join(' ')}
        {...dropZone(receives ? { kind: 'ride', rideId: ride.id } : null)}
      >
        <h3 className="section-title">
          {t.detail.passengersTitle}{' '}
          <span className="section-count">
            {ride.bookings.length} / {ride.seats}
          </span>
          {ride.passengers_manage && (
            <span className="tag tag-icon section-tag" title={t.detail.openListTitle}>
              <UsersIcon size={12} strokeWidth={2.25} /> {t.detail.openList}
            </span>
          )}
        </h3>

        {hint && !choosingPlace && (
          <div className="banner stop-hint">
            <PinIcon size={20} />
            <span>{t.map.hint(hint.place, hint.near)}</span>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={() => getInAt(hint.place, { ...hint.where, point: hint.point })}
            >
              {t.map.hintGetIn(hint.place)}
            </button>
          </div>
        )}

        {(seatOnOffer || canWait) && choosingPlace && (
          <AddStop
            ride={ride}
            submitLabel={seatOnOffer ? getInLabel : t.detail.waitFor}
            busy={busy}
            onCancel={() => setPickup('')}
            onSubmit={
              seatOnOffer
                ? getInAt
                : (place, where) => {
                    setPickup('')
                    onWait(ride, place, where)
                  }
            }
          />
        )}

        {ride.bookings.length === 0 && !seatOnOffer ? (
          <div className="dropzone dropzone-still">
            <UsersIcon size={28} />
            <span>{isPast ? t.detail.nobodyRode : full ? t.detail.noSeatsOffered : t.detail.noPassengers}</span>
          </div>
        ) : null}

        {ride.bookings.length === 0 && seatOnOffer && !choosingPlace ? (
          <div className="join-box">
            <button type="button" className="dropzone" disabled={busy} onClick={getIn}>
              <UsersIcon size={28} />
              <strong>{getInLabel}</strong>
              <span>
                {switching
                  ? t.detail.switchHint(firstName(switchFrom!.ride.driver_name))
                  : draggable
                    ? coarse
                      ? t.detail.dragHintCoarse
                      : t.detail.dragHint
                    : t.detail.tapSeat}
              </span>
            </button>
            <div className="join-box-foot">{pickupChip(t.detail.getInAt)}</div>
          </div>
        ) : null}

        {ride.bookings.length > 0 && (
          <ul className="pax-list">
            {ride.bookings.map((b) => {
              const mine = isMyBooking(b, me)
              const grabbable = draggable && mine && !busy && !isPast
              // Someone new grows into the list; your own row takes the place of the get-in row you tapped.
              return (
                <li key={b.id} className={arrived.has(b.id) && !mine ? 'pax-slot pax-slot-new' : 'pax-slot'}>
                  <div
                    className={['pax-row', mine && 'pax-row-me', grabbable && 'grabbable', mine && lifted && 'lifting']
                      .filter(Boolean)
                      .join(' ')}
                    title={grabbable ? t.detail.dragSwitch : undefined}
                    onPointerDown={(e) => {
                      if (grabbable) onGrab(e, { name: me.name, fromRideId: ride.id, bookingId: b.id })
                    }}
                    onDragStart={(e) => e.preventDefault()}
                  >
                    <Avatar name={b.passenger_name} />
                    <span className="pax-name">
                      <span className="pax-name-row">
                        {b.passenger_name}
                        {mine && <span className="tag">{t.detail.you}</span>}
                      </span>
                      {(hasStops || (mine && !isPast)) && (
                        <span className="pax-pickup">
                          <PinIcon size={12} /> {t.detail.getsInAt(b.pickup || ride.origin)}
                          {mine && !isPast && !movingPickup && (
                            <button type="button" className="link link-sm" disabled={busy} onClick={() => setMovingPickup('pick')}>
                              {t.common.edit}
                            </button>
                          )}
                        </span>
                      )}
                      {mine && movingPickup === 'new' && (
                        <AddStop
                          ride={ride}
                          submitLabel={t.common.save}
                          busy={busy}
                          onCancel={() => setMovingPickup(false)}
                          onSubmit={(place, where) => {
                            setMovingPickup(false)
                            onMovePickup(ride, b.id, place, where)
                          }}
                        />
                      )}
                      {mine && movingPickup === 'pick' && (
                        <span className="pax-pickup-pick">
                          <Select
                            label={t.detail.changePickup}
                            icon={<PinIcon size={16} />}
                            value={b.pickup}
                            options={withElsewhere}
                            onChange={(v) => {
                              if (v === ELSEWHERE) return setMovingPickup('new')
                              setMovingPickup(false)
                              if (v !== b.pickup) onMovePickup(ride, b.id, v)
                            }}
                          />
                          <button type="button" className="icon-btn icon-btn-sm" aria-label={t.common.cancel} onClick={() => setMovingPickup(false)}>
                            <XIcon size={16} />
                          </button>
                        </span>
                      )}
                    </span>
                    {canManage && !mine && (
                      <button
                        type="button"
                        className="icon-btn icon-btn-sm"
                        title={t.detail.removeName(b.passenger_name)}
                        aria-label={t.detail.removeName(b.passenger_name)}
                        disabled={busy}
                        onClick={() => onLeave(ride, b.id)}
                      >
                        <XIcon size={16} />
                      </button>
                    )}
                    {mine && !isDriver && !isPast && (
                      <button
                        type="button"
                        className="link pax-leave"
                        disabled={busy}
                        onClick={() => onLeave(ride, b.id)}
                      >
                        {t.detail.leave}
                      </button>
                    )}
                    {grabbable && (
                      <span className="grip" aria-hidden="true">
                        <GripIcon size={18} />
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
            {seatOnOffer && !choosingPlace && (
              <li>
                <div className="join-row">
                  <button type="button" className="add-row" disabled={busy} onClick={getIn}>
                    <PlusIcon size={18} />
                    {getInLabel}
                  </button>
                  {pickupChip()}
                </div>
                {switching && <p className="hint hint-tight">{t.detail.switchHint(firstName(switchFrom!.ride.driver_name))}</p>}
              </li>
            )}
          </ul>
        )}


        {canAddOther && !adding && (
          <button type="button" className="add-row add-row-quiet" disabled={busy} onClick={() => setAdding(true)}>
            <UserIcon size={18} />
            {t.detail.addByName}
          </button>
        )}
        {canAddOther && adding && (
          <form className="pax-add" onSubmit={submitAdd}>
            <input
              autoFocus
              required
              aria-label={t.detail.passengerName}
              placeholder={t.detail.colleagueName}
              maxLength={80}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim()}>
              {t.common.add}
            </button>
            <button type="button" className="icon-btn" aria-label={t.common.cancel} onClick={() => setAdding(false)}>
              <XIcon size={18} />
            </button>
          </form>
        )}

        {full && !myBooking && !isDriver && ride.bookings.length > 0 && !myEntry && <p className="hint">{t.detail.full}</p>}

        {canWait && !choosingPlace && (
          <>
            <div className="join-row join-row-boxed">
              <button type="button" className="add-row add-row-quiet" disabled={busy} onClick={() => onWait(ride, pickup)}>
                <HourglassIcon size={18} />
                {t.detail.waitFor}
              </button>
              {(hasStops || mayAddStop) && pickupChip()}
            </div>
            <p className="hint hint-tight">{t.detail.waitHint}</p>
          </>
        )}
        {myEntry && !isPast && (
          <div className="banner waitline-me">
            <HourglassIcon size={22} />
            <span>{t.detail.inLine(line)}</span>
            <button type="button" className="link" disabled={busy} onClick={() => onLeaveLine(ride, myEntry.id)}>
              {t.detail.stopWaiting}
            </button>
          </div>
        )}
        {ride.waitlist.length > 0 && (
          <div className="waitline">
            <h4 className="waitline-title">
              {t.detail.waitingTitle} <span className="section-count">{ride.waitlist.length}</span>
            </h4>
            <ol className="waitline-list">
              {ride.waitlist.map((w) => (
                <li key={w.id} className="waitline-row">
                  <Avatar name={w.name} size="sm" />
                  <span className="waitline-name">
                    {w.name}
                    {w.user_id === me.id && <span className="tag">{t.detail.you}</span>}
                    {w.pickup && (
                      <small>
                        {t.detail.getsInAt(w.pickup)}
                        {w.new_stop_before != null && ` · ${t.detail.newPlace}`}
                      </small>
                    )}
                  </span>
                  {isDriver && !isPast && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      title={t.detail.removeFromLine(w.name)}
                      aria-label={t.detail.removeFromLine(w.name)}
                      disabled={busy}
                      onClick={() => onLeaveLine(ride, w.id)}
                    >
                      <XIcon size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <RideThread ride={ride} isDriver={isDriver} onError={onError} />
    </div>
  )
}
