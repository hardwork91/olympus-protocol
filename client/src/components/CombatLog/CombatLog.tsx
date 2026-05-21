// ============================================================================
// CombatLog — render del log de combate con auto-scroll y fade-in de
// entradas nuevas (Framer Motion).
// ============================================================================

import type { LogEntry } from '@shared/types';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import styles from './CombatLog.module.css';

interface CombatLogProps {
  entries: LogEntry[];
}

export default function CombatLog({ entries }: CombatLogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div ref={containerRef} className={styles.log}>
      {entries.length === 0 ? (
        <div className={styles.empty}>Combat log will appear here.</div>
      ) : (
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => (
            <motion.div
              key={i}
              className={styles.entry}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
            >
              <span className={styles.turn}>T{entry.turn}</span>
              {entry.message}
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
