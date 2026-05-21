# Audio files

Drop sound files here to enable SFX. The audio service expects these names
(any of `.mp3`, `.ogg`, `.wav` work — update the extension in
`src/services/audioService.ts` if needed):

- `card-click.mp3` — click suave al hacer click en una carta
- `card-select.mp3` — al seleccionar una carta (halo aparece)
- `card-place.mp3` — al colocar una carta en un slot
- `card-destroy.mp3` — al destruir una carta en combate
- `skill-activate.mp3` — al voltear una skill (active)
- `damage-taken.mp3` — al perder vida
- `turn-end.mp3` — al cerrar turno
- `victory.mp3` — al ganar
- `defeat.mp3` — al perder
- `room-created.mp3` — al crear sala
- `opponent-joined.mp3` — cuando el player 2 se une
- `error.mp3` — acción rechazada por el servidor

**Sin archivos**: el sistema loguea un warning una vez por sonido faltante
y silenciosamente ignora `play()` para ese id. El juego funciona sin SFX.

Recursos gratis recomendados (CC0):

- [Kenney Audio Packs](https://kenney.nl/assets/category:Audio) — bibliotecas
  enormes de juegos.
- [Freesound.org](https://freesound.org/) — buscar por tags + filtrar por
  CC0.
- [Sonniss GDC Pack](https://sonniss.com/gameaudiogdc/) — pack profesional
  gratuito anual.
