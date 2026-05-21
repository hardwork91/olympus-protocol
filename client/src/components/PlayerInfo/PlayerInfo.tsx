// ============================================================================
// PlayerInfo — panel con la info básica del jugador (life, deck, turno).
// Ocupa el 4to cuadrante del slots-grid (donde no hay slot físico).
// ============================================================================

import type { PlayerId, PlayerState } from '@shared/types';
import styles from './PlayerInfo.module.css';

interface PlayerInfoProps {
  playerId: PlayerId;
  player: PlayerState;
  isActive: boolean;
  turnNumber: number;
  maxTurns: number;
}

export default function PlayerInfo({
  playerId,
  player,
  isActive,
  turnNumber,
  maxTurns,
}: PlayerInfoProps) {
  return (
    <div className={styles.info}>
      <div className={styles.name}>
        Player {playerId}
        {isActive && <span className={styles.activeBadge}>● Active</span>}
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Life</span>
        <span className={styles.value}>❤ {player.life}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Deck</span>
        <span className={styles.value}>🂠 {player.deck.length}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Hand</span>
        <span className={styles.value}>{player.hand.length}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Turn</span>
        <span className={styles.value}>
          {turnNumber}/{maxTurns}
        </span>
      </div>
      {player.pendingEffects.length > 0 && (
        <div className={styles.pending}>
          {player.pendingEffects.map((e, i) => (
            <span key={i} className={styles.pendingTag}>
              {e.type}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
