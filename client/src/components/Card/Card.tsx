// ============================================================================
// Card — renderiza una carta (unidad o skill).
// Diseño estilo Yu-Gi-Oh con frame.png overlay + animaciones con Framer.
//   - Capa 1 (z=1): imagen de la unidad/skill como fondo
//   - Capa 2 (z=2): frame.png o skill-frame.png como overlay decorativo
//   - Capa 3 (z=3): textos absolutamente posicionados
// El tamaño usa container-type: inline-size para que los textos escalen con cqi.
// ============================================================================

import type { Card as CardType } from '@shared/types';
import { asset } from '@utils/asset';
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
  /** Posición Y inicial para la animación de entrada (default: -16 px).
   *  Acepta `'100vh'` o `'-100vh'` para que la carta venga desde fuera
   *  del viewport (efecto de robo de mazo). */
  enterFromY?: number | string;
  /** Delay en segundos para la animación de entrada (stagger cuando entran
   *  varias cartas a la vez). Solo aplica al mount inicial. */
  enterDelay?: number;
  /** Style inline opcional (usado por Hand para posicionar via grid-column). */
  style?: React.CSSProperties;
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
  enterFromY = -16,
  enterDelay = 0,
  style,
}: CardProps) {
  // Spring-based entrance. La Y inicial es parametrizable para que el robo
  // pueda venir desde fuera de la pantalla (Hand pasa '100vh' o '-100vh').
  // Cuando viene desde lejos suavizamos el spring (damping mayor) para no
  // overshoot demasiado al llegar.
  const isLongDistance =
    typeof enterFromY === 'string' && (enterFromY.includes('vh') || enterFromY.includes('%'));
  const baseSpring = isLongDistance
    ? ({ type: 'spring', stiffness: 220, damping: 30 } as const)
    : ({ type: 'spring', stiffness: 320, damping: 26 } as const);
  const cardMotion = {
    initial: { opacity: 0, y: enterFromY, scale: 0.92 },
    // El delay vive en animate.transition (no en el global) para que solo
    // afecte al mount inicial, no a hover/tap subsecuentes.
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { ...baseSpring, delay: enterDelay },
    },
    exit: { opacity: 0, scale: 0.85, transition: { duration: 0.18 } },
  };

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
        style={style}
        layout
        initial={cardMotion.initial}
        animate={cardMotion.animate}
        exit={cardMotion.exit}
        whileHover={onClick ? { y: -6 } : undefined}
        whileTap={onClick ? { scale: 0.96 } : undefined}
      >
        <img src={asset('/images/back.png')} alt="Card back" className={styles.fullImg} />
      </motion.button>
    );
  }

  const isUnit = card.type === 'unit';
  const framePath = asset(isUnit ? '/images/frame.png' : '/images/skill-frame.png');

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={clsx(className, isUnit ? styles.unit : styles.skill)}
      style={style}
      layout
      initial={cardMotion.initial}
      animate={cardMotion.animate}
      exit={cardMotion.exit}
      whileHover={onClick ? { y: -6 } : undefined}
      whileTap={onClick ? { scale: 0.96 } : undefined}
    >
      {/* Capa 1: imagen de la unidad/skill */}
      {card.image && (
        <img src={asset(card.image)} alt={card.name} className={styles.bgImg} />
      )}
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
