// ============================================================================
// DamageFloat — número de daño que flota hacia arriba y desaparece.
// Se monta cuando hay daño y Framer anima opacity 1→0 + y 0→-50px.
// El padre lo desmonta tras ~1.4s (cuando la animación ya terminó).
// ============================================================================

import { motion } from 'framer-motion';
import styles from './DamageFloat.module.css';

interface DamageFloatProps {
  /** Cantidad de daño (positivo). Se muestra como "-amount". */
  amount: number;
}

export default function DamageFloat({ amount }: DamageFloatProps) {
  return (
    <motion.div
      className={styles.float}
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 0, y: -52, scale: 1.18 }}
      transition={{ duration: 1.25, ease: 'easeOut' }}
      aria-hidden="true"
    >
      -{amount}
    </motion.div>
  );
}
