# Shared cars: the share, the garage list, the odometer, the car's state, the office road

Moved out of CLAUDE.md, which keeps a one-line pointer here. These are the
feature notes for working on this part of Karpul: the rules, where they live
and why. Keep them in step with the code like CLAUDE.md itself.

**A shared car is rationed.** The share is a setting (`fleet.DEFAULTS`: `share_per_week`, `share_per_day`, both 1, and `share_max_hours`, 24), changed under *Usage* (`ShareRules`, `PUT /api/fleet/settings`), and an account can have its own week (`User.shared_per_week`, set under *People*):
`shared_car_use` counts a driver's shared-car rides in a Mon–Sun week and on a day (pending and
approved ones too), `over_shared_car_share` turns that into `LIMIT_WEEK` / `LIMIT_DAY` (the day's
text wins), and then `LIMIT_STRETCH`: `shared_car_stretch` joins the ride with the driver's shared-car
rides that meet or overlap it (any car, any approval; no return holds the car to midnight) and more than
`share_max_hours` in a row (`limit_stretch(hours)` words the refusal) is past the share too (the day either side is all it reads). `approval_for` in `app/ride_edits.py` applies it on create (per occurrence of a series)
and when an edit moves an unapproved ride to another day, car type or time: within the share the ride's
`approval` is `""`; past it a plain user gets the 409, or with `RideCreate.request_approval` the ride
is added as `"pending"` and every admin (`admin.admin_ids`) is pushed `approval_requested`; an admin
adding it (for anyone) gets `"approved"` outright, and own cars are never rationed. **A pending ride
holds no slot**: `ensure_car_available` skips it, so the car stays bookable over it (and two asks may
overlap), and `POST /api/rides/{id}/approve` (admin, 409 unless pending) re-runs that check before it
sets `"approved"` and pushes `ride_approved`, so an approval that would double-book is the usual 409;
`/decline` removes the ride through `remove_rides` with `ride_declined` to the driver and
`ride_removed` to the passengers; both are in the admin's log. **A removed ride points on**: a
passenger's `ride_removed` push also says how many other cars that day still have a seat
(`cars_with_seats`, nearest departure first) and opens the nearest one (`notify(..., url=)`), so a
cancellation the evening before is not a dead end. **A cancelled shared car asks its passengers
first**: when the *driver* removes their own shared-car ride that has not left, is not pending and has
someone with an account in it (`hands_over` in `app/ride_removal.py`, mirrored by `handsOver` in
`lib/me.ts`), the ride is not deleted but set `Ride.needs_driver` (an `ADDED_COLUMNS` column): it keeps
the car, the passengers are pushed `driver_needed`, and `is_driver` / `drives()` stop treating the old
driver as the driver (their name stays as the snapshot; the ride no longer counts in their share). A
passenger's `POST /api/rides/{id}/takeover` makes them the driver (their seat goes to the queue, the
others are pushed `driver_found`; the share is not checked again, it is a rescue). The last passenger
with an account leaving removes it, and `reminders.drop_driverless` (every tick of the reminder loop,
push or no push) removes one nobody took by departure, pushing `no_driver`. On screen: a *Needs a
driver* tag and an *I'll drive* row on the card (`.approval-row`), the tag on the Upcoming row, and the
removal confirmation says so. Tests: `tests/test_takeover.py`. A driver may also say they would
appreciate a coffee (`Ride.coffee_please`, a switch in the form's Advanced part, a *Coffee* fact on the
driver card); it is only ever shown. On screen: the share's refusal in
`RideForm` grows an *Ask an admin to approve it* button (`canAskApproval`, matched on the text's
tail in `App.tsx`), a pending ride wears an amber *Awaiting approval* tag on the card, the Upcoming
row and as a hollow stretch on the day plan (`.plan-ride-pending`, drawn *under* `.plan-free`, and
`freeGaps` ignores it, so the stretch beneath stays bookable). The admins' own place is *Approvals*
in the drawer (`components/Approvals.tsx`, `GET /api/admin/approvals`: pending rides from today on,
soonest first), with an amber count on the item and a dot on the ☰ (`waiting` in `App.tsx`, asked
again whenever the board's rides change or a decision is made); each ask is decided there, and a tap
on it opens the ride on the day plan. The card keeps its *Approve* / *Decline* row (`.approval-row`)
too. `approval` is an `ADDED_COLUMNS` column. Tests: `tests/test_shared_car_share.py`.

**The mail to the office** (`lib/carMail.ts`, `components/CarMailSheet.tsx`, tested in `carMail.test.ts`
and `e2e/admin.spec.ts`). Adding a shared-car ride (and its way back, or the first of a weekly series)
ends with one more step: *Let the office know* shows a mail and *Open in email* hands it to the driver's
own mail app as a `mailto:` link, so it is sent from them. It goes to Vesna Ardeljan (the `org` contact in
`lib/support.ts`, always the recipient) with every admin in Cc: an admin's own account email when it has
one, else `name.surname@se.com` from the display name (`companyEmail`: lower case, no accents, `đ` as `dj`).
`GET /api/people` carries `is_admin` and, for admins only, `email` for this; nobody else's email leaves the
server. The mail is always Serbian whatever the app language, the date is in the subject, and its foot says
the app wrote it. A pending ride says it waits for approval.

**The Beograd garage list.** The Beograd office's garage lets in only the cars on its list, so an own-car
ride whose destination is that office (`offices.needs_garage`, `GARAGE_OFFICE`; mirrored by `goesToGarage` /
`garageTask` in `lib/offices.ts`) asks for its licence plate: `Ride.plate` (upper-cased, `normalise_plate`, blank
for a shared car) and `Ride.plate_registered` (both `ADDED_COLUMNS`). `RideForm` shows the *Licence plate* field
under the route only then (remembered with the last route), and the driver card shows it as a *Garage* fact to the
driver and admins. A new task pushes `garage_plate` to every admin (category *approvals*); an edit to another plate
or another day undoes the tick and asks again. The admins' place is *Garage list* in the drawer
(`components/GarageList.tsx`, `GET /api/admin/garage`: from today on, the ones still to add first, with an amber
count on the item and in the ☰ dot), where `PUT /api/admin/garage/{id} {registered}` ticks one off (or takes it
back), logged as `plate_registered` / `plate_unregistered` and pushed `plate_registered` to the driver. The list
itself is kept outside Karpul. Tests: `tests/test_garage.py`.

**A shared car's odometer.** Who actually drove a shared car and how far is kept as `DriveLeg`
rows on the ride (`Ride.legs`, in `RideRead`): one stretch at the wheel each, `start_km` to `end_km`
(None while being driven), following each other with no gap. The ride's `driver_id` stays who
*booked* it; the legs say who *drove*. `POST /api/rides/{id}/legs {km, booking_id}` takes the wheel
(the ride's driver when `booking_id` is null, else that passenger): the first one is the reading at
pickup (the driver or an admin only), later ones are handovers that end the current stretch at the
same reading (the driver, an admin or whoever is at the wheel); `POST .../legs/end {km}` is the car
back; `DELETE .../legs/last` (driver or admin) steps back one entry. Readings only go up, only on a
shared car that is not pending, from its day on. `LegEnd` also takes how the car was left (`soc`,
`clean`, `issues`, a `CarReportIn`), which `bring_back` writes as a `CarReport` (below). On screen
`components/Odometer.tsx` (the logic in `lib/odometer.ts`, tested in `odometer.test.ts`) sits on the
ride card for the people in the car and for admins; *Hand over* is how the wheel changes hands, so
the one who drove becomes a passenger in the log, and *Car is back* asks for the battery, whether
it is clean and anything wrong. Once a shared-car ride's return time is `KM_GRACE_MIN` behind and
its odometer is still open, `app/reminders.py` pushes `note_km` to the driver (and whoever is at the
wheel) once, `Ride.km_reminder_sent`. *All rides* shows the odometer out and back, the km driven and who drove how much, and the
spreadsheet carries the same four columns. Account deletion nulls `DriveLeg.driver_id` and keeps the
name. Tests: `tests/test_odometer.py`.

**The state of a shared car** (`app/carstate.py`, table `CarReport`, `routers/cars.py`). Every
signed-in person can see how each pool car stands: `GET /api/cars/corporate/state` gives, per active
car, four facts (`odometer`, `soc`, `clean`, `issues`, each `{value, at, by, estimated}`) and its
`recent` reports. A report is how a car was found or left (odometer, battery %, clean or needs a
wash, what is wrong; every field optional, absent is "not said", `issues` `""` is "nothing wrong");
it is written with a car's return (`bring_back`) or on its own at `POST
/api/cars/corporate/{id}/reports` (anyone signed in, a retired car is a 409, an empty report a 422).
The newest reading or report is the fact; **the guess**: a ride the car went on after the last
odometer reading with no closed reading of its own is assumed driven its length
(`offices.ride_km`, below), and the battery is assumed down `SOC_PER_KM` (0.24 %) for every such
kilometre; a guessed figure is `estimated` and the screen says *about*. A report naming a problem
is pushed to the admins (`car_issue`, category `cars`, `notify` with no ride: `body` and `url`).
Every report publishes `cars.state`, on which `useBoard` fetches the state again (also on every
connect). **An admin puts the state right**: `PATCH /api/cars/corporate/reports/{id}` (the fields
sent replace the report's, null clears one, a report left saying nothing is a 422; author and time stay)
and `DELETE` of the same (the state falls back on the report before), both in the admin's log
(`car_report_edited` / `car_report_removed`); *Mark as fixed* is an ordinary report with `issues: ""`.
On screen: *Shared cars* in the drawer for everyone (`components/SharedCars.tsx`), one list of the
cars: `CarStatusList` (`components/CarStatus.tsx`: a card per car with its state; the text helpers in
`lib/carState.ts`). *Report on this car* opens `CarReportSheet` (`components/CarReportSheet.tsx`, a `Sheet`
with `stacked`: portalled over Shared cars, Escape captured), built from the parts in
`components/CarReportParts.tsx`, which *Car is back* on a ride's odometer (`Odometer.tsx`) uses too (there the
green chip is the ride's own length, `rideKm` in `lib/offices.ts`, on top of the stretch's start): the odometer
as rolling wheels over an invisible input, with chips on top of the last real reading (the state's `odometer_read`): the km the rides since add up
to (`km_since`, the guess's own figure, in green when there is any), else the office road first (`OFFICE_TRIPS`
in `lib/offices.ts`, +90 / +92 / both ways), then +10 / +100; the battery as a battery dragged or arrow-keyed, or typed after a tap on its figure
(`role="slider"`, its colour sliding red to amber to green with the charge, `socHue`, the range at
`SOC_PER_KM` on an electric car), clean / needs a wash / not checked as pictures of the car (picked, clean is tinted blue, a wash amber and not checked grey), each with a loop always running (sparkles and a
shine; mud, rising stink, dust and two flies; a dotted outline of the missing car with question marks floating
out of it), the picked one popping, and quick problems as chips. Left untouched for a few seconds the form idles
(`useIdle` in `lib/useIdle.ts`, `.report-idle`; a light along the drum, an empty battery filling itself, the cars rocking); every
animation under `.report-parts` stops under reduced motion; the arithmetic in `lib/carReport.ts`, tested in
`carReport.test.ts`. The pool is managed on the same cards, not a list of its
own: an admin gets the car's ⋮ (edit, retire, delete) and its `CarEditor` handed in through `carMenu` /
`carEditor` (which also takes the odometer and battery: a changed one is sent as an ordinary report in the
admin's name, the car's own fields only when they changed), *Mark as fixed* on a problem, a ⋮ with *Edit* / *Remove* on each recent report, *Add
shared car* at the foot and the retired cars listed under it; the one other tab, admins only, is
*Usage* (the tab is `sharedCars.tab` in `App.tsx`, so the driver card's car line opens it on the cars). One line under
the car's name on the driver card of a shared-car ride (`.driver-car-state`). **Where the car is**
(`carstate.car_location`, `location` in the state, `CarWhere` in `CarStatus.tsx`): nobody reports it,
it is worked out from the rides and the clock: `out` on a ride with a return that has left and is not
back, `parked` after the last ride driven (at its start after a return, its destination after one
way), `home` before any (`CorporateCar.home`), pending rides not counted; `openSharedCars` in
`App.tsx` refetches the state on every visit for that reason. **Taken days in the form**: `GET
/api/cars/corporate/{id}/busy?from&to&exclude` (signed in, ≤ 92 days) lists the rides holding a car
(not pending) and `useCarBusy` / `clashOn` in `lib/carBusy.ts` (mirroring `services._overlaps`) let
`DatePicker`'s `busy` paint a clashing day red and unpickable; a picked day that clashes after the
times move blocks the save with the server's own 409 wording, as does a later week of a repeat (the
`(date)` suffix), and the save waits until the car's days are known (`known`). A new ride (not an
edit, request or day-plan slot) starts on `firstFreeDay` from the day asked for, once per car
(`settledFor`). **Usage** is `UsageDashboard.tsx`:
per car `hours`, `per_day` and `by_hour` from `services.usage_heat` drawn as a calendar or a
weekday-by-hour heatmap (`lib/usageHeat.ts`); the rides are in the CSV, not listed. Tests:
`tests/test_car_state.py`.

**The road between the offices** (`app/offices.py`, `lib/offices.ts`, keep in step): Beograd to
Novi Sad is 90 km, Novi Sad to Beograd 92 (`OFFICES` holds the names people write, folded).
`prepare` (`app/ride_edits.py`) fills a blank `distance_km` in on that route, `fill_office_distances` does it for old
rides on every start, the form shows the known figure as the placeholder and says so
(`form.knownRoad`), and the car state's guess uses it. Tests: `tests/test_offices.py`.


**The fleet** (`app/fleet.py`, `routers/fleet.py`, tested in `tests/test_fleet.py`). *Shared cars* has two more admin
tabs. **Upkeep** (`FleetUpkeep.tsx`): each car's `registration_until`, `insurance_until`, `service_due_on` /
`service_due_km` and `tyres` (`ADDED_COLUMNS` on `corporatecar`, set through the car's PATCH), turned into a due list by
`fleet.due_items` (soon is 30 days or `SERVICE_SOON_KM`; summer tyres from 1 November to 1 April are overdue), shown as
chips on the car card to admins only (`CarStateRead.due`), and pushed to the admins at 30, 7, 1 and 0 days and 1000 / 0 km
(`send_fleet_reminders`, each step once through `FleetNotice`, run once a day from 8:00 by the reminder loop). **Out of
service** (`CarBlock`, start to end inclusive, no end: until further notice): `ensure_car_available` refuses a ride on
one (*That car is out of service that day*), the busy endpoint returns its days as whole-day `out_of_service` rows so the
form paints them red, the car card shows it to everyone (`CarStateRead.blocks`), and the drivers already booked then are
pushed `car_blocked` (always sent) and listed back to the admin; their rides stay for them to move. A reported problem has
an `issue_status` (`""`, `seen`, `garage`; `PUT /api/cars/corporate/reports/{id}/status`), and *Take out of service* on it
blocks the car from today. **Costs** (`FleetCosts.tsx`, `CarCost`): fuel, charging, tolls, parking, washes, services,
entered by an admin; `fleet_overview` gives per car the total, the km its odometer logged, dinars a km and the km nobody
logged (`odometer_gaps`: a pickup reading that does not carry on from the car's last return, also `km_gap` in *All rides*
and its spreadsheet). A car with costs is retired, not deleted. **The fuel price** (`FuelPrice`, `price_on`): Serbia caps
Evrodizel and BMB 95 every Friday; `FUEL_REFERENCE` (the ministry's figures of 30 Oct 2026, 236 and 207 dinars a litre)
seeds an empty table on start, and an admin adds each new week's. The cost form suggests litres times that price, *Your
rides* and *Usage* show the fuel saved in dinars (`impact(..., fuel_price)`), and the month summary reckons the allowance in it.
The admins are also reminded once of a pending ask leaving within 12 hours (`reminders.send_approval_nudges`, `Ride.approval_nudged`).
The usage spreadsheet uses semicolons and a decimal comma, like *All rides*.

**Plates the garage lets in for good** (`GaragePlate`): *Let in for good* on the garage list ticks the ride and its other
coming rides with that plate, and a new ride with it starts ticked (`fleet.plate_standing`, in `rides.create_ride` and
`ride_edits.apply_edit`), so nobody is asked again; unticking or removing it from the list asks again.
