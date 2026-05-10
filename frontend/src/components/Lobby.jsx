import React, { useState } from 'react';
import { PARTIES } from '../data/boardConfig';

export default function Lobby({ roomState, playerId, onSelectParty, onStartGame }) {
  const [hoveredParty, setHoveredParty] = useState(null);

  if (!roomState) return (
    <div style={centerStyle}>
      <div style={spinnerStyle} />
      <p style={{ color: '#94a3b8', marginTop: 16 }}>Conectando...</p>
    </div>
  );

  const players = roomState.players || [];
  const myPlayer = players.find(p => p.id === playerId);
  const takenParties = new Set(players.filter(p => p.party).map(p => p.party));
  const isHost = players[0]?.id === playerId;
  const readyCount = players.filter(p => p.party).length;
  const canStart = isHost && readyCount >= 2;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui, sans-serif',
    }}>
      <h1 style={{ color: 'white', fontSize: 36, fontWeight: 900, marginBottom: 4, textAlign: 'center' }}>
        🏛️ ¡A 100 pasos de la Rosada!
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: 32, fontSize: 14 }}>
        Sala: <strong style={{ color: '#fbbf24', letterSpacing: 2 }}>{roomState.room_id}</strong>
        {' '}· Compartí este código con tus amigos
      </p>

      {/* Players list */}
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 24, width: '100%', maxWidth: 500 }}>
        <h3 style={{ color: '#e2e8f0', margin: '0 0 12px', fontSize: 14 }}>Jugadores en la sala ({players.length}/4)</h3>
        {players.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: p.party ? PARTIES[p.party]?.color : '#374151',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>
              {p.party ? PARTIES[p.party]?.emoji : '👤'}
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>
                {p.name} {p.id === playerId ? <span style={{ color: '#fbbf24', fontSize: 11 }}>(vos)</span> : null}
                {players[0]?.id === p.id ? <span style={{ color: '#34d399', fontSize: 11 }}> HOST</span> : null}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>
                {p.party ? PARTIES[p.party]?.name : 'Sin partido elegido'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Party selection */}
      {!myPlayer?.party && (
        <>
          <h3 style={{ color: '#e2e8f0', marginBottom: 16, fontSize: 16 }}>Elegí tu partido:</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24, width: '100%', maxWidth: 500 }}>
            {Object.values(PARTIES).map(party => {
              const taken = takenParties.has(party.id);
              return (
                <button key={party.id}
                  onClick={() => !taken && onSelectParty(party.id)}
                  onMouseEnter={() => setHoveredParty(party.id)}
                  onMouseLeave={() => setHoveredParty(null)}
                  disabled={taken}
                  style={{
                    padding: '16px',
                    background: taken ? 'rgba(255,255,255,0.03)' : (hoveredParty === party.id ? party.color : 'rgba(255,255,255,0.08)'),
                    border: `2px solid ${taken ? '#374151' : party.color}`,
                    borderRadius: 12,
                    color: taken ? '#4b5563' : 'white',
                    cursor: taken ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    opacity: taken ? 0.5 : 1,
                  }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{party.emoji}</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{party.short}</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{party.name}</div>
                  {taken && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Ocupado</div>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {myPlayer?.party && !isHost && (
        <p style={{ color: '#34d399', marginBottom: 24, fontWeight: 600 }}>
          ✅ Elegiste {PARTIES[myPlayer.party]?.name}. Esperando que el host inicie el juego...
        </p>
      )}

      {isHost && (
        <button onClick={onStartGame} disabled={!canStart}
          style={{
            padding: '14px 40px',
            background: canStart ? '#16a34a' : '#374151',
            color: canStart ? 'white' : '#6b7280',
            border: 'none', borderRadius: 10,
            fontWeight: 800, fontSize: 16,
            cursor: canStart ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}>
          {canStart ? '▶ Iniciar Juego' : `Esperando jugadores (${readyCount}/2 listos)`}
        </button>
      )}
    </div>
  );
}

const centerStyle = {
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', background: '#0f172a',
};

const spinnerStyle = {
  width: 40, height: 40,
  border: '4px solid #334155',
  borderTopColor: '#6366f1',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};
