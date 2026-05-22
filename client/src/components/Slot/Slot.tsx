// ============================================================================
// Slot — contenedor único de un slot del tablero (unit o skill).
// La carta dentro se renderiza con position:absolute + inset:0 para que la
// animación de entrada de Framer Motion funcione sobre el placeholder estático.
// ============================================================================

import Card from '@components/Card/Card';
import type { Card as CardType, SkillState } from '@shared/types';
import clsx from 'clsx';
import styles from './Slot.module.css';

interface SlotProps {
  card?: CardType | null;
  /** Para slot de skill: estado de la skill ('hidden' | 'active' | 'consumed'). */
  skillState?: SkillState;
  /** Si la skill debe verse de espaldas (rival viendo skill 'hidden'). */
  hideSkillFromOpponent?: boolean;
  /** Highlight cuando la carta seleccionada (de mano) es válida aquí. */
  validPlacement?: boolean;
  /** Highlight cuando un atacante seleccionado puede pegarle. */
  validTarget?: boolean;
  /** Highlight tipo "selected attacker": esta es mi unidad seleccionada para atacar. */
  selectedAttacker?: boolean;
  /** Label opcional (ej. "EMPTY", "SKILL") cuando no hay carta. */
  label?: string;
  onClick?: () => void;
  /** Modo ataque activo y este slot no es ni el atacante ni un target válido. */
  dimmed?: boolean;
}

export default function Slot({
  card,
  skillState,
  hideSkillFromOpponent,
  validPlacement,
  validTarget,
  selectedAttacker,
  label,
  onClick,
  dimmed,
}: SlotProps) {
  const hasCard = !!card;
  return (
    <div
      className={clsx(
        styles.slot,
        !hasCard && styles.empty,
        validPlacement && styles.validPlacement,
        validTarget && styles.validTarget,
        selectedAttacker && styles.selectedAttacker,
        onClick && styles.clickable,
        // Solo dimear slots con carta — los vacíos se dejan neutros
        dimmed && hasCard && styles.dimmed,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {hasCard && (
        <Card
          card={card}
          faceDown={hideSkillFromOpponent || (!!skillState && skillState === 'hidden' && !!hideSkillFromOpponent)}
          skillState={skillState}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      )}
      {!hasCard && label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
