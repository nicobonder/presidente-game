// Tablero en espiral rectangular: 101 casilleros (0 al 100)
// Grilla 20 columnas × 10 filas — espiral horaria desde esquina superior-izquierda
// El jugador empieza en 0 (arriba-izquierda) y tiene que llegar al 99 (Elecciones Presidenciales)
// El casillero 100 muestra La Casa Rosada (destino final visual)
//
// Casilleros especiales:
//   PREMIOS:    7, 18, 23, 38, 65, 78, 92
//   CASTIGOS:   30, 44, 70, 85, 91
//   ELECCIONES: 19, 35, 52, 66, 83
//   PREGUNTAS:  3, 9, 17, 25, 40, 48, 60, 74, 86, 90
//   ESPECIAL13: 13  → retrocede 5
//   ESPECIAL56: 56  → Bulrichización, vuelve al inicio
//   PRES:       99  → Elecciones Presidenciales (casillero ganador)
//   CASAROSADA: 100 → La Casa Rosada (solo visual)

export const SPECIAL_SQUARES = {
  premio:    [7, 18, 23, 38, 65, 78, 92],
  castigo:   [30, 44, 70, 85, 91],
  elecciones:[19, 35, 52, 66, 83],
  pregunta: [3, 9, 17, 25, 40, 48, 60, 74, 86, 90],
  especial13: [13],
  especial56: [56],
  presidencial: [99],
  casarosada: [100],
};

export const SQUARE_TYPE = {};
for (let i = 0; i <= 100; i++) SQUARE_TYPE[i] = 'normal';
SPECIAL_SQUARES.premio.forEach(n => (SQUARE_TYPE[n] = 'premio'));
SPECIAL_SQUARES.castigo.forEach(n => (SQUARE_TYPE[n] = 'castigo'));
SPECIAL_SQUARES.elecciones.forEach(n => (SQUARE_TYPE[n] = 'elecciones'));
SPECIAL_SQUARES.pregunta.forEach(n => (SQUARE_TYPE[n] = 'pregunta'));
SPECIAL_SQUARES.especial13.forEach(n => (SQUARE_TYPE[n] = 'especial13'));
SPECIAL_SQUARES.especial56.forEach(n => (SQUARE_TYPE[n] = 'especial56'));
SPECIAL_SQUARES.presidencial.forEach(n => (SQUARE_TYPE[n] = 'presidencial'));
SPECIAL_SQUARES.casarosada.forEach(n => (SQUARE_TYPE[n] = 'casarosada'));

// ─── Espiral: coordenadas fijas segmento por segmento ───
// Grilla 20 × 11 (cols 0-19, rows 0-10). Las esquinas son compartidas entre
// el segmento que termina y el que empieza (cada esquina pertenece a ambos).
//
// Seg 1  fila sup   →   row 0,  cols 0-19   (sq  0-19,  20 pos)
// Seg 2  col der    ↓   col 19, rows 1-10   (sq 20-29,  10 pos)
// Seg 3  fila inf   ←   row 10, cols 18-0   (sq 30-48,  19 pos)
// Seg 4  col izq    ↑   col 0,  rows 9-2    (sq 49-56,   8 pos)
// Seg 5  fila sup i →   row 2,  cols 1-17   (sq 57-73,  17 pos)
// Seg 6  col der i  ↓   col 17, rows 3-8    (sq 74-79,   6 pos)
// Seg 7  fila inf i ←   row 8,  cols 16-2   (sq 80-94,  15 pos)
// Seg 8  final      ↑→  col 2 rows 7→4, luego (4,3)=99, (4,4)=100
export function buildSpiralCoords() {
  const coords = {};
  let sq = 0;
  // Seg 1: fila superior izq→der
  for (let c = 0; c <= 19; c++) coords[sq++] = { row: 0, col: c };
  // Seg 2: col derecha arr→abajo
  for (let r = 1; r <= 10; r++) coords[sq++] = { row: r, col: 19 };
  // Seg 3: fila inferior der→izq
  for (let c = 18; c >= 0; c--) coords[sq++] = { row: 10, col: c };
  // Seg 4: col izquierda abajo→arriba
  for (let r = 9; r >= 2; r--) coords[sq++] = { row: r, col: 0 };
  // Seg 5: fila superior interna izq→der
  for (let c = 1; c <= 17; c++) coords[sq++] = { row: 2, col: c };
  // Seg 6: col derecha interna arr→abajo
  for (let r = 3; r <= 8; r++) coords[sq++] = { row: r, col: 17 };
  // Seg 7: fila inferior interna der→izq
  for (let c = 16; c >= 2; c--) coords[sq++] = { row: 8, col: c };
  // Seg 8: tramo final — sube por col 2, luego va a la derecha
  for (let r = 7; r >= 4; r--) coords[sq++] = { row: r, col: 2 };  // sq 95-98
  coords[sq++] = { row: 4, col: 3 };  // sq 99 — Elecciones Presidenciales
  coords[sq++] = { row: 4, col: 4 };  // sq 100 — La Casa Rosada
  return coords;
}

export const GRID_W = 20;
export const GRID_H = 11;
export const SPIRAL_COORDS = buildSpiralCoords();

// Color por tramo de espiral (tablero 20×11)
// Tramo 0: fila superior exterior     (0-19)
// Tramo 1: col der + fila inf exterior (20-48)
// Tramo 2: col izq + fila sup interna  (49-73)
// Tramo 3: col der + fila inf interna  (74-94)
// Tramo 4: tramo final hasta La Rosada (95-100)
const SPIRAL_TURN_COLORS = [
  { border: '#3b82f6', text: '#1e3a8a', label: 'azul' },    // tramo 0
  { border: '#16a34a', text: '#14532d', label: 'verde' },   // tramo 1
  { border: '#f59e0b', text: '#92400e', label: 'amarillo' },// tramo 2
  { border: '#ec4899', text: '#831843', label: 'rosa' },    // tramo 3
  { border: '#8b5cf6', text: '#4c1d95', label: 'violeta' }, // tramo 4
];

function getSpiralTurn(squareNum) {
  if (squareNum <= 19) return 0;
  if (squareNum <= 48) return 1;
  if (squareNum <= 73) return 2;
  if (squareNum <= 94) return 3;
  return 4;
}

export function getSpiralBorderColor(squareNum) {
  return SPIRAL_TURN_COLORS[getSpiralTurn(squareNum)];
}

// Logos for parties
import PJLogo from '../Assets/PJ_Logo.png';
import UCRRLogo from '../Assets/UCRR_Logo.png';
import RPDLogo from '../Assets/RPD_Logo.png';
import RPILogo from '../Assets/RPI_Logo.png';

export const PARTIES = {
  PJ: {
    id: 'PJ',
    name: 'Partido Justiciero',
    short: 'PJ',
    color: '#1a6fc4',
    bgColor: '#dbeafe',
    logo: PJLogo,
  },
  UCRR: {
    id: 'UCRR',
    name: 'Unión Civil Republicana y Representativa',
    short: 'UCRR',
    color: '#dc2626',
    bgColor: '#fee2e2',
    logo: UCRRLogo,
  },
  RPD: {
    id: 'RPD',
    name: 'Rejunte de Partidos de Derecha',
    short: 'RPD',
    color: '#7c3aed',
    bgColor: '#ede9fe',
    logo: RPDLogo,
  },
  RPI: {
    id: 'RPI',
    name: 'Rejunte de Partidos de Izquierda',
    short: 'RPI',
    color: '#dc2626',
    bgColor: '#fef2f2',
    logo: RPILogo,
  },
};

export const SQUARE_COLORS = {
  normal:       { bg: '#ffffff', border: null, text: '#334155' }, // border viene de espiral
  premio:       { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
  castigo:      { bg: '#fee2e2', border: '#ef4444', text: '#7f1d1d' },
  elecciones:   { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
  pregunta:     { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
  especial13:   { bg: '#1a1a2e', border: '#6b21a8', text: '#e879f9' },
  especial56:   { bg: '#1a1a2e', border: '#f97316', text: '#fed7aa' },
  presidencial: { bg: '#fffbeb', border: '#d97706', text: '#92400e' },
  casarosada:   { bg: '#f0fdf4', border: '#16a34a', text: '#14532d' },
};

export const GAME_NAME = 'A 100 pasos de La Rosada';

export const REGLAMENTO = `
# Reglamento — ¡A 100 pasos de la Rosada!

## Objetivo
Avanzar por el tablero hasta convertirse en Presidente. La carrera comienza cuando te afiliás a un partido político y termina en el casillero 99 — Elecciones Presidenciales. El casillero 100 (La Casa Rosada) es la meta final: ¡ahí vas cuando ganás!

## Partidos
- **PJ** – Partido Justiciero
- **UCRR** – Unión Civil Republicana y Representativa
- **RPD** – Rejunte de Partidos de Derecha
- **RPI** – Rejunte de Partidos de Izquierda

Pueden jugar de 2 a 4 jugadores, representando cada uno a un partido.

## Comienzo
Para decidir quién comienza se arroja un dado; quien saque el número más alto empieza. La ronda gira hacia la derecha.

## Avance
Cada turno el jugador activo tira el dado y avanza según el resultado. Al caer en ciertos casilleros se activan efectos especiales.

## Casilleros especiales

### ⭐ Premio
Levantá una Tarjeta de Premio y seguí sus instrucciones.

### 💀 Castigo
Levantá una Tarjeta de Castigo y seguí sus instrucciones. Podés usar tu Tarjeta de Salvación si corresponde.

### 🗳️ Elecciones
Levantá una Tarjeta de Elecciones y seguí sus instrucciones.
**No se puede saltar un casillero de Elecciones**: si avanzás más allá de uno, retrocedés hasta él y sacás la tarjeta.

### ❓ Pregunta
Respondé la pregunta que aparece. Si acertás: avanzás 3 casilleros. Si errás: retrocedés 3 casilleros.

### ⚰️ Casillero 13
Mala suerte política. Retrocedés 5 casilleros.

### ☠️ Casillero 56 — Bulrichización
Cambiás de ideología repentinamente y quedás a trasmano con los valores de tu partido. Sufrís un gran retroceso...pero ya estás acostumbrado, ya estuviste en más de 10 partidos 🤷🏻‍♀️

### 🏛️ Casillero 99 — Elecciones Presidenciales
Sacás una Tarjeta de Elección Final. Si ganás, ¡Sos Presidente! Si hay Ballotage, esperás un turno y volvés a intentar. Si perdés, retrocedés.

## Tarjetas de Salvación
Cada jugador recibe una al inicio. Se usa **una sola vez** para neutralizar ciertos Castigos específicos (indicado en la tarjeta).

## Tarjeta de Veto Absoluto
Cada jugador recibe una al inicio. Cuando un rival gana un Premio, podés jugar el Veto para que no lo efectivice. Se usa una sola vez.

## Empate
Si dos jugadores quedan en el mismo casillero, ambos tiran el dado: el que saque más alto avanza esa cantidad; el otro retrocede la cantidad que sacó.

## Tarjetas de Situación
Cada vez que se tira el dado también se saca una Tarjeta de Situación. Se puede acumular o usar inmediatamente.
`;
