import React, { useState, useEffect, useRef } from 'react';
import Board from './Board';
import CardModal from './CardModal';
import HelpModal from './HelpModal';
import { PARTIES, SQUARE_TYPE, GAME_NAME } from '../data/boardConfig';
import { movePlayer, resolveCardEffect } from '../utils/gameLogic';
import cards from '../data/cards.json';

const DICE_FACES = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
const CHAIN_DELAY_MS = 1500;

export default function GameScreen({ roomState, playerId, send }) {
  const [showHelp, setShowHelp]       = useState(false);
  const [diceValue, setDiceValue]     = useState(null);
  const [diceVisible, setDiceVisible] = useState(false);
  const [diceAnim, setDiceAnim]       = useState(false);
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
    if (diceAnim) return; // avoid double animations
    setDiceAnim(true); setDiceVisible(true);
    let count=0;
    if (diceIvRef.current) { clearInterval(diceIvRef.current); diceIvRef.current = null; }
    const iv = setInterval(() => {
      setDiceValue(Math.ceil(Math.random()*6));
      if (++count > 15) {
        clearInterval(iv);
        diceIvRef.current = null;
        setDiceValue(value); setDiceAnim(false);
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
    <div style={{
      minHeight:'100vh',
      background:'linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)',
      fontFamily:'system-ui,sans-serif',
    }}>
      <button onClick={()=>setShowHelp(true)} style={{
        position:'fixed',top:16,right:16,zIndex:500,
        width:40,height:40,borderRadius:'50%',
        background:'#334155',border:'2px solid #475569',
        color:'white',fontWeight:800,fontSize:18,cursor:'pointer',
      }}>?</button>

      <div style={{ display:'flex', gap:16, padding:16, flexWrap:'wrap', alignItems:'flex-start' }}>

        {/* Board 75% */}
        <div style={{ flex:'0 0 75%', minWidth:0 }}>
          <Board gamePlayers={gp} currentPlayerId={playerId} />
        </div>

        {/* Sidebar */}
        <div style={{ flex:1, minWidth:220, display:'flex', flexDirection:'column', gap:12 }}>

          {isWinner && (
            <div style={{
              background:'linear-gradient(135deg,#fbbf24,#f59e0b)',
              borderRadius:12,padding:20,textAlign:'center',
              boxShadow:'0 0 40px rgba(251,191,36,0.4)',
            }}>
              <div style={{fontSize:40}}>🏆</div>
              <div style={{fontWeight:900,fontSize:20,color:'#1c1917',marginTop:8}}>
                ¡{gp[isWinner]?.name} ES PRESIDENTE!
              </div>
              <div style={{fontSize:13,color:'#44403c',marginTop:4,display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}>
                {PARTIES[gp[isWinner]?.party]?.logo ? (
                  <img src={PARTIES[gp[isWinner]?.party].logo} alt={PARTIES[gp[isWinner]?.party]?.short} style={{width:20,height:20,borderRadius:'50%'}} />
                ) : null}
                <span>{PARTIES[gp[isWinner]?.party]?.name}</span>
              </div>
            </div>
          )}

          {/* Dice — visible to all */}
          {diceVisible && (
            <div style={{
              background:'rgba(255,255,255,0.08)',borderRadius:12,
              padding:16,textAlign:'center',
              border:'2px solid rgba(99,102,241,0.4)',
            }}>
              <p style={{color:'#94a3b8',fontSize:12,marginBottom:6}}>
                {gp[pending?.player_id || currentPlayerId]?.name} tiró el dado
              </p>
              <div style={{fontSize:72,lineHeight:1,display:'inline-block'}}>
                {DICE_FACES[diceValue]||'🎲'}
              </div>
            </div>
          )}

          {/* Players */}
          <div style={{background:'rgba(255,255,255,0.05)',borderRadius:12,padding:16}}>
            <h3 style={{color:'#94a3b8',margin:'0 0 12px',fontSize:13,textTransform:'uppercase',letterSpacing:1}}>
              Jugadores
            </h3>
            {turnOrder.map(pid => {
              const p=gp[pid]; if(!p) return null;
              const party=PARTIES[p.party];
              const isCurrent=pid===currentPlayerId;
              return (
                <div key={pid} style={{
                  display:'flex',alignItems:'center',gap:10,padding:'8px 0',
                  borderBottom:'1px solid rgba(255,255,255,0.05)',
                  opacity:p.loses_turn?0.5:1,
                }}>
                  <div style={{
                    width:45,height:45,borderRadius:'50%',
                    background:party?.color||'#666',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:16,border:isCurrent?'3px solid #fbbf24':'2px solid transparent',
                    overflow:'hidden'
                  }}>
                    {party?.logo ? (
                      <img src={party.logo} alt={party.short} style={{width:42,height:42,borderRadius:'50%'}} />
                    ) : (
                      <span style={{color:'white',fontWeight:800}}>{party?.short?.[0] || '?'}</span>
                    )}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:isCurrent?'#fbbf24':'white',fontWeight:600,fontSize:13}}>
                      {p.name}{pid===playerId?' (vos)':''}{isCurrent?' ← turno':''}
                    </div>
                    <div style={{color:'#64748b',fontSize:12}}>
                      <span style={{fontWeight:600, color:'#fff'}}>Casillero {p.position}</span>/99{p.loses_turn?' · ⏭️ Pierde turno':''}
                    </div>
                  </div>
                  <div style={{width:50,height:6,background:'#1e293b',borderRadius:3,overflow:'hidden'}}>
                    <div style={{width:`${(p.position/99)*100}%`,height:'100%',background:party?.color}}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* My cards */}
          {myState && (
            <div style={{background:'rgba(255,255,255,0.05)',borderRadius:12,padding:16}}>
              <h3 style={{color:'#94a3b8',margin:'0 0 10px',fontSize:13,textTransform:'uppercase',letterSpacing:1}}>
                Mis tarjetas
              </h3>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <div style={{
                  padding:'6px 10px',borderRadius:8,fontSize:12,
                  background:myState.salvacion_used?'#1e293b':'#fff7ed',
                  color:myState.salvacion_used?'#4b5563':'#7c2d12',
                  border:`1px solid ${myState.salvacion_used?'#374151':'#f97316'}`,
                  textDecoration:myState.salvacion_used?'line-through':'none',
                }}>
                  🛡️ Salvación {myState.salvacion_used?'(usada)':'(disponible)'}
                </div>
                <div style={{
                  padding:'6px 10px',borderRadius:8,fontSize:12,
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

          {/* Roll button */}
          {isMyTurn && !isWinner && !showCard && !showSpecial && !diceVisible && (
            <div style={{background:'rgba(255,255,255,0.05)',borderRadius:12,padding:16,textAlign:'center'}}>
              <p style={{color:'#fbbf24',fontWeight:700,marginBottom:12,fontSize:14}}>¡Es tu turno!</p>
              {!pending && (
                <button onClick={handleRollDice} disabled={rolling} style={{
                  padding:'12px 28px',borderRadius:10,width:'100%',
                  background:rolling?'#374151':'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  color:'white',border:'none',fontWeight:800,fontSize:16,
                  cursor:rolling?'not-allowed':'pointer',
                  boxShadow:rolling?'none':'0 4px 20px rgba(99,102,241,0.4)',
                }}>
                  {rolling?'🎲 Tirando...':'🎲 Tirar dado'}
                </button>
              )}
              {pending && (
                <p style={{color:'#94a3b8',fontSize:13}}>Procesando...</p>
              )}
            </div>
          )}

          {!isMyTurn && !isWinner && !showCard && !showSpecial && (
            <div style={{background:'rgba(255,255,255,0.03)',borderRadius:12,padding:16,textAlign:'center'}}>
              <p style={{color:'#475569',fontSize:13}}>
                Turno de <strong style={{color:'white'}}>{currentP?.name}</strong>
              </p>
            </div>
          )}

          {/* Log */}
          <div style={{background:'rgba(0,0,0,0.3)',borderRadius:12,padding:12,maxHeight:160,overflowY:'auto'}}>
            <h3 style={{color:'#475569',margin:'0 0 8px',fontSize:11,textTransform:'uppercase'}}>Historial</h3>
            {[...actionLog].reverse().map((line,i)=>(
              <p key={i} style={{color:i===0?'#e2e8f0':'#64748b',fontSize:12,margin:'2px 0'}}>{line}</p>
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
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',
          display:'flex',alignItems:'center',justifyContent:'center',
          zIndex:1000,backdropFilter:'blur(4px)',
        }}>
          <div style={{
            background:'#1e293b',border:'3px solid #6b21a8',borderRadius:20,
            padding:32,textAlign:'center',maxWidth:360,
            boxShadow:'0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{fontSize:56,marginBottom:12}}>{pending.emoji}</div>
            <p style={{color:'white',fontSize:16,fontWeight:700,lineHeight:1.5,marginBottom:20}}>
              {pending.message}
            </p>
            {isMyTurn
              ? <button onClick={handleDismissSpecial} style={{
                  padding:'10px 28px',background:'#6b21a8',color:'white',
                  border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',
                }}>Continuar</button>
              : <p style={{color:'#64748b',fontSize:13}}>Esperando que {currentP?.name} continúe...</p>
            }
          </div>
        </div>
      )}

      {showHelp && <HelpModal onClose={()=>setShowHelp(false)} />}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}