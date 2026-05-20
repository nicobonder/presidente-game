import React, { useMemo, useEffect } from 'react';
import { SPIRAL_COORDS, SQUARE_COLORS, SQUARE_TYPE, PARTIES, getSpiralBorderColor, GRID_W, GRID_H } from '../data/boardConfig';
import CasaRosada from '../Assets/Casa_Rosada.png';

const CELL_SIZE = 80;

const SQUARE_LABELS = {
  premio: '⭐',
  castigo: '💀',
  elecciones: '🗳️',
  pregunta: '❓',
  especial13: '🤞🏻',
  especial56: '♻️',
  presidencial: '🗳️',
  casarosada: '',
  normal: '',
};

export default function Board({ gamePlayers = {}, currentPlayerId, onSquareClick }) {
  // Build grid: squareNum → { row, col }
  const coords = SPIRAL_COORDS;

  // Build reverse: { row_col: squareNum }
  const gridToSquare = useMemo(() => {
    const map = {};
    Object.entries(coords).forEach(([num, { row, col }]) => {
      map[`${row}_${col}`] = Number(num);
    });
    return map;
  }, [coords]);

  // Which players are on each square?
  const playersBySquare = useMemo(() => {
    const map = {};
    Object.values(gamePlayers).forEach(p => {
      if (!map[p.position]) map[p.position] = [];
      map[p.position].push(p);
    });
    return map;
  }, [gamePlayers]);

  const cells = [];
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      const squareNum = gridToSquare[`${row}_${col}`];
      if (squareNum === undefined) continue;

      const type = SQUARE_TYPE[squareNum] || 'normal';
      const colors = SQUARE_COLORS[type];
      const players = playersBySquare[squareNum] || [];
      const label = SQUARE_LABELS[type];
      const spiral  = getSpiralBorderColor(squareNum);
      const border  = colors.border || spiral.border;
      const numColor = colors.border ? colors.text : spiral.text;

      const x = col * CELL_SIZE;
      const y = row * CELL_SIZE;

      cells.push(
        <g key={`sq-${squareNum}`}
           onClick={() => onSquareClick?.(squareNum)}
           style={{ cursor: 'pointer' }}>
          {/* Cell background */}
          <rect
            x={x} y={y}
            width={CELL_SIZE} height={CELL_SIZE}
            rx={6}
            fill={colors.bg}
            stroke={border}
            strokeWidth={type === 'normal' ? 2 : 2.5}
          />

          {/* Square number — bold, colored by spiral turn */}
          <text
            x={x + 7} y={y + 20}
            fontSize={16}
            fontWeight="bold"
            fill={numColor}
            fontFamily="system-ui"
          >
            {squareNum}
          </text>

          {/* Emoji/label (use image for 'casarosada') */}
          {type === 'casarosada' ? (
            <image
              href={CasaRosada}
              x={x + CELL_SIZE / 2 - 26}
              y={y + CELL_SIZE / 2 - 22 + (players.length ? -8 : 5)}
              width={50}
              height={50}
              preserveAspectRatio="xMidYMid slice"
            />
          ) : (
            label && (
              <text
                x={x + CELL_SIZE / 2}
                y={y + CELL_SIZE / 2 + (players.length ? -8 : 5)}
                fontSize={type === 'especial13' || type === 'especial56' ? 24 : 24}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={colors.text}
                fontWeight="bold"
              >
                {label}
              </text>
            )
          )}

          {/* Player tokens */}
          {players.map((p, i) => {
            const party  = PARTIES[p.party];
            const offX   = (i % 2) * 18 - 9;
            const offY   = i < 2 ? 12 : 26;
            return (
              <g key={p.id}>
                <circle
                  cx={x + CELL_SIZE / 2 + offX}
                  cy={y + CELL_SIZE - offY}
                  r={11}
                  fill={party?.color || '#666'}
                  stroke={p.id === currentPlayerId ? '#fbbf24' : 'white'}
                  strokeWidth={p.id === currentPlayerId ? 3.5 : 2}
                />
                {party?.logo ? (
                  <image
                    href={party.logo}
                    x={x + CELL_SIZE / 2 + offX - 8}
                    y={y + CELL_SIZE - offY - 8}
                    width={16}
                    height={16}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <text
                    x={x + CELL_SIZE / 2 + offX}
                    y={y + CELL_SIZE - offY + 1}
                    fontSize={8}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontWeight="bold"
                  >
                    {party?.short?.[0] || '?'}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      );
    }
  }

  const svgW = GRID_W * CELL_SIZE;
  const svgH = GRID_H * CELL_SIZE;

  return (
    <div style={{
      // Background image hook: replace 'none' with `url('/board-bg.jpg')` later
      backgroundImage: 'none',
      backgroundColor: '#0f172a',
      borderRadius: 12,
      padding: 12,
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    }}>
      {/* Leyendas encima del tablero */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap', padding: '0 4px' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8, fontWeight: 600 }}>Casilleros:</span>
        {[
          { color: '#eab308', label: '⭐ Premio' },
          { color: '#ef4444', label: '💀 Castigo' },
          { color: '#3b82f6', label: '🗳️ Elecciones' },
          { color: '#6366f1', label: '❓ Pregunta' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>

     <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        style={{ display: 'block' }}
      >
        {cells}
      </svg>
    </div>
  );
}