// ============================================================================
// CombatLog — render del log de combate. Hace auto-scroll al final cuando
// llegan entradas nuevas.
// ============================================================================

import type { LogEntry } from '@shared/types';
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
        entries.map((entry, i) => (
          <div key={i} className={styles.entry}>
            <span className={styles.turn}>T{entry.turn}</span>
            {entry.message}
          </div>
        ))
      )}
    </div>
  );
}
