import logging
import sys

# ─── Logging ──────────────────────────────────────────────────────────────────
def setup_logging():
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    logging.basicConfig(
        level=logging.DEBUG,
        format=fmt,
        handlers=[
            logging.StreamHandler(sys.stdout),
        ]
    )

setup_logging()

def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)

# ─── Constants ────────────────────────────────────────────────────────────────
DB_PATH = "game.db"
VETO_SALVACION_SECONDS = 10
MAX_PLAYERS = 4
ROOM_TTL_SECONDS = 3600  # rooms expire after 1 hour of inactivity
BULRICHIZACION_TARGET = 24 # Number to where the player must comeback if they move to number 56

# Square type map — mirrors boardConfig.js
SQUARE_TYPE_MAP: dict[int, str] = {}
for n in [8, 22, 38, 64, 78]:              SQUARE_TYPE_MAP[n] = "premio"
for n in [16, 30, 44, 70, 85]:             SQUARE_TYPE_MAP[n] = "castigo"
for n in [19, 35, 52, 67, 83]:             SQUARE_TYPE_MAP[n] = "elecciones"
for n in [4, 10, 17, 25, 29, 40, 47, 60, 74]: SQUARE_TYPE_MAP[n] = "pregunta"
SQUARE_TYPE_MAP[13] = "especial13"
SQUARE_TYPE_MAP[56] = "especial56"
SQUARE_TYPE_MAP[99] = "presidencial"

ELECTION_SQUARES = {19, 35, 52, 67, 83}