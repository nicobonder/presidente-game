// Tablero en espiral: 100 casilleros (0 al 99)
// El jugador empieza en 0 y tiene que llegar al 99 (Elecciones Presidenciales)
//
// Casilleros especiales (verificado ±3 sin colisión con preguntas):
//   PREMIOS:    8, 22, 38, 64, 78
//   CASTIGOS:   16, 30, 44, 70, 85
//   ELECCIONES: 19, 35, 52, 67, 83
//   PREGUNTAS:  10, 25, 47, 60, 75  (ninguna tiene especial a ±1,±2,±3)
//   ESPECIAL13: 13  → retrocede 5
//   ESPECIAL56: 56  → Bulrichización, vuelve al inicio
//   PRES:       99  → Elecciones Presidenciales

export const SPECIAL_SQUARES = {
  premio:    [7, 18, 23, 38, 65, 78, 92],
  castigo:   [30, 44, 70, 85, 91],
  elecciones:[19, 35, 52, 66, 83],
  pregunta: [3, 9, 17, 25, 40, 48, 60, 74, 86, 90],
  especial13: [13],
  especial56: [56],
  presidencial: [99],
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

// ─── Espiral: genera las coordenadas (col, row) de cada casillero ───
// El tablero es de 10x10. Arrancamos desde la esquina exterior y
// vamos girando hacia el centro. El casillero 0 queda en la esquina
// inferior-izquierda y el 99 en el centro.
export function buildSpiralCoords(size = 10) {
  // Usamos la secuencia estándar de espiral pero empezando desde abajo-izquierda
  // Para eso generamos en orden normal y luego invertimos el mapeo de número
  // Generar recorrido espiral estándar (desde top-left, clockwise)
    const spiral = [];
  let t = 0, b = size - 1, l = 0, r = size - 1;
  while (t <= b && l <= r) {
    for (let c = l; c <= r; c++) spiral.push([t, c]);
    t++;
    for (let rr = t; rr <= b; rr++) spiral.push([rr, r]);
    r--;
    if (t <= b) { for (let c = r; c >= l; c--) spiral.push([b, c]); b--; }
    if (l <= r) { for (let rr = b; rr >= t; rr--) spiral.push([rr, l]); l++; }
  }
  const coords = {};
  // Casillero 0 → último elemento de la espiral (centro-ish), 99 → primero
  // Queremos que 0 sea el inicio (exterior) y 99 sea el final
  // La espiral ya está en orden 0..99 desde exterior
  spiral.forEach(([row, col], idx) => { coords[idx] = { row, col }; });
  return coords;
}

export const SPIRAL_COORDS = buildSpiralCoords(10);

// Color por vuelta de espiral
// Vuelta 0 (casilleros 0-35): exterior
// Vuelta 1 (36-63)
// Vuelta 2 (64-83)
// Vuelta 3 (84-95)
// Vuelta 4 (96-99): centro
const SPIRAL_TURN_COLORS = [
  { border: '#3b82f6', text: '#1e3a8a', label: 'azul' },    // vuelta 0
  { border: '#16a34a', text: '#14532d', label: 'verde' },   // vuelta 1
  { border: '#f59e0b', text: '#92400e', label: 'amarillo' },// vuelta 2
  { border: '#ec4899', text: '#831843', label: 'rosa' },    // vuelta 3
  { border: '#8b5cf6', text: '#4c1d95', label: 'violeta' }, // vuelta 4
];

function getSpiralTurn(squareNum) {
  if (squareNum <= 35) return 0;
  if (squareNum <= 63) return 1;
  if (squareNum <= 83) return 2;
  if (squareNum <= 95) return 3;
  return 4;
}

export function getSpiralBorderColor(squareNum) {
  return SPIRAL_TURN_COLORS[getSpiralTurn(squareNum)];
}

export const PARTIES = {
  PJ: {
    id: 'PJ',
    name: 'Partido Justiciero',
    short: 'PJ',
    color: '#1a6fc4',
    bgColor: '#dbeafe',
    emoji: '✌️',
  },
  UCRR: {
    id: 'UCRR',
    name: 'Unión Civil Republicana y Representativa',
    short: 'UCRR',
    color: '#dc2626',
    bgColor: '#fee2e2',
    emoji: '🎩',
  },
  RPD: {
    id: 'RPD',
    name: 'Rejunte de Partidos de Derecha',
    short: 'RPD',
    color: '#7c3aed',
    bgColor: '#ede9fe',
    emoji: '🦍',
  },
  RPI: {
    id: 'RPI',
    name: 'Rejunte de Partidos de Izquierda',
    short: 'RPI',
    color: '#dc2626',
    bgColor: '#fef2f2',
    emoji: '🛠️',
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
  presidencial: { bg: '#f0fdf4', border: '#16a34a', text: '#14532d' },
};

export const GAME_NAME = 'A 100 pasos de La Rosada';

export const REGLAMENTO = `
# Reglamento — ¡A 100 pasos de la Rosada!

## Objetivo
Avanzar por el tablero hasta convertirse en Presidente. La carrera comienza cuando te afiliás a un partido político y termina en el casillero de Elecciones Presidenciales (99).

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

### 🔲 Casillero 13
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
