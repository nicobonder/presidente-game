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
function QuestionCard({ card, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);

  function handleChoice(idx) {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
    setTimeout(() => onAnswer(idx === card.correcta), 1500);
  }

  const style = TYPE_STYLES.pregunta;

  return (
    <div style={cardContainer(style)}>
      <CardHeader style={style} />
      <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#1e1b4b', lineHeight: 1.5 }}>
        {card.pregunta}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {card.opciones.map((op, i) => {
          let bg = 'white';
          let border = '#c7d2fe';
          let color = '#312e81';
          if (revealed) {
            if (i === card.correcta) { bg = '#dcfce7'; border = '#16a34a'; color = '#14532d'; }
            else if (i === selected && i !== card.correcta) { bg = '#fee2e2'; border = '#dc2626'; color = '#7f1d1d'; }
          }
          return (
            <button key={i}
              onClick={() => handleChoice(i)}
              disabled={revealed}
              style={{
                padding: '10px 14px',
                border: `2px solid ${border}`,
                borderRadius: 8,
                background: bg,
                color,
                fontWeight: 600,
                fontSize: 13,
                cursor: revealed ? 'default' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
            >
              {String.fromCharCode(65 + i)}. {op}
            </button>
          );
        })}
      </div>
      {revealed && (
        <p style={{ marginTop: 14, fontWeight: 700, fontSize: 14, textAlign: 'center',
          color: selected === card.correcta ? '#16a34a' : '#dc2626' }}>
          {selected === card.correcta ? '✅ ¡Correcto! Avanzás 3 casilleros' : '❌ Incorrecto. Retrocedés 3 casilleros'}
        </p>
      )}
    </div>
  );
}

// ─── Standard Card ─────────────────────────────────────────────────────────────
function StandardCard({ card, cardType, playerParty, onConfirm, onVeto, rivals, canVeto }) {
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
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
          {PARTIES[playerParty]?.emoji} {PARTIES[playerParty]?.name}
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
              style={actionBtn(PARTIES[r.party]?.color || '#666')}>
              {PARTIES[r.party]?.emoji} {r.name}
            </button>
          ))}
        </div>
      )}

      {card.efecto !== 'elige_rival_retrocede' && (
        <button onClick={() => onConfirm()} style={actionBtn('#0f172a')}>
          Aceptar
        </button>
      )}

      {canVeto && cardType === 'premio' && (
        <button onClick={onVeto}
          style={{ ...actionBtn('#dc2626'), marginTop: 8, fontSize: 12 }}>
          🚫 Usar VETO ABSOLUTO
        </button>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
    case 'saca_avance':       return '🃏 SACÁ OTRA TARJETA DE AVANCE';
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
export default function CardModal({ card, cardType, playerParty, onAnswer, onConfirm, onVeto, rivals, canVeto, onClose }) {
  if (!card) return null;

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
        ? <QuestionCard card={card} onAnswer={onAnswer} />
        : <StandardCard
            card={card} cardType={cardType} playerParty={playerParty}
            onConfirm={onConfirm} onVeto={onVeto} rivals={rivals} canVeto={canVeto}
          />
      }
    </div>
  );
}
