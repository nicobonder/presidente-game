import React, { useState } from 'react';
import JoinScreen from './components/JoinScreen';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import { useGameSocket, joinRoom } from './hooks/useGameSocket';

export default function App() {
  const [session, setSession] = useState(null); // { roomId, playerId }

  const { state, events, connected, send } = useGameSocket(
    session?.roomId,
    session?.playerId
  );

  async function handleJoin(playerName, roomId) {
    const result = await joinRoom(playerName, roomId);
    if (result.error) throw new Error(result.error);
    setSession({ roomId: result.room_id, playerId: result.player_id });
  }

  function handleSelectParty(party) {
    send({ type: 'select_party', party });
  }

  function handleStartGame() {
    send({ type: 'start_game' });
  }

  // ── Routing ─────────────────────────────────────────────────────────────────
  if (!session) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  if (!state) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#0f172a',
        color: 'white', gap: 16, fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          width: 48, height: 48, border: '4px solid #334155',
          borderTopColor: '#6366f1', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: '#475569' }}>
          {connected ? 'Cargando sala...' : 'Conectando al servidor...'}
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (state.phase === 'lobby') {
    return (
      <Lobby
        roomState={state}
        playerId={session.playerId}
        onSelectParty={handleSelectParty}
        onStartGame={handleStartGame}
      />
    );
  }

  return (
    <GameScreen
      roomState={state}
      playerId={session.playerId}
      send={send}
      events={events}
    />
  );
}
