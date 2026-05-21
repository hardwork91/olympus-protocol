// ============================================================================
// Card — renderiza una carta (unidad o skill).
// Diseño estilo Yu-Gi-Oh con frame.png overlay + animaciones con Framer.
//   - Capa 1 (z=1): imagen de la unidad/skill como fondo
//   - Capa 2 (z=2): frame.png o skill-frame.png como overlay decorativo
//   - Capa 3 (z=3): textos absolutamente posicionados
// El tamaño usa container-type: inline-size para que los textos escalen con cqi.
// ============================================================================

import type { Card as CardType } from '@shared/types';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import styles from './Card.module.css';

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  selected?: boolean;
  highlighted?: boolean;
  opponentSelected?: boolean;
  onClick?: () => void;
  variant?: 'inHand' | 'inSlot';
  skillState?: 'hidden' | 'active' | 'consumed';
}

const cardMotion = {
  initial: { opacity: 0, y: -16, scale: 0.92 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.85, transition: { duration: 0.18 } },
  transition: { type: 'spring', stiffness: 320, damping: 26 } as const,
};

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
      <motion.button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={clsx(className, styles.cardBack)}
        layout
        initial={cardMotion.initial}
        animate={cardMotion.animate}
        exit={cardMotion.exit}
        transition={cardMotion.transition}
        whileHover={onClick ? { y: -6 } : undefined}
        whileTap={onClick ? { scale: 0.96 } : undefined}
      >
        <img src="/images/back.png" alt="Card back" className={styles.fullImg} />
      </motion.button>
    );
  }

  const isUnit = card.type === 'unit';
  const framePath = isUnit ? '/images/frame.png' : '/images/skill-frame.png';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={clsx(className, isUnit ? styles.unit : styles.skill)}
      layout
      initial={cardMotion.initial}
      animate={cardMotion.animate}
      exit={cardMotion.exit}
      transition={cardMotion.transition}
      whileHover={onClick ? { y: -6 } : undefined}
      whileTap={onClick ? { scale: 0.96 } : undefined}
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
    </motion.button>
  );
}
