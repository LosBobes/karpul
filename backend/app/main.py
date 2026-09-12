"""Karpul - lightweight carpooling for a community."""

import asyncio
import html
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .database import engine, init_db
from .models import Ride
from .reminders import reminder_loop
from .routers import cars, live, push, rides, stats
from .seed import seed_corporate_cars

# Built frontend location. The Docker image sets KARPUL_FRONTEND_DIST=/app/static;
# a source checkout falls back to frontend/dist after `npm run build`.
FRONTEND_DIST = Path(
    os.getenv("KARPUL_FRONTEND_DIST")
    or Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with Session(engine) as session:
        seed_corporate_cars(session)
    # Departure reminders (app/reminders.py); a no-op tick while push is off.
    reminders = asyncio.create_task(reminder_loop())
    try:
        yield
    finally:
        reminders.cancel()


app = FastAPI(title="Karpul", version="0.1.0", lifespan=lifespan)

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The 90-day board is the biggest thing on the wire and every tab reloads it on
# reconnect; compressed it is a fraction of the size on the office Wi-Fi.
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(cars.router)
app.include_router(rides.router)
app.include_router(live.router)
app.include_router(push.router)
app.include_router(stats.router)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


class HashedAssets(StaticFiles):
    """Vite names every bundle by content hash, so a browser may keep it for good
    and a returning phone downloads only `index.html`."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


def ride_preview_tags(ride: Ride) -> str:
    """Open Graph tags for a shared ride link, so a chat app shows what the link
    is before anyone taps it. The values are escaped; the shell is otherwise
    untouched and the app itself reads the id from the path."""
    free = max(ride.seats - len(ride.bookings), 0)
    seats = "1 free seat" if free == 1 else f"{free} free seats"
    title = f"{ride.driver_name} drives {ride.origin} to {ride.destination}"
    when = f"{ride.ride_date:%a %d %b} at {ride.departure_time:%H:%M}"
    description = f"{when}, {ride.car_name}. {seats}." if free else f"{when}, {ride.car_name}. Full."
    tags = [
        f'<meta property="og:title" content="{html.escape(title, quote=True)}">',
        f'<meta property="og:description" content="{html.escape(description, quote=True)}">',
        '<meta property="og:type" content="website">',
        f'<meta name="description" content="{html.escape(description, quote=True)}">',
    ]
    return "\n".join(tags)


def mount_frontend(app: FastAPI, dist: Path, load_ride=None) -> None:
    """Serve a Vite build from `dist` behind the API routes: hashed bundles from
    `/assets`, everything else (the shell, the service worker, the manifest, the
    icons) by its plain name with an SPA fallback. `/ride/{id}` is the shell
    with a preview of that ride in its head (`load_ride` fetches it; None
    means no preview, which tests use)."""
    app.mount("/assets", HashedAssets(directory=dist / "assets"), name="assets")

    @app.get("/ride/{ride_id}", include_in_schema=False)
    def shared_ride(ride_id: int):
        shell = (dist / "index.html").read_text(encoding="utf-8")
        ride = load_ride(ride_id) if load_ride else None
        if ride is not None and "</head>" in shell:
            shell = shell.replace("</head>", ride_preview_tags(ride) + "\n</head>", 1)
        return HTMLResponse(shell, headers={"Cache-Control": "no-cache"})

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = dist / full_path
        # Anything outside /assets keeps its name across builds, so it must be
        # revalidated every time. The shell is tiny and must always point at the
        # current bundles, and `sw.js` must be re-fetched or an installed app would
        # never learn about a new build (the worker itself precaches the rest).
        file = candidate if full_path and candidate.is_file() else dist / "index.html"
        return FileResponse(file, headers={"Cache-Control": "no-cache"})


def _load_ride(ride_id: int) -> Ride | None:
    with Session(engine) as session:
        ride = session.get(Ride, ride_id)
        if ride is not None:
            ride.bookings  # noqa: B018 - load before the session closes
        return ride


# Serve the built frontend (if present) so a single process can host everything.
if FRONTEND_DIST.is_dir():
    mount_frontend(app, FRONTEND_DIST, _load_ride)
