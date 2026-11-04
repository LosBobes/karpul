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
npm test         # vitest: src/**/*.test.ts(x) (the lib code, components in jsdom, and Serbian for every API error)
npm run build    # tsc -b && vite build -> frontend/dist
npm run e2e      # Playwright against the built app (build first; PYTHON=... picks the interpreter, PW_CHROMIUM=... another Chromium)
```

Whole app in one process: `npm run build`, then `uvicorn app.main:app` serves API + SPA on :8000.
App icons: `node scripts/render-icons.mjs` (from `frontend/`, needs Playwright's Chromium) re-renders
the PNGs in `public/` from `public/favicon.svg`; the PNGs are checked in, so a build never needs a browser.
Whole app in Docker: `docker compose up --build` → http://localhost:8080.

CI (`.github/workflows/ci.yml`) runs exactly: backend `ruff check .` and `pytest -q`; frontend `npm run lint`, `npm test` and `npm run build`; and an `e2e` job that builds the frontend and runs `npm run e2e` (Playwright, Chromium only) against uvicorn on a temp SQLite file: `e2e/smoke.spec.ts` (register, offer, get in, write in the thread; a reload keeping the view and a half-filled form) `e2e/journey.spec.ts` (get in, leave, the driver removes the ride, each side seeing the other live; the car status sheet) and `e2e/pickup.spec.ts` (a passenger gets in at a new place before the start, the driver adds one on the way and then closes the route to new places; a new place from the waiting list goes on the route with the seat) and `e2e/places.spec.ts` (an office picked from the suggestions, the route on the map, a passenger dropping the pin of a new pickup point; the server runs with no geocoder or router and tiles from an address that answers nothing) and `e2e/admin.spec.ts` (a shared car past the share asked for from the form and approved under *Approvals*, a plate ticked off the *Garage list*, a passenger taking over a shared car whose driver cancelled; the admins are `boss.<tag>` / `chief.<tag>` in `KARPUL_ADMINS` in `playwright.config.ts`, each test puts its own car in the pool through the API, and because every board and the admins' lists show every run's rides, the checks match this run's names exactly, `(?!\d)` after the tag). There is no formatter. `.github/workflows/uptime.yml` is not CI: every 15 minutes it asks production's `/api/health` and fails when the site is down, the newest snapshot is stale or it has not reached the bucket (below). The Vite dev proxy forwards `/api/ws` as a WebSocket (`ws: true` in `vite.config.ts`).

**Error texts are a contract.** The server's `detail` strings are English and `apiError` in `lib/i18n.ts` renders them in Serbian by pattern. `backend/tests/error_catalogue.py` collects every `HTTPException` detail and schema `ValueError` from the source (AST, f-string blanks filled with samples) into `frontend/src/lib/api-errors.json`; `tests/test_error_catalogue.py` fails when that file is stale and `src/lib/i18n.test.ts` fails when a text in it has no Serbian. Change a wording: run `python -m tests.error_catalogue`, then translate. `apiError` tries a message whole before splitting it on `"; "`, because several texts contain one.

Server operations from a laptop (needs `HETZNER_HOST` / `HETZNER_USER` in the shell): `make ssh`, `make logs`, `make deploy`, `make backup`, `make backups` (the app's own nightly snapshots, below), and `make backfill` (the shared Mazda's 2026 paper log as rides, `app/backfill.py`; a dry run unless `APPLY=1`, safe to repeat). The backfill, the backups (on the box and off it) and the health check: [docs/features/operations.md](docs/features/operations.md).

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
by the new name (`claim_rows`), which is how an old seat by name becomes theirs. Someone else
is put in a car only as an account: *Add a colleague* (`PassengerPicker`, `lib/people.ts`) searches
`GET /api/people` (id and name of every account, any signed-in user) and sends `passenger_id`;
`join_ride` refuses a name nobody has an account under (422), so no new seat has `passenger_id` null. A ride whose driver is a name with no account (`driver_id` null, mostly the
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
counters in the autouse `clean_env` fixture. **The writes that reach other people are throttled too**: `ratelimit.spend(kind, user.id)` per account for a thread line (20/min), *running late* (6/h), a new ride (40/h, admins exempt), a request (20/h), a car report (20/h) and the usage counts (120/h), and `main.throttle_writes` caps every write per browser (a hash of its bearer token, no database lookup) at `KARPUL_WRITES_PER_MINUTE` (300; the end-to-end tests raise it). Both answer the doors' own 429 wording. Tests: `tests/test_write_limits.py`.

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

**The ride routers.** All under `/api/rides`: `routers/rides.py` is the rides themselves (the
board, add, edit, remove, `/last`, the calendar file); `routers/seats.py` the seats and pickup
points (`/bookings`, `/stops`); `routers/proposals.py` the driver's asks and the passengers'
answers (`/proposal/...`); `routers/drivers.py` who drives (`/approve`, `/decline`, `/takeover`,
`/claim`); the odometer (`/legs`) is `routers/odometer.py`, the queue `routers/waitlist.py`, the
thread `routers/thread.py`. The rules they share: the checks (`get_ride_or_404`, `is_driver`,
`may_run`, `on_behalf`, `booking_of`, `may_manage_seats`) in `app/access.py`; an edit held to the
creation rules and the consent fields (`prepare`, `approval_for`, `plan`, `apply_edit`, `settle`,
`tell_applied`, `CONSENT_FIELDS`) in `app/ride_edits.py`; a ride going (`remove_rides`,
`hands_over`, `cars_with_seats`) in `app/ride_removal.py`. Each of these modules imports `notify`
itself, so a test recording pushes patches them all through `patch_ride_notify` in `conftest.py`
(`RIDE_NOTIFIERS`; add a new module that pushes about a ride there).

**Who may touch the passenger list** (`may_manage_seats` in `app/access.py`): the driver (or an admin) always; a passenger already in the car only while the ride's `passengers_manage` flag is on (the driver's switch, in `RideUpdate` like any other field); everyone may always add or remove *themself*. The frontend mirrors it as `canManage` in `CarDetail.tsx`.

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
*All rides* (`PeopleAdmin`, `RideLog`) to admins only, and *Shared cars* (`SharedCars`) to everyone,
with the pool's controls and the *Usage* tab to admins only. *All rides* is a spreadsheet-style
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
- `routers/rides.py` and `app/ride_edits.py` — ownership checks and the rules that need the DB row:
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

`RideRead` is not a plain ORM dump: `to_ride_read_dict()` adds `bookings`, `waitlist`, `message_count`, `driver_phone` and the computed `free_seats`. Every ride-returning endpoint goes through it (pass `board_extras` for a list).

**What's new** (`lib/whatsNew.ts`, `components/WhatsNew.tsx`, `components/WhatsNewArt.tsx`). **Every pull
request that adds or changes something people will notice adds an entry**: `{ id, date }` at the top of
`WHATS_NEW` (newest first, `date` the day it lands), its title and a few lines in `whatsNew.entries` in both
languages of `lib/i18n.ts` (`**words**` bold, as in the how-to), and a demo in `WhatsNewArt` keyed by the id: a
small piece of the screen it is about playing out on a loop (the `.wn-*` keyframes in `styles/extras.css`; the
base styles are the end state, because under reduced motion the loops stop). The sheet opens by itself once
when an account has an entry it has not seen in this browser (`karpul.whatsNewSeen.<id>`) dated after the day
it joined (a newcomer is not handed the history, and the end-to-end tests' accounts never see it), and *What's
new* in the drawer's *Help* group shows all of them. `whatsNew.test.ts` checks ids, order and both languages.
The PR template asks, and `.github/workflows/whats-new.yml` warns (never fails) on a PR touching
`frontend/src` or `backend/app` without an entry, unless it is labelled `no-whats-new`.

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

**Accessibility notes.** Toasts are announced through an always-mounted `sr-only` live region
in `App.tsx`; the visible pill is `aria-hidden`. Every drag has a button equivalent (*Get in*,
*Switch to this car*, *Leave*). The dark avatars pair a deep tint with a light ink so the
initials keep their contrast.

**What gets opened** (`routers/usage.py`, table `UsageCount`, `lib/usage.ts`). `track('view.week')` (views, `sheet.<overlay>` from `useOverlays.show`, `plan.<shape>`) batches screen names and sends them a minute later or when the tab is hidden; `POST /api/usage` adds one per name to that day's count. The row is only the day, the name and the count: no account, no time of day, and only names matching `USAGE_KEY` get in. Admins read it under *Usage* as *What gets opened* (`GET /api/admin/usage?days`). Tests: `tests/test_usage_counts.py`, `usage.test.ts`.

**The first-login tour** (`lib/tour.ts`, `components/Tour.tsx`): three cards (finding a ride, offering one, the shared cars), each putting `.tour-spot` (a green outline) round its control, shown once per browser to an account under `TOUR_NEW_DAYS` (14) old and again from *Take the tour* in Help. It is never an overlay: above the board on a phone (like the install card) and the top of the `Dock` on a wide screen (`extra`), so nothing it could cover (the end-to-end tests' new accounts see it).

**Frontend data flow.** `App.tsx` holds the UI state, with its pieces in hooks: which sheets
are open (`lib/useOverlays.ts`, one open set, `is`/`show`/`hide` and a stable `closer(name)`),
the toast (`lib/useToast.ts`), the passenger chip in flight (`lib/usePassengerDrag.ts`),
everything a ride card does (`lib/useRideActions.ts`: seats, queue, route, switches, removal, asks
and answers, takeover, claim, running late; each call goes through the board's `withBusy` and
`upsertRide`, and `newlyAsked` lives there), the admin's desk (`lib/useAdminDesk.ts`: the
approvals and garage counts, approve / decline / plate, the car pool's controls), asking for a
ride (`lib/useRideRequests.ts`), the shared `errMsg` (`lib/errors.ts`) and `Confirm`
(`lib/confirm.ts`), and
the pure rules for which ride is open and which days are loaded (`lib/selection.ts`:
`daySelection`, `upcomingSelection`, `boardRange`, tested in `selection.test.ts`). The board's
data lives in `lib/useBoard.ts` (the shared cars' state too, `carStates`): rides and requests for the range on screen (a Mon–Sun week, or the Upcoming 90 days), both car lists, the sequence-guarded `load`, the live-event reducer and the 30 s fallback poll. Mutating endpoints return the updated `Ride` so `upsertRide()` can patch state without a full reload. The ride card is `CarDetail` (the passenger list and the state it shares) assembled from `ChangeAsk`, `RideAsks` (`ApprovalAsk`, `DriverAsks`), `LateRow`, `TripRoute`, `DriverCar`, `RideFacts` and `WaitLine`; `RideForm` keeps the state and the route box, with its field groups in `RideFormParts.tsx` and its helpers in `lib/rideForm.ts`. Components are tested in jsdom through `src/test/render.tsx` (React's own `act`, no Testing Library: `render(node, { me })`, `quietFetch()`, `aRide()`), as `CarDetail.test.tsx` does for who sees what on the card. The rest of the components are presentational, plus a few sheets that fetch their own data (`MyRides`, `PeopleAdmin`, `RideThread`). On any mutation error it toasts and refetches. **A reload lands where you were** (`lib/keep.ts`): state that should survive a refresh (the
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

## Feature notes

The long write-ups of each feature live in `docs/features/`; read the one for the part you touch before changing it, and keep it in step. In short:

- [operations.md](docs/features/operations.md): the Mazda paper-log backfill (`backfill.run_once`, coming log rides `unconfirmed` until their driver confirms), the app's own nightly snapshot and its off-box copy (`app/housekeeping.py`, `app/offsite.py`), `/api/health`, Sentry, the slow/failed request log, and the country filter (`app/geofence.py`).
- [accounts.md](docs/features/accounts.md): profile photos (cropped in the browser, served openly by a random key, `Avatar` looks them up by name) and the driver's phone (`RideRead.driver_phone`).
- [admin.md](docs/features/admin.md): `may_run` lets an admin run any ride, `RideCreate.driver_id` adds one in someone's name (`Ride.added_by_*`), and every admin action is a line in `AdminAction` written before the commit (`audit.record`).
- [shared-cars.md](docs/features/shared-cars.md): the one-a-week/one-a-day share and the 24 h stretch (`approval_for`, pending rides hold no slot, *Approvals*), the driver who cancels hands the car to a passenger (`needs_driver`), the Beograd garage list, the odometer (`DriveLeg`), the car's state and its guess (`app/carstate.py`, `CarReport`), where a car is, taken days in the form, *Usage*, and the office road (90 / 92 km).
- [rides.md](docs/features/rides.md): a driver's change waits for the passengers (`Ride.proposal`), the waiting list, threads, requests, seat notices (`SeatNotice`), running late, stops before and after the start and new pickup points, a new ride starting from your last one, and `RideForm`'s two depths.
- [maps.md](docs/features/maps.md): `KARPUL_MAPS`, pins by folded name (`Ride.points`), known places and their re-pinning, the server-side geocoder and router, and the map components.
- [notifications.md](docs/features/notifications.md): Web Push without pywebpush, who is told what, categories and reminders, the calendar files and feed, `/ride/{id}` previews, and the figures in *Your rides* (km shared, and the car km, CO₂ and fuel saved: `services.impact`, each saved trip split half and half between driver and passenger so the team's adds up).
- [ui.md](docs/features/ui.md): Fluent 2 in Karpul's green (`src/index.css` and `src/styles/*`), icons, car art, motion (`SlideSwitch`, `useClosing`), the theme, and the screen's structure: the drawer, the views, Day as a timeline or a clock, Week, the sheets, the custom pickers and `useBackClose`.
- [pwa.md](docs/features/pwa.md): the manifest and service worker, the install offer, and the update toast and its bolt-tracing screen.

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
