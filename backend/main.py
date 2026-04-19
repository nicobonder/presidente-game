"""
Backend — ¡A la Presidencia!
FastAPI + WebSockets + SQLite (aiosqlite)
"""

import asyncio
import json
import random
import string
import time
from contextlib import asynccontextmanager
from typing import Optional

import aiosqlite
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

DB_PATH = "game.db"

# ─── DB init ──────────────────────────────────────────────────────────────────
async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
                id          TEXT PRIMARY KEY,
                state       TEXT NOT NULL,
                created_at  REAL NOT NULL,
                updated_at  REAL NOT NULL
            )
        """)
        await db.commit()

async def get_room(db, room_id: str) -> Optional[dict]:
    async with db.execute("SELECT state FROM rooms WHERE id = ?", (room_id,)) as cur:
        row = await cur.fetchone()
    if row:
        return json.loads(row[0])
    return None

async def save_room(db, room_id: str, state: dict):
    now = time.time()
    state_json = json.dumps(state, ensure_ascii=False)
    await db.execute("""
        INSERT INTO rooms (id, state, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
    """, (room_id, state_json, now, now))
    await db.commit()

async def find_open_room(db) -> Optional[str]:
    """Find a room in 'lobby' phase with < 4 players."""
    async with db.execute(
        "SELECT id, state FROM rooms WHERE updated_at > ? ORDER BY created_at ASC",
        (time.time() - 3600,)   # rooms active in last hour
    ) as cur:
        rows = await cur.fetchall()
    for room_id, state_json in rows:
        state = json.loads(state_json)
        if state.get("phase") == "lobby" and len(state.get("players", [])) < 4:
            return room_id
    return None

# ─── Room ID generator ────────────────────────────────────────────────────────
def make_room_id(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

# ─── Connection manager ───────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        # room_id → list of websockets
        self.rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, room_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_id, []).append(ws)

    def disconnect(self, room_id: str, ws: WebSocket):
        if room_id in self.rooms:
            self.rooms[room_id] = [w for w in self.rooms[room_id] if w != ws]

    async def broadcast(self, room_id: str, message: dict, exclude: WebSocket = None):
        dead = []
        for ws in self.rooms.get(room_id, []):
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)

    async def send_to(self, ws: WebSocket, message: dict):
        try:
            await ws.send_json(message)
        except Exception:
            pass

manager = ConnectionManager()

# ─── App lifecycle ────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── REST: Join or create a room ──────────────────────────────────────────────
@app.post("/rooms/join")
async def join_room(body: dict):
    """
    Body: { room_id?: string, player_name: string }
    Returns: { room_id, player_id }
    """
    player_name = body.get("player_name", "Jugador")
    requested_room = body.get("room_id", "").strip().upper()
    player_id = make_room_id(8)

    async with aiosqlite.connect(DB_PATH) as db:
        # If specific room requested, try to join it
        if requested_room:
            state = await get_room(db, requested_room)
            if state is None:
                # Create it
                state = new_room_state(requested_room)
            if state["phase"] != "lobby":
                return {"error": "La partida ya comenzó o terminó"}
            if len(state["players"]) >= 4:
                return {"error": "La sala está llena (máximo 4 jugadores)"}
        else:
            # Find open room or create one
            open_id = await find_open_room(db)
            if open_id:
                requested_room = open_id
                state = await get_room(db, open_id)
            else:
                requested_room = make_room_id()
                state = new_room_state(requested_room)

        # Add player to lobby
        state["players"].append({
            "id": player_id,
            "name": player_name,
            "party": None,
            "ready": False,
        })
        await save_room(db, requested_room, state)

    return {"room_id": requested_room, "player_id": player_id}

@app.get("/rooms/{room_id}")
async def get_room_info(room_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        state = await get_room(db, room_id)
    if state is None:
        return {"error": "Sala no encontrada"}
    return state

# ─── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(ws: WebSocket, room_id: str, player_id: str):
    await manager.connect(room_id, ws)

    async with aiosqlite.connect(DB_PATH) as db:
        state = await get_room(db, room_id)
        if not state:
            await ws.close(code=4004, reason="Sala no encontrada")
            return

        # Notify everyone of updated player list
        await manager.broadcast(room_id, {"type": "room_state", "state": state})

    try:
        while True:
            raw = await ws.receive_json()
            await handle_message(ws, room_id, player_id, raw)
    except WebSocketDisconnect:
        manager.disconnect(room_id, ws)
        # Mark player as disconnected
        async with aiosqlite.connect(DB_PATH) as db:
            state = await get_room(db, room_id)
            if state:
                for p in state["players"]:
                    if p["id"] == player_id:
                        p["connected"] = False
                await save_room(db, room_id, state)
                await manager.broadcast(room_id, {"type": "room_state", "state": state})

# ─── Message handler ──────────────────────────────────────────────────────────
async def handle_message(ws: WebSocket, room_id: str, player_id: str, msg: dict):
    mtype = msg.get("type")

    async with aiosqlite.connect(DB_PATH) as db:
        state = await get_room(db, room_id)
        if not state:
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
            await save_room(db, room_id, state)
            await manager.broadcast(room_id, {"type": "room_state", "state": state})

        # ── start_game ────────────────────────────────────────────────────────
        elif mtype == "start_game":
            players_ready = [p for p in state["players"] if p["party"]]
            if len(players_ready) < 2:
                await manager.send_to(ws, {"type": "error", "message": "Necesitás al menos 2 jugadores listos"})
                return
            # Only first player (host) can start
            if state["players"][0]["id"] != player_id:
                await manager.send_to(ws, {"type": "error", "message": "Solo el host puede iniciar"})
                return

            # Determine turn order by simulated dice roll
            order = sorted(players_ready, key=lambda _: random.randint(1, 6), reverse=True)
            state["phase"] = "playing"
            state["turn_order"] = [p["id"] for p in order]
            state["current_turn_index"] = 0
            state["game_players"] = {
                p["id"]: {
                    "id": p["id"],
                    "name": p["name"],
                    "party": p["party"],
                    "position": 0,
                    "loses_turn": False,
                    "salvacion_used": False,
                    "veto_available": True,
                    "situation_cards": [],
                }
                for p in order
            }
            state["log"] = [f"¡El juego comenzó! Turno de {order[0]['name']}"]
            state["pending"] = None

            await save_room(db, room_id, state)
            await manager.broadcast(room_id, {"type": "room_state", "state": state})

        # ── game_action ───────────────────────────────────────────────────────
        elif mtype == "game_action":
            # Validate it's this player's turn
            current_pid = state["turn_order"][state["current_turn_index"]]
            if player_id != current_pid and msg.get("action") not in ["use_veto", "use_salvacion"]:
                await manager.send_to(ws, {"type": "error", "message": "No es tu turno"})
                return

            updated_state, events = process_game_action(state, player_id, msg)
            await save_room(db, room_id, updated_state)
            await manager.broadcast(room_id, {
                "type": "room_state",
                "state": updated_state,
                "events": events,
            })

        # ── chat (optional simple chat) ───────────────────────────────────────
        elif mtype == "chat":
            text = msg.get("text", "")[:200]
            player = next((p for p in state["players"] if p["id"] == player_id), None)
            name = player["name"] if player else "?"
            await manager.broadcast(room_id, {
                "type": "chat",
                "name": name,
                "text": text,
            })

# ─── Game action processor ────────────────────────────────────────────────────
def process_game_action(state: dict, player_id: str, msg: dict) -> tuple[dict, list]:
    """Pure function: given state + action → new state + event log."""
    import copy, random
    state = copy.deepcopy(state)
    events = []
    action = msg.get("action")
    gp = state["game_players"]
    player = gp[player_id]

    if action == "roll_dice":
        dice = random.randint(1, 6)
        events.append({"type": "dice", "player_id": player_id, "value": dice})
        state["log"].append(f"{player['name']} sacó un {dice}")

        # Store dice in pending for frontend to complete movement
        state["pending"] = {
            "type": "movement",
            "player_id": player_id,
            "dice": dice,
        }

    elif action == "confirm_move":
        # Frontend resolved movement and sends final position
        new_pos = msg.get("new_position", player["position"])
        landed_type = msg.get("landed_type", "normal")
        player["position"] = new_pos
        state["log"].append(f"{player['name']} avanzó al casillero {new_pos}")

        state["pending"] = {
            "type": "square_effect",
            "player_id": player_id,
            "square_type": landed_type,
            "position": new_pos,
        }
        events.append({"type": "moved", "player_id": player_id, "position": new_pos, "square_type": landed_type})

    elif action == "apply_card_effect":
        effect = msg.get("effect", {})
        _apply_effect(state, player_id, effect, events)
        _advance_turn(state)

    elif action == "answer_question":
        correct = msg.get("correct", False)
        delta = 3 if correct else -3
        player["position"] = max(0, min(99, player["position"] + delta))
        result = "correcta ✅ (+3)" if correct else "incorrecta ❌ (-3)"
        state["log"].append(f"{player['name']} respondió {result}")
        events.append({"type": "question_result", "player_id": player_id, "correct": correct, "position": player["position"]})
        state["pending"] = None
        _advance_turn(state)

    elif action == "use_veto":
        target_id = msg.get("target_id")
        if player["veto_available"]:
            player["veto_available"] = False
            state["log"].append(f"{player['name']} usó su VETO ABSOLUTO contra {gp[target_id]['name']}")
            events.append({"type": "veto_used", "by": player_id, "against": target_id})

    elif action == "use_salvacion":
        if not player["salvacion_used"]:
            player["salvacion_used"] = True
            state["log"].append(f"{player['name']} usó su Tarjeta de Salvación")
            events.append({"type": "salvacion_used", "player_id": player_id})
            state["pending"] = None
            _advance_turn(state)

    elif action == "choose_rival":
        # For "elige un rival" cards
        rival_id = msg.get("rival_id")
        cantidad = msg.get("cantidad", 3)
        if rival_id in gp:
            gp[rival_id]["position"] = max(0, gp[rival_id]["position"] - cantidad)
            state["log"].append(f"{player['name']} hizo retroceder {cantidad} casilleros a {gp[rival_id]['name']}")
            events.append({"type": "rival_moved", "rival_id": rival_id, "delta": -cantidad})
        state["pending"] = None
        _advance_turn(state)

    return state, events


def _apply_effect(state, player_id, effect, events):
    gp = state["game_players"]
    player = gp[player_id]
    etype = effect.get("type")

    if etype == "avanza":
        player["position"] = min(99, player["position"] + effect.get("cantidad", 0))
    elif etype == "retrocede":
        player["position"] = max(0, player["position"] - effect.get("cantidad", 0))
    elif etype == "pierde_turno":
        player["loses_turn"] = True
    elif etype == "reset":
        player["position"] = 0
    elif etype == "win":
        state["phase"] = "finished"
        state["winner"] = player_id
        state["log"].append(f"🏆 ¡{player['name']} ganó! ¡ES PRESIDENTE!")
        events.append({"type": "game_won", "player_id": player_id})
    elif etype == "ballotage":
        player["loses_turn"] = True
        state["log"].append(f"{player['name']} va al Ballotage. Espera un turno.")
    elif etype == "rivales_retroceden":
        cantidad = effect.get("cantidad", 3)
        for pid, p in gp.items():
            if pid != player_id:
                p["position"] = max(0, p["position"] - cantidad)
    state["pending"] = None


def _advance_turn(state):
    order = state["turn_order"]
    gp = state["game_players"]
    idx = state["current_turn_index"]
    # Skip players who lose their turn
    attempts = 0
    while attempts < len(order):
        idx = (idx + 1) % len(order)
        pid = order[idx]
        if gp[pid].get("loses_turn"):
            gp[pid]["loses_turn"] = False   # reset after skipping
            state["log"].append(f"{gp[pid]['name']} pierde su turno")
        else:
            break
        attempts += 1
    state["current_turn_index"] = idx
    state["pending"] = None
    state["log"].append(f"Turno de {gp[order[idx]]['name']}")


# ─── Room factory ─────────────────────────────────────────────────────────────
def new_room_state(room_id: str) -> dict:
    return {
        "room_id": room_id,
        "phase": "lobby",
        "players": [],
        "turn_order": [],
        "current_turn_index": 0,
        "game_players": {},
        "log": [],
        "pending": None,
    }
