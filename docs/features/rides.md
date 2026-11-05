# Rides: consent to changes, seats and queues, threads and requests, stops, the form

Moved out of CLAUDE.md, which keeps a one-line pointer here. These are the
feature notes for working on this part of Karpul: the rules, where they live
and why. Keep them in step with the code like CLAUDE.md itself.

**Changes wait for the passengers.** When the *driver* moves the day, a time, the start or the
destination (`CONSENT_FIELDS` in `app/ride_edits.py`) of a ride with passengers who have accounts, `update_ride`
checks the whole edit (`plan`, writes nothing), makes the rest at once (`apply_edit`) and holds those fields (with
the pins) in `Ride.proposal` (an `ADDED_COLUMNS` JSON column, `ProposalRead` in `RideRead`: `by`, `by_id`,
`fields`, `agreed`); the passengers are pushed `change_asked`. Each answers `POST .../proposal/agree` or
`/decline`; the last agree makes it through `settle` (held to the rules as they stand then, so a shared car
taken since is the usual 409), a decline drops it (`change_declined` to the driver), the last one waited on
leaving the car makes it too, and `DELETE .../proposal` withdraws it. An admin changing someone's ride makes it
at once and overtakes any ask. **A passenger may suggest another time**: `POST .../proposal/suggest`
(`TimeSuggestion`, departure and/or return) stores a proposal with `suggested: true` and the suggester already
agreed, pushed `time_suggested` to the driver; the driver (or an admin) accepting it through the same `agree`
turns it into the driver's ask to the others (`suggested_by` keeps who it came from) or makes it when nobody
else is left, declining tells the suggester. One ask at a time (409), and a suggestion goes with its suggester.
On screen: `ChangeAsk` in `CarDetail.tsx` (each field struck through and then as it would be, the answers for
whoever answers now, *Withdraw* for whoever asked), *Suggest another time* under the driver head for a passenger
(`SuggestTime`, a stacked `Sheet` with two `TimePicker`s), a *Change asked* tag on the Upcoming row, the form's
`consentHint` under the times, and the toast says the passengers were asked (`newlyAsked` in `App.tsx`). An
invalid merged edit is a 422 now, not a crash. Tests: `tests/test_consent.py`.

**Waiting list, thread, requests.** A full car has a queue (`WaitlistEntry`, `POST/DELETE
/api/rides/{id}/waitlist`): only for yourself, refused while seats are free. When a seat frees
up (someone leaves, the driver adds seats) `promote_waitlist` books the first in line who is
not already in a car that day and pushes `seat_freed`; getting a seat anywhere drops your
other queue places that day (`leave_waitlists_that_day`). Each ride has a thread
(`RideMessage`, `/api/rides/{id}/messages`): anyone signed in may write, the driver and
passengers are pushed, the author or the driver may delete. Messages are not in `RideRead`;
its `message_count` (counted in bulk by `board_extras`) changes and an open `RideThread`
refetches. Ride requests (`RideRequest`, `routers/requests.py`) are "I need a ride on day X
around T from A to B": answered by a driver creating a ride with `request_id` (the requester
gets a seat, `request_answered` push) or by the requester getting into any car that day;
deleting the answering ride reopens it. Live events `request.saved` / `request.deleted`. A new
request is pushed `request_made` to the drivers who drive that way (`drivers_for` in
`routers/requests.py`: a ride of theirs from `DRIVES_THAT_WAY_DAYS` (60) ago on, past or coming,
that ends where the request ends and starts or picks up where it starts; places compared as an
office under any of its names, else folded). **Losing a seat is never silent** (`app/notices.py`, table `SeatNotice`, `routers/notices.py`). A seat taken
out by someone else (`leave_ride`, not your own) writes a thread line (`RideMessage.removed_name`, an `ADDED_COLUMNS`
column; the app renders `thread.removed`, and it cannot be deleted, a 409) and pushes `taken_out` to the passenger,
naming whoever did it, and `guest_taken_out` to whoever had put them in (`Booking.added_by_id`, set when someone books
another person, nulled on account deletion), so an old seat by name with no account (new ones always have one) still has someone told.
`taken_out`, `guest_taken_out` and `ride_removed` are `push.ALWAYS_SENT`: muting *Seats* or *Changes* never silences
them. Because not everyone has push on, the same people get a `SeatNotice` (also for a coming ride removed through
`remove_rides`): `GET /api/notices` (unseen, today on), `POST /api/notices/{id}/seen`, and `notices.changed` over the
socket to that account only. On screen `SeatNotices` (above the board on a phone, floating top right on a wide
screen; `lib/notices.ts` is its external store, loaded with the photos) with *See that day* and *Got it*, and taking
someone else out of a car asks first (`onLeave` in `useRideActions`). Tests: `tests/test_seat_notices.py`.
**Running late**: on the ride's day the driver taps
*Running late?* 5, 10 or 15 min on the card (`.late-row` in `CarDetail`, shown until an hour after
departure); `POST /api/rides/{id}/late` (the driver only, the ride's day only) writes a thread line
with `RideMessage.late_minutes` (an `ADDED_COLUMNS` column; `body` is the English, the app renders
`thread.late` in the reader's language) and pushes `running_late` (category *changes*) to the
passengers. The ride's times do not change.
On screen: requests under each Upcoming day and under `YouPanel` in Week (`RequestList`,
"Offer a ride" opens `RideForm` with `request`), asked through `RequestForm`.

**More on a ride.** `Ride.stops` is the extra pickup points after the origin and `Ride.stops_before`
the ones before it (collected on the way to the start), each as one-per-line text (the API shows
lists; `stops_from_text` / `stops_to_text`, `all_stops` for both in route order, mirrored by
`allStops` in `lib/stops.ts`; at most `MAX_STOPS` (6) together, the origin and duplicates are
dropped, a place in both lists stays before the origin), and each `Booking.pickup` is `""` for the
origin or one stop verbatim (`pickup_or_422`; an edit that removes a stop moves its passengers back
to the origin with `drop_orphaned_pickups`). **New pickup points after the fact**: a passenger
getting in or moving (`BookingCreate` / `BookingUpdate` with `new_stop: {before, index}`) at a place
not on the route puts it there (`add_stop`; a place already on it is just that place, the
destination is a 422) and the driver is pushed `stop_added`; the driver or an admin adds one with
`POST /api/rides/{id}/stops`. The driver's switch `Ride.passengers_add_stops` (on by default, in
`RideUpdate` like `passengers_manage`; the ⋮ menu and the form's Advanced route) closes the route to
passengers' new places (a 403; picking a place already on it still works, and whoever runs the ride
may still add one for a passenger); off, the pickup `Select` drops *Somewhere else…*. The waiting list takes a
new place too (`WaitlistJoin.new_stop`), but keeps it on the entry (`WaitlistEntry.new_stop_before`
/ `new_stop_index`) instead of the route: `promote_waitlist` puts it on the route with the seat
(and the driver is pushed `stop_added`), or seats them at the origin when the switch is off or the
route is full by then. On screen the pickup `Select` ends in *Somewhere else…*, which opens
`components/AddStop.tsx`: the full-screen `PlaceDialog` of the ride form's places, with `freeText` (a *Use
"<words>"* row, the place with no pin) and a `confirm` step after the pick that names the place and asks which
stretch of the route it is on (`stopSlots` in `lib/stops.ts`) above the submit button,
and the driver card has two links under the route for whoever runs the ride: *Add a pickup point* (while
there is room) opens that same `AddStop`, straight to the place and then where on the way (`POST
/api/rides/{id}/stops`, `onAddStop`), and *Edit the route* opens `components/RouteEditor.tsx`: the whole route full screen, the same panel as `PlaceDialog`,
a row per place with who gets in there, a tap picks it again in `PlaceDialog` (a stop's `confirm` step also
takes where on the way, which is how one moves), × takes a stop off, and *Save route* is one `PATCH` of the
route and its pins (`onSaveRoute` in `App.tsx`; the foot says who `drop_orphaned_pickups` will move to the
start). On the card's route (`TripRoute`) each place where someone gets in carries their faces
(`.trip-who`, overlapping avatars, yours ringed green and first, past three a *+N*; a pickup no longer on the
route counts as the start), so who gets in where reads without the passenger list. A ride with a
return draws one more, quieter row at the foot of the card's route, the start again with *Back
<time>* (`.trip-back`, after a dashed rule; no map link, the start has one). `distance_km` and `chip_in` are the driver's own words and only ever
shown or summed. `RideCreate.repeat_until` is not a column: `create_ride` writes one ride per
week (`weekly_dates`, at most `MAX_REPEAT_WEEKS`) under one `series_id`, all or nothing, and a
409 on a later week names the date in parentheses (the Serbian `apiError` regex knows that
suffix). `DELETE ?scope=following` removes the rest of the series.

**A new ride starts from your last one.** `User.prefill_rides` (an `ADDED_COLUMNS` column, on by default, in
`UserRead` and `PATCH /api/auth/me`) says whether `RideForm` starts a new ride (not an edit or a duplicate) as a
copy of `GET /api/rides/last` (the newest ride by id that the account drives, not one handed over with
`needs_driver`): car, seats, times, route, stops, pins and the Advanced settings, on the day picked, never the
date or a repeat; a request or a picked slot still wins for what they set, and a shared car since retired falls
back to the first in the pool. `App.tsx` fetches it on start and keeps it to the ride just created (not its way
back). The form's *Start from my last ride* switch fills the form in or empties it on the spot and saves the
choice to the account; off, the browser's remembered route (`karpul.lastRoute`) is not used either. Tests:
`tests/test_prefill.py`.

**Adding a ride.** `RideForm` is one form at two depths, switched by the segmented control
stuck to the head of the sheet's body and remembered as `karpul.formMode` (*Simple* is the
default). Simple asks only what a ride cannot be made without: the car, the seats, the day and
its two clocks, and where from and to. Advanced reveals the rest *in place* rather than in a
tail, so nothing you have already filled in moves when you switch: the passenger-list switch
under the seats, the weekly repeat under the day, the pickup points inside the route, then
distance, chip-in and the note. Switching back to Simple hides those fields but keeps their
values and still submits them, so the foot of the simple form names the ones carrying a value
(`.form-extras`) and a tap on it goes to look; editing a ride that already has any of them opens
on Advanced for the same reason. The driver is a line that states who it is (`.form-driver`),
not a field, because `driver_name` can never change. The day, departure and return sit in one
`.when-grid` row: rides are same-day, so the return has a time and no date of its own, and
turning on *One way* removes the return clock instead of grey-ing it out and, on a new ride,
offers *Add the way back too*: a switch with its own day and departure that makes a second
one-way ride with the route reversed (`onSubmit(input, wayBack)`; `App.tsx` creates it after the
first and toasts its failure, the shared car's share included, rather than failing the form). The start, the stops
and the destination are one `.route` box with one focus ring and one `.route-tag` column, the
way `CarDetail` draws the same journey. Every boolean here is a switch (`.toggle`, and
`.switch-row` for one that is boxed on its own line with its explanation beside it).
