// ============================================================================
// gameService — "fake backend" para acciones del juego.
//
// Cada función PARECE un endpoint HTTP. Hoy ejecuta la lógica localmente con
// `@server/gameEngine` y persiste vía transacción en Firebase RTDB.
// Mañana: el cuerpo cambia a `fetch('/api/...')` o WebSocket. La interfaz
// pública NO cambia → los componentes no se enteran.
//
// STUBS de Fase 2: las firmas + JSDoc están listas. La implementación real
// (con Firebase) llega en Fase 3 (cuando creemos services/firebase.ts).
// ============================================================================

import type { GameConfig, PlayerId, SerializedGameState, SlotIndicator } from '@shared/types';

/** Crea una sala nueva y devuelve su id. */
export async function createRoom(_config: GameConfig): Promise<{ roomId: string }> {
  throw new Error('createRoom: not implemented (Fase 3)');
}

/** Une al usuario actual a una sala existente. Asigna seat 2. */
export async function joinRoom(_roomId: string): Promise<{ seat: PlayerId }> {
  throw new Error('joinRoom: not implemented (Fase 3)');
}

/** Coloca una carta en un slot. Server-authoritative: valida antes de mutar. */
export async function placeCard(
  _roomId: string,
  _playerId: PlayerId,
  _instanceId: string,
  _slot: SlotIndicator,
): Promise<void> {
  throw new Error('placeCard: not implemented (Fase 3)');
}

/** Declara mulligan (devuelve mano al mazo, baraja, roba 5). */
export async function declareMulligan(_roomId: string, _playerId: PlayerId): Promise<void> {
  throw new Error('declareMulligan: not implemented (Fase 3)');
}

/** Confirma la mano y pasa a colocar unidades/skill. */
export async function confirmHand(_roomId: string, _playerId: PlayerId): Promise<void> {
  throw new Error('confirmHand: not implemented (Fase 3)');
}

/** Finaliza el setup del jugador (pasa al rival o dispara coinFlip). */
export async function finishSetup(_roomId: string, _playerId: PlayerId): Promise<void> {
  throw new Error('finishSetup: not implemented (Fase 3)');
}

/** Activa el modo "reemplazar skill". */
export async function enterReplaceSkillMode(_roomId: string, _playerId: PlayerId): Promise<void> {
  throw new Error('enterReplaceSkillMode: not implemented (Fase 3)');
}

/** Cancela el modo de reemplazo. */
export async function exitReplaceSkillMode(_roomId: string, _playerId: PlayerId): Promise<void> {
  throw new Error('exitReplaceSkillMode: not implemented (Fase 3)');
}

/** Robar (paso 2 del turno). */
export async function drawPhase(_roomId: string, _playerId: PlayerId): Promise<void> {
  throw new Error('drawPhase: not implemented (Fase 3)');
}

/** Finalizar el turno: resuelve combate y pasa el control al rival. */
export async function endTurn(_roomId: string, _playerId: PlayerId): Promise<void> {
  throw new Error('endTurn: not implemented (Fase 3)');
}

/** Actualiza la carta seleccionada por el jugador (UI sync, no autoritativo). */
export async function setSelection(
  _roomId: string,
  _playerId: PlayerId,
  _instanceId: string | null,
): Promise<void> {
  throw new Error('setSelection: not implemented (Fase 3)');
}

// ─── Listeners ───────────────────────────────────────────────────────────

/** Suscribe a cambios del estado del juego. Devuelve función de unsubscribe. */
export function listenRoom(
  _roomId: string,
  _onChange: (state: SerializedGameState | null) => void,
): () => void {
  throw new Error('listenRoom: not implemented (Fase 3)');
}
