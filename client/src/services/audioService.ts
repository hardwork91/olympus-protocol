// ============================================================================
// audioService — sistema de sonido con Howler.js.
//
// SFX nombrados (SoundId): play('cardClick') / play('endTurn') / etc.
// Cada uno apunta a un archivo en /public/audio/. Si el archivo no existe,
// el sistema lo registra en console.warn UNA VEZ y silenciosamente ignora
// las llamadas posteriores. Esto permite trabajar sin SFX y agregarlos
// progresivamente sin romper el cliente.
//
// Para agregar un sonido real: pon el archivo en client/public/audio/<id>.mp3
// (o .ogg/.wav) y se carga automáticamente al primer play.
// ============================================================================

import { Howl } from 'howler';

export type SoundId =
  | 'cardClick'
  | 'cardSelect'
  | 'cardPlace'
  | 'cardDestroy'
  | 'skillActivate'
  | 'damageTaken'
  | 'turnEnd'
  | 'victory'
  | 'defeat'
  | 'roomCreated'
  | 'opponentJoined'
  | 'error';

interface SoundConfig {
  src: string;
  volume?: number;
}

const SOUNDS: Record<SoundId, SoundConfig> = {
  cardClick: { src: '/audio/card-click.mp3', volume: 0.4 },
  cardSelect: { src: '/audio/card-select.mp3', volume: 0.5 },
  cardPlace: { src: '/audio/card-place.mp3', volume: 0.6 },
  cardDestroy: { src: '/audio/card-destroy.mp3', volume: 0.7 },
  skillActivate: { src: '/audio/skill-activate.mp3', volume: 0.7 },
  damageTaken: { src: '/audio/damage-taken.mp3', volume: 0.7 },
  turnEnd: { src: '/audio/turn-end.mp3', volume: 0.6 },
  victory: { src: '/audio/victory.mp3', volume: 0.8 },
  defeat: { src: '/audio/defeat.mp3', volume: 0.8 },
  roomCreated: { src: '/audio/room-created.mp3', volume: 0.5 },
  opponentJoined: { src: '/audio/opponent-joined.mp3', volume: 0.6 },
  error: { src: '/audio/error.mp3', volume: 0.5 },
};

// Cache de instancias Howl. Lazy-init para no descargar todo en boot.
const howlCache = new Map<SoundId, Howl | null>();
// IDs que ya reportamos como faltantes (para no spamear console).
const reportedMissing = new Set<SoundId>();

// ─── Config global ──────────────────────────────────────────────────────

let masterVolume = 0.8;
let muted = false;

export function setMasterVolume(vol: number): void {
  masterVolume = Math.max(0, Math.min(1, vol));
}
export function getMasterVolume(): number {
  return masterVolume;
}
export function setMuted(value: boolean): void {
  muted = value;
}
export function isMuted(): boolean {
  return muted;
}

// ─── API ────────────────────────────────────────────────────────────────

/**
 * Reproduce un SFX. Si el archivo no existe, loguea una sola vez y devuelve
 * silenciosamente (NO lanza error).
 */
export function play(id: SoundId): void {
  if (muted) return;
  const cached = howlCache.get(id);
  if (cached === null) return; // ya marcamos como missing
  if (cached) {
    cached.volume((SOUNDS[id].volume ?? 1) * masterVolume);
    cached.play();
    return;
  }

  // Primer uso → crear Howl
  const config = SOUNDS[id];
  const howl = new Howl({
    src: [config.src],
    volume: (config.volume ?? 1) * masterVolume,
    preload: true,
    onloaderror: () => {
      if (!reportedMissing.has(id)) {
        reportedMissing.add(id);
        console.warn(
          `[audioService] Sound "${id}" not found at ${config.src}. ` +
            `Add the file or remove the play() call.`,
        );
      }
      howlCache.set(id, null); // marca como missing
    },
  });
  howlCache.set(id, howl);
  howl.play();
}

/**
 * Pre-carga un set de sonidos (opcional). Útil para evitar latencia
 * la primera vez que se reproducen.
 */
export function preload(ids: SoundId[]): void {
  for (const id of ids) {
    if (howlCache.has(id)) continue;
    const config = SOUNDS[id];
    const howl = new Howl({
      src: [config.src],
      preload: true,
      onloaderror: () => {
        howlCache.set(id, null);
      },
    });
    howlCache.set(id, howl);
  }
}
