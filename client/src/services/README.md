# services/

Service layer ("fake backend"). El cliente llama a estas funciones **como si
fueran endpoints HTTP**.

- `gameService.ts` — acciones del juego (placeCard, endTurn, setSelection, ...)
- `roomService.ts` — lobby (createRoom, joinRoom, listenRoom)
- `firebase.ts` — inicialización del SDK + helper de auth

Hoy: ejecutan la lógica localmente, validan con `@server`, escriben a Firebase
RTDB con transacciones.

Mañana: los cuerpos cambian a `fetch('/api/...')` o WebSocket. **La interfaz
pública (los nombres de funciones y sus tipos) NO cambia** — los componentes
de UI no se enteran del cambio.
