import json
import time
from typing import Optional

import aiosqlite

from config import DB_PATH, ROOM_TTL_SECONDS, MAX_PLAYERS, get_logger

log = get_logger("db")


async def init_db():
    log.info("Initializing database at %s", DB_PATH)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
                id         TEXT PRIMARY KEY,
                state      TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        await db.commit()
    log.info("Database ready")


async def get_room(db: aiosqlite.Connection, room_id: str) -> Optional[dict]:
    async with db.execute(
        "SELECT state FROM rooms WHERE id = ?", (room_id,)
    ) as cur:
        row = await cur.fetchone()
    if row:
        log.debug("get_room %s → found", room_id)
        return json.loads(row[0])
    log.debug("get_room %s → not found", room_id)
    return None


async def save_room(db: aiosqlite.Connection, room_id: str, state: dict):
    now = time.time()
    payload = json.dumps(state, ensure_ascii=False)
    await db.execute("""
        INSERT INTO rooms (id, state, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE
            SET state = excluded.state,
                updated_at = excluded.updated_at
    """, (room_id, payload, now, now))
    await db.commit()
    log.debug("save_room %s (phase=%s)", room_id, state.get("phase"))


async def find_open_room(db: aiosqlite.Connection) -> Optional[str]:
    """Return the ID of a lobby room with available slots, or None."""
    cutoff = time.time() - ROOM_TTL_SECONDS
    async with db.execute(
        "SELECT id, state FROM rooms WHERE updated_at > ? ORDER BY created_at ASC",
        (cutoff,)
    ) as cur:
        rows = await cur.fetchall()

    for room_id, state_json in rows:
        state = json.loads(state_json)
        if (
            state.get("phase") == "lobby"
            and len(state.get("players", [])) < MAX_PLAYERS
        ):
            log.debug("find_open_room → %s", room_id)
            return room_id

    log.debug("find_open_room → none available")
    return None