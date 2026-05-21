// ============================================================================
// Board — vista principal de la partida.
// Orquesta: PlayerArea (top), PlayerArea (bottom), Sidebar.
// Sincroniza la selección local con el state autoritativo vía gameService.
//
// Reglas de visibilidad:
// - Si localSeat == 1: P2 arriba, P1 abajo.
// - Si localSeat == 2: P1 arriba, P2 abajo.
// - El halo de selección del rival solo se ve cuando es SU turno.
// ============================================================================

import PlayerArea from '@components/PlayerArea/PlayerArea';
import Sidebar from '@components/Sidebar/Sidebar';
import { Game } from '@server/gameEngine';
import * as gameService from '@services/gameService';
import type { PlayerId, SerializedGameState, SlotIndicator } from '@shared/types';
import { otherPlayer } from '@shared/types';
import { useUIStore } from '@store/uiStore';
import styles from './Board.module.css';

interface BoardProps {
  roomId: string;
  state: SerializedGameState;
  localSeat: PlayerId;
}

export default function Board({ roomId, state, localSeat }: BoardProps) {
  const selectedInstanceId = useUIStore((s) => s.selectedInstanceId);
  const setSelectedInstanceId = useUIStore((s) => s.setSelectedInstanceId);
  const setErrorMessage = useUIStore((s) => s.setErrorMessage);

  const opponentSeat: PlayerId = otherPlayer(localSeat);

  // Game local (solo lectura) para usar validSlotsFor sin volver a implementar.
  const game = Game.fromSerialized(state);

  // Slots válidos para la carta seleccionada actualmente. Vacío si no hay
  // selección, o si no estoy en una fase donde puedo colocar.
  const validSlots: SlotIndicator[] = selectedInstanceId
    ? game.validSlotsFor(localSeat, selectedInstanceId)
    : [];

  // Si soy el activo (mi turno o mi setup), mi selección se broadcastea.
  const canBroadcastSelection =
    state.phase === 'setup'
      ? state.setupState?.currentPlayer === localSeat
      : state.activePlayer === localSeat;

  const handleHandCardClick = (instanceId: string): void => {
    // Toggle: si ya estaba seleccionada, deseleccionar.
    const newSelection = selectedInstanceId === instanceId ? null : instanceId;
    setSelectedInstanceId(newSelection);

    // Broadcast solo cuando es mi turno (server-authoritative; en otros
    // momentos la selección queda local para feedback visual personal).
    if (canBroadcastSelection) {
      gameService.setSelection(roomId, localSeat, newSelection).catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      });
    }
  };

  const handleSlotClick = (slot: SlotIndicator): void => {
    if (!selectedInstanceId) return;
    if (!validSlots.includes(slot)) return;

    const instanceId = selectedInstanceId;
    setSelectedInstanceId(null);
    // Limpiar la selección broadcasteada.
    if (canBroadcastSelection) {
      gameService.setSelection(roomId, localSeat, null).catch(() => {});
    }
    gameService.placeCard(roomId, localSeat, instanceId, slot).catch((err: unknown) => {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    });
  };

  // ¿Es turno del rival? Si sí, mostrar su halo de selección.
  const opponentIsActive =
    state.phase === 'setup'
      ? state.setupState?.currentPlayer === opponentSeat
      : state.activePlayer === opponentSeat;

  // Asignación a arriba/abajo según localSeat.
  const topId = opponentSeat;
  const bottomId = localSeat;
  const topActive =
    state.phase === 'setup'
      ? state.setupState?.currentPlayer === topId
      : state.activePlayer === topId;
  const bottomActive =
    state.phase === 'setup'
      ? state.setupState?.currentPlayer === bottomId
      : state.activePlayer === bottomId;

  return (
    <div className={styles.app}>
      <main className={styles.main}>
        <PlayerArea
          playerId={topId}
          player={state.players[topId]}
          isLocal={false}
          isActive={topActive}
          turnNumber={state.turnNumber}
          maxTurns={state.config.maxTurnos}
          localSelectedInstanceId={selectedInstanceId}
          opponentSelectedInstanceId={state.selection[topId]}
          validSlots={[]}
          showOpponentSelection={opponentIsActive}
          orientation="top"
        />
        <PlayerArea
          playerId={bottomId}
          player={state.players[bottomId]}
          isLocal={true}
          isActive={bottomActive}
          turnNumber={state.turnNumber}
          maxTurns={state.config.maxTurnos}
          localSelectedInstanceId={selectedInstanceId}
          opponentSelectedInstanceId={null}
          validSlots={validSlots}
          showOpponentSelection={false}
          onHandCardClick={handleHandCardClick}
          onSlotClick={handleSlotClick}
          orientation="bottom"
        />
      </main>

      <Sidebar roomId={roomId} state={state} localSeat={localSeat} />
    </div>
  );
}
