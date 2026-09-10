"""Karpul - lightweight carpooling for a firm."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

app.include_router(cars.router)
app.include_router(rides.router)
app.include_router(live.router)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


# Serve the built frontend (if present) so a single process can host everything.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
