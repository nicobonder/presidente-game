import { useEffect, useRef, useState, useCallback } from 'react';

function getWsBase() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function useGameSocket(roomId, playerId) {
  const wsRef = useRef(null);
  const reconnectRef = useRef({ attempts: 0, timeoutId: null });
  const msgQueueRef = useRef([]);
  const [state, setState] = useState(null);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => {
    if (!roomId || !playerId) return;

    let closedByUs = false;

    function connect() {
      const ws = new WebSocket(`${getWsBase()}/ws/${roomId}/${playerId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectRef.current.attempts = 0;
        setConnected(true);
        // flush queued messages
        while (msgQueueRef.current.length && wsRef.current?.readyState === WebSocket.OPEN) {
          const m = msgQueueRef.current.shift();
          wsRef.current.send(JSON.stringify(m));
        }
      };

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

      ws.onclose = () => {
        setConnected(false);
        if (closedByUs) return; // do not reconnect if we intentionally closed
        // reconnect with exponential backoff
        reconnectRef.current.attempts += 1;
        const delay = Math.min(30000, 1000 * 2 ** (reconnectRef.current.attempts - 1));
        reconnectRef.current.timeoutId = setTimeout(() => connect(), delay);
      };

      ws.onerror = () => {
        // let onclose handle reconnection/backoff
      };
    }

    connect();

    return () => {
      closedByUs = true;
      if (reconnectRef.current.timeoutId) {
        clearTimeout(reconnectRef.current.timeoutId);
        reconnectRef.current.timeoutId = null;
      }
      try { wsRef.current?.close(); } catch (e) {}
      wsRef.current = null;
      setConnected(false);
    };
  }, [roomId, playerId]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      // queue message to send once connected
      msgQueueRef.current.push(msg);
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