import copy
import random

import aiosqlite
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import DB_PATH, get_logger
from connections import manager, start_timer, cancel_timer, start_election_timer
from config import VETO_PREMIO_SECONDS
from db import get_room, save_room
from game_logic import process_action, build_game_players, new_room_state, apply_effect_and_check_chain

log    = get_logger("ws_handler")
router = APIRouter()


@router.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(ws: WebSocket, room_id: str, player_id: str):
    await manager.connect(room_id, ws)
    log.info("WS open room=%s player=%s", room_id, player_id)

    async with aiosqlite.connect(DB_PATH) as db:
        state = await get_room(db, room_id)
        if not state:
            log.error("WS room %s not found, closing", room_id)
            await ws.close(code=4004, reason="Sala no encontrada")
            return
        await manager.broadcast(room_id, {"type": "room_state", "state": state})

    try:
        while True:
            raw = await ws.receive_json()
            log.debug("WS recv room=%s player=%s msg=%s", room_id, player_id, raw.get("type"))
            await _handle(ws, room_id, player_id, raw)

    except WebSocketDisconnect:
        manager.disconnect(room_id, ws)
        log.info("WS disconnect room=%s player=%s", room_id, player_id)
        async with aiosqlite.connect(DB_PATH) as db:
            state = await get_room(db, room_id)
            if state:
                for p in state["players"]:
                    if p["id"] == player_id:
                        p["connected"] = False
                await save_room(db, room_id, state)
                await manager.broadcast(room_id, {"type": "room_state", "state": state})


async def _handle(ws: WebSocket, room_id: str, player_id: str, msg: dict):
    mtype = msg.get("type")

    async with aiosqlite.connect(DB_PATH) as db:
        state = await get_room(db, room_id)
        if not state:
            log.error("_handle: room %s not found", room_id)
            return

        # ── select_party ──────────────────────────────────────────────────────
        if mtype == "select_party":
            party = msg.get("party")
            taken = {p["party"] for p in state["players"] if p["party"]}
            if party in taken:
                await manager.send_to(ws, {"type": "error", "message": "Partido ya elegido"})
                return
            for p in state["players"]:
                if p["id"] == player_id:
                    p["party"] = party
                    p["ready"] = True
            log.info("player %s selected party %s in room %s", player_id, party, room_id)
            await save_room(db, room_id, state)
            await manager.broadcast(room_id, {"type": "room_state", "state": state})

        # ── start_game ────────────────────────────────────────────────────────
        elif mtype == "start_game":
            ready = [p for p in state["players"] if p["party"]]
            if len(ready) < 2:
                await manager.send_to(ws, {"type": "error", "message": "Necesitás al menos 2 jugadores listos"})
                return
            if state["players"][0]["id"] != player_id:
                await manager.send_to(ws, {"type": "error", "message": "Solo el host puede iniciar"})
                return

            order = sorted(ready, key=lambda _: random.randint(1, 6), reverse=True)
            state["phase"]               = "playing"
            state["turn_order"]          = [p["id"] for p in order]
            state["current_turn_index"]  = 0
            state["game_players"]        = build_game_players(order)
            state["log"]                 = [f"¡El juego comenzó! Turno de {order[0]['name']}"]
            state["pending"]             = None

            log.info("game started in room %s, turn order: %s",
                     room_id, [p["name"] for p in order])
            await save_room(db, room_id, state)
            await manager.broadcast(room_id, {"type": "room_state", "state": state})

        # ── game_action ───────────────────────────────────────────────────────
        elif mtype == "game_action":
            action      = msg.get("action")
            current_pid = state["turn_order"][state["current_turn_index"]]
            pending_now = state.get("pending") or {}

            # Determinar quién puede actuar
            is_second_answerer = (
                action == "answer_question" and
                pending_now.get("first_wrong") and
                player_id == pending_now.get("second_player_id")
            )

            # Non-active players can only use veto, salvacion, or answer as second player
            if player_id != current_pid and action not in ("use_veto", "use_salvacion") and not is_second_answerer:
                log.warning("out-of-turn action %s from %s (current: %s)",
                            action, player_id, current_pid)
                await manager.send_to(ws, {"type": "error", "message": "No es tu turno"})
                return

            updated, events = process_action(state, player_id, msg)
            await save_room(db, room_id, updated)
            await manager.broadcast(room_id, {
                "type":   "room_state",
                "state":  updated,
                "events": events,
            })

            # Start/cancel veto-salvacion timer
            p = updated.get("pending") or {}
            if p.get("type") in ("waiting_veto", "waiting_salvacion"):
                async def on_timer_expire():
                    await _auto_apply(room_id)
                cancel_timer(room_id)
                timer_secs = VETO_PREMIO_SECONDS if p.get("type") == "waiting_veto" else None
                start_timer(room_id, on_timer_expire, **({"seconds": timer_secs} if timer_secs else {}))
            elif p.get("type") == "show_card_no_confirm":
                async def on_election_expire():
                    await _auto_apply_election(room_id, p.get("player_id"), p.get("effect", {}))
                cancel_timer(room_id)
                start_election_timer(room_id, on_election_expire)
            else:
                cancel_timer(room_id)

            # Auto-apply election cards after 3 seconds (no confirm button)
            # Election cards auto-apply is handled by the election timer
            # (start_election_timer -> on_election_expire -> _auto_apply_election).
            # Avoid doing an inline sleep here which would block message handling
            # for this WebSocket and cause delayed processing when the game is busy.

        # ── chat ──────────────────────────────────────────────────────────────
        elif mtype == "chat":
            text   = msg.get("text", "")[:200]
            player = next((p for p in state["players"] if p["id"] == player_id), None)
            name   = player["name"] if player else "?"
            await manager.broadcast(room_id, {"type": "chat", "name": name, "text": text})

        else:
            log.warning("unknown message type: %s", mtype)


async def _auto_apply(room_id: str):
    """Called when the veto/salvacion timer expires — auto-apply the pending effect."""
    log.info("auto_apply timer expired room=%s", room_id)
    async with aiosqlite.connect(DB_PATH) as db:
        state = await get_room(db, room_id)
        if not state:
            return
        p = state.get("pending") or {}
        if p.get("type") not in ("waiting_veto", "waiting_salvacion"):
            return

        # Simulate a confirm_card action from the active player
        pid    = p.get("player_id")
        effect = p.get("effect", {})
        log.info("auto_apply: applying effect %s for player %s", effect, pid)

        state = copy.deepcopy(state)
        state = apply_effect_and_check_chain(state, pid, effect, [])
        await save_room(db, room_id, state)
        await manager.broadcast(room_id, {
            "type":   "room_state",
            "state":  state,
            "events": [{"type": "timer_expired"}],
        })

async def _auto_apply_election(room_id: str, player_id: str, effect: dict):
    """Apply election card effect after 3-second display."""
    log.info("auto_apply_election room=%s player=%s", room_id, player_id)
    async with aiosqlite.connect(DB_PATH) as db:
        state = await get_room(db, room_id)
        if not state:
            return
        # Only apply if still showing the same card
        if (state.get("pending") or {}).get("type") != "show_card_no_confirm":
            return
        
        state = copy.deepcopy(state)
        state = apply_effect_and_check_chain(state, player_id, effect, [])
        await save_room(db, room_id, state)
        await manager.broadcast(room_id, {
            "type": "room_state", "state": state, "events": []
        })