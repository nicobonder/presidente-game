import React, { useMemo } from 'react';
import { SPIRAL_COORDS, SQUARE_COLORS, SQUARE_TYPE, PARTIES } from '../data/boardConfig';

const CELL_SIZE = 60;   // px per cell
const GRID = 10;

const SQUARE_LABELS = {
  premio: '⭐',
  castigo: '💀',
  elecciones: '🗳️',
  pregunta: '❓',
  especial13: '13',
  especial56: '56',
  presidencial: '🏛️',
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
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const squareNum = gridToSquare[`${row}_${col}`];
      if (squareNum === undefined) continue;

      const type = SQUARE_TYPE[squareNum] || 'normal';
      const colors = SQUARE_COLORS[type];
      const players = playersBySquare[squareNum] || [];
      const label = SQUARE_LABELS[type];

      const x = col * CELL_SIZE;
      const y = row * CELL_SIZE;

      cells.push(
        <g key={`sq-${squareNum}`}
           onClick={() => onSquareClick?.(squareNum)}
           style={{ cursor: 'pointer' }}>
          {/* Cell background */}
          <rect
            x={x + 1} y={y + 1}
            width={CELL_SIZE - 2} height={CELL_SIZE - 2}
            rx={4}
            fill={colors.bg}
            stroke={colors.border}
            strokeWidth={type === 'normal' ? 1 : 2}
          />

          {/* Square number */}
          <text
            x={x + 4} y={y + 12}
            fontSize={7}
            fill={colors.text}
            fontFamily="monospace"
            opacity={0.6}
          >
            {squareNum}
          </text>

          {/* Special label / emoji */}
          {label && (
            <text
              x={x + CELL_SIZE / 2} y={y + CELL_SIZE / 2 + (players.length ? -8 : 4)}
              fontSize={type === 'especial13' || type === 'especial56' ? 11 : 16}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={colors.text}
              fontWeight="bold"
            >
              {label}
            </text>
          )}

          {/* Player tokens */}
          {players.map((p, i) => {
            const party = PARTIES[p.party];
            const offX = (i % 2) * 16 - 8;
            const offY = i < 2 ? 10 : 24;
            return (
              <g key={p.id}>
                <circle
                  cx={x + CELL_SIZE / 2 + offX}
                  cy={y + CELL_SIZE - offY}
                  r={8}
                  fill={party?.color || '#666'}
                  stroke={p.id === currentPlayerId ? '#fbbf24' : 'white'}
                  strokeWidth={p.id === currentPlayerId ? 2.5 : 1.5}
                />
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
              </g>
            );
          })}
        </g>
      );
    }
  }

  const svgSize = GRID * CELL_SIZE;

  return (
    <div style={{
      // Background image hook: replace 'none' with `url('/board-bg.jpg')` later
      backgroundImage: 'none',
      backgroundColor: '#0f172a',
      borderRadius: 12,
      padding: 8,
      display: 'inline-block',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', padding: '0 4px' }}>
        {[
          { color: SQUARE_COLORS.premio.border, label: '⭐ Premio' },
          { color: SQUARE_COLORS.castigo.border, label: '💀 Castigo' },
          { color: SQUARE_COLORS.elecciones.border, label: '🗳️ Elecciones' },
          { color: SQUARE_COLORS.pregunta.border, label: '❓ Pregunta' },
          { color: SQUARE_COLORS.especial13.border, label: '🔲 #13' },
          { color: SQUARE_COLORS.especial56.border, label: '☠️ #56' },
          { color: SQUARE_COLORS.presidencial.border, label: '🏛️ Presidencial' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#94a3b8' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>

      <svg
        width={svgSize}
        height={svgSize}
        style={{ display: 'block' }}
      >
        {cells}
      </svg>
    </div>
  );
}
