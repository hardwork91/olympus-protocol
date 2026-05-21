// ============================================================================
// Hand — mano de cartas de un jugador.
//
// Layout en dos capas (CSS grid stack):
//   1. placeholdersLayer (z-index implícito): 5 slot.png siempre visibles.
//   2. cardsLayer: las cartas reales (AnimatePresence) montadas encima.
//
// Esto permite que la animación de entrada/salida de cartas sea independiente
// del placeholder — el slot.png queda fijo y la carta vuela sobre él.
// ============================================================================

import Card from '@components/Card/Card';
import type { Card as CardType, PlayerId } from '@shared/types';
import clsx from 'clsx';
import { AnimatePresence } from 'framer-motion';
import styles from './Hand.module.css';

interface HandProps {
  cards: CardType[];
  playerId: PlayerId;
  isLocal: boolean;
  selectedInstanceId?: string | null;
  showOpponentSelection?: boolean;
  onCardClick?: (instanceId: string) => void;
  maxSlots?: number;
}

export default function Hand({
  cards,
  playerId,
  isLocal,
  selectedInstanceId,
  showOpponentSelection,
  onCardClick,
  maxSlots = 5,
}: HandProps) {
  // Robo viene desde fuera del viewport (abajo si es local, arriba si rival).
  const enterFromY = isLocal ? '100vh' : '-100vh';

  return (
    <div className={clsx(styles.hand, isLocal ? styles.local : styles.opponent)}>
      {/* Capa 1 — placeholders estáticos. Siempre 5, nunca se animan. */}
      <div className={styles.placeholdersLayer}>
        {Array.from({ length: maxSlots }, (_, i) => (
          <div className={styles.placeholder} key={`ph-${playerId}-${i}`} />
        ))}
      </div>

      {/* Capa 2 — cartas animadas, montadas encima. */}
      <div className={styles.cardsLayer}>
        <AnimatePresence mode="popLayout">
          {cards.map((card, i) => {
            const isSelected =
              card.instanceId === selectedInstanceId && (isLocal || !!showOpponentSelection);
            return (
              <Card
                key={card.instanceId}
                card={card}
                faceDown={!isLocal}
                selected={isLocal && isSelected}
                opponentSelected={!isLocal && isSelected}
                onClick={isLocal && onCardClick ? () => onCardClick(card.instanceId) : undefined}
                enterFromY={enterFromY}
                enterDelay={i * 0.08}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
