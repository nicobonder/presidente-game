import { SQUARE_TYPE, SPECIAL_SQUARES } from '../data/boardConfig';
import cards from '../data/cards.json';

// ─── Deck helpers ─────────────────────────────────────────────────────────────
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createDecks() {
  return {
    avance:        shuffle([...cards.avance]),
    premio:        shuffle([...cards.premio]),
    castigo:       shuffle([...cards.castigo]),
    elecciones:    shuffle([...cards.elecciones]),
    eleccion_final:shuffle([...cards.eleccion_final]),
    situacion:     shuffle([...cards.situacion]),
    pregunta:      shuffle([...cards.preguntas]),
    salvacion:     shuffle([...cards.salvacion]),
  };
}

// Draw from top, reshuffle if empty
export function drawCard(deck, type) {
  if (deck[type].length === 0) {
    const source = type === 'pregunta' ? cards.preguntas : cards[type];
    deck[type] = shuffle([...source]);
  }
  return deck[type].shift();
}

// ─── Movement ─────────────────────────────────────────────────────────────────
const MAX_SQUARE = 99;

/**
 * Move a player from `from` by `delta` squares (positive or negative).
 * Respects the "can't skip Elecciones" rule.
 * Returns { newPos, skippedElection }
 */
export function movePlayer(from, delta) {
  if (delta === 0) return { newPos: from, skippedElection: null };

  const direction = delta > 0 ? 1 : -1;
  let pos = from;
  let skippedElection = null;

  for (let step = 0; step < Math.abs(delta); step++) {
    const next = pos + direction;
    if (next > MAX_SQUARE) { pos = MAX_SQUARE; break; }
    if (next < 0) { pos = 0; break; }

    // Check if we're jumping OVER an election square (not landing on it)
    if (direction > 0) {
      const elecInPath = SPECIAL_SQUARES.elecciones.find(e => e === next && step < Math.abs(delta) - 1);
      if (elecInPath) {
        // Don't skip, stop here
        pos = elecInPath;
        skippedElection = elecInPath;
        break;
      }
    }
    pos = next;
  }

  return { newPos: Math.max(0, Math.min(MAX_SQUARE, pos)), skippedElection };
}

// ─── Square type helpers ───────────────────────────────────────────────────────
export function getSquareType(pos) {
  return SQUARE_TYPE[pos] || 'normal';
}

export function isElectionSquare(pos) {
  return getSquareType(pos) === 'elecciones' || getSquareType(pos) === 'presidencial';
}

// ─── Card effect resolver ──────────────────────────────────────────────────────
/**
 * Apply a card effect to a game state (immutable, returns updates).
 * Returns an object describing what happened:
 *   { message, positionDelta, losesTurn, needsRival, resetToStart,
 *     drawNext, isWin, isBallotage, requiresQuestion }
 */
export function resolveCardEffect(card, playerParty) {
  const result = {
    message: '',
    positionDelta: 0,
    losesTurn: false,
    needsRival: false,   // for "elige un rival"
    rivalDelta: 0,
    resetToStart: false,
    drawNext: null,      // 'avance' | 'premio' | 'castigo'
    isWin: false,
    isBallotage: false,
    requiresQuestion: false,
  };

  // Get partido-specific text
  const textoPartido = card.partido
    ? (card.partido['todos'] ?? card.partido[playerParty] ?? Object.values(card.partido)[0])
    : card.texto;

  result.message = textoPartido || card.texto || '';

  switch (card.efecto) {
    case 'avanza':
      result.positionDelta = card.cantidad;
      break;
    F
    case 'pierde_turno':
      result.losesTurn = true;
      break;
    case 'saca_premio':
      result.drawNext = 'premio';
      break;
    case 'saca_castigo':
      result.drawNext = 'castigo';
      break;
    case 'rivales_retroceden':
      result.positionDelta = 0;
      result.rivalDelta = -(card.cantidad);
      break;
    case 'elige_rival_retrocede':
      result.needsRival = true;
      result.rivalDelta = -(card.cantidad);
      break;
    case 'gana':
      result.isWin = true;
      break;
    case 'ballotage':
      result.isBallotage = true;
      result.losesTurn = true;
      break;
    default:
      break;
  }

  return result;
}

// ─── Salvation card matching ───────────────────────────────────────────────────
export function canUseSalvacion(salvacionCard, castigoCard) {
  if (!salvacionCard || !castigoCard) return false;
  return salvacionCard.salvacion_id === castigoCard.salvacion_id;
}

// ─── Dice ─────────────────────────────────────────────────────────────────────
export function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// ─── Initial state factory ────────────────────────────────────────────────────
export function createInitialGameState(roomId, players) {
  const decks = createDecks();

  // Each player gets 1 salvacion card and 1 veto card
  const playerStates = {};
  players.forEach(p => {
    playerStates[p.id] = {
      id: p.id,
      name: p.name,
      party: p.party,
      position: 0,
      salvacionCard: drawCard(decks, 'salvacion'),
      salvacionUsed: false,
      vetoCard: true,  // has veto available
      losesTurn: false,
      situacionCards: [],
      isActive: false,
    };
  });

  return {
    roomId,
    phase: 'playing',       // lobby | playing | finished
    players: playerStates,
    turnOrder: players.map(p => p.id),
    currentTurn: 0,         // index into turnOrder
    decks,
    log: [],
    winner: null,
    pendingAction: null,    // for UI: card being shown, rival choice, etc.
  };
}
