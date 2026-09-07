# Karpul – firm carpooling

A small internal tool for sharing rides between colleagues. No accounts, no passwords:
you type your name once, it's remembered in your browser, and you're good to go.

**Backend:** FastAPI + SQLModel (SQLite) · **Frontend:** React + Vite + TypeScript

## What it does

- **Offer a ride** for a given day: pick a **company car** from the pool or use **your own car**,
  set departure and return time (or one-way), origin/destination, and how many **free seats** you have.
- **Company cars can't be double-booked** – overlapping time windows on the same day are rejected.
- **Join a ride** by pressing *Join*, or **drag your name onto a car** to pick a driver.
  Drag it to another car to switch, or drop it back on the tray to get out.
- Week overview shows how many rides and free seats each day has.
- Drivers can edit/cancel their ride and remove passengers; passengers can leave.
- The board refreshes itself every 30 s and whenever the tab regains focus.

Identity is honour-based: actions that change a ride are checked against the `X-User-Name`
header (driver-only edit/cancel, passenger-or-driver leave). That's deliberate – it's an
internal tool for a firm, and the goal is zero friction.

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
docker compose up --build              # http://localhost:8080
```

### Production on Hetzner

Terraform for the server, Caddy for HTTPS, GitHub Actions for deploys on every push to `main`.
See [deploy/README.md](deploy/README.md) for the steps and the secrets to set.

## Configuration

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | backend | `sqlite:///backend/data/karpul.db` | Any SQLAlchemy URL |
| `CORS_ORIGINS` | backend | `http://localhost:5173` | Comma-separated allowed origins |
| `CORPORATE_CARS` | backend | 3 sample cars | Seed for the car pool on first start: `Name\|PLATE\|seats;Name\|PLATE\|seats` |
| `VITE_API_URL` | frontend | *(same origin)* | Base URL of the API if hosted elsewhere |
| `VITE_API_PROXY` | frontend dev | `http://localhost:8000` | Dev-server proxy target for `/api` |

The car pool is seeded only when the table is empty; edit the `corporatecar` table
(or delete the DB) to change it later.

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/cars/corporate` | Active company cars |
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
    routers/       cars.py, rides.py
    seed.py        Company-car seed
  tests/           pytest suite (in-memory SQLite)
frontend/
  src/
    App.tsx                  Week/day board, joins, drag-and-drop orchestration
    components/              NameBar, WeekStrip, RideCard, RideForm, PassengerTray
    lib/                     api client, dates, dnd helpers, useUserName
```
