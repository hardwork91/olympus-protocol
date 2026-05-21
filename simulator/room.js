// Gestión de salas en Firebase Realtime Database.
// Una "sala" vive en /games/{roomId} y contiene:
//   - config: parámetros (vida, turnos, force-p1)
//   - state: estado serializado del Game
//   - seats: { 1: uid, 2: uid|null } — asientos ocupados
//   - createdAt: timestamp del servidor

import {
  db, ref, set, get, update, onValue, off, runTransaction, serverTimestamp,
  userPromise
} from './firebase-config.js';
import { Game } from './game.js';

// Sin O/0/I/1 para evitar confusión al dictar el código.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode() {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

// Crea una sala nueva. El usuario actual se asienta como jugador 1.
// Devuelve { roomId, user }.
export async function createRoom(config) {
  const user = await userPromise;
  const roomId = generateCode();

  // Construimos el estado inicial usando la lógica existente de Game.
  // El Game.constructor ya hace el reparto del mazo, robo de 5, etc.
  const localGame = new Game(config);
  const initialState = localGame.serialize();

  const roomData = {
    config,
    state: sanitizeForFirebase(initialState),
    seats: { 1: user.uid, 2: null },
    createdAt: serverTimestamp(),
  };

  await set(ref(db, `games/${roomId}`), roomData);
  return { roomId, user };
}

// Une al usuario actual como jugador 2 a una sala existente.
// Casos:
//   - Usuario ya es seat 2 → reconnect, devolver tal cual.
//   - Usuario ya es seat 1 y seat 2 está vacío → ERROR: está intentando unirse a su propia sala
//     (típico bug de testing en el mismo navegador con dos pestañas).
//   - Usuario ya es seat 1 y seat 2 está ocupado → reconnect como seat 1.
//   - Usuario no está sentado, seat 2 vacío → reclama seat 2.
//   - Usuario no está sentado, seat 2 ocupado → ERROR: sala llena.
export async function joinRoom(roomId) {
  const user = await userPromise;
  const snap = await get(ref(db, `games/${roomId}`));

  if (!snap.exists()) {
    throw new Error('Room not found. Check the code.');
  }

  const room = snap.val();

  // Reconnect as seat 2
  if (room.seats && room.seats[2] === user.uid) {
    return { roomId, user, room };
  }

  // Case "you're trying to join your own room": you are already seat 1
  if (room.seats && room.seats[1] === user.uid) {
    if (room.seats[2]) {
      // seat 2 already occupied by another: normal reconnect as seat 1
      return { roomId, user, room };
    } else {
      // seat 2 empty and you are seat 1: trying to join your own room
      throw new Error(
        'You are already Player 1 in this room. To add a Player 2, ' +
        'open the URL in an incognito window (Ctrl+Shift+N) or another browser.'
      );
    }
  }

  // You are not seated: try to claim seat 2
  if (room.seats && room.seats[2]) {
    throw new Error('Room full. There are already 2 players in this game.');
  }

  const seatsRef = ref(db, `games/${roomId}/seats/2`);
  const result = await runTransaction(seatsRef, (current) => {
    if (current) {
      return; // abort if someone took it between our get() and the transaction
    }
    return user.uid;
  });

  if (!result.committed) {
    throw new Error('Room full (another player joined before you).');
  }

  const updated = await get(ref(db, `games/${roomId}`));
  return { roomId, user, room: updated.val() };
}

// Determina el seat (1 o 2) del usuario actual en una sala.
// Devuelve 1, 2, o null si no está asentado.
export function getMySeat(room, userId) {
  if (!room || !room.seats) return null;
  if (room.seats[1] === userId) return 1;
  if (room.seats[2] === userId) return 2;
  return null;
}

// Subscribe to room changes. Returns an unsubscribe function.
export function listenRoom(roomId, callback) {
  const roomRef = ref(db, `games/${roomId}`);
  const handler = (snap) => {
    if (snap.exists()) callback(snap.val());
  };
  onValue(roomRef, handler);
  return () => off(roomRef, 'value', handler);
}

// Escribe (sobreescribe) el state completo del Game en Firebase.
// Sanitiza el objeto antes de escribir porque Firebase RTDB rechaza valores undefined.
export async function writeState(roomId, state) {
  await set(ref(db, `games/${roomId}/state`), sanitizeForFirebase(state));
}

// Recorre recursivamente el objeto y reemplaza valores undefined por null
// (RTDB rechaza undefined; null es válido). Crea copia, no muta el original.
export function sanitizeForFirebase(obj) {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirebase);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue; // omitir keys con undefined
      out[k] = sanitizeForFirebase(v);
    }
    return out;
  }
  return obj;
}

// Lee el roomId del query param ?room=XYZ
export function getRoomIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('room');
  return code ? code.toUpperCase() : null;
}

// Construye una URL absoluta con ?room=XYZ (para copiar y compartir).
export function buildRoomURL(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  return url.toString();
}

// Actualiza la URL del navegador (sin recargar) para incluir el roomId.
export function setRoomInURL(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', url.toString());
}
