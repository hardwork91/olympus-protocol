// ============================================================================
// InfoSidebar — columna izquierda del tablero.
// Muestra:
//   1. Preview grande de la carta que el jugador LOCAL tiene bajo el cursor.
//   2. Stats de la partida: vida de ambos jugadores, turno, mazo, efectos.
//
// El hover se rastrea globalmente en uiStore.hoveredCard — Card.tsx lo
// actualiza en onMouseEnter/onMouseLeave. Como todo ocurre en el mismo
// navegador, todos los eventos de mouse son del jugador local.
// ============================================================================

import Card from '@components/Card/Card';
import { UNITS } from '@shared/cards';
import type { Card as CardType, PlayerId, PlayerState, SerializedGameState } from '@shared/types';
import { otherPlayer } from '@shared/types';
import { useUIStore } from '@store/uiStore';
import clsx from 'clsx';
import styles from './InfoSidebar.module.css';

interface InfoSidebarProps {
  state: SerializedGameState;
  localSeat: PlayerId;
}

// ─── Bloque de stats de un jugador ──────────────────────────────────────────
function PlayerBlock({
  label,
  player,
  isActive,
}: {
  label: string;
  player: PlayerState;
  isActive: boolean;
}) {
  return (
    <div className={styles.playerBlock}>
      <div className={styles.playerName}>
        {label}
        {isActive && <span className={styles.activeDot}>● Active</span>}
      </div>
      <div className={styles.statRow}>
        <span>❤ Life</span>
        <span className={styles.statVal}>{player.life}</span>
      </div>
      <div className={styles.statRow}>
        <span>🂠 Deck</span>
        <span className={styles.statVal}>{player.deck.length}</span>
      </div>
      <div className={styles.statRow}>
        <span>Hand</span>
        <span className={styles.statVal}>{player.hand.length}</span>
      </div>
      {player.pendingEffects.length > 0 && (
        <div className={styles.pendingList}>
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

// ─── Componente principal ────────────────────────────────────────────────────
export default function InfoSidebar({ state, localSeat }: InfoSidebarProps) {
  const hoveredCard = useUIStore((s) => s.hoveredCard);
  const opponentSeat = otherPlayer(localSeat);

  // Mostrar siempre las estadísticas originales de la carta (sin bonos de campo
  // ni daño a armadura acumulado). Buscamos la definición original por id en UNITS.
  const displayCard: CardType | undefined = (() => {
    if (!hoveredCard) return undefined;
    if (hoveredCard.type !== 'unit') return hoveredCard;
    const template = UNITS.find((u) => u.id === hoveredCard.id);
    if (!template) return hoveredCard;
    return { ...hoveredCard, armor: template.armor, firepower: template.firepower };
  })();

  const isActive = (id: PlayerId): boolean =>
    state.phase === 'setup'
      ? state.setupState?.currentPlayer === id
      : state.activePlayer === id;

  return (
    <aside className={clsx(styles.sidebar, 'fancy-border')}>
      {/* ── Preview de carta ─────────────────────────────────────── */}
      <div className={styles.previewSection}>
        <div className={styles.previewLabel}>CARD DETAIL</div>
        <div className={styles.previewWrapper}>
          {displayCard ? (
            <Card card={displayCard} variant="inSlot" />
          ) : (
            <div className={styles.previewEmpty}>
              <span className={styles.previewHint}>hover a card</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats de la partida ───────────────────────────────────── */}
      <div className={styles.statsSection}>
        <div className={styles.statsTurn}>
          Turn {state.turnNumber} / {state.config.maxTurnos}
        </div>

        <PlayerBlock
          label={`Player ${localSeat} (You)`}
          player={state.players[localSeat]}
          isActive={isActive(localSeat)}
        />

        <div className={styles.divider} />

        <PlayerBlock
          label={`Player ${opponentSeat} (Rival)`}
          player={state.players[opponentSeat]}
          isActive={isActive(opponentSeat)}
        />
      </div>
    </aside>
  );
}
