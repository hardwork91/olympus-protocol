// ============================================================================
// Slot — contenedor de un slot del tablero (frontLine / rearGuard / skill).
// Renderiza la carta dentro si existe, o un placeholder con label si vacío.
// ============================================================================

import Card from '@components/Card/Card';
import type { Card as CardType, SlotName } from '@shared/types';
import clsx from 'clsx';
import styles from './Slot.module.css';

interface SlotProps {
  slot: SlotName;
  card?: CardType | null;
  /** Para slot=skill: estado de la skill ('hidden', 'active', 'consumed'). */
  skillState?: 'hidden' | 'active' | 'consumed';
  /** Si el slot acepta la carta seleccionada actualmente → highlight + onClick. */
  highlighted?: boolean;
  /** Si la skill colocada debe mostrarse oculta al rival (face down). */
  hideSkillFromOpponent?: boolean;
  onClick?: () => void;
}

const SLOT_LABELS: Record<SlotName, string> = {
  frontLine: 'Front Line',
  rearGuard: 'Rear Guard',
  skill: 'Skill',
};

export default function Slot({
  slot,
  card,
  skillState,
  highlighted,
  hideSkillFromOpponent,
  onClick,
}: SlotProps) {
  const hasCard = !!card;

  return (
    <div
      className={clsx(
        styles.slot,
        !hasCard && styles.empty,
        highlighted && styles.highlighted,
        onClick && styles.clickable,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {hasCard ? (
        <Card
          card={card}
          variant="inSlot"
          faceDown={hideSkillFromOpponent || (slot === 'skill' && skillState === 'hidden')}
          skillState={skillState}
        />
      ) : (
        <span className={styles.label}>{SLOT_LABELS[slot]}</span>
      )}
    </div>
  );
}
