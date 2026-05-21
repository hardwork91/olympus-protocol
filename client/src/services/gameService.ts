// ============================================================================
// gameService — "fake backend" para acciones del juego.
//
// Cada función PARECE un endpoint HTTP. Hoy ejecuta la lógica localmente:
//   1) Lee el state actual de Firebase RTDB.
//   2) Reconstruye Game.fromSerialized.
//   3) Valida la acción (caería un endpoint real igual de fuerte).
//   4) Aplica la mutación.
//   5) Escribe el nuevo state en Firebase con runTransaction (atómico).
//
// Mañana: el cuerpo cambia a `fetch('/api/...')` o WebSocket. La interfaz
// pública NO cambia → los componentes no se enteran.
// ============================================================================

import { Game } from '@server/gameEngine';
import type { PlayerId, SerializedGameState, SlotIndicator } from '@shared/types';
import { ref, runTransaction, set } from 'firebase/database';
import { db, sanitizeForFirebase } from './firebase';

/** Helpers internos: aplica una mutación al state con transacción de RTDB. */
async function mutateGameState(
  roomId: string,
  mutate: (game: Game) => boolean,
  actionLabel: string,
): Promise<SerializedGameState> {
  const stateRef = ref(db, `games/${roomId}/state`);
  const result = await runTransaction(stateRef, (current: SerializedGameState | null) => {
    if (!current) return current;
    const game = Game.fromSerialized(current);
    const success = mutate(game);
    if (!success) {
      // Abort: el cliente intentó algo inválido (puede ser fuera de turno,
      // slot ocupado, etc.). No escribimos.
      return current;
    }
    return sanitizeForFirebase(game.serialize());
  });

  if (!result.committed) {
    throw new Error(`${actionLabel}: transaction did not commit.`);
  }
  const value = result.snapshot.val();
  if (!value) {
    throw new Error(`${actionLabel}: room state missing.`);
  }
  return value as SerializedGameState;
}

// ─── Setup ──────────────────────────────────────────────────────────────

export async function declareMulligan(
  roomId: string,
  playerId: PlayerId,
): Promise<SerializedGameState> {
  return mutateGameState(roomId, (g) => g.declareMulligan(playerId), 'declareMulligan');
}

export async function confirmHand(
  roomId: string,
  playerId: PlayerId,
): Promise<SerializedGameState> {
  return mutateGameState(roomId, (g) => g.confirmHand(playerId), 'confirmHand');
}

export async function finishSetup(
  roomId: string,
  playerId: PlayerId,
): Promise<SerializedGameState> {
  return mutateGameState(roomId, (g) => g.finishSetup(playerId), 'finishSetup');
}

// ─── Acciones de turno ──────────────────────────────────────────────────

export async function placeCard(
  roomId: string,
  playerId: PlayerId,
  instanceId: string,
  slot: SlotIndicator,
): Promise<SerializedGameState> {
  return mutateGameState(roomId, (g) => g.placeCard(playerId, instanceId, slot), 'placeCard');
}

export async function enterReplaceSkillMode(
  roomId: string,
  playerId: PlayerId,
): Promise<SerializedGameState> {
  return mutateGameState(roomId, (g) => g.enterReplaceSkillMode(playerId), 'enterReplaceSkillMode');
}

export async function exitReplaceSkillMode(
  roomId: string,
  playerId: PlayerId,
): Promise<SerializedGameState> {
  return mutateGameState(roomId, (g) => g.exitReplaceSkillMode(playerId), 'exitReplaceSkillMode');
}

export async function drawPhase(roomId: string, playerId: PlayerId): Promise<SerializedGameState> {
  return mutateGameState(
    roomId,
    (g) => {
      if (g.activePlayer !== playerId) return false;
      g.drawPhase(playerId);
      return true;
    },
    'drawPhase',
  );
}

export async function endTurn(roomId: string, playerId: PlayerId): Promise<SerializedGameState> {
  return mutateGameState(
    roomId,
    (g) => {
      if (g.activePlayer !== playerId) return false;
      const result = g.endTurn();
      return result !== null;
    },
    'endTurn',
  );
}

// ─── UI sync (no autoritativo) ───────────────────────────────────────────

/**
 * Actualiza la carta seleccionada del jugador. Esto NO es una acción de juego
 * — es solo para sincronizar UI (mostrar halo al rival). Por eso usamos set()
 * directo (no transacción), es más liviano.
 */
export async function setSelection(
  roomId: string,
  playerId: PlayerId,
  instanceId: string | null,
): Promise<void> {
  await set(
    ref(db, `games/${roomId}/state/selection/${playerId}`),
    sanitizeForFirebase(instanceId),
  );
}
