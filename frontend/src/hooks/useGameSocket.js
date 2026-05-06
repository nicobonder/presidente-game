import { useEffect, useRef, useState, useCallback } from 'react';

function getWsBase() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function useGameSocket(roomId, playerId) {
  const wsRef = useRef(null);
  const [state, setState] = useState(null);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => {
    if (!roomId || !playerId) return;
    const ws = new WebSocket(`${getWsBase()}/ws/${roomId}/${playerId}`);
    wsRef.current = ws;
    ws.onopen  = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'room_state') {
        setState(msg.state);
        if (msg.events) setEvents(prev => [...prev, ...msg.events]);
      } else if (msg.type === 'chat') {
        setChatMessages(prev => [...prev.slice(-50), msg]);
      } else if (msg.type === 'error') {
        console.warn('Server error:', msg.message);
      }
    };
    return () => ws.close();
  }, [roomId, playerId]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendChat = useCallback((text) => {
    send({ type: 'chat', text });
  }, [send]);

  return { state, events, connected, chatMessages, send, sendChat };
}

export async function joinRoom(playerName, roomId = null) {
  const res = await fetch('/rooms/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_name: playerName, room_id: roomId }),
  });
  return res.json();
}