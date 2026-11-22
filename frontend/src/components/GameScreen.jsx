import React, { useState, useEffect, useRef } from 'react';
import Board from './Board';
import CardModal from './CardModal';
import HelpModal from './HelpModal';
import { PARTIES, SQUARE_TYPE, GAME_NAME } from '../data/boardConfig';
import { movePlayer, resolveCardEffect } from '../utils/gameLogic';
import cards from '../data/cards.json';
import '../style.css';

const DICE_FACES = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
const CHAIN_DELAY_MS = 1500;

export default function GameScreen({ roomState, playerId, send }) {
  const [showHelp, setShowHelp]       = useState(false);
  const [diceValue, setDiceValue]     = useState(null);
  const [diceVisible, setDiceVisible] = useState(false);
  const diceAnimRef                   = useRef(false);   // ref avoids stale-closure guard
  const [rolling, setRolling]         = useState(false);
  const [localDecks, setLocalDecks]   = useState(null);
  const [actionLog, setActionLog]     = useState([]);
  const [timer, setTimer]             = useState(null);
  const timerRef             = useRef(null);
  const processedPendingRef  = useRef(null);
  const diceIvRef = useRef(null);

  const gp              = roomState?.game_players || {};
  const turnOrder       = roomState?.turn_order || [];
  const currentTurnIdx  = roomState?.current_turn_index ?? 0;
  const currentPlayerId = turnOrder[currentTurnIdx];
  const isMyTurn        = currentPlayerId === playerId;
  const myState         = gp[playerId];
  const pending         = roomState?.pending;

  useEffect(() => {
    if (roomState?.log) setActionLog(roomState.log.slice(-20));
  }, [roomState?.log]);

  useEffect(() => {
    if (!localDecks) {
      const shuffle = a => [...a].sort(() => Math.random() - 0.5);
      setLocalDecks({
        premio:         shuffle([...cards.premio]),
        castigo:        shuffle([...cards.castigo]),
        elecciones:     shuffle([...cards.elecciones]),
        eleccion_final: shuffle([...cards.eleccion_final]),
        pregunta:       shuffle([...cards.preguntas]),
        avance:         shuffle([...cards.avance]),
        situacion:      shuffle([...cards.situacion]),
      });
    }
  }, []);

  function popCard(type) {
    if (!localDecks) return null;
    const deck = [...(localDecks[type] || [])];
    if (!deck.length) {
      const src = type==='pregunta' ? cards.preguntas : cards[type];
      deck.push(...[...src].sort(() => Math.random()-0.5));
    }
    const card = deck.shift();
    setLocalDecks(prev => ({ ...prev, [type]: deck }));
    return card;
  }

  // ── Veto/Salvacion countdown ───────────────────────────────────────────────
  useEffect(() => {
    const pt = pending?.type;
    if (pt === 'waiting_veto' || pt === 'waiting_salvacion') {
      const exp = pending.expires_at;
      if (!exp) return;
      if (timerRef.current) clearInterval(timerRef.current);
      const tick = () => {
        const rem = Math.ceil(exp - Date.now() / 1000);
        setTimer(Math.max(0, rem));
        if (rem <= 0) { clearInterval(timerRef.current); timerRef.current = null; }
      };
      tick();
      timerRef.current = setInterval(tick, 500);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setTimer(null);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pending?.type, pending?.expires_at]);

  // ── Handle pending ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pending || !localDecks) return;
    const key = JSON.stringify(pending);
    if (processedPendingRef.current === key) return;
    processedPendingRef.current = key;
    handlePending(pending);
  }, [pending, localDecks, isMyTurn]);

  function handlePending(p) {
    switch (p.type) {
      case 'show_dice':
        animateDice(p.dice, () => {
          if (p.player_id === playerId) {
            const pos = gp[playerId]?.position ?? 0;
            const { newPos } = movePlayer(pos, p.dice);
            const landedType = SQUARE_TYPE[newPos] || 'normal';
            send({ type:'game_action', action:'confirm_move',
              new_position:newPos, landed_type:landedType });
          }
        });
        break;
      
      case 'show_card_no_confirm':
        // Card shown to all, server auto-applies after 3s
        break;

      case 'draw_card':
        if (p.player_id === playerId) {
          drawAndSendCard(p.square_type);
        }
        break;

      case 'chain_delay':
        // After a card moved the player, wait briefly then trigger chained square
        if (p.player_id === playerId) {
          setTimeout(() => {
            send({ type:'game_action', action:'trigger_chain', position: p.position });
          }, CHAIN_DELAY_MS);
        }
        break;

      case 'waiting_answer':
      case 'waiting_veto':
      case 'waiting_salvacion':
      case 'show_card_then_apply':
      case 'special_effect':
        break;

      default:
        break;
    }
  }

  function animateDice(value, cb) {
    if (diceAnimRef.current) return; // avoid double animations
    diceAnimRef.current = true; setDiceVisible(true);
    let count=0;
    if (diceIvRef.current) { clearInterval(diceIvRef.current); diceIvRef.current = null; }
    const iv = setInterval(() => {
      setDiceValue(Math.ceil(Math.random()*6));
      if (++count > 15) {
        clearInterval(iv);
        diceIvRef.current = null;
        setDiceValue(value); diceAnimRef.current = false;
        setTimeout(() => { cb(); setTimeout(()=>setDiceVisible(false),600); }, 2500);
      }
    }, 80);
    diceIvRef.current = iv;
  }

  useEffect(() => {
    return () => {
      if (diceIvRef.current) {
        clearInterval(diceIvRef.current);
        diceIvRef.current = null;
      }
    };
  }, []);

  function drawAndSendCard(squareType) {
    const typeMap = {
      premio:'premio', castigo:'castigo',
      elecciones:'elecciones', presidencial:'eleccion_final', pregunta:'pregunta',
    };
    const deckType = typeMap[squareType];
    if (!deckType) { send({ type:'game_action', action:'apply_effect', effect:{type:'normal'} }); return; }
    const card = popCard(deckType);
    if (!card) return;
    const effect = resolveCardEffect(card, myState?.party);
    const serverEffect = effectToServer(effect);
    send({ type:'game_action', action:'show_card', card, card_type:deckType, effect:serverEffect });
  }

  function handleRollDice() {
    if (!isMyTurn || rolling) return;
    setRolling(true);
    processedPendingRef.current = null;
    send({ type:'game_action', action:'roll_dice' });
    setTimeout(() => setRolling(false), 5000);
  }

  // Card actions
  function handleCardConfirm(overrideAction) {
    if (overrideAction) { send({ type:'game_action', ...overrideAction }); return; }
    send({ type:'game_action', action:'confirm_card' });
  }
  function handleAnswer(correct, answerIdx, isSecond) {
    const p = roomState?.pending || {};
    send({
      type: 'game_action',
      action: 'answer_question',
      correct,
      answer_idx: answerIdx,
      is_second: isSecond,
      original_player_id: p.player_id,   // original turn player
    });
  }
  function handleUseSalvacion() {
    send({ type:'game_action', action:'use_salvacion' });
  }
  function handleUseVeto() {
    send({ type:'game_action', action:'use_veto' });
  }
  function handleDismissSpecial() {
    send({ type:'game_action', action:'dismiss_special' });
  }
  function handleChooseRival(rivalId, cantidad) {
    send({ type:'game_action', action:'choose_rival', rival_id:rivalId, cantidad });
  }

  function effectToServer(effect) {
    if (effect.isWin)             return { type:'win' };
    if (effect.isBallotage)       return { type:'ballotage' };
    if (effect.losesTurn)         return { type:'pierde_turno' };
    if (effect.positionDelta > 0) return { type:'avanza', cantidad:effect.positionDelta };
    if (effect.positionDelta < 0) return { type:'retrocede', cantidad:Math.abs(effect.positionDelta) };
    if (effect.rivalDelta)        return { type:'rivales_retroceden', cantidad:Math.abs(effect.rivalDelta) };
    if (effect.resetToStart)      return { type:'reset' };
    if (effect.drawNext)          return { type:'draw_next', deck:effect.drawNext };
    return { type:'normal' };
  }

  const isWinner    = roomState?.winner;
  const currentP    = gp[currentPlayerId];
  const rivals      = Object.values(gp).filter(p => p.id !== playerId);
  const pendingType = pending?.type;

  const showCard = ['waiting_veto','waiting_salvacion','waiting_answer','show_card_then_apply','show_card_no_confirm'].includes(pendingType);
  const showSpecial = pendingType === 'special_effect';

  const canSalvacion = (
    pendingType==='waiting_salvacion' &&
    pending?.player_id===playerId &&
    pending?.can_use_salvacion &&
    !myState?.salvacion_used  
  );

  const canVeto = (
    pendingType==='waiting_veto' &&
    pending?.player_id!==playerId &&
    myState?.veto_available
  );

  // For show_card_then_apply, only active player sees confirm button
  const isReadOnly = pendingType==='show_card_then_apply' && pending?.player_id!==playerId;
  const isActiveCard = pending?.player_id===playerId;
  const secondPlayerId = pending?.second_player_id;
  const isSecondPlayer = secondPlayerId === playerId && pending?.first_wrong;
  const isActivePlayer = isActiveCard || isSecondPlayer;

  return (
    <div className="game-screen">
      <button className="help-btn" onClick={()=>setShowHelp(true)}>?</button>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      <div className="main-container">

        {/* Board 81% */}
        <div className="board-container">
          <Board gamePlayers={gp} currentPlayerId={playerId} />
        </div>

        {/* Sidebar */}
        <div className="sidebar">

          {isWinner && (
            <div className="winner-div">
              <h3>🏆</h3>
              <h2>¡{gp[isWinner]?.name} ES PRESIDENTE!
              </h2>
              <div className="parties-container">
                {PARTIES[gp[isWinner]?.party]?.logo ? (
                  <img className = "logo-parties-winner" src={PARTIES[gp[isWinner]?.party].logo} alt={PARTIES[gp[isWinner]?.party]?.short}/>
                ) : null}
                <span>{PARTIES[gp[isWinner]?.party]?.name}</span>
              </div>
            </div>
          )}

          {/* Dice — visible to all */}
          {diceVisible && (
            <div className="dice-container">
              <p className="dice-label">
                {gp[pending?.player_id || currentPlayerId]?.name} tiró el dado
              </p>
              <div className="dice-rolling">
                {DICE_FACES[diceValue]||'🎲'}
              </div>
            </div>
          )}

          {/* Players */}
          <div className="players-container">
            <h3>
              Jugadores
            </h3>
            {turnOrder.map(pid => {
              const p=gp[pid]; if(!p) return null;
              const party=PARTIES[p.party];
              const isCurrent=pid===currentPlayerId;
              return (
                <div key={pid} className="players-separator" style={{
                  opacity:p.loses_turn?0.5:1,
                }}>
                  <div className="logo-parties-container"  style={{
                    border:isCurrent?'3px solid #fbbf24':'2px solid transparent',
                  }}>
                    {party?.logo ? (
                      <img className="logo-parties" src={party.logo} alt={party.short} />
                    ) : (
                      <span className="logo-parties-span">{party?.short?.[0] || '?'}</span>
                    )}
                  </div>
                  <div className="parties-info-container">
                    <div className="parties-name" style={{color:isCurrent?'#fbbf24':'white'}}>
                      {p.name}{pid===playerId?' (Sos vos)':''}{isCurrent?' ← turno':''}
                    </div>
                    <div className="parties-position-div">
                      <span className="parties-position">Casillero {p.position}</span>/99{p.loses_turn?' · ⏭️ Pierde turno':''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* My cards */}
          {myState && (
            <div className="my-cards-containers">
              <h3>
                Mis tarjetas
              </h3>
              <div className="my-card-items">
                <div className="salvation-card" style={{
                  background:myState.salvacion_used?'#1e293b':'#fff7ed',
                  color:myState.salvacion_used?'#4b5563':'#7c2d12',
                  border:`1px solid ${myState.salvacion_used?'#374151':'#f97316'}`,
                  textDecoration:myState.salvacion_used?'line-through':'none',
                }}>
                  🛡️ Salvación {myState.salvacion_used?'(usada)':'(disponible)'}
                </div>
                <div className="veto-card" style={{
                  background:myState.veto_available?'#fef2f2':'#1e293b',
                  color:myState.veto_available?'#7f1d1d':'#4b5563',
                  border:`1px solid ${myState.veto_available?'#ef4444':'#374151'}`,
                  textDecoration:myState.veto_available?'none':'line-through',
                }}>
                  🚫 Veto absoluto
                </div>
              </div>
            </div>
          )}

          {/* Roll button — only show when there is no active pending to avoid re-appearance glitches */}
          {isMyTurn && !isWinner && !showCard && !showSpecial && !diceVisible && !pending && (
            <div className="roll-btn-container">
              <p>¡Es tu turno!</p>
              <button className="dice-btn" onClick={handleRollDice} disabled={rolling} style={{              
                background:rolling?'#374151':'linear-gradient(135deg,#6366f1,#8b5cf6)',
                cursor:rolling?'not-allowed':'pointer',
                boxShadow:rolling?'none':'0 4px 20px rgba(99,102,241,0.4)',
              }}>
                {rolling?'🎲 Tirando...':'🎲 Tirar dado'}
              </button>
            </div>
          )}

          {!isMyTurn && !isWinner && !showCard && !showSpecial && (
            <div className ="player-turn-container">
              <p>
                Turno de <strong >{currentP?.name}</strong>
              </p>
            </div>
          )}

          {/* Game Story  */}
          <div className="game-story-container">
            <h3>Historial</h3>
            {[...actionLog].reverse().map((line,i)=>(
              <p key={i} style={{color:i===0?'#e2e8f0':'#64748b'}}>{line}</p>
            ))}
          </div>
        </div>
      </div>

      {/* Card modal — all players see it */}
      {showCard && pending?.card && (
        <CardModal
          card={pending.card}
          cardType={pending.card_type}
          playerParty={gp[pending.player_id]?.party}
          playerName={gp[pending.player_id]?.name}
          playerId={playerId}
          pending={pending}
          pendingType={pendingType}
          isActivePlayer={isActiveCard}
          timer={timer}
          canSalvacion={canSalvacion}
          canVeto={canVeto}
          rivals={rivals}
          readOnly={isReadOnly}
          onAnswer={handleAnswer}
          onConfirm={handleCardConfirm}
          onUseSalvacion={handleUseSalvacion}
          onUseVeto={handleUseVeto}
          onChooseRival={handleChooseRival}
          onClose={()=>{}}
        />
      )}

      {/* Special effect (13, 56) */}
      {showSpecial && pending && (
        <div className="special-effect-container">
          <div className="special-effect-div">
            <div className="special-effect-emoji">{pending.emoji}</div>
            <p>
              {pending.message}
            </p>
            {isMyTurn
              ? <button className="continue-btn" onClick={handleDismissSpecial}>Continuar</button>
              : <p className="continue-txt">Esperando que {currentP?.name} continúe...</p>
            }
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}