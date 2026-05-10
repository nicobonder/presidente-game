import asyncio
from fastapi import WebSocket
from config import get_logger, VETO_SALVACION_SECONDS

log = get_logger("connections")


class ConnectionManager:
    def __init__(self):
        # room_id → list[WebSocket]
        self.rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, room_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_id, []).append(ws)
        log.info("WS connected room=%s total=%d", room_id, len(self.rooms[room_id]))

    def disconnect(self, room_id: str, ws: WebSocket):
        if room_id in self.rooms:
            self.rooms[room_id] = [w for w in self.rooms[room_id] if w != ws]
        log.info("WS disconnected room=%s remaining=%d", room_id, len(self.rooms.get(room_id, [])))

    async def broadcast(self, room_id: str, message: dict, exclude: WebSocket = None):
        dead = []
        for ws in self.rooms.get(room_id, []):
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception as e:
                log.warning("broadcast send failed: %s", e)
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)

    async def send_to(self, ws: WebSocket, message: dict):
        try:
            await ws.send_json(message)
        except Exception as e:
            log.warning("send_to failed: %s", e)


manager = ConnectionManager()

# ─── Veto / Salvacion auto-apply timer ────────────────────────────────────────
_pending_timers: dict[str, asyncio.Task] = {}


def start_timer(room_id: str, callback):
    """Start a countdown; call callback() when it expires."""
    cancel_timer(room_id)

    async def _run():
        try:
            await asyncio.sleep(VETO_SALVACION_SECONDS)
            log.info("timer expired for room %s", room_id)
            await callback()
        except asyncio.CancelledError:
            log.debug("timer cancelled for room %s", room_id)

    _pending_timers[room_id] = asyncio.create_task(_run())

def start_election_timer(room_id: str, callback):
    """Start 3-second countdown for election cards."""
    if room_id in _pending_timers:
        _pending_timers[room_id].cancel()

    async def _run():
        try:
            await asyncio.sleep(3)
            log.info("election timer expired for room %s", room_id)
            await callback()
        except asyncio.CancelledError:
            log.debug("election timer cancelled for room %s", room_id)

    _pending_timers[room_id] = asyncio.create_task(_run())


def cancel_timer(room_id: str):
    task = _pending_timers.pop(room_id, None)
    if task:
        task.cancel()
        log.debug("timer cancelled for room %s", room_id)