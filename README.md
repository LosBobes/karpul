# Karpul – firm carpooling

A small internal tool for sharing rides between colleagues. No accounts: you type your
name once, it's remembered in your browser, and you're good to go. The only password in
the app guards the company-car pool.

**Backend:** FastAPI + SQLModel (SQLite) · **Frontend:** React + Vite + TypeScript

## What it does

- **Offer a ride** for a given day: pick a **company car** from the pool or use **your own car**,
  set departure and return time (or one-way), origin/destination, and how many **free seats** you have.
- **Company cars can't be double-booked** – overlapping time windows on the same day are rejected.
- **Join a ride** by pressing *Join*, or **drag your name onto a car** to pick a driver.
  Drag it to another car to switch, or drop it back on the tray to get out.
- **Manage the company car pool** from the *Cars* button in the header: add a car, fix a
  name/plate/seat count, retire one that's been sold, or delete one that was never used.
  This is the one screen behind a password (see *Company-car admin* below).
- Week overview shows how many rides and free seats each day has.
- Drivers can edit/cancel their ride and remove passengers; passengers can leave.
- The board refreshes itself every 30 s and whenever the tab regains focus.

Identity is honour-based: actions that change a ride are checked against the `X-User-Name`
header (driver-only edit/cancel, passenger-or-driver leave). That's deliberate – it's an
internal tool for a firm, and the goal is zero friction.

### Company-car admin

Editing the car pool is the exception, because a bad edit shows up on everyone's rides.
Set `KARPUL_ADMIN_PASSWORD` and whoever knows it can manage the pool; it is sent as the
`X-Admin-Password` header and remembered in the browser like the user's name. Leave the
variable unset and the admin endpoints are switched off entirely (`503`), which is what a
plain local checkout does.

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
| `KARPUL_ADMIN_PASSWORD` | backend | *(unset)* | Shared password for the company-car admin screen. Unset = admin endpoints off |
| `VITE_API_URL` | frontend | *(same origin)* | Base URL of the API if hosted elsewhere |
| `VITE_API_PROXY` | frontend dev | `http://localhost:8000` | Dev-server proxy target for `/api` |

The car pool is seeded only when the table is empty; after that it is managed from the
*Cars* admin screen (or directly in the `corporatecar` table).

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/cars/corporate` | Active company cars; `?include_inactive=true` adds retired ones (admin) |
| `POST` | `/api/cars/corporate` | Add a company car (admin) |
| `PATCH` | `/api/cars/corporate/{id}` | Edit name/plate/seats, or retire with `{"active": false}` (admin) |
| `DELETE` | `/api/cars/corporate/{id}` | Admin; 409 when any ride uses the car |
| `GET` | `/api/rides?date=YYYY-MM-DD` or `?from=&to=` | Rides with bookings and `free_seats`; defaults to this week |
| `POST` | `/api/rides` | Create a ride |
| `GET` | `/api/rides/{id}` | |
| `PATCH` | `/api/rides/{id}` | Driver only (`X-User-Name`) |
| `DELETE` | `/api/rides/{id}` | Driver only |
| `POST` | `/api/rides/{id}/bookings` | `{ "passenger_name": "…" }` – 409 when full / duplicate / driver |
| `DELETE` | `/api/rides/{id}/bookings/{booking_id}` | Passenger or driver |

Interactive docs: http://localhost:8000/docs

## Layout

```
backend/
  app/
    main.py        FastAPI app, CORS, static hosting of the built frontend
    models.py      CorporateCar, Ride, Booking
    schemas.py     Pydantic request/response models + validation rules
    services.py    Car-availability (overlap) check, ride serialisation
    admin.py       Shared-password gate for the company-car endpoints
    routers/       cars.py, rides.py
    seed.py        Company-car seed
  tests/           pytest suite (in-memory SQLite)
Dockerfile         frontend build + FastAPI in one image
docker-compose.prod.yml, Caddyfile, Makefile   shared-Hetzner-box deploy (docs/deployment-hetzner.md)
frontend/
  src/
    App.tsx                  Week/day board, joins, drag-and-drop orchestration
    components/              NameBar, WeekStrip, RideCard, RideForm, PassengerTray, CarAdmin
    lib/                     api client, dates, dnd helpers, useUserName, useAdminPassword
```
