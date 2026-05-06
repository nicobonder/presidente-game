"""
Pure game logic — no I/O, no async.
All functions take state dicts and return modified copies.
"""
import copy
import time
from typing import Any

from config import (
    SQUARE_TYPE_MAP, ELECTION_SQUARES,
    VETO_SALVACION_SECONDS, BULRICHIZACION_TARGET, get_logger
)

log = get_logger("game_logic")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def sq_type(pos: int) -> str:
    return SQUARE_TYPE_MAP.get(pos, "normal")


def move_with_election_check(from_pos: int, delta: int) -> int:
    """
    Move player by delta, stopping at election squares if they would be skipped.
    Returns the final position.
    """
    direction = 1 if delta > 0 else -1
    pos = from_pos
    for _ in range(abs(delta)):
        next_pos = pos + direction
        if next_pos < 0:
            return 0
        if next_pos > 99:
            return 99
        # Stop if we'd jump OVER an election square (don't land past it)
        if direction > 0 and next_pos in ELECTION_SQUARES and next_pos != from_pos + delta:
            log.debug("move stopped at election square %d", next_pos)
            return next_pos
        pos = next_pos
    return pos


# ─── Turn management ──────────────────────────────────────────────────────────

def advance_turn(state: dict) -> dict:
    """Move to the next player, skipping those who lose their turn."""
    order = state["turn_order"]
    gp    = state["game_players"]
    idx   = state["current_turn_index"]

    for _ in range(len(order)):
        idx = (idx + 1) % len(order)
        pid = order[idx]
        if gp[pid].get("loses_turn"):
            gp[pid]["loses_turn"] = False
            state["log"].append(f"⏭️ {gp[pid]['name']} pierde su turno")
            log.info("player %s loses turn, skipping", pid)
        else:
            break

    state["current_turn_index"] = idx
    state["pending"] = None
    next_name = gp[order[idx]]["name"]
    state["log"].append(f"Turno de {next_name}")
    log.info("turn advanced to %s (idx=%d)", next_name, idx)
    return state


# ─── Effect application ───────────────────────────────────────────────────────

def apply_effect(state: dict, player_id: str, effect: dict, events: list) -> dict:
    """
    Apply a card effect to a player. Modifies state in-place.
    Does NOT advance the turn — caller decides when to do that.
    """
    gp     = state["game_players"]
    player = gp[player_id]
    etype  = effect.get("type", "normal")
    log.info("apply_effect player=%s type=%s", player_id, etype)

    if etype == "avanza":
        delta   = effect.get("cantidad", 0)
        new_pos = move_with_election_check(player["position"], delta)
        player["position"] = new_pos
        state["log"].append(f"⬆️ {player['name']} avanza {delta} → casillero {new_pos}")

    elif etype == "retrocede":
        cantidad = effect.get("cantidad", 0)
        new_pos  = max(0, player["position"] - cantidad)
        player["position"] = new_pos
        state["log"].append(f"⬇️ {player['name']} retrocede {cantidad} → casillero {new_pos}")

    elif etype == "pierde_turno":
        player["loses_turn"] = True
        state["log"].append(f"⏭️ {player['name']} perderá su próximo turno")

    elif etype == "reset":
        player["position"] = 0
        state["log"].append(f"🔄 {player['name']} vuelve al inicio")

    elif etype == "win":
        state["phase"]  = "finished"
        state["winner"] = player_id
        state["log"].append(f"🏆 ¡{player['name']} ganó! ¡ES PRESIDENTE!")
        events.append({"type": "game_won", "player_id": player_id})
        log.info("GAME WON by %s", player_id)

    elif etype == "ballotage":
        player["loses_turn"] = True
        state["log"].append(f"🔄 {player['name']} va al Ballotage. Espera un turno.")

    elif etype == "rivales_retroceden":
        cantidad = effect.get("cantidad", 3)
        for pid, p in gp.items():
            if pid != player_id:
                p["position"] = max(0, p["position"] - cantidad)
                state["log"].append(f"⬇️ {p['name']} retrocede {cantidad}")

    elif etype in ("normal", "draw_next"):
        pass  # no movement

    state["pending"] = None
    return state


def apply_effect_and_check_chain(
    state: dict, player_id: str, effect: dict, events: list
) -> dict:
    """
    Apply effect, then check if the new position is a special square.
    If so, set chain_delay pending so the frontend pauses before triggering it.
    """
    old_pos = state["game_players"][player_id]["position"]
    state   = apply_effect(state, player_id, effect, events)

    if state.get("phase") == "finished":
        return state

    new_pos = state["game_players"][player_id]["position"]

    if new_pos == old_pos:
        # No movement — just advance turn
        return advance_turn(state)

    ltype = sq_type(new_pos)
    if ltype not in ("normal", ""):
        state["pending"] = {
            "type":        "chain_delay",
            "player_id":   player_id,
            "position":    new_pos,
            "square_type": ltype,
        }
        state["log"].append(
            f"↪️ {state['game_players'][player_id]['name']} "
            f"cae en casillero especial {new_pos} ({ltype})"
        )
        log.info("chain_delay: player %s landed on %s (%s)", player_id, new_pos, ltype)
    else:
        state = advance_turn(state)

    return state


# ─── Square landing ───────────────────────────────────────────────────────────

def set_pending_for_square(
    state: dict, player_id: str, pos: int, landed_type: str
) -> dict:
    """
    Set the correct pending state for a player landing on a square.
    Instant effects (13, 56) are applied immediately.
    Card squares signal the frontend to draw a card.
    """
    player = state["game_players"][player_id]
    log.info("set_pending_for_square player=%s pos=%d type=%s", player_id, pos, landed_type)

    if landed_type == "especial13":
        new_pos = max(0, pos - 5)
        player["position"] = new_pos
        state["log"].append(f"🔲 Casillero 13 — {player['name']} retrocede 5 → {new_pos}")
        state["pending"] = {
            "type":      "special_effect",
            "player_id": player_id,
            "message":   f"¡Casillero maldito! {player['name']} retrocede 5 casilleros.",
            "emoji":     "🔲",
        }

    elif landed_type == "especial56":
        new_pos = min(player["position"], BULRICHIZACION_TARGET)  # retrocede hasta 24 (Hardcoded en config.py)
        player["position"] = new_pos
        state["log"].append(f"☠️ Bulrichización — {player['name']} retrocede hasta casillero 24")
        state["pending"] = {
            "type":      "special_effect",
            "player_id": player_id,
            "message":   f"¡Bulrichización! {player['name']} cambia de ideología y retrocede hasta el casillero 24.",
            "emoji":     "☠️",
        }

    elif landed_type == "normal":
        state = advance_turn(state)

    else:
        # premio, castigo, elecciones, pregunta, presidencial
        state["pending"] = {
            "type":        "draw_card",
            "player_id":   player_id,
            "square_type": landed_type,
            "position":    pos,
        }

    return state


# ─── Main action processor ────────────────────────────────────────────────────

def process_action(
    state: dict, player_id: str, msg: dict
) -> tuple[dict, list]:
    """
    Main entry point for all game actions.
    Returns (new_state, events).
    """
    state  = copy.deepcopy(state)
    events: list[dict[str, Any]] = []
    action = msg.get("action")
    gp     = state["game_players"]
    player = gp.get(player_id)

    if not player:
        log.warning("process_action: unknown player %s", player_id)
        return state, events

    log.info("process_action player=%s action=%s", player_id, action)

    # ── roll_dice ──────────────────────────────────────────────────────────────
    if action == "roll_dice":
        import random
        dice = random.randint(1, 6)
        state["log"].append(f"🎲 {player['name']} sacó un {dice}")
        events.append({"type": "dice_rolled", "player_id": player_id, "value": dice})
        state["pending"] = {
            "type":      "show_dice",
            "player_id": player_id,
            "dice":      dice,
        }

    # ── confirm_move ──────────────────────────────────────────────────────────
    elif action == "confirm_move":
        new_pos     = msg.get("new_position", player["position"])
        landed_type = msg.get("landed_type", "normal")
        player["position"] = new_pos
        state["log"].append(f"📍 {player['name']} → casillero {new_pos}")
        events.append({"type": "moved", "player_id": player_id, "position": new_pos})
        state = set_pending_for_square(state, player_id, new_pos, landed_type)

    # ── show_card ─────────────────────────────────────────────────────────────
    elif action == "show_card":
        card      = msg.get("card")
        card_type = msg.get("card_type")
        effect    = msg.get("effect", {})
        log.info("show_card card_type=%s effect=%s", card_type, effect)

        if card_type == "pregunta":
            state["pending"] = {
                "type":      "waiting_answer",
                "player_id": player_id,
                "card":      card,
                "card_type": "pregunta",
                "effect":    {},
            }

        elif card_type == "castigo":
            can_salv = not player.get("salvacion_used", False)
            log.info("castigo card, can_use_salvacion=%s", can_salv)
            state["pending"] = {
                "type":               "waiting_salvacion",
                "player_id":          player_id,
                "card":               card,
                "card_type":          card_type,
                "effect":             effect,
                "can_use_salvacion":  can_salv,
                "expires_at":         time.time() + VETO_SALVACION_SECONDS,
            }

        elif card_type == "premio":
            state["pending"] = {
                "type":       "waiting_veto",
                "player_id":  player_id,
                "card":       card,
                "card_type":  card_type,
                "effect":     effect,
                "expires_at": time.time() + VETO_SALVACION_SECONDS,
            }

        else:
            # elecciones, eleccion_final — show card, player confirms to apply
            state["pending"] = {
                "type":      "show_card_no_confirm",
                "player_id": player_id,
                "card":      card,
                "card_type": card_type,
                "effect":    effect,
            }

    # ── confirm_card ──────────────────────────────────────────────────────────
    elif action == "confirm_card":
        p      = state.get("pending") or {}
        effect = p.get("effect", {})
        pid    = p.get("player_id", player_id)
        log.info("confirm_card for player %s effect=%s", pid, effect)
        state  = apply_effect_and_check_chain(state, pid, effect, events)

    # ── apply_effect ──────────────────────────────────────────────────────────
    elif action == "apply_effect":
        effect = msg.get("effect", {})
        state  = apply_effect_and_check_chain(state, player_id, effect, events)

    # ── answer_question ───────────────────────────────────────────────────────
    elif action == "answer_question":
        correct           = msg.get("correct", False)
        is_second         = msg.get("is_second", False)
        original_player_id = msg.get("original_player_id", player_id)
        delta             = 3 if correct else -3

        if correct:
            # Quien respondió bien avanza 3
            new_pos = max(0, min(99, player["position"] + delta))
            player["position"] = new_pos
            who = "segundo jugador" if is_second else player["name"]
            state["log"].append(f"❓ {player['name']} respondió correcta ✅ (+3) → casillero {new_pos}")
            events.append({"type": "question_result", "player_id": player_id, "correct": True, "revealed": True})
            ltype = sq_type(new_pos)
            if ltype not in ("normal", ""):
                state["pending"] = {
                    "type": "chain_delay", "player_id": player_id,
                    "position": new_pos, "square_type": ltype
                }
            else:
                state["pending"] = None
                state = advance_turn(state)

        else:
            if is_second:
                # Ambos responden mal → ambos retroceden 3
                orig_player = gp.get(original_player_id, player)
                
                # Retrocede el jugador original
                orig_new = max(0, orig_player["position"] - 3)
                orig_player["position"] = orig_new
                
                # Retrocede el segundo jugador (quien acaba de responder)
                second_new = max(0, player["position"] - 3)
                player["position"] = second_new

                state["log"].append(
                    f"❓ {player['name']} también respondió mal — "
                    f"{orig_player['name']} retrocede 3 → {orig_new}, "
                    f"{player['name']} retrocede 3 → {second_new}"
                )
                events.append({
                    "type": "question_result", "player_id": player_id,
                    "correct": False, "revealed": True,
                    "also_moved": original_player_id,
                })
                state["pending"] = None
                state = advance_turn(state)

            else:
                # Primer jugador responde mal → turno al siguiente
                turn_order = state["turn_order"]
                curr_idx   = state["current_turn_index"]
                next_idx   = (curr_idx + 1) % len(turn_order)
                next_pid   = turn_order[next_idx]
                state["log"].append(f"❓ {player['name']} respondió incorrectamente — turno a {gp[next_pid]['name']}")
                events.append({
                    "type": "question_result", "player_id": player_id,
                    "correct": False, "revealed": False  # resultado oculto al segundo jugador
                })
                current_pending = state.get("pending") or {}
                state["pending"] = {
                    "type":             "waiting_answer",
                    "player_id":        player_id,      # jugador original del turno
                    "second_player_id": next_pid,       # quien puede responder ahora
                    "card":             current_pending.get("card"),
                    "card_type":        "pregunta",
                    "effect":           {},
                    "first_wrong":      True,
                    "first_answer_idx": msg.get("answer_idx"),  # oculto al segundo
                }

    # ── use_salvacion ─────────────────────────────────────────────────────────
    elif action == "use_salvacion":
        p = state.get("pending") or {}
        if p.get("type") != "waiting_salvacion":
            log.warning("use_salvacion: wrong pending type %s", p.get("type"))
            return state, events
        if player.get("salvacion_used"):
            log.warning("use_salvacion: already used by %s", player_id)
            return state, events
        player["salvacion_used"] = True
        state["log"].append(f"🛡️ {player['name']} usó su Tarjeta de Salvación — castigo anulado")
        events.append({"type": "salvacion_used", "player_id": player_id})
        state["pending"] = None
        state = advance_turn(state)

    # ── use_veto ──────────────────────────────────────────────────────────────
    elif action == "use_veto":
        p = state.get("pending") or {}
        if p.get("type") != "waiting_veto":
            log.warning("use_veto: wrong pending type %s", p.get("type"))
            return state, events
        if not gp[player_id].get("veto_available"):
            log.warning("use_veto: not available for %s", player_id)
            return state, events
        gp[player_id]["veto_available"] = False
        target_name = gp.get(p.get("player_id"), {}).get("name", "?")
        state["log"].append(f"🚫 {player['name']} vetó el premio de {target_name}")
        events.append({"type": "veto_used", "by": player_id, "against": p.get("player_id")})
        state["pending"] = None
        state = advance_turn(state)

    # ── choose_rival ──────────────────────────────────────────────────────────
    elif action == "choose_rival":
        rival_id = msg.get("rival_id")
        cantidad = msg.get("cantidad", 3)
        if rival_id in gp:
            gp[rival_id]["position"] = max(0, gp[rival_id]["position"] - cantidad)
            state["log"].append(
                f"🎯 {player['name']} hizo retroceder {cantidad} a {gp[rival_id]['name']}"
            )
            events.append({"type": "rival_moved", "rival_id": rival_id, "delta": -cantidad})
        state["pending"] = None
        state = advance_turn(state)

    # ── dismiss_special ───────────────────────────────────────────────────────
    elif action == "dismiss_special":
        state["pending"] = None
        state = advance_turn(state)

    # ── trigger_chain ─────────────────────────────────────────────────────────
    elif action == "trigger_chain":
        pos   = msg.get("position", player["position"])
        ltype = sq_type(pos)
        log.info("trigger_chain pos=%d type=%s", pos, ltype)
        state = set_pending_for_square(state, player_id, pos, ltype)

    else:
        log.warning("Unknown action: %s", action)

    return state, events


# ─── State factory ────────────────────────────────────────────────────────────

def new_room_state(room_id: str) -> dict:
    return {
        "room_id":             room_id,
        "phase":               "lobby",
        "players":             [],
        "turn_order":          [],
        "current_turn_index":  0,
        "game_players":        {},
        "log":                 [],
        "pending":             None,
    }


def build_game_players(players_ready: list) -> dict:
    return {
        p["id"]: {
            "id":             p["id"],
            "name":           p["name"],
            "party":          p["party"],
            "position":       0,
            "loses_turn":     False,
            "salvacion_used": False,
            "veto_available": True,
            "situation_cards": [],
        }
        for p in players_ready
    }