// ============================================================================
// PlayerArea — fila horizontal de un jugador.
// Layout: [Skill] [Unit 0] [Unit 1] [Unit 2] [Unit 3] [Unit 4]
//
// PlayerInfo fue movido al InfoSidebar (columna izquierda), por eso ya no
// aparece aquí. Recibe handlers de click ya resueltos por el Board.
// ============================================================================

import Slot from '@components/Slot/Slot';
import type { PlayerId, PlayerState, UnitSlotIndex } from '@shared/types';
import { UNIT_SLOTS } from '@shared/types';
import clsx from 'clsx';
import styles from './PlayerArea.module.css';

interface PlayerAreaProps {
  playerId: PlayerId;
  player: PlayerState;
  isLocal: boolean;
  isActive: boolean;
  /** Slots de unidad válidos para placement (vacío si no aplica). */
  validUnitPlacements: Set<UnitSlotIndex>;
  /** ¿La skill slot es válida para placement? */
  validSkillPlacement: boolean;
  validSkillReplace: boolean;
  /** Slots enemigos que están en reach de un atacante seleccionado. */
  validAttackTargets: Set<UnitSlotIndex>;
  /** Slot de unidad propio que está seleccionado como atacante. */
  selectedAttackerSlot: UnitSlotIndex | null;
  onUnitSlotClick?: (index: UnitSlotIndex) => void;
  onSkillSlotClick?: () => void;
  /** Hay un atacante seleccionado — dimear todo lo que no sea relevante. */
  attackModeActive?: boolean;
}

export default function PlayerArea({
  playerId,
  player,
  isLocal,
  isActive,
  validUnitPlacements,
  validSkillPlacement,
  validSkillReplace,
  validAttackTargets,
  selectedAttackerSlot,
  onUnitSlotClick,
  onSkillSlotClick,
  attackModeActive,
}: PlayerAreaProps) {
  const skillState = player.skill?.state;
  // El rival no ve mi skill mientras esté hidden.
  const hideSkillFromOpponent = !isLocal && skillState === 'hidden';

  return (
    <section className={clsx(styles.area, 'fancy-border', isActive && styles.active)}>

      {/* Skill slot — fuera del campo de ataque, no atacable.
          En modo ataque siempre se dimea (no es target ni atacante). */}
      <Slot
        card={player.skill?.card}
        skillState={skillState}
        hideSkillFromOpponent={hideSkillFromOpponent}
        validPlacement={validSkillPlacement || validSkillReplace}
        label="SKILL"
        onClick={validSkillPlacement || validSkillReplace ? onSkillSlotClick : undefined}
        dimmed={!!attackModeActive}
      />

      {/* 5 unit slots en fila */}
      <div className={styles.unitsRow}>
        {Array.from({ length: UNIT_SLOTS }, (_, i) => {
          const index = i as UnitSlotIndex;
          const card = player.units[index];
          const isValidPlacement = validUnitPlacements.has(index);
          const isValidTarget = validAttackTargets.has(index);
          const isSelectedAttacker = selectedAttackerSlot === index;
          const interactive =
            isValidPlacement || isValidTarget || (isLocal && card !== null);
          // Dimear en modo ataque si no es ni el atacante ni un target válido
          const isDimmed = !!attackModeActive && !isSelectedAttacker && !isValidTarget;
          return (
            <Slot
              key={`u-${playerId}-${i}`}
              card={card}
              validPlacement={isValidPlacement}
              validTarget={isValidTarget}
              selectedAttacker={isSelectedAttacker}
              label={`${i + 1}`}
              onClick={interactive && onUnitSlotClick ? () => onUnitSlotClick(index) : undefined}
              dimmed={isDimmed}
            />
          );
        })}
      </div>
    </section>
  );
}
