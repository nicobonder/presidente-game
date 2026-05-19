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
VETO_PREMIO_SECONDS = 4        # rival has 4s to veto a Premio card
MAX_PLAYERS = 4
ROOM_TTL_SECONDS = 3600  # rooms expire after 1 hour of inactivity
BULRICHIZACION_TARGET = 45 # Number to where the player must comeback if they move to number 56

# Square type map — mirrors boardConfig.js
SQUARE_TYPE_MAP: dict[int, str] = {}
for n in [7, 18, 23, 38, 65, 78, 92]:      SQUARE_TYPE_MAP[n] = "premio"
for n in [30, 44, 70, 85, 91]:             SQUARE_TYPE_MAP[n] = "castigo"
for n in [19, 35, 52, 66, 83]:             SQUARE_TYPE_MAP[n] = "elecciones"
for n in [3, 9, 17, 25, 40, 48, 60, 74, 86, 90]: SQUARE_TYPE_MAP[n] = "pregunta"
SQUARE_TYPE_MAP[13] = "especial13"
SQUARE_TYPE_MAP[56] = "especial56"
SQUARE_TYPE_MAP[99] = "presidencial"

ELECTION_SQUARES = {19, 35, 52, 66, 83}