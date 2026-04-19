import React, { useState, useEffect } from 'react';
import Board from './Board';
import CardModal from './CardModal';
import HelpModal from './HelpModal';
import { PARTIES, SQUARE_TYPE } from '../data/boardConfig';
import { movePlayer, drawCard, resolveCardEffect, canUseSalvacion } from '../utils/gameLogic';
import cards from '../data/cards.json';

export default function GameScreen({ roomState, playerId, send }) {
  const [showHelp, setShowHelp] = useState(false);
  const [diceValue, setDiceValue] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [activeCard, setActiveCard] = useState(null);     // { card, type }
  const [pendingEffect, setPendingEffect] = useState(null);
  const [localDecks, setLocalDecks] = useState(null);     // client-side deck for card drawing
  const [actionLog, setActionLog] = useState([]);
  const [diceAnim, setDiceAnim] = useState(false);

  const gp = roomState?.game_players || {};
  const turnOrder = roomState?.turn_order || [];
  const currentTurnIdx = roomState?.current_turn_index ?? 0;
  const currentPlayerId = turnOrder[currentTurnIdx];
  const isMyTurn = currentPlayerId === playerId;
  const myState = gp[playerId];
  const pending = roomState?.pending;

  // Sync log
  useEffect(() => {
    if (roomState?.log) setActionLog(roomState.log.slice(-20));
  }, [roomState?.log]);

  // Initialize local decks (mirrors server shuffle; in production decks are on server)
  useEffect(() => {
    if (!localDecks) {
      const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
      setLocalDecks({
        premio:        shuffle([...cards.premio]),
        castigo:       shuffle([...cards.castigo]),
        elecciones:    shuffle([...cards.elecciones]),
        eleccion_final:shuffle([...cards.eleccion_final]),
        pregunta:      shuffle([...cards.preguntas]),
        avance:        shuffle([...cards.avance]),
        situacion:     shuffle([...cards.situacion]),
      });
    }
  }, []);

  function popCard(type) {
    if (!localDecks) return null;
    const deck = [...(localDecks[type] || [])];
    if (deck.length === 0) {
      // Reshuffle
      const source = type === 'pregunta' ? cards.preguntas : cards[type];
      deck.push(...[...source].sort(() => Math.random() - 0.5));
    }
    const card = deck.shift();
    setLocalDecks(prev => ({ ...prev, [type]: deck }));
    return card;
  }

  // ── Handle pending actions from server ─────────────────────────────────────
  useEffect(() => {
    if (!pending || !isMyTurn || !localDecks) return;
    handlePending(pending);
  }, [pending, isMyTurn, localDecks]);

  function handlePending(p) {
    if (p.type === 'movement') {
      // Server rolled dice, we animate and move
      const dice = p.dice;
      animateDice(dice, () => {
        const pos = gp[playerId]?.position ?? 0;
        const { newPos, skippedElection } = movePlayer(pos, dice);
        const landedType = SQUARE_TYPE[newPos] || 'normal';
        send({
          type: 'game_action',
          action: 'confirm_move',
          new_position: newPos,
          landed_type: landedType,
        });
      });
    } else if (p.type === 'square_effect') {
      triggerSquareEffect(p.square_type, p.position);
    }
  }

  function animateDice(value, cb) {
    setDiceAnim(true);
    let count = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.ceil(Math.random() * 6));
      count++;
      if (count > 8) {
        clearInterval(interval);
        setDiceValue(value);
        setDiceAnim(false);
        setTimeout(cb, 400);
      }
    }, 80);
  }

  function triggerSquareEffect(type, pos) {
    switch (type) {
      case 'premio': {
        const card = popCard('premio');
        setActiveCard({ card, type: 'premio' });
        break;
      }
      case 'castigo': {
        const card = popCard('castigo');
        setActiveCard({ card, type: 'castigo' });
        break;
      }
      case 'elecciones': {
        const card = popCard('elecciones');
        setActiveCard({ card, type: 'elecciones' });
        break;
      }
      case 'presidencial': {
        const card = popCard('eleccion_final');
        setActiveCard({ card, type: 'eleccion_final' });
        break;
      }
      case 'pregunta': {
        const card = popCard('pregunta');
        setActiveCard({ card, type: 'pregunta' });
        break;
      }
      case 'especial13': {
        send({ type: 'game_action', action: 'apply_card_effect',
          effect: { type: 'retrocede', cantidad: 5 } });
        break;
      }
      case 'especial56': {
        send({ type: 'game_action', action: 'apply_card_effect',
          effect: { type: 'reset' } });
        break;
      }
      default:
        send({ type: 'game_action', action: 'apply_card_effect', effect: { type: 'normal' } });
    }
  }

  // ── Dice roll ──────────────────────────────────────────────────────────────
  function handleRollDice() {
    if (!isMyTurn || rolling) return;
    setRolling(true);
    send({ type: 'game_action', action: 'roll_dice' });
    setTimeout(() => setRolling(false), 3000);
  }

  // ── Card confirm ───────────────────────────────────────────────────────────
  function handleCardConfirm(overrideAction) {
    if (!activeCard) return;
    const { card, type } = activeCard;
    setActiveCard(null);

    if (overrideAction) {
      send({ type: 'game_action', ...overrideAction });
      return;
    }

    const effect = resolveCardEffect(card, myState?.party);

    // Handle draw-next
    if (effect.drawNext) {
      const nextCard = popCard(effect.drawNext);
      setActiveCard({ card: nextCard, type: effect.drawNext });
      return;
    }

    // Handle rival selection
    if (effect.needsRival) {
      // Card modal already shows rival buttons; handled above
      return;
    }

    // Translate effect to server action
    const serverEffect = effectToServer(effect);
    send({ type: 'game_action', action: 'apply_card_effect', effect: serverEffect });
  }

  function effectToServer(effect) {
    if (effect.isWin) return { type: 'win' };
    if (effect.isBallotage) return { type: 'ballotage' };
    if (effect.losesTurn) return { type: 'pierde_turno' };
    if (effect.positionDelta > 0) return { type: 'avanza', cantidad: effect.positionDelta };
    if (effect.positionDelta < 0) return { type: 'retrocede', cantidad: Math.abs(effect.positionDelta) };
    if (effect.rivalDelta) return { type: 'rivales_retroceden', cantidad: Math.abs(effect.rivalDelta) };
    if (effect.resetToStart) return { type: 'reset' };
    return { type: 'normal' };
  }

  // ── Question answer ────────────────────────────────────────────────────────
  function handleAnswer(correct) {
    setActiveCard(null);
    send({ type: 'game_action', action: 'answer_question', correct });
  }

  // ── Salvacion ──────────────────────────────────────────────────────────────
  function handleUseSalvacion() {
    if (!myState || myState.salvacion_used) return;
    if (!activeCard || activeCard.type !== 'castigo') return;
    const salvCard = myState.salvacionCard;
    if (!canUseSalvacion(salvCard, activeCard.card)) {
      alert('Tu Tarjeta de Salvación no aplica a este castigo');
      return;
    }
    setActiveCard(null);
    send({ type: 'game_action', action: 'use_salvacion' });
  }

  // ── Veto ───────────────────────────────────────────────────────────────────
  function handleVeto() {
    if (!myState?.veto_available) return;
    const currentP = gp[currentPlayerId];
    send({ type: 'game_action', action: 'use_veto', target_id: currentPlayerId });
    setActiveCard(null);
  }

  const rivals = Object.values(gp).filter(p => p.id !== playerId);
  const currentPlayerState = gp[currentPlayerId];
  const isWinner = roomState?.winner;

  const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
      fontFamily: 'system-ui, sans-serif',
      position: 'relative',
    }}>
      {/* Help button */}
      <button onClick={() => setShowHelp(true)} style={{
        position: 'fixed', top: 16, right: 16, zIndex: 500,
        width: 40, height: 40, borderRadius: '50%',
        background: '#334155', border: '2px solid #475569',
        color: 'white', fontWeight: 800, fontSize: 18, cursor: 'pointer',
      }}>?</button>

      <div style={{ display: 'flex', gap: 16, padding: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Board */}
        <div style={{ flex: '0 0 auto' }}>
          <Board gamePlayers={gp} currentPlayerId={playerId} />
        </div>

        {/* Sidebar */}
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Winner banner */}
          {isWinner && (
            <div style={{
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              borderRadius: 12, padding: 20, textAlign: 'center',
              boxShadow: '0 0 40px rgba(251,191,36,0.4)',
            }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
              <div style={{ fontWeight: 900, fontSize: 22, color: '#1c1917' }}>
                ¡{gp[isWinner]?.name} ES PRESIDENTE!
              </div>
              <div style={{ fontSize: 14, color: '#44403c', marginTop: 4 }}>
                {PARTIES[gp[isWinner]?.party]?.emoji} {PARTIES[gp[isWinner]?.party]?.name}
              </div>
            </div>
          )}

          {/* Players status */}
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
              Jugadores
            </h3>
            {turnOrder.map((pid, idx) => {
              const p = gp[pid];
              if (!p) return null;
              const party = PARTIES[p.party];
              const isCurrent = pid === currentPlayerId;
              return (
                <div key={pid} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  opacity: p.loses_turn ? 0.5 : 1,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: party?.color || '#666',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, border: isCurrent ? '3px solid #fbbf24' : '2px solid transparent',
                  }}>
                    {party?.emoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: isCurrent ? '#fbbf24' : 'white', fontWeight: 600, fontSize: 13 }}>
                      {p.name} {pid === playerId ? '(vos)' : ''}
                      {isCurrent ? ' ← turno' : ''}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 11 }}>
                      Casillero {p.position} / 99
                      {p.loses_turn ? ' · ⏭️ Pierde turno' : ''}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: 50, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(p.position / 99) * 100}%`, height: '100%', background: party?.color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* My cards */}
          {myState && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16 }}>
              <h3 style={{ color: '#94a3b8', margin: '0 0 10px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
                Mis tarjetas
              </h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 12,
                  background: myState.salvacion_used ? '#1e293b' : '#fff7ed',
                  color: myState.salvacion_used ? '#4b5563' : '#7c2d12',
                  border: `1px solid ${myState.salvacion_used ? '#374151' : '#f97316'}`,
                  textDecoration: myState.salvacion_used ? 'line-through' : 'none',
                }}>
                  🛡️ Salvación: {myState.salvacionCard?.salvacion_id || '?'}
                </div>
                <div style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 12,
                  background: myState.veto_available ? '#fef2f2' : '#1e293b',
                  color: myState.veto_available ? '#7f1d1d' : '#4b5563',
                  border: `1px solid ${myState.veto_available ? '#ef4444' : '#374151'}`,
                  textDecoration: myState.veto_available ? 'none' : 'line-through',
                }}>
                  🚫 Veto absoluto
                </div>
              </div>
            </div>
          )}

          {/* Dice & Action */}
          {isMyTurn && !isWinner && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <p style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 12, fontSize: 14 }}>
                ¡Es tu turno!
              </p>
              {diceValue && (
                <div style={{
                  fontSize: 56, marginBottom: 12,
                  animation: diceAnim ? 'spin 0.1s linear infinite' : 'none',
                  display: 'inline-block',
                }}>
                  {DICE_FACES[diceValue]}
                </div>
              )}
              {!pending && (
                <button onClick={handleRollDice} disabled={rolling}
                  style={{
                    padding: '12px 28px', borderRadius: 10,
                    background: rolling ? '#374151' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: 'white', border: 'none',
                    fontWeight: 800, fontSize: 16, cursor: rolling ? 'not-allowed' : 'pointer',
                    boxShadow: rolling ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
                    width: '100%',
                  }}>
                  {rolling ? '🎲 Tirando...' : '🎲 Tirar dado'}
                </button>
              )}
              {pending?.type === 'square_effect' && (
                <p style={{ color: '#94a3b8', fontSize: 13 }}>Resolviendo casillero...</p>
              )}
            </div>
          )}

          {!isMyTurn && !isWinner && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <p style={{ color: '#475569', fontSize: 13 }}>
                Turno de <strong style={{ color: 'white' }}>{currentPlayerState?.name}</strong>
              </p>
              {/* Non-active player veto option */}
              {activeCard?.type === 'premio' && myState?.veto_available && (
                <button onClick={handleVeto}
                  style={{ marginTop: 8, padding: '8px 16px', background: '#dc2626', color: 'white',
                    border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  🚫 Usar VETO ABSOLUTO
                </button>
              )}
            </div>
          )}

          {/* Action log */}
          <div style={{
            background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12,
            maxHeight: 160, overflowY: 'auto',
          }}>
            <h3 style={{ color: '#475569', margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase' }}>
              Historial
            </h3>
            {[...actionLog].reverse().map((line, i) => (
              <p key={i} style={{ color: i === 0 ? '#e2e8f0' : '#64748b', fontSize: 12, margin: '2px 0' }}>
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Card Modal */}
      {activeCard && (
        <CardModal
          card={activeCard.card}
          cardType={activeCard.type}
          playerParty={myState?.party}
          onAnswer={handleAnswer}
          onConfirm={handleCardConfirm}
          onVeto={handleVeto}
          rivals={rivals}
          canVeto={myState?.veto_available && activeCard.type === 'premio' && !isMyTurn}
          onClose={() => {}}  // can't close cards - must resolve
        />
      )}

      {/* Help Modal */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
