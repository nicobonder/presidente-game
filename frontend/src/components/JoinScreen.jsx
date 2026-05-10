import React, { useState } from 'react';

export default function JoinScreen({ onJoin }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState(null); // 'friend' | 'random'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    if (!name.trim()) { setError('Ingresá tu nombre'); return; }
    if (mode === 'friend' && !roomCode.trim()) { setError('Ingresá el código de sala'); return; }
    setLoading(true);
    setError('');
    try {
      await onJoin(name.trim(), mode === 'friend' ? roomCode.trim().toUpperCase() : null);
    } catch (e) {
      setError('Error al conectar. ¿Está corriendo el backend?');
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0c0a09 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', padding: 24,
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 60, marginBottom: 8 }}>🏛️</div>
        <h1 style={{
          color: 'white', fontSize: 42, fontWeight: 900, margin: 0,
          textShadow: '0 0 40px rgba(99,102,241,0.5)',
        }}>
          ¡A 100 pasos de la Rosada!
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 8 }}>
          El juego de la política argentina
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, padding: 32,
        width: '100%', maxWidth: 420,
        boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Name */}
        <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>
          Tu nombre
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej: El Gordo Lerena"
          maxLength={30}
          style={inputStyle}
          onKeyDown={e => e.key === 'Enter' && mode && handleJoin()}
        />

        {/* Mode selector */}
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 10, marginTop: 20 }}>
          ¿Cómo querés jugar?
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[
            { key: 'random', label: '🎲 Partida aleatoria', desc: 'Entrás a un juego con desconocidos' },
            { key: 'friend', label: '👥 Con amigos', desc: 'Usás un código de sala' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setMode(opt.key)}
              style={{
                flex: 1, padding: '14px 10px',
                background: mode === opt.key ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                border: `2px solid ${mode === opt.key ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 12, color: 'white', cursor: 'pointer',
                textAlign: 'center', transition: 'all 0.2s',
              }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* Room code input */}
        {mode === 'friend' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>
              Código de sala (dejalo vacío para crear una nueva)
            </label>
            <input
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Ej: AB1234"
              maxLength={6}
              style={{ ...inputStyle, letterSpacing: 4, textTransform: 'uppercase', fontFamily: 'monospace', fontSize: 18 }}
            />
          </div>
        )}

        {error && (
          <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>⚠️ {error}</p>
        )}

        <button
          onClick={handleJoin}
          disabled={!mode || loading}
          style={{
            width: '100%', padding: '14px',
            background: (!mode || loading) ? '#374151' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: (!mode || loading) ? '#6b7280' : 'white',
            border: 'none', borderRadius: 12,
            fontWeight: 800, fontSize: 16,
            cursor: (!mode || loading) ? 'not-allowed' : 'pointer',
            boxShadow: mode && !loading ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
            transition: 'all 0.2s',
          }}>
          {loading ? 'Conectando...' : '▶ Entrar al juego'}
        </button>
      </div>

      <p style={{ color: '#1e293b', marginTop: 24, fontSize: 12 }}>
        · 2 a 4 jugadores · Política argentina ·
      </p>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '12px 14px',
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10, color: 'white', fontSize: 15,
  outline: 'none', boxSizing: 'border-box',
};
