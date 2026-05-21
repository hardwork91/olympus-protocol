// ============================================================================
// Card — renderiza una carta (unidad o skill).
// Diseño estilo Yu-Gi-Oh con frame.png overlay:
//   - Capa 1 (z=1): imagen de la unidad/skill como fondo (object-fit: cover)
//   - Capa 2 (z=2): frame.png o skill-frame.png como overlay decorativo
//   - Capa 3 (z=3): textos absolutamente posicionados (nombre, FP, AR, lore)
// El tamaño usa container-type: inline-size para que los textos escalen con cqi.
// ============================================================================

import type { Card as CardType } from '@shared/types';
import clsx from 'clsx';
import styles from './Card.module.css';

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  selected?: boolean;
  highlighted?: boolean;
  /** Halo dorado tipo "selección del rival" — mismo color, animación distinta. */
  opponentSelected?: boolean;
  onClick?: () => void;
  variant?: 'inHand' | 'inSlot';
  skillState?: 'hidden' | 'active' | 'consumed';
}

export default function Card({
  card,
  faceDown,
  selected,
  highlighted,
  opponentSelected,
  onClick,
  variant = 'inHand',
  skillState,
}: CardProps) {
  const className = clsx(
    styles.card,
    variant === 'inSlot' && styles.inSlot,
    variant === 'inHand' && styles.inHand,
    selected && styles.selected,
    opponentSelected && styles.opponentSelected,
    highlighted && styles.highlighted,
    skillState === 'active' && styles.skillActive,
    skillState === 'consumed' && styles.skillConsumed,
    !onClick && styles.notClickable,
  );

  if (faceDown || !card) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={clsx(className, styles.cardBack)}
      >
        <img src="/images/back.png" alt="Card back" className={styles.fullImg} />
      </button>
    );
  }

  const isUnit = card.type === 'unit';
  const framePath = isUnit ? '/images/frame.png' : '/images/skill-frame.png';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={clsx(className, isUnit ? styles.unit : styles.skill)}
    >
      {/* Capa 1: imagen de la unidad/skill */}
      {card.image && <img src={`/${card.image}`} alt={card.name} className={styles.bgImg} />}
      {/* Capa 2: frame decorativo */}
      <img src={framePath} alt="" aria-hidden="true" className={styles.frameImg} />
      {/* Capa 3: textos */}
      <div className={styles.frameName}>{card.name}</div>
      {isUnit ? (
        <>
          <div className={styles.frameFp}>{card.firepower}</div>
          <div className={styles.frameAr}>{card.armor}</div>
          {card.lore && <div className={styles.frameDesc}>{card.lore}</div>}
        </>
      ) : (
        <div className={clsx(styles.frameDesc, styles.skillDesc)}>{card.effect}</div>
      )}
    </button>
  );
}
