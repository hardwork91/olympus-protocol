// ============================================================================
// roomService — gestión de salas (lobby) en Firebase RTDB.
//
// Estructura en RTDB:
//   /games/{roomId} = {
//     config: GameConfig,
//     state: SerializedGameState,
//     seats: { 1: uid, 2: uid|null },
//     createdAt: serverTimestamp,
//   }
// ============================================================================

import { Game, normalizeSerializedState } from '@server/gameEngine';
import type { GameConfig, PlayerId, SerializedGameState } from '@shared/types';
import { get, off, onValue, ref, runTransaction, serverTimestamp, set } from 'firebase/database';
import { db, sanitizeForFirebase, userPromise } from './firebase';

// ─── Tipos del lobby ────────────────────────────────────────────────────

/** Forma persistida en /games/{roomId}. */
export interface RoomData {
  config: GameConfig;
  state: SerializedGameState;
  seats: { 1: string | null; 2: string | null };
  createdAt: number | object; // serverTimestamp() devuelve un object placeholder
}

// ─── Generación de códigos ──────────────────────────────────────────────

// Sin O/0/I/1 para evitar confusión al dictar el código.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

// ─── API ────────────────────────────────────────────────────────────────

/**
 * Crea una sala nueva. El usuario actual se asienta como player 1.
 * Devuelve el roomId generado y el user autenticado.
 */
export async function createRoom(config: GameConfig): Promise<{ roomId: string; userId: string }> {
  const user = await userPromise;
  const roomId = generateCode();

  // Construimos el state inicial con la lógica del motor (reparto + robo 5).
  const localGame = new Game(config);
  const initialState = localGame.serialize();

  const roomData: RoomData = {
    config,
    state: initialState,
    seats: { 1: user.uid, 2: null },
    createdAt: serverTimestamp(),
  };

  await set(ref(db, `games/${roomId}`), sanitizeForFirebase(roomData));
  return { roomId, userId: user.uid };
}

/**
 * Une al usuario actual como player 2 a una sala existente.
 *
 * Casos manejados:
 * - Usuario ya es seat 2 → reconnect (no error).
 * - Usuario ya es seat 1 con seat 2 vacío → ERROR (intenta unirse a su propia sala,
 *   típico bug de testing con dos pestañas del mismo navegador).
 * - Usuario ya es seat 1 con seat 2 ocupado → reconnect como seat 1.
 * - Usuario no asentado y seat 2 libre → reclama seat 2 vía transacción.
 * - Usuario no asentado y seat 2 ocupado → ERROR (sala llena).
 */
export async function joinRoom(
  roomId: string,
): Promise<{ roomId: string; userId: string; seat: PlayerId }> {
  const user = await userPromise;
  const snap = await get(ref(db, `games/${roomId}`));

  if (!snap.exists()) {
    throw new Error('Room not found. Check the code.');
  }

  const room = snap.val() as RoomData;

  // Reconnect como seat 2
  if (room.seats && room.seats[2] === user.uid) {
    return { roomId, userId: user.uid, seat: 2 };
  }

  // Caso "te estás uniendo a tu propia sala"
  if (room.seats && room.seats[1] === user.uid) {
    if (room.seats[2]) {
      // seat 2 ya ocupado por otro: reconnect normal como seat 1
      return { roomId, userId: user.uid, seat: 1 };
    } else {
      throw new Error(
        'You are already Player 1 in this room. To add a Player 2, ' +
          'open the URL in an incognito window (Ctrl+Shift+N) or another browser.',
      );
    }
  }

  // No estás asentado: intenta reclamar seat 2
  if (room.seats && room.seats[2]) {
    throw new Error('Room full. There are already 2 players in this game.');
  }

  const seatsRef = ref(db, `games/${roomId}/seats/2`);
  const result = await runTransaction(seatsRef, (current: string | null) => {
    if (current) return; // abort si alguien lo tomó entre get() y la transacción
    return user.uid;
  });

  if (!result.committed) {
    throw new Error('Room full (another player joined before you).');
  }

  return { roomId, userId: user.uid, seat: 2 };
}

/**
 * Determina el seat (1 o 2) del usuario en una sala.
 * Devuelve null si no está asentado.
 */
export function getMySeat(room: RoomData | null, userId: string): PlayerId | null {
  if (!room || !room.seats) return null;
  if (room.seats[1] === userId) return 1;
  if (room.seats[2] === userId) return 2;
  return null;
}

/**
 * Suscribe a cambios de la sala. Devuelve función de unsubscribe.
 * El callback recibe `null` si la sala no existe.
 *
 * Normaliza el snapshot antes de pasarlo al callback: Firebase RTDB elimina
 * valores `null` y arrays vacíos al persistir, así que campos como
 * `selection: {1: null, 2: null}` o `combatLog: []` desaparecen del JSON
 * recibido. La normalización los rellena con defaults para que los
 * consumidores no tengan que hacer defensive access en todas partes.
 */
export function listenRoom(roomId: string, callback: (room: RoomData | null) => void): () => void {
  const roomRef = ref(db, `games/${roomId}`);
  const handler = (snap: { exists: () => boolean; val: () => unknown }): void => {
    if (snap.exists()) {
      const raw = snap.val() as RoomData;
      const normalized: RoomData = {
        ...raw,
        seats: {
          1: raw.seats?.[1] ?? null,
          2: raw.seats?.[2] ?? null,
        },
        state: normalizeSerializedState(raw.state),
      };
      callback(normalized);
    } else {
      callback(null);
    }
  };
  onValue(roomRef, handler);
  return () => off(roomRef, 'value', handler);
}

// ─── Utilidades de URL ──────────────────────────────────────────────────

/** Lee `?room=XYZ` del URL. */
export function getRoomIdFromURL(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('room');
  return code ? code.toUpperCase() : null;
}

/** Construye una URL absoluta apuntando a la raíz con `?room=XYZ`.
 *  Usa import.meta.env.BASE_URL para que el path correcto funcione tanto
 *  en dev ('/') como en producción ('/olympus-protocol/').
 *  El destinatario debe llegar al Menu para que la auth anónima cree su
 *  propio usuario antes de unirse — si lo mandamos directo a /game/XYZ
 *  recibe "you are not seated in this room" porque aún no se unió. */
export function buildRoomURL(roomId: string): string {
  const url = new URL(window.location.href);
  url.pathname = import.meta.env.BASE_URL;
  url.search = `?room=${roomId}`;
  url.hash = '';
  return url.toString();
}
