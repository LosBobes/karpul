"""Karpul - lightweight carpooling for a community."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .database import engine, init_db
from .routers import cars, live, rides
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
    yield


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


def mount_frontend(app: FastAPI, dist: Path) -> None:
    """Serve a Vite build from `dist` behind the API routes: hashed bundles from
    `/assets`, everything else (the shell, the service worker, the manifest, the
    icons) by its plain name with an SPA fallback."""
    app.mount("/assets", HashedAssets(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = dist / full_path
        # Anything outside /assets keeps its name across builds, so it must be
        # revalidated every time. The shell is tiny and must always point at the
        # current bundles, and `sw.js` must be re-fetched or an installed app would
        # never learn about a new build (the worker itself precaches the rest).
        file = candidate if full_path and candidate.is_file() else dist / "index.html"
        return FileResponse(file, headers={"Cache-Control": "no-cache"})


# Serve the built frontend (if present) so a single process can host everything.
if FRONTEND_DIST.is_dir():
    mount_frontend(app, FRONTEND_DIST)
