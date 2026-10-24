"""`/api/ws`: live board updates.

The browser opens one socket and receives every change to rides and to the
car pool as it happens (see `app.events` for the event shapes).

The board is for signed-in people only, and a browser cannot put a header on
a WebSocket, so the first thing the client sends is its token:
`{"type": "auth", "token": "..."}` (in a message rather than the URL, which
proxies write into their logs). The server answers `hello` and starts
sending; a missing or dead token closes the socket with code 4401, which the
client takes the way it takes a 401. Anything sent after that is ignored, but
reading it is what tells us the peer has gone away.

Kept under `/api` so the Vite dev proxy and the SPA catch-all in `main.py`
treat it like the rest of the API.
"""

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlmodel import Session

from ..auth import user_for_token
from ..database import get_session
from ..events import Subscription, hub

router = APIRouter(tags=["live"])

# Idle sockets get a ping so proxies and mobile networks do not drop them as dead.
PING_INTERVAL_S = 25
# How long a fresh socket has to say who it is.
AUTH_TIMEOUT_S = 10
# Close code for "sign in again": 4000-4999 are the application's own.
CLOSE_UNAUTHORIZED = 4401


async def _pump(ws: WebSocket, sub: Subscription) -> None:
    while True:
        try:
            event = await asyncio.wait_for(sub.queue.get(), timeout=PING_INTERVAL_S)
        except TimeoutError:
            event = {"type": "ping"}
        await ws.send_json(event)


async def _authenticate(ws: WebSocket, session: Session) -> bool:
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=AUTH_TIMEOUT_S)
        message = json.loads(raw)
        token = message.get("token") if isinstance(message, dict) and message.get("type") == "auth" else None
    except (TimeoutError, ValueError):
        token = None
    ok = isinstance(token, str) and user_for_token(session, token) is not None
    # Done with the database for the life of the socket: an open read
    # transaction would pin a WAL snapshot for as long as the tab stays open.
    session.close()
    return ok


@router.websocket("/api/ws")
async def live_board(ws: WebSocket, session: Annotated[Session, Depends(get_session)]) -> None:
    await ws.accept()
    try:
        authenticated = await _authenticate(ws, session)
    except WebSocketDisconnect:
        return
    if not authenticated:
        await ws.close(code=CLOSE_UNAUTHORIZED)
        return
    with hub.subscribe() as sub:
        await ws.send_json({"type": "hello"})
        sender = asyncio.create_task(_pump(ws, sub))
        try:
            while True:
                # Only here to notice the disconnect; payloads are ignored.
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            sender.cancel()
            try:
                await sender
            except (asyncio.CancelledError, Exception):
                # A send that failed because the peer vanished is not an error here.
                pass
