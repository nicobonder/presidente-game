# 🏛️ ¡A la Presidencia!

Juego de mesa político argentino, versión web multijugador en tiempo real.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite |
| Backend | Python FastAPI + WebSockets |
| Base de datos | SQLite (via aiosqlite) |
| Tarjetas | JSON estático en frontend |

---

## Instalación y puesta en marcha

### 1. Backend (Python)

```bash
cd backend

# Crear entorno virtual (recomendado)
python -m venv venv
source venv/bin/activate        # macOS/Linux/codespace
# venv\Scripts\activate         # Windows

# Instalar dependencias
pip install -r requirements.txt

# Correr el servidor
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

El backend queda en: `http://localhost:8000`

### 2. Frontend (React)

```bash
cd frontend

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Correr en desarrollo
npm run dev
```

El frontend queda en: `http://localhost:5173`

### 3. Jugar

1. Abrí `http://localhost:5173` en el navegador
2. Ingresá tu nombre
3. Elegí **Partida aleatoria** o **Con amigos**
4. Si elegís "Con amigos": el primer jugador crea la sala y comparte el código de 6 letras
5. Elegí tu partido político
6. El host hace clic en **Iniciar Juego** (mínimo 2 jugadores listos)

---

## Estructura del proyecto

```
presidente-game/
├── backend/
│   ├── main.py            ← FastAPI + WebSockets + SQLite
│   ├── requirements.txt
│   └── game.db            ← se crea automáticamente al correr
│
└── frontend/
    ├── src/
    │   ├── App.jsx                    ← Router principal
    │   ├── components/
    │   │   ├── JoinScreen.jsx         ← Pantalla de entrada
    │   │   ├── Lobby.jsx              ← Sala de espera + elección de partido
    │   │   ├── GameScreen.jsx         ← Pantalla de juego principal
    │   │   ├── Board.jsx              ← Tablero SVG en espiral
    │   │   ├── CardModal.jsx          ← Modal de tarjetas (incluye preguntas)
    │   │   └── HelpModal.jsx          ← Reglamento en popup
    │   ├── data/
    │   │   ├── cards.json             ← Todas las tarjetas del juego
    │   │   └── boardConfig.js         ← Casilleros especiales + colores + reglamento
    │   ├── hooks/
    │   │   └── useGameSocket.js       ← WebSocket hook
    │   └── utils/
    │       └── gameLogic.js           ← Lógica de movimiento, efectos de tarjetas
    └── vite.config.js
```

---

## Tablero — casilleros especiales

| Casillero | Tipo | Efecto |
|-----------|------|--------|
| 8, 22, 38, 64, 78 | ⭐ Premio | Tarjeta de Premio |
| 16, 30, 44, 70, 85 | 💀 Castigo | Tarjeta de Castigo |
| 19, 35, 52, 67, 83 | 🗳️ Elecciones | Tarjeta de Elecciones |
| 10, 25, 47, 60, 75 | ❓ Pregunta | Responder pregunta (+3/-3) |
| 13 | 🔲 Especial | Retrocede 5 |
| 56 | ☠️ Bulrichización | Vuelve al inicio |
| 99 | 🏛️ Presidencial | Elecciones Presidenciales |

*Verificado: ninguna Pregunta tiene casillero especial a ±1, ±2, ni ±3.*

---

## Para agregar más tarjetas

Editá `frontend/src/data/cards.json`. Cada tipo tiene su estructura:

```json
// Pregunta nueva:
{
  "id": "PQ17",
  "pregunta": "¿Tu pregunta acá?",
  "opciones": ["Opción A", "Opción B correcta", "Opción C"],
  "correcta": 1
}

// Castigo nuevo (con salvacion_id si aplica):
{
  "id": "CA10",
  "salvacion_id": "carcel",
  "partido": {
    "PJ": "Texto para PJ...",
    "UCRR": "Texto para UCRR...",
    "RPI": "Texto para RPI...",
    "RPD": "Texto para RPD..."
  },
  "efecto": "retrocede",
  "cantidad": 2
}
```

Salvacion IDs disponibles: `"carcel"` | `"gremios"` | `"internacional"` | `"inundaciones"`

---

## Deploy (producción)

### Backend en Railway / Render

1. Subí la carpeta `backend/` a un repositorio
2. Configurá el comando de inicio: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Copiá la URL del servidor

### Frontend en Vercel / Netlify

1. Creá un archivo `frontend/.env` con:
   ```
   VITE_API_URL=https://tu-backend.railway.app
   VITE_WS_URL=wss://tu-backend.railway.app
   ```
2. Comando de build: `npm run build`
3. Directorio de output: `dist`

### Background del tablero (estética futura)

En `Board.jsx`, buscá el comentario:
```js
// Background image hook: replace 'none' with `url('/board-bg.jpg')` later
backgroundImage: 'none',
```
Reemplazá `'none'` con `"url('/board-bg.jpg')"` y poné tu imagen en `frontend/public/board-bg.jpg`.

---

## Notas técnicas

- **¿Por qué JSON y no BD para tarjetas?** Con 2000 tarjetas el JSON pesa ~500KB máximo. Se carga una vez en memoria y no requiere queries. Si en el futuro necesitás filtrar por categoría, búsqueda de texto, o estadísticas de uso, ahí sí conviene migrar a SQLite o Postgres.
- **¿Por qué SQLite?** Para las salas de juego es perfecta: las partidas son efímeras, hay pocas concurrentes, y no necesitás escalar a múltiples servidores. Si en algún momento tenés mucho tráfico, la migración a Postgres con SQLAlchemy async es directa.
- **Decks de tarjetas:** El servidor maneja el estado de la sala (posiciones, turnos), pero los decks se mezclan en el frontend para simplicidad. En una versión más robusta (anti-trampa), el servidor debería hacer el shuffle y distribuir tarjetas.
