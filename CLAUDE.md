# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (from `backend/`, Python 3.11+; CI uses 3.12):

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload      # :8000, OpenAPI docs at /docs
python -m pytest                   # full suite
python -m pytest tests/test_rides.py::test_name -q   # one test
python -m app.vapid                # print a VAPID key for KARPUL_VAPID_PRIVATE_KEY
```

`conftest.py` imports `app.*`, so pytest must be run from `backend/`, not the repo root.

Frontend (from `frontend/`, Node 20+; CI uses 22):

```bash
npm install
npm run dev      # :5173, proxies /api to VITE_API_PROXY (default localhost:8000)
npm run lint     # oxlint (not ESLint)
npm run build    # tsc -b && vite build -> frontend/dist
```

Whole app in one process: `npm run build`, then `uvicorn app.main:app` serves API + SPA on :8000.
App icons: `node scripts/render-icons.mjs` (from `frontend/`, needs Playwright's Chromium) re-renders
the PNGs in `public/` from `public/favicon.svg`; the PNGs are checked in, so a build never needs a browser.
Whole app in Docker: `docker compose up --build` → http://localhost:8080.

CI (`.github/workflows/ci.yml`) runs exactly: backend `pytest -q`, frontend `npm run lint` and `npm run build`. There is no frontend test runner and no Python linter/formatter configured. The Vite dev proxy forwards `/api/ws` as a WebSocket (`ws: true` in `vite.config.ts`).

Server operations from a laptop (needs `HETZNER_HOST` / `HETZNER_USER` in the shell): `make ssh`, `make logs`, `make deploy`, `make backup`. The backup streams `python -m app.backup`, a consistent snapshot through SQLite's backup API — the database is in WAL mode, so copying `karpul.db` alone loses the latest commits.

## Architecture

FastAPI + SQLModel (SQLite) backend, React 19 + Vite + TypeScript frontend, shipped as **one container**: the multi-stage `Dockerfile` builds the frontend and copies `dist` into the Python image, and `backend/app/main.py` mounts it at `/` behind the `/api` routes (`KARPUL_FRONTEND_DIST`). Anything unmatched falls through to `index.html` — so any new API route must live under `/api`, or the SPA catch-all will swallow it.

**No auth, by design.** The user types a name once; it lives in `localStorage` (`lib/useUserName.ts`) and is sent as the `X-User-Name` header on mutations that need an actor (PATCH/DELETE ride, POST/DELETE booking). Joining a ride passes the passenger's name in the body; the header is who is doing it, and without it the passenger is taken to be the actor (a self-join). Name comparison is whitespace-collapsed + casefolded (`_norm` in `routers/rides.py`, `sameName` in `lib/dates.ts`) — keep both sides in sync if the rule changes.

**Who may touch the passenger list** (`_may_manage_seats` in `routers/rides.py`): the driver always; a passenger already in the car only while the ride's `passengers_manage` flag is on (the driver's switch, in `RideUpdate` like any other field); everyone may always add or remove *themself*. The frontend mirrors it as `canManage` in `CarDetail.tsx`.

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

**Schema changes.** `create_all` never adds a column to an existing table, so a new column also goes into `ADDED_COLUMNS` in `database.py` with its DDL; `init_db()` runs the `ALTER TABLE`s on start and `tests/test_migrations.py` proves it. The production SQLite file predates `ride.passengers_manage`, which is why this exists.

**One exception to the no-auth rule.** Managing the company-car pool sits behind a single shared
password from `KARPUL_ADMIN_PASSWORD`, sent as `X-Admin-Password` and checked by `require_admin`
(`app/admin.py`) with `secrets.compare_digest`. The variable is read per request, not at import, so
tests monkeypatch it. Unset means the admin endpoints answer 503 rather than 401 — that is the
default for a plain checkout, and `tests/test_cars.py` has an autouse fixture that clears it so a
developer's shell can't leak in. The frontend stores the password in `localStorage`
(`lib/useAdminPassword.ts`) and verifies it by calling `GET /api/cars/corporate?include_inactive=true`;
there is no login endpoint.

**Where the rules live:**
- `schemas.py` — field validation and cross-field consistency (`corporate_car_id` required for corporate rides, `car_name` required for own cars, `return_time > departure_time`).
- `services.py` — corporate-car double-booking check. Windows are half-open, so the same car can be handed over back to back within a day (a ride back at 12:00 does not block one leaving at 12:00); a ride with no `return_time` has no handover point and occupies the car until end of day. Called on both create and update (update passes `exclude_ride_id`).
- `routers/rides.py` — ownership checks and the rules that need the DB row:
  - `seats` may not exceed the chosen corporate car's `passenger_seats` (422), and on PATCH may not
    drop below the number of existing bookings (409).
  - For corporate rides the server overwrites `car_name` with `"<Name> (<PLATE>)"`; a client-supplied
    value is ignored.
  - `driver_name` is absent from `RideUpdate` — the driver of a ride can never change. `App.tsx`
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

**More on a ride.** `Ride.stops` is the extra pickup points as one-per-line text (the API shows a
list; `stops_from_text` / `stops_to_text` in `services.py`; at most `MAX_STOPS`, the origin and
duplicates are dropped), and each `Booking.pickup` is `""` for the origin or one stop verbatim
(`pickup_or_422`; an edit that removes a stop moves its passengers back to the origin with
`drop_orphaned_pickups`). `distance_km` and `chip_in` are the driver's own words and only ever
shown or summed. `RideCreate.repeat_until` is not a column: `create_ride` writes one ride per
week (`weekly_dates`, at most `MAX_REPEAT_WEEKS`) under one `series_id`, all or nothing, and a
409 on a later week names the date in parentheses (the Serbian `apiError` regex knows that
suffix). `DELETE ?scope=following` removes the rest of the series. The `X-User-Name` header
arrives percent-encoded (`user_from_header`), because a header cannot carry a ć.

**Push notifications.** `app/webpush.py` does RFC 8291 encryption and VAPID (RFC 8292) on the
`cryptography` package rather than pywebpush, whose `http-ece` dependency does not build on a
Debian-patched setuptools; `tests/test_push.py` holds it to the RFC test vector. `app/push.py`
keeps one `PushSubscription` per endpoint under the normalised name and the app language, and
`notify()` collects the targets inside the request and sends from a small thread pool
(`deliver`, `forget` for 404/410 endpoints; tests replace both). It is all off until
`KARPUL_VAPID_PRIVATE_KEY` is set (`python -m app.vapid` prints one), read per request like the
admin password. Who is told: the driver when someone gets in or out on their own, a passenger
when the driver takes them out, the passengers when the ride moves (date, times or route, not a
note) or is removed, and everyone in the car 30 minutes before departure (`app/reminders.py`,
a minute-by-minute task started in the lifespan; `Ride.reminder_sent` makes it once). The
browser side is `lib/push.ts` plus `public/push-sw.js`, which Workbox pulls into `sw.js`
through `importScripts`; a renamed browser re-subscribes (`resubscribePush` in `App.tsx`).

**Calendar, sharing, figures.** `app/calendar.py` writes floating local times (no zone) for one
ride and for a person's feed (`/api/calendar/{name}.ics`, a week back to a year ahead).
`/ride/{id}` is the shell with Open Graph tags spliced before `</head>` (`ride_preview_tags` in
`main.py`); the app reads the path on load, opens the ride and `replaceState`s to `/`.
`person_stats` and `corporate_usage` in `services.py` are the *Your rides* and admin *Usage*
figures: "km shared" is the one-way distance of every ride the person was in, a floor not a
claim, and a car's use rate is days out over working days in the window.

`RideRead` is not a plain ORM dump: `to_ride_read_dict()` adds `bookings` and the computed `free_seats`. Every ride-returning endpoint goes through it.

**Styling.** The frontend is Tailwind v4 (via `@tailwindcss/vite`) plus a hand-written design
system in `src/index.css`: a light, phone-first, card-based UI — off-white ground, white cards with
1px borders and a faint shadow, 12px corners, one green accent for "selected / go", red only for
removal, Inter throughout (bundled from `@fontsource/inter` in `main.tsx`, because the app ships as
one self-hosted container). The semantic class names (`.card`, `.date`, `.car-tile`, `.pax-row`,
`.panel`, `.btn`, …) are the contract the components render against. The layout is a single
560px column centred on a desktop; two media blocks at the end carry the phone layout:
`max-width: 600px` (sheets become true bottom sheets) and `pointer: coarse` (44px targets, hover
choreography switched off, carousel arrows hidden). `lib/useCoarsePointer.ts` exposes the same
query to components that need to change their wording. The app's own mark (the top bar, the drawer head, the favicon and the installed-app
icons) is a car, side-on, whose back half turns into a thunderbolt: one thick white line on a green
tile, nothing else. `public/favicon.svg` is the source, split by `<!-- tile -->` / `<!-- mark -->`
comments that `scripts/render-icons.mjs` uses to derive the PNGs (`pwa-192`/`pwa-512` with rounded
transparent corners, `pwa-maskable-512` full-bleed with the mark scaled into the platform's safe
zone, `apple-touch-icon` full-bleed and opaque), and `components/Logo.tsx` repeats the same drawing
inline with the tile in `currentColor`. Change the mark in all three places. Icons come from Phosphor
(`@phosphor-icons/react`) through the named wrappers in `components/icons.tsx`, which are the
contract the components render against (`size` in px, optional `weight`); nothing imports the
package directly. The default weight is *regular*. Phosphor's *duotone* weight paints a 20% fill
of the glyph's silhouette under the stroke, and for line icons that silhouette is a slab (a
rectangle behind the three bars of the menu icon, a triangle behind a chevron) that showed on
phones as a grey grating around the lines; duotone is therefore opt-in and used only for the two
car marks, where the fill is the car's body. Adding a ride has exactly one control: `AddRideFab`
(`components/AddRideButton.tsx`), a white plus in a green circle floating at the bottom right of
the column on both views whenever a ride can be added (`.fab`, under every sheet's backdrop).
There is deliberately no *Add ride* tile in the carousel, no plus in the empty card and no drawer
item; the empty card's hint points at the floating button instead. Avatars (`components/Avatar.tsx`) derive a stable pastel from the name.
Known car models get a side-view illustration instead of the generic icon: `lib/carModels.ts`
matches a car name (plate suffix and all) to a model key and an `electric` flag, and
`components/CarArt.tsx` draws it (`CarGlyph` falls back to `CarIcon`). Today that is only the
white Mazda 6e, used in the ride tiles, the driver card's vehicle strip and the admin list.
`carPowertrain()` in the same file says whether a name is *electric*, a *hybrid*, *diesel* or
*petrol* (explicit words and engine badges first, hybrid before electric before diesel before
petrol so "plug-in hybrid electric" is a hybrid; then models sold only one way) and
`PowertrainMark` draws it as a 12px glyph (bolt / leaf / drop / pump) *after the car's name* on
the tile, the Upcoming row and the admin list (`.pt-mark`). It is deliberately not on the
picture: a sticker big enough to read on a phone hid the car. The driver card spells it out as
an "Electric" / "Hybrid" / "Diesel" / "Petrol" tag.
Below that, `carBrand()` in the same file recognises a *make* from the name (make words and
the models people write instead of one: "grey Golf", "Octavia"; words that are also plain
English, like "Seat" or "Focus", must be capitalised to count) and `BrandLogo` /`CarGlyph` show
its mark from the `simple-icons` package in `currentColor`. Only the brands listed in `LOGOS`
are bundled (named imports tree-shake); Mercedes, Land Rover, Jaguar, Alfa Romeo and Lexus are
not in that package, so they keep the generic icon.

**Motion.** Nothing fades in; things slide or pop, and go back the way they came. The
keyframes are in the *Motion* and *Sheets & dialogs* sections of `index.css`, the two hooks in
`lib/motion.ts`. `useSlideDir(value, rank)` says which side freshly keyed content enters from
(a higher rank enters from the right, a lower one from the left, NaN means no slide) and
`App.tsx` wraps the view (Upcoming sits left of Week), the day board (the way the calendar
moved, only while the Week view shows) and the driver card (from the tile you tapped) in keyed
`.stack` wrappers carrying `slideClass(dir)`; `DateCarousel` does the same for a week step.
`useClosing(onClose)` lets `Sheet`, `Sidebar` and `ConfirmDialog` play their exit before the
parent unmounts them: every close from inside the overlay goes through `requestClose`, which
adds `backdrop-closing`, and `onClose` runs on the panel's `animationend` (with a fallback
timeout); a parent that unmounts the overlay itself, after a save, still closes on the spot,
and the drawer's `pick` closes on the spot on purpose so the sheet it opens owns the history
entry alone. Sheets rise from the bottom edge on a phone and pop up on a desktop, the drawer
slides from the left, confirmations and popovers scale out of their anchor (`Popover` sets
`transform-origin` and measures itself with `offsetWidth`, which a transform does not change),
the toast and the floating plus spring in (the plus also contracts while pressed and springs back on release; the pressed state comes from pointer and key events, not `:active`, which phones apply late and Chrome holds on after the finger lifts), the Upcoming detail unfolds as a grid row from
`0fr` (the `.session-detail-clip` wrapper hides the overflow and leaves room for shadows), and
the segmented controls (`SegThumb`, `components/Segmented.tsx`) and the date pills
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
weekday and month names, the week range and 12/24-hour clocks follow the app language rather
than the browser. Backend error texts stay English on the wire and are rendered through
`apiError` in the same file, which matches the server's wordings (keep it in step when a
`detail` string changes). The switch is `LanguageSwitch`, at the foot of the drawer and on the
first-run name sheet. `main.tsx` also bundles Inter's Latin Extended subset for č ć š ž đ.
Wording rule for both languages: no em dashes.

**Screen structure.** The top bar is the ☰ button, the title and the live lamp; the ☰ opens
`Sidebar` (`components/Sidebar.tsx`), a drawer from the left edge that holds everything not
about one particular ride: your name (the identity block and *Change name* both open
`NameSheet`), *Your rides* (`MyRides`: figures, history, the calendar feed address),
*Notifications* (`NotificationsSheet`, the push switch), *Company cars* (`CarAdmin`, with a
*Usage* tab that reads `/api/cars/corporate/usage`) and the *Company car guide* (`CarGuide`: how to charge
with the company card, and a Mazda 6e primer for first-time EV drivers, frunk included. The words are the `guide`
entries in `lib/i18n.ts`, one picture per entry in `components/GuideArt.tsx`, drawn in the
line-icon style with the green accent on the one thing the step is about; also reachable from
the driver card of any company-car ride). Picking an
item closes the drawer before the sheet opens, so the two body-scroll locks never overlap. Below the bar, two views are switched by the
segmented control at the top of `main` and
remembered in `localStorage` (`karpul.view`): *Upcoming* (the default) and *Week*. Upcoming is
`Upcoming` (`components/Upcoming.tsx`): every ride from today for the next `UPCOMING_DAYS` (90;
the API caps a range at 92) grouped under a heading per day, one row per car; a tapped row
unfolds `CarDetail` beneath it with `draggable={false}`, because there is no `YouPanel` tray and
no other same-day tile to drop on. Above the list sit the filter chips (*All*, *Free seats*, *My
rides*, *I'm in*) and a search box, state local to `Upcoming`; the day headings are sticky under
the top bar (`.upcoming-head`). `App.tsx` loads whichever range the view needs (`range`) and
the live-event filter uses the same range. Week is the day board: `DateCarousel` (the loaded Mon–Sun week as seven pills that always fit the
width — nothing scrolls; the arrows beside the week label and a sideways swipe on the strip step a
week) →
`CarCarousel` (one tile per ride that day with its route line, hidden when there are none; tiles are also drop targets; the seat count goes red when full and green when you are in or driving) →
either `CarDetail` (driver card, times, route with the pickup points, distance and chip-in
tags, passenger list with the drop zone and the *Get in this car* row, which reads *Switch to
this car* when `switchFrom` says you are seated elsewhere that day, the keyboard's way of
dragging; a pickup `Select` above the seats when the ride has stops; ⋮ with *Share ride*,
*Add to calendar* and, on a series, *Remove this and following rides*) or `AddCarCard` (the
illustrated placeholder; `intro` adds the two-view explanation when the whole board is empty) →
`YouPanel`. The design's
"unassigned passengers" list has no equivalent because Karpul has no roster: the only passenger
you can move is yourself, so `YouPanel` is your draggable chip when you are not seated and the
"drop here to get out" target when you are. Every dialog is a `Sheet` (bottom sheet on a phone,
centred panel on a desktop); destructive actions go through `ConfirmDialog` instead of
`window.confirm`. Every overlay (`Sheet`, `Sidebar`, `ConfirmDialog`, `Popover`) calls
`useBackClose` (`lib/useBackClose.ts`), so a phone's back button closes the topmost one instead
of leaving the page: the first overlay to open pushes one history entry, the ones stacked on top
join an in-memory stack, back pops the top and re-pushes while any remain, and a close by any
other route pops the entry when it was the last, so back never lands on a dead entry. **No native pickers or dropdowns**: `Select`, `DatePicker` and `TimePicker` are
custom controls (and `Menu` is the ⋮ menu) built on `Popover`, which portals to `<body>` and
positions itself against its anchor with `position: fixed`, so it is never clipped by a sheet's
scrolling body and flips above the anchor when the viewport runs out. `TimePicker` shows 12- or
24-hour columns depending on the browser locale but always emits `HH:MM`. `App.tsx` resolves which tile is open (`selection`):
an explicit pick that still exists, else your own ride, else the first ride, else nothing (the empty card).
**Wording:** the thing you add, edit, duplicate or remove is a *ride*; *car* is reserved for the
vehicle (the pool, "Company car" / "Own car", "get in this car", "in this car").

**Accessibility notes.** Toasts are announced through an always-mounted `sr-only` live region
in `App.tsx`; the visible pill is `aria-hidden`. Every drag has a button equivalent (*Get in*,
*Switch to this car*, *Leave*). The dark avatars pair a deep tint with a light ink so the
initials keep their contrast.

**Frontend data flow.** `App.tsx` is the only stateful component; the rest are presentational. It loads a whole Mon–Sun week at a time (`/api/rides?from=&to=`), and mutating endpoints return the updated `Ride` so `replaceRide()` can patch state without a full reload. On any mutation error it toasts and refetches. All dates crossing the API are local-date ISO strings built by hand in `lib/dates.ts`
(`toISODate`) — never `toISOString()`, which would shift the day by the timezone offset.

**Installable (PWA).** `vite-plugin-pwa` in `vite.config.ts` writes the web app manifest
(`manifest.webmanifest`, standalone display, the icons above, off-white theme colour to match the
top bar) and generates a Workbox service worker, `sw.js`, that precaches the built shell: `index.html`,
the hashed bundles, the fonts and the icons, so an installed app opens offline and starts instantly.
Nothing under `/api` is ever cached, and navigations to `/api`, `/docs`, `/redoc` and `/openapi.json`
are left to FastAPI (`navigateFallbackDenylist`). `lib/pwa.ts` registers the worker from `main.tsx`
(`registerType: 'prompt'`): a new build waits instead of reloading under the user's fingers, `App.tsx`
shows it as a tappable "A new version is ready" toast (`useUpdateReady`, in the toast slot whenever no
other toast shows) and the tap runs `applyUpdate`, which listens for `controllerchange` itself and
reloads. That listener is deliberate: workbox-window only calls a controller change an update when a
worker already controlled the page at registration, false on a first visit, and `clientsClaim: true`
in the worker is what makes the new worker take that page over at all. An installed app can stay open
for days, so the hook also asks the browser for a new worker every hour and when the app comes back to
the foreground. On the server, everything outside `/assets` keeps its name across builds (the shell,
`sw.js`, the manifest, the icons) and `mount_frontend` in `main.py` serves all of it `no-cache`, so a
phone always learns about a new build; `tests/test_frontend.py` pins the headers. In `npm run dev` the
virtual register module is a stub and no worker runs; index.html carries the Apple meta tags the
manifest cannot express (`apple-touch-icon`, standalone mode, the app title).

**Live updates.** Every tab keeps one WebSocket open to `/api/ws` (`lib/live.ts`, `useLiveBoard`).
The server pushes `ride.created` / `ride.updated` (carrying the full `RideRead`), `ride.deleted`
and `cars.changed`; `App.tsx` upserts or removes the ride if it falls inside the loaded week
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

**Company cars** are seeded from `CORPORATE_CARS` (`Name|PLATE|seats;…`) only while the `corporatecar` table is empty (`seed.py`); after that the pool is managed through the admin endpoints. `GET /api/cars/corporate` stays public and active-only, so `App.tsx` keeps the admin list (`adminCars`, everything) and the ride-form list (`cars`, `active` only) as two views of one fetch — `applyCars()`.

Tests (`backend/tests/conftest.py`) use an in-memory SQLite engine (`make_engine("sqlite://", poolclass=StaticPool)`) and override `get_session`; `get_write_session` wraps it, so the override covers both. `TestClient` is intentionally used **without** a context manager so the lifespan never runs and the on-disk DB is never touched.

## Deployment

Karpul shares a Hetzner box with gamgee, iris, flora-find and sokola. Host-level Caddy terminates TLS for `www.karpul.dev` and proxies to `127.0.0.1:3004` (the other apps own 3000–3003); the stack lives in `/opt/karpul` with SQLite in the `karpul_karpul_data` volume. Full runbook: `docs/deployment-hetzner.md`.

Two constraints in `.github/workflows/deploy.yml` that look accidental but are not — don't "clean them up":
- `DEPLOY_PATH` is hard-coded to `/opt/karpul` in the workflow `env`. The LosBobes org carries a `DEPLOY_PATH` secret pointing at a sibling app; reading it would rebuild that app instead. The script also verifies the directory is a clone of this repo and that its compose file defines `app` before touching anything.
- `script_stop: false` on `appleboy/ssh-action` is required. With it true the action injects exit-code checks between lines, which breaks the multi-line `case` block.

Anything that changes the loopback port, container/volume names, or the Caddy block risks colliding with the other apps on that box.
