# store/

Estado de UI compartido (Zustand). **Esto NO es el estado autoritativo del
juego** — ese vive en Firebase y se sincroniza vía listener.

Útil para:

- Estado de UI que no debe sincronizarse (modales abiertos, animaciones,
  scroll position).
- Caché local del game state (deserializado de Firebase para no parsear
  en cada render).
- Configuración del usuario (volumen, idioma, dark/light, ...).
