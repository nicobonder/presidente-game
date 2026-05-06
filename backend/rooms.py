import random
import string


import aiosqlite
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from config import DB_PATH, MAX_PLAYERS, get_logger
from db import get_room, save_room, find_open_room
from game_logic import new_room_state

log    = get_logger("rooms")
router = APIRouter()


def make_id(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))

class JoinRequest(BaseModel):
    player_name: str = "Jugador"
    room_id: Optional[str] = None

@router.post("/rooms/join")
async def join_room(body: JoinRequest):
    player_name    = body.player_name.strip() or "Jugador"
    requested_room = (body.room_id or "").strip().upper()
    player_id      = make_id(8)
    log.info("join_room player=%s requested_room=%r", player_name, requested_room)



    log.info("join_room player=%s requested_room=%r", player_name, requested_room)

    async with aiosqlite.connect(DB_PATH) as db:
        if requested_room:
            state = await get_room(db, requested_room)
            if state is None:
                log.info("room %s not found — creating", requested_room)
                state = new_room_state(requested_room)
            if state["phase"] != "lobby":
                log.warning("room %s already started", requested_room)
                return {"error": "La partida ya comenzó o terminó"}
            if len(state["players"]) >= MAX_PLAYERS:
                log.warning("room %s is full", requested_room)
                return {"error": "La sala está llena (máximo 4 jugadores)"}
            room_id = requested_room
        else:
            open_id = await find_open_room(db)
            if open_id:
                room_id = open_id
                state   = await get_room(db, open_id)
                log.info("joining existing open room %s", room_id)
            else:
                room_id = make_id()
                state   = new_room_state(room_id)
                log.info("created new room %s", room_id)

        state["players"].append({
            "id":    player_id,
            "name":  player_name,
            "party": None,
            "ready": False,
        })
        await save_room(db, room_id, state)

    log.info("player %s (%s) joined room %s", player_id, player_name, room_id)
    return {"room_id": room_id, "player_id": player_id}


@router.get("/rooms/{room_id}")
async def get_room_info(room_id: str):
    log.debug("get_room_info %s", room_id)
    async with aiosqlite.connect(DB_PATH) as db:
        state = await get_room(db, room_id)
    if state is None:
        return {"error": "Sala no encontrada"}
    return state