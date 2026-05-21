# server-logic/

Lógica del juego que **mañana se moverá al backend real**.

- `gameEngine.ts` — clase Game, mutaciones de estado, fases del juego
- `combat.ts` — resolución de combate (sin animaciones, todo síncrono)
- `validators.ts` — funciones puras `canPlaceCard()`, `canEndTurn()`, etc.

**Regla crítica**: este directorio **NO importa nada de UI** (`@components`,
`@hooks`, `@store`, `react`, `framer-motion`, etc.). Solo puede importar de
`@shared`. Si esto se respeta, mover esta carpeta a un servidor Node real
es trivial.
