// ============================================================================
// PlayerArea — orquesta los 3 slots + info + hand de un jugador.
// Layout: grid 2x2 con slots-grid (frontLine, rearGuard, skill, info) + hand.
// Si es el área local: hand clickeable. Si es el rival: hand face-down.
// ============================================================================

import Hand from '@components/Hand/Hand';
import PlayerInfo from '@components/PlayerInfo/PlayerInfo';
import Slot from '@components/Slot/Slot';
import type { PlayerId, PlayerState, SlotIndicator } from '@shared/types';
import clsx from 'clsx';
import styles from './PlayerArea.module.css';

interface PlayerAreaProps {
  playerId: PlayerId;
  player: PlayerState;
  isLocal: boolean;
  isActive: boolean;
  turnNumber: number;
  maxTurns: number;
  /** Selección actual: instanceId seleccionado y por quién. */
  localSelectedInstanceId: string | null;
  opponentSelectedInstanceId: string | null;
  /** Slots válidos para la carta seleccionada actualmente. */
  validSlots: SlotIndicator[];
  /** Si esta área debe mostrar el rival como activo (para halo de selección). */
  showOpponentSelection: boolean;
  /** Handler de click en una carta de la mano. */
  onHandCardClick?: (instanceId: string) => void;
  /** Handler de click en un slot. */
  onSlotClick?: (slot: SlotIndicator) => void;
  /** Orientación: 'top' (cabeza al norte) o 'bottom' (cabeza al sur).
   *  Afecta el orden interno del grid (FL/Skill arriba en top, abajo en bottom). */
  orientation: 'top' | 'bottom';
}

export default function PlayerArea({
  playerId,
  player,
  isLocal,
  isActive,
  turnNumber,
  maxTurns,
  localSelectedInstanceId,
  opponentSelectedInstanceId,
  validSlots,
  showOpponentSelection,
  onHandCardClick,
  onSlotClick,
  orientation,
}: PlayerAreaProps) {
  const isFrontHighlighted = validSlots.includes('frontLine');
  const isRearHighlighted = validSlots.includes('rearGuard');
  const isSkillHighlighted = validSlots.includes('skill') || validSlots.includes('skill_replace');

  const skillState = player.skill?.state;
  // El rival no debe ver mi skill mientras esté hidden.
  const hideSkillFromOpponent = !isLocal && skillState === 'hidden';

  return (
    <section
      className={clsx(
        styles.area,
        'fancy-border',
        styles[`orient-${orientation}`],
        isActive && styles.active,
      )}
    >
      <div className={styles.slotsGrid}>
        <Slot
          slot="rearGuard"
          card={player.rearGuard}
          highlighted={isRearHighlighted}
          onClick={isRearHighlighted ? () => onSlotClick?.('rearGuard') : undefined}
        />
        <PlayerInfo
          playerId={playerId}
          player={player}
          isActive={isActive}
          turnNumber={turnNumber}
          maxTurns={maxTurns}
        />
        <Slot
          slot="frontLine"
          card={player.frontLine}
          highlighted={isFrontHighlighted}
          onClick={isFrontHighlighted ? () => onSlotClick?.('frontLine') : undefined}
        />
        <Slot
          slot="skill"
          card={player.skill?.card}
          skillState={skillState}
          hideSkillFromOpponent={hideSkillFromOpponent}
          highlighted={isSkillHighlighted}
          onClick={
            isSkillHighlighted
              ? () =>
                  onSlotClick?.(validSlots.includes('skill_replace') ? 'skill_replace' : 'skill')
              : undefined
          }
        />
      </div>

      <Hand
        cards={player.hand}
        playerId={playerId}
        isLocal={isLocal}
        selectedInstanceId={isLocal ? localSelectedInstanceId : opponentSelectedInstanceId}
        showOpponentSelection={showOpponentSelection}
        onCardClick={onHandCardClick}
      />
    </section>
  );
}
