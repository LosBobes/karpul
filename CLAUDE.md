# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (from `backend/`, Python 3.11+; CI uses 3.12):

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload      # :8000, OpenAPI docs at /docs
python -m pytest                   # full suite
python -m pytest tests/test_rides.py::test_name -q   # one test
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
Whole app in Docker: `docker compose up --build` → http://localhost:8080.

CI (`.github/workflows/ci.yml`) runs exactly: backend `pytest -q`, frontend `npm run lint` and `npm run build`. There is no frontend test runner and no Python linter/formatter configured.

Server operations from a laptop (needs `HETZNER_HOST` / `HETZNER_USER` in the shell): `make ssh`, `make logs`, `make deploy`, `make backup`.

## Architecture

FastAPI + SQLModel (SQLite) backend, React 19 + Vite + TypeScript frontend, shipped as **one container**: the multi-stage `Dockerfile` builds the frontend and copies `dist` into the Python image, and `backend/app/main.py` mounts it at `/` behind the `/api` routes (`KARPUL_FRONTEND_DIST`). Anything unmatched falls through to `index.html` — so any new API route must live under `/api`, or the SPA catch-all will swallow it.

**No auth, by design.** The user types a name once; it lives in `localStorage` (`lib/useUserName.ts`) and is sent as the `X-User-Name` header only on mutations that need an actor (PATCH/DELETE ride, DELETE booking). Joining a ride passes the name in the body instead. Name comparison is whitespace-collapsed + casefolded (`_norm` in `routers/rides.py`, `sameName` in `lib/dates.ts`) — keep both sides in sync if the rule changes.

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

`RideRead` is not a plain ORM dump: `to_ride_read_dict()` adds `bookings` and the computed `free_seats`. Every ride-returning endpoint goes through it.

**Styling and the fancy components.** The frontend is Tailwind v4 (via `@tailwindcss/vite`)
plus a hand-written design system in `src/index.css` — a dark "departure board" identity: hairline
rules instead of shadows, 2px radius, Barlow Condensed for signage labels and IBM Plex Mono for
anything numeric (times, plates, seat counts). The semantic class names (`.ride`, `.day`, `.btn`,
`.chip`, …) are the contract the components render against; Tailwind utilities are used by the
vendored components and for new markup. Fonts are bundled from `@fontsource` in `main.tsx` rather
than fetched from Google, because the app ships as one self-hosted container.

`src/fancy/` holds components copied from the fancy registry (`https://fancycomponents.dev/r/{name}.json`,
MIT). They are vendored, not installed: each file carries a header naming its source and the local
edits needed for this toolchain (no `"use client"`, no `NodeJS` types, `verbatimModuleSyntax`). They
import `@/lib/utils`, hence the `@` → `src` alias in `vite.config.ts` and `tsconfig.app.json`.
`src/fancy/**` is in `.oxlintrc.json`'s `ignorePatterns` — it is third-party code we deliberately
do not restyle to local conventions.

`components/BoardText.tsx` wraps `VerticalCutReveal` and is the only thing that should use it
directly. That component clips its characters with `overflow-hidden` and slides them in from
`y: 100%`, so if the animation never runs the text is *invisible*, not merely static — which happens
in a background tab (rAF is throttled and the spring freezes part-way) and under
`prefers-reduced-motion` (motion drives transforms from JS, so CSS can't stop it). `BoardText`
renders plain text as the baseline and mounts the reveal only once the page is visible and motion is
wanted. Re-keying it (`key={selected}`, `key={ride.free_seats}`) is what replays the flip.

**Frontend data flow.** `App.tsx` is the only stateful component; the rest are presentational. It loads a whole Mon–Sun week at a time (`/api/rides?from=&to=`), refetches on a 30 s interval and on window focus, and mutating endpoints return the updated `Ride` so `replaceRide()` can patch state without a full reload. On any mutation error it toasts and refetches. All dates crossing the API are local-date ISO strings built by hand in `lib/dates.ts`
(`toISODate`) — never `toISOString()`, which would shift the day by the timezone offset.
Drag-and-drop uses native HTML5 DnD with a custom MIME type (`lib/dnd.ts`); dropping the passenger token on another car issues `leave` then `join`.

**Company cars** are seeded from `CORPORATE_CARS` (`Name|PLATE|seats;…`) only while the `corporatecar` table is empty (`seed.py`); after that the pool is managed through the admin endpoints. `GET /api/cars/corporate` stays public and active-only, so `App.tsx` keeps the admin list (`adminCars`, everything) and the ride-form list (`cars`, `active` only) as two views of one fetch — `applyCars()`.

Tests (`backend/tests/conftest.py`) use an in-memory SQLite engine with `StaticPool` and override `get_session`. `TestClient` is intentionally used **without** a context manager so the lifespan never runs and the on-disk DB is never touched.

## Deployment

Karpul shares a Hetzner box with gamgee, iris, flora-find and sokola. Host-level Caddy terminates TLS for `www.karpul.dev` and proxies to `127.0.0.1:3004` (the other apps own 3000–3003); the stack lives in `/opt/karpul` with SQLite in the `karpul_karpul_data` volume. Full runbook: `docs/deployment-hetzner.md`.

Two constraints in `.github/workflows/deploy.yml` that look accidental but are not — don't "clean them up":
- `DEPLOY_PATH` is hard-coded to `/opt/karpul` in the workflow `env`. The LosBobes org carries a `DEPLOY_PATH` secret pointing at a sibling app; reading it would rebuild that app instead. The script also verifies the directory is a clone of this repo and that its compose file defines `app` before touching anything.
- `script_stop: false` on `appleboy/ssh-action` is required. With it true the action injects exit-code checks between lines, which breaks the multi-line `case` block.

Anything that changes the loopback port, container/volume names, or the Caddy block risks colliding with the other apps on that box.
