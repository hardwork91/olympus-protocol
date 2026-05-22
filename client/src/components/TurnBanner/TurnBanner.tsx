// ============================================================================
// TurnBanner — anuncio centrado que aparece al inicio de cada turno.
// Se monta con AnimatePresence en Board.tsx y se desmonta automáticamente
// tras la animación.
// ============================================================================

import type { PlayerId } from '@shared/types';
import { motion } from 'framer-motion';
import styles from './TurnBanner.module.css';

interface TurnBannerProps {
  playerId: PlayerId;
}

export default function TurnBanner({ playerId }: TurnBannerProps) {
  return (
    // Wrapper estático: sólo centra. Framer no toca este elemento.
    <div className={styles.bannerWrapper} aria-live="polite">
      <motion.div
        className={styles.banner}
        initial={{ opacity: 0, scale: 0.55, y: 10 }}
        animate={{
          opacity: [0, 1,    1,    1,    0],
          scale:   [0.55, 1.08, 1,    1,    0.9],
          y:       [10,   0,    0,    0,    -18],
        }}
        transition={{
          duration: 2.8,
          times:    [0, 0.14, 0.3, 0.72, 1],
          ease:     'easeOut',
        }}
      >
        Player {playerId} Turn
      </motion.div>
    </div>
  );
}
