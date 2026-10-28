# Karpul – community carpooling

A small internal tool for sharing rides between colleagues. You register once with a
username, a password, your email and your name, and from then on the browser stays signed
in; your name and surname are what colleagues see in a car.

**Using the app?** Read the [user guide](docs/user-guide.md): a short tutorial and every feature, for drivers, passengers and admins.

**Backend:** FastAPI + SQLModel (SQLite) · **Frontend:** React + Vite + TypeScript

## What it does

- **Upcoming** is the home screen: every session from today on as one list, a heading per day
  and a row per ride with its time, driver, car, route and free seats. Tap a row and the full
  ride card unfolds underneath it, so you get in, edit or duplicate without leaving the list. The
  list looks 90 days ahead.
- **Week** is the day board: **pick a day** on the date carousel, then **swipe through the rides**
  going that day. Each tile shows the car and its seat count; the open ride shows the driver, when
  it leaves and returns, where from and to, and who is in the car. The switch between the two
  views is remembered in the browser.
- **Add a ride** for a given day from the *+ Add ride* tile or the ☰ sidebar: pick a **company car** from the pool
  or use **your own car**, set how many **passenger seats** you offer, departure and return time
  (or one-way), and pickup / drop-off locations. The wording is deliberate: you add, edit or
  remove a *ride*; the *car* is the vehicle it goes in.
- **Repeat weekly.** A new ride can repeat every week up to a date (26 weeks at most): one ride
  per week, same weekday, all created at once or not at all if the company car is taken on one of
  them. The driver's ⋮ menu offers *Remove this and following rides* on any ride of the series.
- **Pickup points.** Besides the start, a driver can list up to three places on the way. A
  passenger picks where to get in and can change it later; the passenger list shows it.
- **Distance and chip-in.** A ride can carry its one-way distance (which feeds the "km shared"
  figures) and a free-text "chip in per seat" note ("300 din"). Nothing is charged; it is the
  agreement, written where the passengers see it.
- **Company cars can't be double-booked** – overlapping time windows on the same day are rejected.
- **Get into a car** by tapping *Get in this car*, or **drag your chip onto a car**. Drag it to
  another car to switch, or drop it back on *You* to get out. Works with a finger too: on a phone,
  press and hold your chip for a moment and it lifts. Already seated in another car that day, the
  button reads *Switch to this car* and does the drag's job without a drag.
- **Filter the list.** Upcoming has chips for *Free seats*, *My rides* and *I'm in* and a search
  box for a place, a driver or a car; the day headings stay pinned while their rows scroll.
- **Share a ride.** Every ride's ⋮ menu has *Share ride* (the phone's share sheet, or the link
  goes to the clipboard) and *Add to calendar* (an `.ics` file). A shared link, `/ride/{id}`,
  opens the ride and carries a preview card for chat apps.
- **Notifications** (☰ sidebar): a push when someone gets into your car or out of it, when a
  driver moves or removes a ride you are in, and 30 minutes before you leave. Needs the server's
  VAPID key (see *Configuration*) and, on an iPhone, the app installed to the home screen.
- **Your rides** (☰ sidebar): rides driven and ridden along, people carried and kilometres shared
  this month and all time, the past rides, and a calendar feed address any calendar app can
  subscribe to.
- **Light or dark**, or the phone's choice, at the foot of the ☰ sidebar next to the language.
- **Company car guide** in the ☰ sidebar (and on the driver card of every company-car ride): how
  to charge with the company card at the charger, and where the Mazda 6e keeps the controls a
  first-time EV driver looks for in the wrong place (the gear stalk, the frunk, the 80% rule).
- **Add a ride** from the green plus button that floats at the bottom right on both views; the same
  mark sits in the empty state, the *Add ride* tile and the ☰ sidebar.
- **Manage the company car pool** from the ☰ sidebar (*Company cars*): add a car, fix a
  name/plate/seat count, retire one that's been sold, or delete one that was never used.
  This is the one screen behind a password (see *Company-car admin* below). Its *Usage* tab
  shows how each pool car was used over the last 30, 90 or 365 days: rides, days out as a share
  of the working days, drivers, passengers, kilometres, when it last went out and what is booked
  ahead, with the rides themselves as history.
- A dot under a day on the carousel means at least one ride is going that day.
- Drivers can edit, duplicate or remove their ride from its ⋮ menu, remove passengers and put a
  colleague in by name; passengers can leave. A driver can also **let the passengers manage the
  list** (a switch in the ride form and in the ⋮ menu): with it on, anyone already in the car can
  add or remove other passengers too.
- Cars get a face from their name: a known model is drawn (the Mazda 6e so far), otherwise a
  recognised make shows its logo ("grey Golf" gets the VW mark, "Octavia" the Škoda one), and
  anything else keeps the generic car icon. A small mark after the name says what the car runs
  on: a bolt for **electric**, a leaf for a **hybrid**, a drop for **diesel**, a pump for
  **petrol**, worked out from the name ("Kona Electric", "Corolla hybrid", "Golf GTE", "Octavia
  iV", "Passat TDI", "dizel", "Clio TCe", "benzinac") or from a model that only comes one way
  (Tesla, ID.4, Enyaq, Prius…).
- **Live board.** Every tab holds a WebSocket to `/api/ws`; when anyone offers, edits or
  cancels a ride, joins or leaves one, or edits the car pool, everybody else sees it at once.
  The header lamp shows *Live*, *Connecting* or *Offline*; while offline the board falls back
  to polling every 30 s, and every reconnect reloads the week in case something was missed.
- Phone-first: one column, horizontal carousels, forms open as bottom sheets, and tap
  targets are sized for fingers. On a desktop the same column sits centred.

### Accounts

Registering takes a username, an email, your first name and surname, and a password of at
least eight characters. The browser keeps the token the server hands back and sends it as
`Authorization: Bearer …`; passwords are stored as PBKDF2-HMAC-SHA256 with a per-password
salt and the token only as its SHA-256, so neither is recoverable from the database.

Your first name and surname are how colleagues see you on the board, so no two accounts
may go by the same one. Rides and seats belong to the account, not the name: editing your
name in *Your account* changes it on every ride you drive or sit in. Changing your password
signs your other browsers out, and *Sign out everywhere else* does the same on demand.

The board is for signed-in people only: every endpoint that shows or changes it needs a
session token, reading included, and the live socket signs in with the token too. A driver
edits their own ride, a passenger takes their own seat, and the driver may let passengers
manage the seat list. Sign-in, registration and password reset links are rate-limited.

Forgot your password? There is no email: an admin makes a one-time reset link in *People*
and passes it on; it works once, for 48 hours.

### Seats, messages and requests

A full car has a waiting list: the first seat that frees up goes to the first in line, who
gets a notification. Every ride has a thread for the car ("running five minutes late"), and
anyone who needs a ride nobody offers can ask for one: the request shows under its day, and
a driver answers it by adding a ride for it, which puts the person who asked in the car.

### Admins

An admin manages the company-car pool and the people (making someone else an admin, reset
links). The usernames in `KARPUL_ADMINS` are admins whatever the app says, which is how the
first admin of a deployment comes to be: register, put your username there, restart. More
admins are made from the app; the last one cannot be removed. An admin can also delete an
account: its coming rides are cancelled (the passengers are told), its seats go to whoever is
waiting and its requests are withdrawn, while its past rides keep its name. *Company cars* has
a *Usage* tab whose rides download as a spreadsheet. *All rides* is every ride between two dates,
coming or past, as one sortable table (driver, car, route, passengers, km, chip-in, note), with
filters for the car type and a search, and a download of the rows on screen as a spreadsheet that
Excel opens directly with German or Serbian settings.

### Countries

Set `KARPUL_ALLOWED_COUNTRIES` (e.g. `DE,RS`) and the app answers nobody else: the page, the
API and the live socket all refuse other countries with a 403. The country comes from
[DB-IP](https://db-ip.com)'s free IP-to-country database (CC BY 4.0), which the Docker image
downloads when it is built. Private addresses always pass. A calendar app that fetches the feed
from its own servers abroad (Google Calendar does) is refused like anyone else.

Retiring a car (`active = false`) is preferred over deleting: it disappears from the ride
form while past rides keep their car. Deleting is refused outright once any ride references
the car, and shrinking a car's seat count is refused while a ride offers more seats than
that.

## Run it locally

Backend (Python 3.11+):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload            # http://localhost:8000, docs at /docs
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev                              # http://localhost:5173, proxies /api to :8000
```

Tests and checks:

```bash
cd backend && python -m pytest
cd frontend && npm run lint && npm run build
```

### Single process

After `npm run build`, FastAPI serves `frontend/dist` itself, so `uvicorn app.main:app`
alone hosts the whole app at http://localhost:8000.

### Docker

```bash
docker compose up --build              # http://localhost:8080, one container
```

### Production on Hetzner

Karpul runs on the shared LosBobes Hetzner box next to gamgee, iris and flora-find:
host Caddy for HTTPS, a loopback-only compose stack on port 3004, and a GitHub Actions
deploy on every push to `main` using the org's `HETZNER_*` secrets.
See [docs/deployment-hetzner.md](docs/deployment-hetzner.md).

## Configuration

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | backend | `sqlite:///backend/data/karpul.db` | Any SQLAlchemy URL |
| `KARPUL_FRONTEND_DIST` | backend | `frontend/dist` | Built frontend to serve from `/` |
| `CORS_ORIGINS` | backend | `http://localhost:5173` | Comma-separated allowed origins |
| `CORPORATE_CARS` | backend | 3 sample cars | Seed for the car pool on first start: `Name\|PLATE\|seats;Name\|PLATE\|seats` |
| `KARPUL_ADMINS` | backend | *(unset)* | Comma-separated usernames that are always admins (the first admin comes from here) |
| `KARPUL_ALLOWED_COUNTRIES` | backend | *(unset)* | ISO country codes (`DE,RS`) the app answers; unset answers everyone |
| `KARPUL_GEOIP_DB` | backend | `/app/geoip/country.mmdb` | The IP-to-country database (the image has one) |
| `KARPUL_SENTRY_DSN` | backend | *(unset)* | Sentry error tracking; unset sends nothing anywhere. `KARPUL_SENTRY_TRACES` sets a trace sample rate |
| `FORWARDED_ALLOW_IPS` | backend | `127.0.0.1` | uvicorn's own: which proxies' `X-Forwarded-For` to believe (production: `*`, behind Caddy) |
| `KARPUL_VAPID_PRIVATE_KEY` | backend | *(unset)* | VAPID private key for push notifications; `python -m app.vapid` prints one. Unset = push off |
| `KARPUL_VAPID_SUBJECT` | backend | `https://www.karpul.dev` | Contact the push services see: a `mailto:` or `https:` URL |
| `VITE_API_URL` | frontend | *(same origin)* | Base URL of the API if hosted elsewhere |
| `VITE_API_PROXY` | frontend dev | `http://localhost:8000` | Dev-server proxy target for `/api` |

The car pool is seeded only when the table is empty; after that it is managed from the
*Company cars* admin screen (or directly in the `corporatecar` table).

## API

Everything below takes the signed-in browser's `Authorization: Bearer …` token, which is
what decides who is acting; without one it is a 401, reads included. Open: register, login,
the reset-link pair, `/api/health`, `/api/push/config` and the calendar feed (its address is
its secret).

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` | `{ "username", "email", "first_name", "last_name", "password" }` – creates the account and signs it in; 409 on a taken username, email or name |
| `POST` | `/api/auth/login` | `{ "login", "password" }` – `login` is the username or the email |
| `POST` | `/api/auth/logout` | Drops this browser's session |
| `GET` | `/api/auth/me` | The signed-in account |
| `PATCH` | `/api/auth/me` | Change your name, email or password (a new password needs `current_password`); a new name follows you onto every ride |
| `POST` | `/api/auth/logout-others` | Sign every other browser of this account out |
| `POST` | `/api/auth/me/calendar-token` | A new secret for your calendar feed address |
| `GET` / `POST` | `/api/auth/reset/{token}`, `/api/auth/reset` | Whose reset link it is / `{ "token", "new_password" }` sets it and signs in |
| `GET` | `/api/admin/users` | Every account (admin) |
| `PATCH` | `/api/admin/users/{id}` | `{ "is_admin": true }` (admin; the last admin stays) |
| `POST` | `/api/admin/users/{id}/reset-link` | A one-time password reset link (admin) |
| `GET` | `/api/admin/rides?from=&to=` | Every ride in a window of up to three years, past included (admin) |
| `DELETE` | `/api/admin/users/{id}` | Delete an account: its coming rides, seats, queue places and requests go, its past stays (admin; not yourself, not the last admin) |
| `GET` | `/api/cars/corporate` | Active company cars; `?include_inactive=true` adds retired ones (admin) |
| `POST` | `/api/cars/corporate` | Add a company car (admin) |
| `PATCH` | `/api/cars/corporate/{id}` | Edit name/plate/seats, or retire with `{"active": false}` (admin) |
| `DELETE` | `/api/cars/corporate/{id}` | Admin; 409 when any ride uses the car |
| `GET` | `/api/rides?date=YYYY-MM-DD` or `?from=&to=` | Rides with bookings and `free_seats`; defaults to this week |
| `POST` | `/api/rides` | Create a ride; the signed-in account is the driver, and `repeat_until` adds one per week up to that date (all or nothing) |
| `GET` | `/api/rides/{id}` | |
| `GET` | `/api/rides/{id}/calendar.ics` | The ride as a calendar file |
| `WS` | `/api/ws` | Live updates; send `{"type":"auth","token":…}` first. Then `ride.created` / `ride.updated` (with the ride), `ride.deleted`, `request.saved` / `request.deleted`, `cars.changed`, `ping` |
| `PATCH` | `/api/rides/{id}` | Driver only |
| `DELETE` | `/api/rides/{id}` | Driver only; `?scope=following` also removes the later rides of the same weekly series |
| `POST` | `/api/rides/{id}/bookings` | `{ "passenger_name": "…", "pickup": "" }` – 409 when full / duplicate / driver; `pickup` is the origin (`""`) or one of the ride's stops. Adding someone else is the driver's to do: they always may, a passenger only while the ride's `passengers_manage` is on (403 otherwise) |
| `PATCH` | `/api/rides/{id}/bookings/{booking_id}` | `{ "pickup": "…" }` – the passenger or whoever may manage the seats |
| `DELETE` | `/api/rides/{id}/bookings/{booking_id}` | Passenger or driver, or another passenger while `passengers_manage` is on; the seat goes to the first on the waiting list |
| `POST` / `DELETE` | `/api/rides/{id}/waitlist`, `/api/rides/{id}/waitlist/{entry_id}` | Queue for a seat in a full car (yourself only) / leave it (you, or the driver) |
| `GET` / `POST` / `DELETE` | `/api/rides/{id}/messages[/{message_id}]` | The ride's thread; the author or the driver deletes |
| `GET` / `POST` / `DELETE` | `/api/requests?from=&to=`, `/api/requests[/{id}]` | "I need a ride": list, ask, withdraw your own. `POST /api/rides` with `request_id` answers one |
| `GET` | `/api/stats/me` | Your rides driven and ridden, people carried, km shared (this month, all time) and the past rides |
| `GET` | `/api/calendar/{token}.ics` | Subscribable calendar of everything you drive or ride in; the token is in *Your rides* |
| `GET` | `/api/cars/corporate/usage?days=90` | Per-car usage over the window, totals and history (admin); `usage.csv` is the same rides as a spreadsheet |
| `GET` | `/api/push/config` | Whether push is on and the VAPID public key |
| `POST` / `DELETE` | `/api/push/subscriptions` | Register this browser's push subscription under the signed-in account / drop it |
| `GET` | `/ride/{id}` | The app shell with Open Graph tags for that ride (a shareable link) |

Interactive docs: http://localhost:8000/docs

## Layout

```
backend/
  app/
    main.py        FastAPI app, CORS, static hosting of the built frontend, /ride/{id} previews
    models.py      User, AuthSession, PasswordReset, CorporateCar, Ride, Booking, WaitlistEntry,
                   RideMessage, RideRequest, PushSubscription
    schemas.py     Pydantic request/response models + validation rules
    services.py    Car-availability (overlap) check, ride serialisation, stats and usage figures
    auth.py        Passwords, session tokens and who a request is acting as
    admin.py       Who is an admin (the flag, or KARPUL_ADMINS)
    ratelimit.py   Throttling sign-in, registration and reset links
    monitoring.py  Sentry, when KARPUL_SENTRY_DSN is set
    events.py      In-process hub that fans board changes out to the WebSocket clients
    push.py        Who subscribed, and telling them what happened (webpush.py: the encryption)
    reminders.py   The departure reminder, once a minute from the lifespan
    calendar.py    .ics for one ride and the per-person feed
    routers/       auth.py, admin.py, cars.py, rides.py, requests.py, live.py (the /api/ws socket), push.py, stats.py
    seed.py        Company-car seed
  tests/           pytest suite (in-memory SQLite)
Dockerfile         frontend build + FastAPI in one image
docker-compose.prod.yml, Caddyfile, Makefile   shared-Hetzner-box deploy (docs/deployment-hetzner.md)
frontend/
  src/
    App.tsx                  Day/car selection, joins, drag-and-drop and live-update orchestration
    components/              DateCarousel, CarCarousel, CarDetail, YouPanel, AddCarCard, RideForm,
                             CarAdmin (with the Usage tab), MyRides, NotificationsSheet, ThemeSwitch,
                             AuthGate (the sign-in screen), AccountSheet, Sheet, ConfirmDialog, Menu,
                             Avatar, icons
    lib/                     api client, dates, pointer drag-and-drop (dnd.ts), live socket (live.ts),
                             push.ts (subscribing), auth.ts (the session store), theme.ts,
                             useAdminPassword, useCoarsePointer
  public/push-sw.js          The push and notification-click handlers, pulled into the service worker
```
