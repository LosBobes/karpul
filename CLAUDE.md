# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (from `backend/`, Python 3.11+; CI uses 3.12):

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload      # :8000, OpenAPI docs at /docs
python -m pytest                   # full suite
python -m pytest tests/test_rides.py::test_name -q   # one test
ruff check .                       # lint (ruff.toml); CI runs it
python -m tests.error_catalogue    # rewrite frontend/src/lib/api-errors.json after changing an error text
python -m app.vapid                # print a VAPID key for KARPUL_VAPID_PRIVATE_KEY
```

`conftest.py` imports `app.*`, so pytest must be run from `backend/`, not the repo root.

Frontend (from `frontend/`, Node 20+; CI uses 22):

```bash
npm install
npm run dev      # :5173, proxies /api to VITE_API_PROXY (default localhost:8000)
npm run lint     # oxlint (not ESLint)
npm test         # vitest: src/**/*.test.ts (the lib code, and Serbian for every API error)
npm run build    # tsc -b && vite build -> frontend/dist
npm run e2e      # Playwright against the built app (build first; PYTHON=... picks the interpreter, PW_CHROMIUM=... another Chromium)
```

Whole app in one process: `npm run build`, then `uvicorn app.main:app` serves API + SPA on :8000.
App icons: `node scripts/render-icons.mjs` (from `frontend/`, needs Playwright's Chromium) re-renders
the PNGs in `public/` from `public/favicon.svg`; the PNGs are checked in, so a build never needs a browser.
Whole app in Docker: `docker compose up --build` → http://localhost:8080.

CI (`.github/workflows/ci.yml`) runs exactly: backend `ruff check .` and `pytest -q`; frontend `npm run lint`, `npm test` and `npm run build`; and an `e2e` job that builds the frontend and runs `npm run e2e` (Playwright, Chromium only) against uvicorn on a temp SQLite file: `e2e/smoke.spec.ts` (register, offer, get in, write in the thread; a reload keeping the view and a half-filled form) `e2e/journey.spec.ts` (get in, leave, the driver removes the ride, each side seeing the other live; the car status sheet) and `e2e/pickup.spec.ts` (a passenger gets in at a new place before the start, the driver adds one on the way and then closes the route to new places; a new place from the waiting list goes on the route with the seat) and `e2e/places.spec.ts` (an office picked from the suggestions, the route on the map, a passenger dropping the pin of a new pickup point; the server runs with no geocoder or router and tiles from an address that answers nothing). There is no formatter. The Vite dev proxy forwards `/api/ws` as a WebSocket (`ws: true` in `vite.config.ts`).

**Error texts are a contract.** The server's `detail` strings are English and `apiError` in `lib/i18n.ts` renders them in Serbian by pattern. `backend/tests/error_catalogue.py` collects every `HTTPException` detail and schema `ValueError` from the source (AST, f-string blanks filled with samples) into `frontend/src/lib/api-errors.json`; `tests/test_error_catalogue.py` fails when that file is stale and `src/lib/i18n.test.ts` fails when a text in it has no Serbian. Change a wording: run `python -m tests.error_catalogue`, then translate. `apiError` tries a message whole before splitting it on `"; "`, because several texts contain one.

Server operations from a laptop (needs `HETZNER_HOST` / `HETZNER_USER` in the shell): `make ssh`, `make logs`, `make deploy`, `make backup`, `make backups` (the app's own nightly snapshots, below), and `make backfill` (the shared Mazda's 2026 paper log as rides, `app/backfill.py`; a dry run unless `APPLY=1`, safe to repeat). Nobody needs to run it: the lifespan calls `backfill.run_once` on every start, which applies it once and records `mazda-log-2026` in the `DataMigration` table so it never runs again (with no single Mazda in the pool it logs a warning, writes nothing and tries again on the next start; a failure is logged and never stops the app). The backup streams `python -m app.backup`, a consistent snapshot through SQLite's backup API — the database is in WAL mode, so copying `karpul.db` alone loses the latest commits. **The app also backs itself up** (`app/housekeeping.py`, started in the lifespan): once a day the same snapshot goes to `KARPUL_BACKUP_DIR` (default `backups/` beside the database file, in production the volume) as `karpul-<date>-<time>.db`, written under a `.part` name and renamed, the newest `KARPUL_BACKUP_KEEP` (14) kept; the same hourly pass purges expired sessions and spent reset links (`auth.purge_expired`). Nothing runs on an in-memory database. Tests: `tests/test_housekeeping.py`.

## Architecture

FastAPI + SQLModel (SQLite) backend, React 19 + Vite + TypeScript frontend, shipped as **one container**: the multi-stage `Dockerfile` builds the frontend and copies `dist` into the Python image, and `backend/app/main.py` mounts it at `/` behind the `/api` routes (`KARPUL_FRONTEND_DIST`). Anything unmatched falls through to `index.html` — so any new API route must live under `/api`, or the SPA catch-all will swallow it.

**Accounts, and nothing without one.** A person registers with a username, a
first name and a surname, plus an optional email and mobile number (`app/auth.py`, `routers/auth.py`); `"<first> <last>"` is their
`display_name`. `User.name_key` is the normalised display name, unique, so two
accounts can never answer to one name. Passwords are PBKDF2-HMAC-SHA256 from the standard
library in a `pbkdf2_sha256$rounds$salt$hash` string (no new dependency, for the same reason
`app/webpush.py` avoids pywebpush); a session is an opaque token stored only as its SHA-256
(`AuthSession`) and sent as `Authorization: Bearer`.

Every endpoint that shows or changes the board needs a session, reads included (the board
carries names, routes and phone numbers): `require_user` in `app/auth.py` is the one answer to
"who is this", and there is no anonymous or name-header path any more (the honour-based
`X-User-Name` and `KARPUL_REQUIRE_LOGIN` are gone). **A session in use slides**: it is issued
for `SESSION_DAYS` (30) and `renew_session` pushes the expiry out to a full 30 days again once
`SESSION_RENEW_AFTER` (a day) of it has gone, from `GET /api/auth/me`, which the app calls on
every start and which is a write route for that reason (a read route must never turn into a
writer, below); only a browser left alone for a month sees the door. Open without a token: `/api/health`,
`/api/push/config`, register/login/reset, the calendar feed (its own secret, below) and the
`/ride/{id}` share preview. A token that is *present but dead* is a 401 with its own wording,
so the browser drops it and shows the door again. The lookup deliberately happens in the
handler body, not as a dependency: `Credentials` (the `CredsDep` dependency) only reads the
header, because a mutating route must take the write lock before anything queries its
session (`database.begin_write`). `require_admin` (`app/admin.py`) follows the same rule.

**People are accounts on the rows.** `Ride.driver_id`, `Booking.passenger_id`,
`PushSubscription.user_id` (and the newer tables' `user_id`/`author_id`) point at `appuser`;
the names next to them (`driver_name`, `passenger_name`, ...) are display snapshots. Ownership
is decided by id through `is_person(user, id, name)` in `services.py` (the frontend's twin is
`isMe` in `lib/me.ts`, read through `useMe()` / `MeContext`); only a row with no id, from before
accounts, falls back to the normalised name (`norm_name`, mirrored by `sameName` in
`lib/dates.ts`, keep both in sync). `database.link_people` fills the ids in by name on every
start (and gives every account a calendar token); registering claims the id-less rows that go
by the new name (`claim_rows`), which is also how a seat a driver gave a colleague by name
becomes theirs. A driver can still add someone without an account by name (`passenger_id`
null). A ride whose driver is a name with no account (`driver_id` null, mostly the
backfilled paper log) wears a *No account* tag on the driver card, and someone signed in under a
*similar* name (`similar_names` in `services.py`: diacritics, case and word order aside, edit
similarity ≥ `SIMILAR_NAME`; mirrored by `similarName` in `lib/dates.ts`, `mayClaim` in `lib/me.ts`)
gets *This is me*: `POST /api/rides/{id}/claim` takes every account-less ride under that name
(`claim_driver_rides`), renaming the snapshots to the account's name. `PATCH /api/auth/me` renaming an account rewrites the snapshots (`rename_person`, by
id) and republishes the changed rides.

**The doors are throttled** (`app/ratelimit.py`, in-process, which is fine for one worker):
wrong passwords per account (10/15 min) and per address (30/15 min), registrations per address
(10 an hour; `KARPUL_REGISTRATIONS_PER_HOUR` raises it for the end-to-end tests, which register
everyone from one address), reset-link guesses per address; 429 with `Retry-After`. Production sets `FORWARDED_ALLOW_IPS=*`
(docker-compose.prod.yml) so uvicorn believes Caddy's `X-Forwarded-For`. Tests reset the
counters in the autouse `clean_env` fixture.

**Account housekeeping.** `POST /api/auth/logout-others` signs every other browser out (the
*Your account* sheet). An admin issues a one-time reset link (`POST
/api/admin/users/{id}/reset-link`, `PasswordReset` stored as a hash, 48 h, the newest only);
the app opened on `/reset/<token>` shows `AuthGate`'s reset card, which sets the password,
signs every browser out and this one in. There is no email: the admin passes the link on.

On the frontend `lib/auth.ts` is an external store (like the theme and the locale) holding
the token and the account in `localStorage` under `karpul.auth`; `lib/api.ts` attaches the
bearer token to every call and clears the store on a 401. `App.tsx` is the door: with no
session it renders `AuthGate` and nothing else, so the board never loads signed out; it
refreshes the account from `/api/auth/me` on start (an admin may have been made one).

**Profile photos** (`routers/photos.py`, table `ProfilePhoto`). `components/AccountSheet.tsx` picks a file and opens it in
`PhotoCropper` (inline in the sheet, not a second overlay): the picture dimmed round a square outline (what is saved)
with the avatar's circle inside it, dragged, pinched, wheeled or arrow-keyed, with a zoom slider up to `MAX_ZOOM`
(the geometry is `fitCrop` / `zoomCrop` in `lib/photos.ts`, tested in `photos.test.ts`). `squarePhoto` then draws that
square at 256 px as WebP (JPEG where the browser cannot write WebP) before `PUT /api/auth/me/photo` (raw body, no multipart). The server only sniffs the first bytes
(JPEG/PNG/WebP) and caps the size (`MAX_PHOTO_BYTES`). The bytes live in the database, so the backup carries
them. An `<img>` cannot send a bearer token, so a photo is served openly at `/api/avatars/<key>` with a random
key that changes on every upload (the old address 404s), `immutable` and `nosniff`; the service worker caches
those addresses (`karpul-photos`), the one exception to "nothing under `/api` is cached". Every place draws an
avatar by *name*, so the board fetches the whole list (`GET /api/avatars`, signed in) into the external store in
`lib/photos.ts`, and `Avatar` looks its name up there (`normName` in `lib/dates.ts`) and falls back to the
initials. `useBoard` refetches it on every (re)connect and on `photos.changed`, which an upload, a removal, a
rename of someone with a photo and an account deletion publish. An admin takes one down from *People*
(`DELETE /api/admin/users/{id}/photo`, logged as `photo_removed`). Tests: `tests/test_photos.py`.

**Calling the driver.** `User.phone` is optional and shown on the rides that person drives:
`RideRead.driver_phone` is looked up by `driver_id` (`board_extras` in `services.py`, one query for
the whole board in `GET /api/rides`, next to the thread's message counts), and `CarDetail` turns it into a *Call the driver* `tel:` link
for everyone but the driver. Email is optional too; the production `appuser.email` started out
NOT NULL, so `relax_not_null` in `database.py` rebuilds that table once on start (`RELAXED_COLUMNS`).

**The ride routers.** `routers/rides.py` is the rides and their seats; the odometer (`/legs`) is
`routers/odometer.py`, the queue `routers/waitlist.py`, the thread `routers/thread.py`, and the
checks they share (`get_ride_or_404`, `is_driver`, `may_run`, `on_behalf`, `booking_of`,
`may_manage_seats`) live in `app/access.py`.

**Admins run every ride.** `may_run` in `app/access.py` lets the driver *or an admin* edit and
remove a ride (and its following weeks) and manage its seats; the frontend twin is `runs()` in
`lib/me.ts` (`Me.admin`), which `CarDetail` uses for the ⋮ menu and the seat controls. An admin can
also add a ride in someone else's name: `RideCreate.driver_id` (create only; anyone else naming
another account is a 403, an unknown one a 404), chosen in `RideForm` through `DriverPicker`
(the form's driver line made pressable, listing `/api/admin/users`); that account then drives and
owns the ride and is pushed `ride_assigned`. An admin's edit or removal of someone's ride is pushed to
its driver too, and the passengers' `ride_changed` / `ride_removed` name whoever did it.
**The admin's log** (`app/audit.py`, table `AdminAction`, `GET /api/admin/log?before&limit`, admins
only): `audit.record` is called before the commit of every admin action, so the line and the change
land together: a ride added in someone's name, someone's ride edited (`audit.diff`, each field before
and after in words) or removed, a seat added or taken out in someone's car (`_on_behalf`: an admin
acting on a ride they do not drive; their own rides are never logged), and every pool-car and account
change in `routers/cars.py` / `routers/admin.py`. Lines are snapshots in words, no foreign keys, so they
outlive the ride, car or person. On screen: *Admin log* in the drawer (`AdminLog`), a heading per day,
the changes as chips with the old value struck through; a line about a ride that still exists opens it
on the day plan. A new action needs its sentence in `adminLog.line` (both languages) and a new field
its label in `adminLog.fields`. Tests: `tests/test_admin_rides.py`.

**A shared car is rationed.** `SHARED_CAR_PER_WEEK` / `SHARED_CAR_PER_DAY` (both 1) in `services.py`:
`shared_car_use` counts a driver's shared-car rides in a Mon–Sun week and on a day (pending and
approved ones too), `over_shared_car_share` turns that into `LIMIT_WEEK` / `LIMIT_DAY` (the day's
text wins), and then `LIMIT_STRETCH`: `shared_car_stretch` joins the ride with the driver's shared-car
rides that meet or overlap it (any car, any approval; no return holds the car to midnight) and more than
`SHARED_CAR_MAX_STRETCH` (24 h) in a row is past the share too (the day either side is all it reads). `_approval_for` in `routers/rides.py` applies it on create (per occurrence of a series)
and when an edit moves an unapproved ride to another day, car type or time: within the share the ride's
`approval` is `""`; past it a plain user gets the 409, or with `RideCreate.request_approval` the ride
is added as `"pending"` and every admin (`admin.admin_ids`) is pushed `approval_requested`; an admin
adding it (for anyone) gets `"approved"` outright, and own cars are never rationed. **A pending ride
holds no slot**: `ensure_car_available` skips it, so the car stays bookable over it (and two asks may
overlap), and `POST /api/rides/{id}/approve` (admin, 409 unless pending) re-runs that check before it
sets `"approved"` and pushes `ride_approved`, so an approval that would double-book is the usual 409;
`/decline` removes the ride through `_remove_rides` with `ride_declined` to the driver and
`ride_removed` to the passengers; both are in the admin's log. **A removed ride points on**: a
passenger's `ride_removed` push also says how many other cars that day still have a seat
(`_alternatives`, nearest departure first) and opens the nearest one (`notify(..., url=)`), so a
cancellation the evening before is not a dead end. **A cancelled shared car asks its passengers
first**: when the *driver* removes their own shared-car ride that has not left, is not pending and has
someone with an account in it (`_hands_over` in `routers/rides.py`, mirrored by `handsOver` in
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
On screen: *Shared cars* in the drawer for everyone (`components/SharedCars.tsx`), whose *Status*
tab is `CarStatusList` (`components/CarStatus.tsx`: a card per car, the report form inline on it,
and for admins *Mark as fixed* on a problem and a ⋮ with *Edit* / *Remove* on each recent report;
the text helpers in `lib/carState.ts`); admins also get its *Cars* and *Usage* tabs (the tab is
`sharedCars.tab` in `App.tsx`, so the driver card's car line opens it on *Status*). One line under
the car's name on the driver card of a shared-car ride (`.driver-car-state`). Tests:
`tests/test_car_state.py`.

**The road between the offices** (`app/offices.py`, `lib/offices.ts`, keep in step): Beograd to
Novi Sad is 90 km, Novi Sad to Beograd 92 (`OFFICES` holds the names people write, folded).
`_prepare` fills a blank `distance_km` in on that route, `fill_office_distances` does it for old
rides on every start, the form shows the known figure as the placeholder and says so
(`form.knownRoad`), and the car state's guess uses it. Tests: `tests/test_offices.py`.

**Who may touch the passenger list** (`may_manage_seats` in `app/access.py`): the driver (or an admin) always; a passenger already in the car only while the ride's `passengers_manage` flag is on (the driver's switch, in `RideUpdate` like any other field); everyone may always add or remove *themself*. The frontend mirrors it as `canManage` in `CarDetail.tsx`.

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
office under any of its names, else folded). **Running late**: on the ride's day the driver taps
*Running late?* 5, 10 or 15 min on the card (`.late-row` in `CarDetail`, shown until an hour after
departure); `POST /api/rides/{id}/late` (the driver only, the ride's day only) writes a thread line
with `RideMessage.late_minutes` (an `ADDED_COLUMNS` column; `body` is the English, the app renders
`thread.late` in the reader's language) and pushes `running_late` (category *changes*) to the
passengers. The ride's times do not change.
On screen: requests under each Upcoming day and under `YouPanel` in Week (`RequestList`,
"Offer a ride" opens `RideForm` with `request`), asked through `RequestForm`.

**Operations.** `/api/health` queries the database (503 when it cannot). `KARPUL_SENTRY_DSN`
turns on Sentry (`app/monitoring.py`, no PII, traces only with `KARPUL_SENTRY_TRACES`); unset sends
nothing. A middleware in `main.py` logs 5xx answers, crashes (then re-raises, for Sentry) and
requests slower than 1 s under `karpul.http`; uvicorn's access log has the rest.
`KARPUL_ALLOWED_COUNTRIES` (`DE,RS`) is a country filter in front of everything, socket included
(`app/geofence.py`, pure ASGI, the outermost middleware): another country is a 403 or a 4403 close,
private addresses always pass, an address the database does not know is refused, and a missing
database logs an error and lets everyone in. The database is DB-IP Lite, downloaded at image build
by `backend/fetch_geoip.py` (it sends its own User-Agent: DB-IP refuses Python's); tests replace
`geofence.country_of`, and `clean_env` clears the variable.

**Many people at once.** Twenty colleagues tap "get in" at the same minute, so the DB layer
(`database.py`) is built for it: SQLite runs in WAL mode with a busy timeout (readers never wait
for the writer), and every mutating route takes `WriteSessionDep` (`get_write_session`) instead
of `SessionDep`. That starts the request's transaction as `BEGIN IMMEDIATE`, so the check-then-write
in the handler (free seats, the car's time window, the plate) is serialised against every other
writer and cannot overbook; `begin_write` must be the first thing on the session and refuses one
that already ran a query. pysqlite's own transaction handling is switched off and SQLAlchemy's
`begin` event issues the `BEGIN`, which means **every engine is built through `make_engine`** —
the tests' included. `tests/test_concurrency.py` hammers the last seat and the corporate-car
window from 20 threads on a file database (the shared in-memory test engine cannot show these
races) and must keep passing. Around that: `GET /api/rides` eager-loads bookings (`selectinload`,
two queries for the whole board instead of one per ride), API responses are gzipped, `/assets`
are served immutable and `index.html` `no-cache`. On the frontend, `load()` in `App.tsx` is
sequence-guarded (only the newest request may set the board) and repeats itself while socket
events keep landing mid-flight; mutation responses go through `upsertRide` instead of a reload.

**Schema changes.** A new *table* is created by `create_all` on start, which is how
`appuser`, `authsession` and the newer tables reach a production database. `create_all` never adds a *column*
to an existing table, so a new column also goes into `ADDED_COLUMNS` in `database.py` with its DDL; `init_db()` runs the `ALTER TABLE`s on start (and creates the model's indexes on the new column) and `tests/test_migrations.py` proves it. A NOT NULL column needs a `server_default` too, or `relax_not_null`'s table rebuild cannot copy old rows. The production SQLite file predates `ride.passengers_manage`, which is why this exists.

**Admins are accounts.** An admin manages the company-car pool and the people: `User.is_admin`,
or a username listed in `KARPUL_ADMINS` (comma-separated, read per request, cannot be undone
from the app; it is how the first admin exists). `require_admin` (`app/admin.py`) is 401
signed out, 403 for a non-admin. `routers/admin.py`: list accounts, make or unmake an admin
(the last one cannot be removed; a configured one is 409), issue a reset link, delete an account
(not yourself, not a configured or the last admin: its rides from today are deleted as if it had
cancelled them, its coming seats and queue places go with `promote_waitlist`, its requests are
withdrawn; the past keeps the names with the ids nulled, messages keep their text; its open sockets
are closed through `events.disconnect`, which the hub sends only to that account's subscriptions). `UserRead.is_admin`
is the effective value (`routers/auth.user_read`). The drawer shows *People* and
*All rides* (`PeopleAdmin`, `RideLog`) to admins only, and *Shared cars* (`SharedCars`) to everyone
with its *Cars* and *Usage* tabs to admins only. *All rides* is a spreadsheet-style
table for an office manager: `GET /api/admin/rides?from&to` (any window up to `MAX_LOG_DAYS`, past
included, unlike the board's 92), shown in a wide sheet (`.panel-wide`, sticky header row and date
column). It also carries each shared car's odometer (below). Filtering, sorting and the CSV download all happen in the browser (`lib/rideLog.ts`, tested in
`rideLog.test.ts`): the file holds the rows on screen in the app language, with semicolons and a decimal
comma because Excel in Germany and Serbia reads a comma file as one column, and a leading apostrophe on
any cell that starts like a formula. Tests: the `admin_auth` fixture in `conftest.py`;
the autouse `clean_env` clears `KARPUL_ADMINS` so a developer's shell can't leak in.

**Where the rules live:**
- `schemas.py` — field validation and cross-field consistency (`corporate_car_id` required for corporate rides, `car_name` required for own cars, `return_time > departure_time`).
- `services.py` — corporate-car double-booking check. Windows are half-open, so the same car can be handed over back to back within a day (a ride back at 12:00 does not block one leaving at 12:00); a ride with no `return_time` has no handover point and occupies the car until end of day. Called on both create and update (update passes `exclude_ride_id`).
- `routers/rides.py` — ownership checks and the rules that need the DB row:
  - `seats` may not exceed the chosen corporate car's `passenger_seats` (422), and on PATCH may not
    drop below the number of existing bookings (409).
  - For corporate rides the server overwrites `car_name` with `"<Name> (<PLATE>)"`; a client-supplied
    value is ignored.
  - `driver_name` is absent from `RideUpdate` — the driver of a ride can never change (an admin
    picks it once, at creation, with `driver_id`). `App.tsx`
    strips it from the edit payload for that reason.
  - `GET /api/rides` takes `date` or `from`/`to`; with no params it returns the current Mon–Sun week,
    and a range longer than 92 days is rejected.
- `routers/cars.py` — the admin-only car mutations. A rename or re-plate is pushed out to the
  rides already booked in that car (`relabel_rides_for_car`), because `Ride.car_name` is a
  denormalised `"<Name> (<PLATE>)"` snapshot; a capacity change deliberately does *not* touch
  `Ride.seats`, which is the driver's own offer. Two guards keep ride invariants true
  after the fact: a car's `passenger_seats` may not drop below the seats an existing ride already
  offers in it (409), and a car may not be hard-deleted while any ride references it (409 — retire
  it with `active=false` instead, which hides it from the pool without touching ride history).

`PATCH /api/rides/{id}` deliberately merges the partial payload onto the stored ride and re-validates the result through `RideCreate`, so a partial edit is held to the full creation rules. New invariants belong in `RideCreate`/`services.py` so both paths inherit them automatically.

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
start). A ride with a
return draws one more, quieter row at the foot of the card's route, the start again with *Back
<time>* (`.trip-back`, after a dashed rule; no map link, the start has one). `distance_km` and `chip_in` are the driver's own words and only ever
shown or summed. `RideCreate.repeat_until` is not a column: `create_ride` writes one ride per
week (`weekly_dates`, at most `MAX_REPEAT_WEEKS`) under one `series_id`, all or nothing, and a
409 on a later week names the date in parentheses (the Serbian `apiError` regex knows that
suffix). `DELETE ?scope=following` removes the rest of the series.

**Places on the map** (`app/geo.py`, `routers/places.py`, `lib/maps.ts`, `lib/places.ts`). A place
is still its words; a pin is extra. **Who has them**: `KARPUL_MAPS` (`everyone`, the default,
`admins` or `off`, read per request, `geo.maps_for`) says who has the maps; `/api/map/config` carries it
as `audience`, the lookups are a 403 for anyone else, the calendar's `GEO` too, and in the app
`useMapConfig` / `useMapsAllowed` answer "no maps" to them, so `PlaceInput` is a plain field and the card
shows no map links, hint or menu item (the *Places on the map* how-to topic is `maps: true`). The pins are
stored for everyone regardless, so turning the maps back on shows them at once; tests run with `everyone`
(`clean_env`, `playwright.config.ts`). `Ride.points` and `RideRequest.points` (`ADDED_COLUMNS`, JSON text)
map the place's folded name (`fold_name` / `foldName`) to `{lat, lng}`, so reordering stops needs no
bookkeeping: `RideBase.points` / `RideUpdate.points` (replaces them whole) are by the place as written,
`geo.points_for` keeps only the route's places and fills in the pins everyone knows (`known_point`: an
office, as an admin placed it in `KnownPlace` or else `offices.OFFICE_POINTS`, and a shared car's home,
`CorporateCar.home_lat/home_lng`, set with `home_point`). `NewStop.point` pins a new pickup point (a
passenger's only while `passengers_add_stops`; a place already on the route keeps its pin, only whoever
runs the ride moves one), and the waiting list keeps it on the entry (`new_stop_lat/lng`) until the seat
comes. A moved pin (not a first one) is the route moving: `ride_changed`, and an admin's is a `pins`
change in the log. Pinned places become suggestions (`KnownPlace` kind `learned`, `geo.learn`); offices
and car homes are seeded on start by `geo.seed_places`, which also pins old office rides. Admins keep them
at `/api/admin/places` (*Places* in the drawer, `PlacesAdmin`; `place_moved` / `place_removed` in the log).
**A moved office or car home takes its coming rides along** (`geo.repin` / `repin_known`, also from a
car's `home_point` edit): rides from today on and open requests that name it and still carry its old pin
(an office's city-centre default counts as old) get the new one; a pin dropped elsewhere for it and the
rides already driven stay, and no one is pushed. `seed_places` does the same catch-up on start for an
office placed before this existed.
The server, never the browser, asks the outside services: `GET /api/places?q=` (known places, then the
geocoder, `KARPUL_GEOCODER_URL`, the public Nominatim by default, "" off), `/api/places/reverse` (a dropped
pin's name) and `/api/places/road?via=` (an OSRM at `KARPUL_ROUTER_URL`, off by default), all signed in,
per account throttled (`ratelimit.place_lookups`), the answers cached in memory (`geo.cache`; a read route
writes nothing) and the public Nominatim asked once a second at most; tests replace `geo.fetch_json`, and
`clean_env` turns the geocoder off. `GET /api/map/config` (open) gives the tiles (`KARPUL_MAP_TILES`, OSM
by default, "" no map at all: only *Open in Maps*). `requests.drivers_for` also matches a pinned request
whose start is within `geo.NEAR_KM` of a ride's pinned pickup point, and the calendar's `LOCATION`/`GEO`
are the reader's own pickup. On screen: `PlaceInput` (suggestions in a `Popover`, which opens only when
something is found, and a labelled *Map* / *Pinned* chip, `.place-pin`) in `RideForm`, `RequestForm` and `SharedCars`,
whose chip opens `PlaceDialog` (portalled to `<body>`, the whole screen on a phone, a tall panel on a desktop,
Escape captured so the form behind stays open): a search on top, the *Saved places* below it before anything is
typed (`GET /api/places/saved`: every `KnownPlace`, offices first, then car homes, then the most used), the matches
and the geocoder's *Addresses* once something is; a saved place is the pick at once, an address or *Pick on the map*
goes on to the embedded `MapPicker` filling the panel, with a *Name* field and *Use this point*;
`MapPicker` (a crosshair over a moving map, inline, not an overlay, a round *Use my location* button and the zoom
bottom left; on its own a floating rounded address search on top, a `PlaceInput` whose pick centres the map, Enter
kept from the form around it; `embedded`, in `PlaceDialog`, it has no search or buttons, the pin being where it was
moved, `onMove`); `MapView` (Leaflet, loaded on first
use through `lib/leaflet.ts`, so it is a chunk of its own; Karpul's own pins as `divIcon`s, the disc drawn
in `.map-pin-body` because Leaflet owns the marker's transform; dark tiles by a CSS filter); on the card
each place opens in Google Maps (`mapsSearchUrl`), *Show on map* opens `RouteMapSheet` (portalled to
`<body>`: the card may clip) or, in a wide pane, `RideMap` inline; *Open the route in Maps* in the ⋮ menu
(`routeUrl`); the "on your way" hint (`stopHint`) offers your open request's pinned start as a new stop;
Day has a *Map* shape (`DayMap`); *Shared cars* shows a pinned car's home. The service worker keeps map
tiles (`karpul-tiles`, never anything under `/api`). Tests: `tests/test_places.py`, `maps.test.ts`.

**Push notifications.** `app/webpush.py` does RFC 8291 encryption and VAPID (RFC 8292) on the
`cryptography` package rather than pywebpush, whose `http-ece` dependency does not build on a
Debian-patched setuptools; `tests/test_push.py` holds it to the RFC test vector. `app/push.py`
keeps one `PushSubscription` per endpoint under the normalised name and the app language, and
`notify()` collects the targets inside the request and sends from a small thread pool
(`deliver`, `forget` for 404/410 endpoints; tests replace both). It is all off until
`KARPUL_VAPID_PRIVATE_KEY` is set (`python -m app.vapid` prints one), read per request like the
admin password. Pushes are addressed by account (`notify(session, user_ids, ...)`;
a seat with no account is skipped). Who is told: the driver when someone gets in or out on their own, a passenger
when the driver takes them out, the passengers when the ride moves (date, times or route, not a
note) or is removed, the first in line when a seat frees up, the car when someone writes in its
thread, the passengers when the driver is running late, the drivers who drive that way when someone
asks for a ride, a requester when a driver answers, and everyone in the car before departure (`app/reminders.py`,
a minute-by-minute task started in the lifespan): **each person picks the lead**, 15, 30 or 60
minutes (`User.remind_before`, `LEAD_CHOICES`, in `GET/PUT /api/push/preferences` as
`remind_before`, the segmented control under the reminders row in `NotificationsSheet`), so one
ride's reminders go out at different minutes; `ReminderSent` is who has had theirs and
`Ride.reminder_sent` is set once everyone has or the ride has left. The
browser side is `lib/push.ts` plus `public/push-sw.js`, which Workbox pulls into `sw.js`
through `importScripts`; every sign-in re-files the browser's subscription under the account (`resubscribePush` in `App.tsx`). Each `kind` belongs to one of `CATEGORIES` in `app/push.py`
(seats, changes, reminders, messages, requests, approvals, cars); a person switches categories off per account
(`User.push_muted`, `GET/PUT /api/push/preferences`) and `notify` skips them. `NotificationsSheet` is the
notification centre: the push switch on its own card, a row per category, and *New version notice* for this
device (`useUpdateNotices` / `setUpdateNotices` in `lib/pwa.ts`, `karpul.updateNotices`, off unless turned on): off, the update
toast and its bolt never show and a waiting build is taken only in the first seconds after the app opens
(`takeQuietly`: the page reloads only once the new worker has taken it, never on a timer, at most once per
10 minutes in a tab, because an iOS app woken from a long sleep can keep its worker waiting and a timed
reload found it still waiting and reloaded again every few seconds).

**Calendar, sharing, figures.** `app/calendar.py` writes floating local times (no zone) for one
ride (`/api/rides/{id}/calendar.ics`, signed in; the app fetches it and hands it over as a
download) and for a person's feed (`/api/calendar/{token}.ics`, a week back to a year ahead).
A calendar app cannot sign in, so `User.calendar_token` in the address is the credential;
*Your rides* shows it and `POST /api/auth/me/calendar-token` rotates it.
`/ride/{id}` is the shell with Open Graph tags spliced before `</head>` (`ride_preview_tags` in
`main.py`); the app reads the path on load, opens the ride and `replaceState`s to `/`.
`person_stats` and `corporate_usage` in `services.py` are the *Your rides* and admin *Usage*
figures: "km shared" is the one-way distance of every ride the person was in, a floor not a
claim, and a car's use rate is days out over the working days in the window plus the weekend days it went out (so never past 100%).

`RideRead` is not a plain ORM dump: `to_ride_read_dict()` adds `bookings`, `waitlist`, `message_count`, `driver_phone` and the computed `free_seats`. Every ride-returning endpoint goes through it (pass `board_extras` for a list).

**Styling.** The frontend is Tailwind v4 (via `@tailwindcss/vite`) plus a hand-written design
system in `src/index.css` (one stylesheet in parts: it `@import`s `src/styles/*.css`: tokens,
controls, layout, board, plan, admin-log, ride, people, sheets, feedback, extras, themes, each a
run of sections in the order they always were, Tailwind inlining them at build; the media blocks,
phones, wide screens, dark and hover, are in the last two and must stay last), built on Microsoft's
Fluent 2 design language in Karpul's own green: a
phone-first, card-based UI on Fluent's neutrals, white cards with Fluent's two-part elevation shadows
(`--shadow`, `--shadow-hover` in the *Hover* block, `hover: hover and pointer: fine` only,
`--shadow-pop`), Fluent's shapes (`--radius-sm` 4px for controls, `--radius` 8px for cards,
`--radius-lg` 12px for sheets and dialogs), one green accent for "selected / go", red only for
removal, Fluent's controls (an input's bottom edge darker and an accent underline when focused, the custom
pickers and the route box included; the outlined switch that fills; a secondary button outlined on
the surface, pressed by darkening rather than shrinking; cards at shadow 4 with no visible stroke;
the top bar and the tab bar frosted with `backdrop-filter`, written unprefixed only, because the
CSS minifier keeps just the `-webkit-` copy when both are there), and Segoe UI Variable where the
system has it, else Inter (bundled from `@fontsource/inter`
in `main.tsx`, because the app ships as one self-hosted container). Karpul keeps its own name, mark
and colour: Fluent is the language, not a Microsoft brand. The semantic class names (`.card`, `.date`, `.car-tile`, `.pax-row`,
`.panel`, `.btn`, …) are the contract the components render against. On a phone the layout is
one 600px column. From 1024px (`lib/useWide.ts`, the *Wide screens* block in `index.css`) it is a desktop app
that fills the window: the page never scrolls; the drawer's content is docked down the left edge
(`Dock` in `Sidebar.tsx`, no ☰), a toolbar carries the view's name, the view switch and the add
button, and each view is two full-height panes (`.split`) that scroll on their own
(`data-scroll-pane`, which `lib/dnd.ts` auto-scrolls during a drag instead of the window):
Upcoming is the list beside the open ride (no unfolding in place: `Upcoming` gets no `renderDetail`,
and the pane shows your next ride when nothing is picked), Week is the days, the day's rides as a
vertical list (`CarCarousel vertical`) and `YouPanel` beside the open ride, Day is the plan with the
ride in a column on the right. The ride pane is a container: past 760px the ride becomes one big
card split into the driver's half and the passengers'. From 1600px the root font grows to 16px. Two media
blocks carry the phone layout:
`max-width: 600px` (sheets become true bottom sheets) and `pointer: coarse` (44px targets, hover
choreography switched off, carousel arrows hidden). `lib/useCoarsePointer.ts` exposes the same
query to components that need to change their wording. The app's own mark (the top bar, the drawer head, the favicon and the installed-app
icons) is a car, side-on, whose back half turns into a thunderbolt: one thick white line on a tile
that runs from mint to forest green with a soft light in its top corner, in the manner of the newer
Fluent app icons. `public/favicon.svg` is the source, split by `<!-- tile -->` / `<!-- mark -->`
comments that `scripts/render-icons.mjs` uses to derive the PNGs (`pwa-192`/`pwa-512` with rounded
transparent corners, `pwa-maskable-512` full-bleed with the mark scaled into the platform's safe
zone, `apple-touch-icon` full-bleed and opaque), and `components/Logo.tsx` repeats the same drawing
inline (its gradient ids per instance, through `useId`). Change the mark in all three places. Icons are drawn in
`components/icons.tsx` itself (no icon package), in Fluent 2's grammar: the 24px grid with its 3px
margin, a 1.5px round stroke (`light` 1.25 / `regular` 1.5 / `bold` 2, a touch heavier below 16px so
small glyphs stay crisp), rounded corners on every box, long thin chevrons and arrows, a person as a
head over a rounded shoulder, Fluent's own shapes for the common glyphs (Dismiss, Navigation,
Calendar, Clock, Delete, Edit, Chat, Send, Alert, Shield, Money), no fills except the dots. The named exports are the contract the components render against (`size` in px, optional
`weight`). The drawer and the phone's tab bar use the Fluent marks in
`components/FluentIcon.tsx` instead: a 20px grid, a 1.5px stroke, each drawing split into a body,
details and extras so one drawing gives two styles (`regular`, and `filled` with the details cut out
in `--icon-knock` for the selected tab). Every icon in the app is monochrome, in `currentColor`: the
drawer's marks stand in the label's ink with no tile, and the notification centre's rows have no
tinted tiles either. Selection is shown the Fluent way, by a brand tint and an accent bar, never by a
solid green block: the picked day in the week strip is a tinted cell with a short bar at its foot
(`.date-thumb`, today's number in green), a picked car tile or Upcoming row is tinted with a green
hairline (`.car-tile-selected`, `.session-open`), a filter chip is a square-cornered toggle that tints
when on (`.chip-on`), and the week arrows are borderless icon buttons (`.week-btn`). Adding a ride has exactly one control: `AddRideFab`
(`components/AddRideButton.tsx`), Fluent's FAB: a white plus on a green rounded square (16px corners)
floating at the bottom right of the column, above the tab bar, on every view whenever a ride can be added (`.fab`, under every sheet's backdrop); on a
wide screen it is `AddRideToolbarButton` at the right end of the toolbar instead.
There is deliberately no *Add ride* tile in the carousel, no plus in the empty card and no drawer
item; the empty card says only that there is nothing yet. Avatars (`components/Avatar.tsx`) derive a stable pastel from the name.
Known car models get a side-view illustration instead of the generic icon: `lib/carModels.ts`
matches a car name (plate suffix and all) to a model key and an `electric` flag, and
`components/CarArt.tsx` draws it (`CarGlyph` falls back to `CarIcon`) in Fluent's illustration
manner: no outline, the shapes modelled by soft gradients (ids per instance through `useId`), a
sheen across the glass and a blurred shadow under the car. Today that is only the
white Mazda 6e, used in the ride tiles, the driver card's vehicle strip and the admin list.
`carPowertrain()` in the same file says whether a name is *electric*, a *hybrid*, *diesel* or
*petrol* (explicit words and engine badges first, hybrid before electric before diesel before
petrol so "plug-in hybrid electric" is a hybrid; then models sold only one way) and
`PowertrainMark` draws it as a 12px glyph (bolt / leaf / drop / pump) *after the car's name* on
the tile, the Upcoming row and the admin list (`.pt-mark`). It is deliberately not on the
picture: a sticker big enough to read on a phone hid the car. The driver card spells it out as
"Electric" / "Hybrid" / "Diesel" / "Petrol" beside *Company car* / *Own car* under the car's name.
Below that, `carBrand()` in the same file recognises a *make* from the name (make words and
the models people write instead of one: "grey Golf", "Octavia"; words that are also plain
English, like "Seat" or "Focus", must be capitalised to count) and `BrandLogo` /`CarGlyph` show
its mark from the `simple-icons` package in `currentColor`. Only the brands listed in `LOGOS`
are bundled (named imports tree-shake); Mercedes, Land Rover, Jaguar, Alfa Romeo and Lexus are
not in that package, so they keep the generic icon.

**Motion.** Fluent's patterns, and things go back the way they came: a view slides in 40px from
its side after the one it replaces has slid out the other way (`components/SlideSwitch.tsx`: the keyed
content's wrapper hands its DOM to the host as it unmounts, and a `cloneNode` snapshot laid over
the host plays `.swap-leave-*` while the real content is long gone, so nothing in it runs or
fetches again; the entering `.swap-*` is marked `data-after` and holds, invisible, for the
snapshot's `--swap-out` (100ms) before its own step, so the two are never on screen together:
two layouts of text stacked at half opacity read as mud, not motion), a flyout comes 10px out of its anchor, a dialog grows a little out of the
middle as it fades in, a toast rises 16px, on Fluent's curves (`--ease-out` decelerates in,
`--ease-in` accelerates out, `--ease-spring` no longer overshoots; the one overshoot left is
`--ease-bounce`, on the update screen's bolt and the phone tab bar's glide and pop) and durations (`--dur-fast` 150ms, `--dur-normal`
200ms, `--dur-gentle` 250ms, hover 100ms). The
keyframes are in the *Motion* and *Sheets & dialogs* sections of `index.css`, the two hooks in
`lib/motion.ts`. `useSlideDir(value, rank)` says which side freshly keyed content enters from
(a higher rank enters from the right, a lower one from the left, NaN means no slide) and
`App.tsx` wraps the view (Upcoming sits left of Week), the day board (the way the calendar
moved, only while the Week view shows) and the driver card (from the tile you tapped) in
`SlideSwitch` (the keyed `.stack` inside carries `slideClass(dir)`); `DateCarousel` does the same for a week step.
`useClosing(onClose)` lets `Sheet`, `Sidebar` and `ConfirmDialog` play their exit before the
parent unmounts them: every close from inside the overlay goes through `requestClose`, which
adds `backdrop-closing`, and `onClose` runs on the panel's `animationend` (with a fallback
timeout); a parent that unmounts the overlay itself, after a save, still closes on the spot,
and the drawer's `pick` closes on the spot on purpose so the sheet it opens owns the history
entry alone. Sheets rise from the bottom edge on a phone and pop up on a desktop, the drawer
slides from the left, confirmations grow out of the middle and popovers come out of their anchor (`Popover` sets
`transform-origin` and measures itself with `offsetWidth`, which a transform does not change),
the toast and the floating plus spring in (the plus also contracts while pressed and springs back on release; the pressed state comes from pointer and key events, not `:active`, which phones apply late and Chrome holds on after the finger lifts), the Upcoming detail unfolds as a grid row from
`0fr` (the `.session-detail-clip` wrapper hides the overflow and leaves room for shadows), a
passenger who just got in grows into the car's list the same way (`.pax-slot-new`, `useArrivals`
in `lib/motion.ts`: not on first render, not into an empty list, not your own row, which takes the
place of the *Get in* row; the seat controls stay on screen, disabled, while the call is out, so
the card never flickers through its empty state first), and
the segmented controls (`SegThumb`, `components/Segmented.tsx`, drawn as Fluent's TabList: the
choices on the page, the pick semibold over a short accent bar) and the date pills
(`.date-thumb`) move one marker element instead of recolouring buttons. Reduced motion collapses
every duration, so the exits still fire `animationend`.

**Theme.** Light, dark or the system's choice: `lib/theme.ts` is an external store like the
locale, remembered as `karpul.theme`, and puts the choice on the root as `data-theme` and what
is on screen as `data-resolved`. The dark tokens in `index.css` live under both
`:root[data-theme='dark']` and the `prefers-color-scheme` media query (so a dark phone never
paints light before the script runs); the rules that were never tokens (the pastel avatars,
the illustrations, the toast, the error text) key off `data-resolved`. The switch
(`ThemeSwitch`) sits above the language switch in the drawer.

**Language.** The UI is switchable between English and Serbian (Latin script). Every string
the screen shows lives in `lib/i18n.ts` as two dictionaries, `en` and `sr`; `en` is the
reference and `sr` is typed as its shape, so a missing key is a type error, never a silent
fallback. Anything with a count or a name in it is a function (Serbian has three plural forms
and would need case endings on names, so the sentences are built to keep the name as typed).
Components read text with `useT()`; non-component code (`lib/dates.ts`, `lib/carModels.ts`) with
`messages()`. The choice is an external store in `lib/locale.ts` (`karpul.locale`, first visit
follows the browser language), which also hands `Intl` its tag (`intlTag()`, `sr-Latn-RS`), so
weekday and month names and the week range follow the app language rather
than the browser. Clock times are 24-hour in both languages, always: `fmtTime` / `fmtHour` in
`lib/dates.ts` write `HH:MM` / `HH` by hand, and a `Date` goes through `toLocale*String` with `CLOCK`
(`hourCycle: 'h23'`), never a bare `hour: 'numeric'`. Backend error texts stay English on the wire and are rendered through
`apiError` in the same file, which matches the server's wordings (keep it in step when a
`detail` string changes). The switch is `LanguageSwitch`, at the foot of the drawer and on the
sign-in screen, the two places a newcomer looks first. `main.tsx` also bundles Inter's Latin Extended subset for č ć š ž đ.
Wording rule for both languages: no em dashes. Don't explain what the screen already shows: no
intro paragraphs restating a sheet's title, no hints under menu items, no "tap here to..." lines, and
never "only admins / only you can see this" (whoever reads it can see it). A hint stays only when it
says something the control cannot (a consequence, a privacy risk, a format).

**Screen structure.** The top bar is the ☰ button, the title and the live lamp; the ☰ opens
`Sidebar` (`components/Sidebar.tsx`), a drawer from the left edge that holds everything not
about one particular ride: under your account, the things opened most with no heading over them
(*Your rides*, *Shared cars*, the *Shared car guide*), then collapsible groups, *Manage* for admins (approvals, the
people, the places, every ride, the log), *Help* (support, feedback), and *Settings*: not a group but a card of its
own pinned to the foot (`.settings-card`, a gear, a chevron pointing up), folded by default, that unfolds
*upwards* out of its head (the body is a grid row above the head, 0fr to 1fr; the rest of the menu is
`.drawer-scroll` and gives way), holding *Notifications*, *Install the app* while the browser can, the
theme and the language. What is open is remembered as `karpul.drawerGroups`; a folded *Manage* carries the approvals count on
its heading. Each group heading is a Fluent accordion header: a full-width
row in the text's ink, a leading chevron in its own small well that turns down when the group opens,
a tint under a mouse and a darker one when pressed, and the open group's rows hanging off a hairline
under the chevron. The items are one label each, no hint line. Your account is the
identity block on top (it opens `AccountSheet`, which is also where you sign out), *Your rides* (`MyRides`: figures, history, the calendar feed address),
*Notifications* (`NotificationsSheet`, the push switch), *Approvals* and *Admin log* (admins only, `Approvals`, `AdminLog`), *Shared cars* (`SharedCars`: *Status* for everyone, and for admins a
*Cars* tab and a *Usage* tab that reads `/api/cars/corporate/usage`) and the *Shared car guide* (`CarGuide`: how to charge
with the company card, and a Mazda 6e primer for first-time EV drivers, frunk included. The words are the `guide`
entries in `lib/i18n.ts`, one picture per entry in `components/GuideArt.tsx`, drawn like Fluent's
own icons only bigger (a 120×80 box at 96px, so the 1.875 stroke lands on 1.5px, round corners, soft
neutral fills, numbers and ticks on a solid green disc) with the green accent on the one thing the
step is about; also reachable from
the driver card of any company-car ride; its foot opens *Contact support*). The *Help* group holds *How to use Karpul* (`HowTo`: a
Fluent accordion of topics, each a few numbered steps; the words are `howTo` in `lib/i18n.ts`, `**name**` sets a
control's name in bold, the admin topic shows to admins only; `docs/user-guide.md` is the long version, keep them
in step), the guide,
*Contact support* (`SupportSheet`: car, app and organizational contacts with `tel:` / `mailto:` buttons, the list is
`SUPPORT` in `lib/support.ts`) and *Report a bug or send feedback* (`FeedbackSheet`, also at the foot of the support
sheet: a bug or an idea sent as a `mailto:` to the app contact from the person's own mail app, with the account, view,
browser and screen under the text; nothing on the server). Picking an
item closes the drawer before the sheet opens, so the two body-scroll locks never overlap. The views are switched by a Fluent bottom tab bar on a
phone (`.tabbar` in `App.tsx`, a radio group named *View*, 26px marks, the active one filled; one
green pill, `.tab-glider`, slides under the marks to the picked tab on `--ease-bounce`, and the mark it
lands on pops, keyed so the animation replays; `--tabbar` is its height, which the FAB, the toast and the column's foot leave room for, and 0
on a wide screen) and by the segmented control in the toolbar on a wide screen, and
remembered in `localStorage` (`karpul.view`): *Upcoming* (the default), *Week* and *Day*.
Day (`components/DayPlan.tsx`, the arithmetic in `lib/dayPlan.ts`, tested in `dayPlan.test.ts`) is
one day for scheduling the company cars, drawn as one *road* per car: every active pool car (free
ones too) and then each own car going, hours across: the whole day, 00:00 to 24:00 (`DAY_AXIS`), at a
fixed width per hour (`--plan-hour`), so the board scrolls sideways (`.plan-scroll`, the car's name
sticky on the left) and opens on now today, else an hour before the first ride, else 07:00. A ride is a
stretch of its road in the driver's colour (`avatarTone` in `lib/tone.ts`, the avatar's pastel and ink
as `.tone-*`; solid green when it is yours), from the driver's avatar at departure to a dot at the
return, the way `CarDetail` draws a route; no return runs off the right edge, as the server holds the
car to end of day. Now is an ink rule behind the roads (not red, which is for removal); each pool car
says when it is next free (`rowStatus`). Switching to it jumps to today; `range` is that one day. A tapped bar
opens the ride under the plan (beside it on a wide screen, `.split-day`); a free stretch of a pool car
(`.plan-free`, never in the past; under a mouse a ring follows the pointer to the half hour, popping in on a spring and shrinking away where it was when the pointer leaves, per road in `pins`, and the clock's ring the same through `useLinger` in `lib/motion.ts`; a company car's hour ticks are elements, `.plan-tick`, and the ones on a free stretch are green-tinted and stand up in a wave from the pointer, `--d` delaying each by its distance) opens `RideForm` with `slot`: that car, departure at the tapped
half hour, back by the next booking or 17:00. While the board scrolls (a phone, a narrow pane), an
overview strip sits on top of it (`components/PlanOverview.tsx`): the whole day across the card's width,
one thin lane per car with its rides in the drivers' tones, and a green frame over the hours on screen;
a tap centres the board there and a drag pans it (`visibleSpan` / `scrollToCentre` in `lib/dayPlan.ts`),
and it is a keyboard slider too. It hides itself when the day fits. A picked ride that you run (`runs()`, so any ride for an
admin) grows a pencil at its end (`.plan-edit`), and a double click on it opens the edit form too. The same
day can be drawn as a **clock** instead (`components/DayClock.tsx`, geometry in `lib/dayClock.ts`, tested in
`dayClock.test.ts`): a 24-hour dial, midnight at the top, one ring per car (pool cars outermost, then own cars),
rides as arcs in the driver's tone from their initials to a dot, the hours gone today as a faint wedge and now as
a hand. A free arc of a pool car books like `.plan-free` (pin at the half hour under the pointer), the middle of
the dial reads out the hovered slot, the hovered or picked ride (with *Edit* when you run it) or the time, and a
legend beside it names the rings with each car's status. The Clock / Timeline switch sits in the plan's head,
remembered as `karpul.planShape`; with nothing remembered a wide screen opens on the clock (its dial takes the
pane's height) and a phone on the timeline. Upcoming is
`Upcoming` (`components/Upcoming.tsx`): every ride from today for the next `UPCOMING_DAYS` (90;
the API caps a range at 92) grouped under a heading per day, one row per car; a tapped row
unfolds `CarDetail` beneath it with `draggable={false}`, because there is no `YouPanel` tray and
no other same-day tile to drop on. Above the list sit the filter chips (*All*, *Free seats*, *My
rides*, *I'm in*) and a search box, state local to `Upcoming`; the day headings are sticky under
the top bar (`.upcoming-head`). `App.tsx` loads whichever range the view needs (`range`) and
the live-event filter uses the same range. Week is the day board: `DateCarousel` (the loaded Mon–Sun week as seven pills that always fit the
width — nothing scrolls; above them one line for the week, whose name opens a calendar
(`DatePicker variant="title"`) with *Today* and the two arrows on the right, and a sideways swipe on
the strip also steps a week; the days are bare text, the sliding green pill marks the picked one) →
`CarCarousel` (one tile per ride that day with its route line, hidden when there are none; tiles are also drop targets; the seat count goes red when full and green when you are in or driving) →
either `CarDetail` (driver card, times, route with the pickup points, distance and chip-in
tags, passenger list with the drop zone and the *Get in this car* row, which reads *Switch to
this car* when `switchFrom` says you are seated elsewhere that day, the keyboard's way of
dragging; a pickup `Select` above the seats when the ride has stops; ⋮ with *Share ride*,
*Add to calendar* and, on a series, *Remove this and following rides*) or `AddCarCard` (the
dashed placeholder with a small car badge, deliberately no picture; `intro` adds the two-view explanation when the whole board is empty) →
`YouPanel`. The design's
"unassigned passengers" list has no equivalent because Karpul has no roster: the only passenger
you can move is yourself, so `YouPanel` is your draggable chip when you are not seated and the
"drop here to get out" target when you are. Every dialog is a `Sheet` (bottom sheet on a phone,
centred panel on a desktop), the one exception being `UpdateScreen`, which takes the whole screen
because the bolt you trace on it is the screen; destructive actions go through `ConfirmDialog` instead of
`window.confirm`. Every overlay (`Sheet`, `Sidebar`, `ConfirmDialog`, `Popover`) calls
`useBackClose` (`lib/useBackClose.ts`), so a phone's back button closes the topmost one instead
of leaving the page: the first overlay to open pushes one history entry, the ones stacked on top
join an in-memory stack, back pops the top and re-pushes while any remain, and a close by any
other route pops the entry when it was the last, so back never lands on a dead entry. **No native pickers or dropdowns**: `Select`, `DatePicker` and `TimePicker` are
custom controls (and `Menu` is the ⋮ menu) built on `Popover`, which portals to `<body>` and
positions itself against its anchor with `position: fixed`, so it is never clipped by a sheet's
scrolling body and flips above the anchor when the viewport runs out. `TimePicker` shows hour (00–23)
and minute columns and emits `HH:MM`. `App.tsx` resolves which tile is open (`selection`):
an explicit pick that still exists, else your own ride, else the first ride, else nothing (the empty card).
**Wording:** the thing you add, edit, duplicate or remove is a *ride*; *car* is reserved for the
vehicle (the pool, "Shared car" / "Own car", "get in this car", "in this car"). The pool cars are
*shared cars* on screen (Serbian *zajednički auto*); the code and the API keep saying *corporate*
(`CarType.corporate`, `/api/cars/corporate`), and the charging card stays the *company card*.

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

**Accessibility notes.** Toasts are announced through an always-mounted `sr-only` live region
in `App.tsx`; the visible pill is `aria-hidden`. Every drag has a button equivalent (*Get in*,
*Switch to this car*, *Leave*). The dark avatars pair a deep tint with a light ink so the
initials keep their contrast.

**Frontend data flow.** `App.tsx` holds the UI state, with its pieces in hooks: which sheets
are open (`lib/useOverlays.ts`, one open set, `is`/`show`/`hide` and a stable `closer(name)`),
the toast (`lib/useToast.ts`), the passenger chip in flight (`lib/usePassengerDrag.ts`), and
the pure rules for which ride is open and which days are loaded (`lib/selection.ts`:
`daySelection`, `upcomingSelection`, `boardRange`, tested in `selection.test.ts`). The board's
data lives in `lib/useBoard.ts` (the shared cars' state too, `carStates`): rides and requests for the range on screen (a Mon–Sun week, or the Upcoming 90 days), both car lists, the sequence-guarded `load`, the live-event reducer and the 30 s fallback poll. Mutating endpoints return the updated `Ride` so `upsertRide()` can patch state without a full reload. The rest of the components are presentational, plus a few sheets that fetch their own data (`MyRides`, `PeopleAdmin`, `RideThread`). On any mutation error it toasts and refetches. **A reload lands where you were** (`lib/keep.ts`): state that should survive a refresh (the
browser's, or `applyUpdate` taking a new build) is held with `useKept(key, init)` instead of
`useState`: the day, the open ride, the open sheets (`useOverlays`, all but the update screen), the
ride and request forms field by field, a thread's draft, the feedback text, a car report, the account's
details (never a password) and Upcoming's filter. Every mounted `useKept` is in a registry that is
written to sessionStorage (`karpul.keep`) on `pagehide` and when the tab is hidden, so what comes back
is exactly what was on screen: a closed sheet is unmounted and simply not saved. Each key is handed
back once, the snapshot belongs to one account (`keepFor`, in `App`) and goes stale after 6 hours; the
page's and the panes' scroll ride along (`restoreScroll`, once the board has loaded). A reload with a
sheet open keeps its back-button entry for the sheet to take over (`useBackClose`). Tests: the reload
walk in `e2e/smoke.spec.ts`. All dates crossing the API are local-date ISO strings built by hand in `lib/dates.ts`
(`toISODate`) — never `toISOString()`, which would shift the day by the timezone offset.

**Installable (PWA).** `vite-plugin-pwa` in `vite.config.ts` writes the web app manifest
(`manifest.webmanifest`, standalone display, the icons above, off-white theme colour to match the
top bar) and generates a Workbox service worker, `sw.js`, that precaches the built shell: `index.html`,
the hashed bundles, the fonts and the icons, so an installed app opens offline and starts instantly.
**The install offer** (`lib/install.ts`, `components/InstallCard.tsx`): Chrome and Edge fire
`beforeinstallprompt` once the app qualifies, and `listenForInstall` (called in `main.tsx` before
React, because the event can fire before the first render) keeps it and suppresses the browser's
own mini-infobar; Safari on an iPhone or iPad has no such event, so there the offer is the two taps
through the Share menu (`ios()` also catches an iPad that calls itself a Mac). Signed in and not
running standalone, the board opens with an *Install Karpul* card (above the board on a phone,
floating in the bottom corner on a wide screen): *Install* runs the browser's dialog, *Not now* /
*Got it* puts it away for good in this browser (`karpul.installHint`), and *Install the app* in the
drawer's *Settings* group stays while the browser can still install, bringing the card back on iOS.
Nothing under `/api` is ever cached, and navigations to `/api`, `/docs`, `/redoc` and `/openapi.json`
are left to FastAPI (`navigateFallbackDenylist`). `lib/pwa.ts` registers the worker from `main.tsx`
(`registerType: 'prompt'`): a new build waits instead of reloading under the user's fingers, `App.tsx`
shows it as a tappable "A new version is ready" toast (`useUpdateReady`, in the toast slot whenever no
other toast shows). The other toasts are a line of ink that comes and goes; this one waits to be
pressed, so it is built like the cards instead: the app's own mark on a green tile (a charge sweeps
across it every few seconds), the line with its hint under it and the verb as a green chip, on a card
with a green line and a green glow that it keeps in both themes.
The tap opens `UpdateScreen`, which takes the **whole screen** and turns the lights out: an ink
ground in either theme, with the app's own thunderbolt glowing across it for you to **trace** to take
the build. It is its own screen rather than a sheet because the bolt is the screen, a stroke that
crosses a phone edge to edge, and a pad inside a panel gave the finger a lane the width of a thumb;
it still rises from the bottom edge and carries a sheet's manners (escape, the phone's back button, a
locked body), because it comes out of the toast down there. The words and the way out float over the
bolt with `pointer-events: none`, so only the two buttons take a tap of their own, and the screen
hands the bolt its colours as `--bolt` / `--bolt-dark` (the light board's green is too dark to glow).
`BoltTrace` walks the bolt path once with `getPointAtLength` and matches the finger against a window
of points ahead of where it has got to, so a corner may be cut and a wander is forgiven: past `STRAY_R`
the trail holds where it is and can be picked back up, and only past `LOST_R`, or a lift short of the
tail, does it start over with a shrug. The bolt falls the way a bolt falls: two steep strokes with a jog
back across between them, because the screen's height is what there is most of and a stroke pulled down
it is the gesture a thumb makes without thinking. The two long strokes are parallel and 53 units apart,
which is what lets `STRAY_R` be generous (a finger on one is never nearer a point on the other) and what
sets how thick the lane can be drawn: `LANE` in `BoltTrace.tsx` and the `stroke-width` in `index.css`
are the same number, because `LANE` also cuts the mask below. The lit part of the bolt is four layers on
one path, all keyed to how far the finger has got (`pathLength=100`, so every dash is a percentage): a
blurred `.bolt-glow` for the light it throws, the `.bolt-trail` itself, and `.bolt-current` pulses
falling down the inside, clipped to the drawn part by a mask cut from the same dash. A blurred filter
*inside* that mask leaks its own rectangular filter region in Chrome, so the current's softness is a
second wider pass at low opacity instead. The head the finger steers is a white core in a blurred
`.bolt-halo`, and before anyone touches it a `.bolt-hint` spark falls down the empty lane to say which
way it goes. When it closes, the pad pops, the lane goes white-hot and cools back to green, the current
speeds up, a white spark runs the length of it, a ring is thrown off the tail and a green flare washes
the screen, which is also what hides the reload's blank frame. The flare opens from the
tail of the bolt rather than the middle of the screen, so it carries on from where the finger stopped:
`BoltTrace` hands its last point to `onComplete` as a percentage of the viewport (through the same
matrix that puts the finger in the bolt's coordinates, measured before the charge pops the pad) and
`UpdateScreen` sets it as `--flare-x` / `--flare-y`, which `.update-flare` uses for both the gradient's
centre and its `transform-origin`. The plain button at the foot of the screen
is the same update for anyone who would rather not draw, the button equivalent every drag here has.
Both run `applyUpdate`, which is a hard refresh: it listens for `controllerchange` itself, empties the
Cache Storage (the precache an ordinary reload would be served from, kept when the browser says it is
offline) and reloads, with a 3 s timer so it still refreshes when no worker claims the page. That listener is deliberate: workbox-window only calls a controller change an update when a
worker already controlled the page at registration, false on a first visit, and `clientsClaim: true`
in the worker is what makes the new worker take that page over at all. An installed app can stay open
for days, so the hook also asks the browser for a new worker every hour and when the app comes back to
the foreground. On the server, everything outside `/assets` keeps its name across builds (the shell,
`sw.js`, the manifest, the icons) and `mount_frontend` in `main.py` serves all of it `no-cache`, so a
phone always learns about a new build; `tests/test_frontend.py` pins the headers. In `npm run dev` the
virtual register module is a stub and no worker runs; index.html carries the Apple meta tags the
manifest cannot express (`apple-touch-icon`, standalone mode, the app title).

**Live updates.** Every tab keeps one WebSocket open to `/api/ws` (`lib/live.ts`, `useLiveBoard`).
A browser cannot put a header on a WebSocket, so the first message is `{"type": "auth", "token": ...}`;
the server answers `hello` (the client's cue that it is live) or closes with 4401, which drops the session.
The server pushes `ride.created` / `ride.updated` (carrying the full `RideRead`), `ride.deleted`,
`request.saved` / `request.deleted`, `photos.changed`, `cars.changed` and `cars.state`; `App.tsx` upserts or removes the ride if it falls inside the loaded week
(re-sorting with the API's order: date, departure, id) and treats `cars.changed` as "reload
both car lists and the board", because a pool edit can relabel rides. The hook reconnects with
exponential backoff and immediately on `visibilitychange`/`online`/`focus`, and calls
`onConnect` on *every* open, which reloads the week — events that happened while the socket
was down were never delivered. The 30 s poll only runs while the socket is not `live`. On the
backend, `app/events.py` is an in-memory hub: sync route handlers run on a worker thread, so
`publish()` hands each event to the connection's own `asyncio.Queue` via
`call_soon_threadsafe` and the socket task does the sending. This only works with **one
uvicorn worker** (which is what the Dockerfile runs); more workers would need a shared channel.
Publish only after `session.commit()`, and every ride mutation must publish or the other tabs
go stale. Tests: `tests/test_live.py` (`client.websocket_connect`).

**Drag-and-drop** is pointer-event based (`lib/dnd.ts`, `grabPassenger`), not HTML5 DnD, so it
works with a finger: mouse lifts the chip after a few pixels of movement, touch after a short
press-and-hold (a swipe before the hold is treated as a scroll and ignored). Handles carry
`touch-action: none` in `index.css` — remove that and mobile drags get cancelled by the
browser's own scrolling. The controller owns a plain-DOM ghost, auto-scrolls at the viewport
edges and finds the drop target with `elementFromPoint` on `[data-drop]` elements: a card or the
tray spreads `dropZone(...)` *only while it can receive*, so validity lives in the components.
`App.tsx` holds the in-flight `drag`/`dragOver` state and dispatches the drop through a ref, since
the ride list can change under a drag via live updates. Dropping on another car issues `leave`
then `join`; dropping on the tray issues `leave`.

**Company cars** are seeded from `CORPORATE_CARS` (`Name|PLATE|seats[|home];…`) only while the `corporatecar` table is empty (`seed.py`); after that the pool is managed through the admin endpoints, and nothing on start touches a car again. `CorporateCar.home` (an `ADDED_COLUMNS` column, *Departs from* in `SharedCars`) is where a car is kept: `RideForm` starts a new ride in it there, and picking another car moves the start along unless the driver typed their own. `GET /api/cars/corporate` stays public and active-only, so `App.tsx` keeps the admin list (`adminCars`, everything) and the ride-form list (`cars`, `active` only) as two views of one fetch — `applyCars()`.

Tests (`backend/tests/conftest.py`) use an in-memory SQLite engine (`make_engine("sqlite://", poolclass=StaticPool)`) and override `get_session`; `get_write_session` wraps it, so the override covers both. `TestClient` is intentionally used **without** a context manager so the lifespan never runs and the on-disk DB is never touched. The `client` fixture is a `BoardClient`: it signs requests in as accounts made per name on first use (`headers={"X-User-Name": "Ana"}`, or the payload's `driver_name` / `passenger_name`, else "Test Viewer"), so tests read in names while the API only sees bearer tokens; `client.anon` is a plain client, `client.auth(name)` the headers, and `websocket_connect` sends the auth message itself.

## Deployment

Karpul shares a Hetzner box with gamgee, iris, flora-find and sokola. Host-level Caddy terminates TLS for `www.karpul.dev` and proxies to `127.0.0.1:3004` (the other apps own 3000–3003); the stack lives in `/opt/karpul` with SQLite in the `karpul_karpul_data` volume. Full runbook: `docs/deployment-hetzner.md`.

**CI gates both merges and deploys.** `deploy.yml` runs on `workflow_run` of CI (not on push): only a green
CI run of a push to `main` deploys, and it deploys the commit CI tested (`ci-passed` hands its sha to the SSH
script, which exits without touching anything if `main` has moved past it, so a late run never rolls back). A
manual run checks with `gh run list` that CI passed on `main`'s head first. Merges are gated by branch
protection on `main` (a GitHub setting, see `docs/deployment-hetzner.md` §6) requiring the three CI jobs, so
keep their `name:`s (`Backend tests`, `Frontend lint and build`, `End-to-end smoke test`) or update the rule.

Two constraints in `.github/workflows/deploy.yml` that look accidental but are not — don't "clean them up":
- `DEPLOY_PATH` is hard-coded to `/opt/karpul` in the workflow `env`. The LosBobes org carries a `DEPLOY_PATH` secret pointing at a sibling app; reading it would rebuild that app instead. The script also verifies the directory is a clone of this repo and that its compose file defines `app` before touching anything.
- `script_stop: false` on `appleboy/ssh-action` is required. With it true the action injects exit-code checks between lines, which breaks the multi-line `case` block.

Anything that changes the loopback port, container/volume names, or the Caddy block risks colliding with the other apps on that box.
