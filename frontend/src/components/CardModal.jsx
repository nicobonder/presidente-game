import React, { useState } from 'react';
import { PARTIES } from '../data/boardConfig';

const TYPE_STYLES = {
  premio:         { bg: '#fef9c3', border: '#eab308', header: '#854d0e', icon: '⭐', title: 'Tarjeta de Premio' },
  castigo:        { bg: '#fee2e2', border: '#ef4444', header: '#7f1d1d', icon: '💀', title: 'Tarjeta de Castigo' },
  elecciones:     { bg: '#dbeafe', border: '#3b82f6', header: '#1e3a8a', icon: '🗳️', title: 'Tarjeta de Elecciones' },
  eleccion_final: { bg: '#f0fdf4', border: '#16a34a', header: '#14532d', icon: '🏛️', title: 'Elecciones Presidenciales' },
  pregunta:       { bg: '#e0e7ff', border: '#6366f1', header: '#3730a3', icon: '❓', title: 'Pregunta' },
  avance:         { bg: '#f0fdf4', border: '#22c55e', header: '#15803d', icon: '🚀', title: 'Tarjeta de Avance' },
  situacion:      { bg: '#fdf4ff', border: '#a855f7', header: '#6b21a8', icon: '🃏', title: 'Tarjeta de Situación' },
  salvacion:      { bg: '#fff7ed', border: '#f97316', header: '#7c2d12', icon: '🛡️', title: 'Tarjeta de Salvación' },
};

// ─── Question Card ─────────────────────────────────────────────────────────────
function QuestionCard({ card, playerId, pending, isActivePlayer, playerName, onAnswer }) {
  const [selected, setSelected]   = useState(null);
  const [revealed, setRevealed]   = useState(false);
  const style = TYPE_STYLES.pregunta;

  const isSecondPlayer  = pending?.second_player_id === playerId && pending?.first_wrong;
  const isOriginalPlayer = pending?.player_id === playerId && !pending?.first_wrong;
  const canAnswer       = isActivePlayer || isSecondPlayer;
  const firstWrong      = pending?.first_wrong;

  function handleChoice(idx) {
    if (revealed || !canAnswer) return;
    setSelected(idx);
    setRevealed(true);
    const correct = idx === card.correcta;
    setTimeout(() => onAnswer(correct, idx, isSecondPlayer), 1200);
  }

  return (
    <div style={cardContainer(style)}>
      <CardHeader style={style} playerName={playerName} isActivePlayer={isActivePlayer} />

      {firstWrong && isSecondPlayer && (
        <div style={{
          background:'#fef3c7', border:'1px solid #f59e0b',
          borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#92400e'
        }}>
          ⚡ El jugador anterior respondió mal. ¡Tu oportunidad!
        </div>
      )}

      <p style={{ fontWeight:700, fontSize:15, marginBottom:16, color:'#1e1b4b', lineHeight:1.5 }}>
        {card.pregunta}
      </p>

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {card.opciones.map((op, i) => {
          let bg='white', border='#c7d2fe', color='#312e81';

          if (revealed) {
            if (i === card.correcta)                       { bg='#dcfce7'; border='#16a34a'; color='#14532d'; }
            else if (i === selected && i !== card.correcta){ bg='#fee2e2'; border='#dc2626'; color='#7f1d1d'; }
          }

          // For second player: hide which answer first player chose
          const isDisabled = revealed || !canAnswer;

          return (
            <button key={i} onClick={() => handleChoice(i)} disabled={isDisabled}
              style={{
                padding:'10px 14px', border:`2px solid ${border}`,
                borderRadius:8, background:bg, color,
                fontWeight:600, fontSize:13,
                cursor:isDisabled ? 'default' : 'pointer',
                textAlign:'left', transition:'all 0.2s',
              }}>
              {String.fromCharCode(65+i)}. {op}
            </button>
          );
        })}
      </div>

      {!canAnswer && !revealed && (
        <p style={{marginTop:12,color:'#64748b',fontSize:12,textAlign:'center'}}>
          {firstWrong
            ? 'Esperando que el siguiente jugador responda...'
            : 'Esperando respuesta...'}
        </p>
      )}

      {revealed && (
        <p style={{
          marginTop:14, fontWeight:700, fontSize:14, textAlign:'center',
          color: selected === card.correcta ? '#16a34a' : '#dc2626'
        }}>
          {selected === card.correcta
            ? '✅ ¡Correctooo!'
            : '❌ Incorrecto 🤦🏻'}
        </p>
      )}
    </div>
  );
}

// ─── Standard Card ─────────────────────────────────────────────────────────────
function StandardCard({ card, cardType, playerParty, playerName, isActivePlayer,
  timer, pendingType, canSalvacion, canVeto,
  onConfirm, onUseSalvacion, onUseVeto, rivals, onChooseRival }) {
  const style = TYPE_STYLES[cardType] || TYPE_STYLES.avance;

  // Get party-specific text
  const textoPartido = card.partido
    ? (card.partido['todos'] ?? card.partido[playerParty] ?? Object.values(card.partido)[0])
    : card.texto;

  const effectLabel = getEffectLabel(card);

  return (
    <div style={cardContainer(style)}>
      <CardHeader style={style} />
      {playerParty && card.partido && !card.partido['todos'] && (
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          {PARTIES[playerParty]?.logo && (
            <img src={PARTIES[playerParty].logo} alt={PARTIES[playerParty]?.short} style={{ width: 16, height: 16, borderRadius: '50%' }} />
          )}
          {PARTIES[playerParty]?.name}
        </div>
      )}
      <p style={{ fontSize: 14, marginBottom: 14, color: '#1e293b', lineHeight: 1.6, fontWeight: 500 }}>
        {textoPartido}
      </p>
      <div style={{
        background: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: '8px 12px',
        fontWeight: 800, fontSize: 15, color: style.header, textAlign: 'center', marginBottom: 16,
      }}>
        {effectLabel}
      </div>

      {/* Rival selector */}
      {card.efecto === 'elige_rival_retrocede' && rivals && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#475569' }}>
            Elegí un rival para hacer retroceder hasta {card.cantidad} casilleros:
          </p>
          {rivals.map(r => (
            <button key={r.id} onClick={() => onConfirm({ action: 'choose_rival', rival_id: r.id, cantidad: card.cantidad })}
              style={{ ...actionBtn(PARTIES[r.party]?.color || '#666'), display: 'flex', alignItems: 'center', gap: 8 }}>
              {PARTIES[r.party]?.logo
                ? <img src={PARTIES[r.party].logo} alt={PARTIES[r.party]?.short} style={{ width: 22, height: 22, borderRadius: '50%' }} />
                : null
              }
              {r.name}
            </button>
          ))}
        </div>
      )}

      {canSalvacion && (
        <button onClick={onUseSalvacion} style={actionBtn('#f97316')}>
          🛡️ Usar Tarjeta de Salvación
        </button>
      )}

      {canVeto && !(cardType === 'premio' && isActivePlayer) && (
        <button onClick={onUseVeto} style={actionBtn('#dc2626')}>
          🚫 Usar VETO ABSOLUTO
        </button>
      )}

      {isActivePlayer &&
        card.efecto !== 'elige_rival_retrocede' &&
        cardType !== 'elecciones' &&
        cardType !== 'eleccion_final' &&
        cardType !== 'premio' &&
        pendingType !== 'show_card_no_confirm' && (
        <button onClick={() => onConfirm()} style={actionBtn('#0f172a')}>
          {cardType === 'castigo'
            ? (timer > 0 ? `Aceptar castigo (${timer}s)` : 'Aceptar castigo')
            : 'Aceptar'}
        </button>
      )}

      {isActivePlayer && cardType === 'premio' && pendingType === 'waiting_veto' && (
        <p style={{ color: '#1e3a8a', fontSize: 13, textAlign: 'center', marginTop: 8, fontWeight: 600 }}>
          {timer > 0 ? `⭐ Premio se aplica en ${timer}s…` : '⭐ Aplicando premio…'}
        </p>
      )}

      {pendingType === 'show_card_no_confirm' && (
        <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
          Aplicando en 3 segundos...
        </p>
      )}

      {!isActivePlayer && !canVeto && pendingType !== 'show_card_no_confirm' && (
        <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
          {pendingType === 'waiting_veto'
            ? (timer !== null && timer > 0 ? `Tenés ${timer}s para usar el Veto` : 'Tiempo agotado')
            : 'Observando...'}
        </p>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────── ──────────────────────
function CardHeader({ style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 24 }}>{style.icon}</span>
      <span style={{ fontWeight: 800, fontSize: 16, color: style.header }}>{style.title}</span>
    </div>
  );
}

function cardContainer(style) {
  return {
    background: style.bg,
    border: `3px solid ${style.border}`,
    borderRadius: 16,
    padding: 20,
    minWidth: 280,
    maxWidth: 360,
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
  };
}

function actionBtn(color) {
  return {
    width: '100%',
    padding: '10px 16px',
    background: color,
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    marginTop: 4,
  };
}

function getEffectLabel(card) {
  switch (card.efecto) {
    case 'avanza':            return `⬆️ AVANZÁ ${card.cantidad} CASILLERO${card.cantidad > 1 ? 'S' : ''}`;
    case 'retrocede':         return `⬇️ RETROCEDÉ ${card.cantidad} CASILLERO${card.cantidad > 1 ? 'S' : ''}`;
    case 'pierde_turno':      return '⏭️ PERDÉS EL PRÓXIMO TURNO';
    case 'saca_premio':       return '⭐ SACÁ UNA TARJETA DE PREMIO';
    case 'saca_castigo':      return '💀 SACÁ UNA TARJETA DE CASTIGO';
    case 'rivales_retroceden':return `⬇️ TUS RIVALES RETROCEDEN ${card.cantidad} CASILLEROS`;
    case 'elige_rival_retrocede': return `🎯 ELEGÍ UN RIVAL → RETROCEDE HASTA ${card.cantidad}`;
    case 'gana':              return '🏆 ¡FELICITACIONES PRESIDENTE!';
    case 'ballotage':         return '🔄 BALLOTAGE — ESPERÁ UN TURNO';
    default:                  return '';
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function CardModal({
  card, cardType, playerParty, playerName,
  isActivePlayer, playerId, pending,
  timer, canSalvacion, canVeto, pendingType,
  rivals, onAnswer, onConfirm,
  onUseSalvacion, onUseVeto, onChooseRival,
  onClose,
}) {
  if (!card) return null;
  const style = TYPE_STYLES[cardType] || TYPE_STYLES.avance;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)',
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      {cardType === 'pregunta'
        ? <QuestionCard
            card={card}
            playerId={playerId}
            pending={pending}
            isActivePlayer={isActivePlayer}
            playerName={playerName}
            onAnswer={onAnswer}
          />
        : <StandardCard
            card={card} cardType={cardType} playerParty={playerParty}
            playerName={playerName} isActivePlayer={isActivePlayer}
            timer={timer} pendingType={pendingType}
            canSalvacion={canSalvacion} canVeto={canVeto}
            onConfirm={onConfirm} onUseSalvacion={onUseSalvacion}
            onUseVeto={onUseVeto} rivals={rivals} onChooseRival={onChooseRival}
          />
      }
    </div>
  );
}
