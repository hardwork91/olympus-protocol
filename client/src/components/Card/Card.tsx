// ============================================================================
// Card — renderiza una carta (unidad o skill).
// Variantes:
//   - inHand: tamaño completo, clickeable, muestra info
//   - inSlot: ocupa el slot, no clickeable directamente
//   - faceDown: dorso opaco (mano del rival, skill hidden, etc.)
// ============================================================================

import type { Card as CardType } from '@shared/types';
import clsx from 'clsx';
import styles from './Card.module.css';

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  selected?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
  variant?: 'inHand' | 'inSlot';
  /** Skill state ('hidden', 'active', 'consumed') si aplica. */
  skillState?: 'hidden' | 'active' | 'consumed';
}

export default function Card({
  card,
  faceDown,
  selected,
  highlighted,
  onClick,
  variant = 'inHand',
  skillState,
}: CardProps) {
  if (faceDown || !card) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          styles.card,
          styles.cardBack,
          variant === 'inSlot' && styles.inSlot,
          selected && styles.selected,
          highlighted && styles.highlighted,
          !onClick && styles.notClickable,
        )}
        disabled={!onClick}
      >
        <div className={styles.backInner}>?</div>
      </button>
    );
  }

  const isUnit = card.type === 'unit';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={clsx(
        styles.card,
        isUnit ? styles.unit : styles.skill,
        styles[`subtype-${card.subtype.toLowerCase()}`],
        variant === 'inSlot' && styles.inSlot,
        selected && styles.selected,
        highlighted && styles.highlighted,
        skillState === 'active' && styles.skillActive,
        skillState === 'consumed' && styles.skillConsumed,
        !onClick && styles.notClickable,
      )}
    >
      <header className={styles.cardTop}>
        <span className={styles.cardName}>
          #{card.id} {card.name}
        </span>
      </header>

      <div className={styles.cardBody}>
        <div className={styles.cardSubtype}>{card.subtype}</div>
        {isUnit ? (
          <div className={styles.cardLore}>{card.lore ?? ''}</div>
        ) : (
          <div className={styles.cardEffect}>{card.effect}</div>
        )}
      </div>

      {isUnit && (
        <footer className={styles.cardBottom}>
          <span className={styles.fp}>⚔ {card.firepower}</span>
          <span className={styles.armor}>🛡 {card.armor}</span>
        </footer>
      )}
    </button>
  );
}
