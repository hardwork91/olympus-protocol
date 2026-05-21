# shared/

Tipos y constantes compartidas entre cliente y "server" (server-logic/).

- `cards.ts` — catálogo de cartas (unidades + skills)
- `types.ts` — interfaces TypeScript (`Card`, `Unit`, `Skill`, `GameState`, etc.)

Regla: este directorio puede ser importado desde cualquier lado. **No importa
de UI, ni de Firebase, ni de servicios.** Es puro modelo de datos.

Cuando aparezca el backend real, esta carpeta se duplica/comparte vía workspace.
