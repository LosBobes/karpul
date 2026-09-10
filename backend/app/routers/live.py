"""`/api/ws`: live board updates.

The browser opens one socket and receives every change to rides and to the
car pool as it happens (see `app.events` for the event shapes). The socket is
receive-only from the client's point of view; anything the client sends is
ignored, but reading it is what tells us the peer has gone away.

Kept under `/api` so the Vite dev proxy and the SPA catch-all in `main.py`
treat it like the rest of the API.
"""

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..events import Subscription, hub

router = APIRouter(tags=["live"])

# Idle sockets get a ping so proxies and mobile networks do not drop them as dead.
PING_INTERVAL_S = 25


async def _pump(ws: WebSocket, sub: Subscription) -> None:
    while True:
        try:
            event = await asyncio.wait_for(sub.queue.get(), timeout=PING_INTERVAL_S)
        except asyncio.TimeoutError:
            event = {"type": "ping"}
        await ws.send_json(event)


@router.websocket("/api/ws")
async def live_board(ws: WebSocket) -> None:
    await ws.accept()
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
