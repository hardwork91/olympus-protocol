// ============================================================================
// Hand — mano de cartas de un jugador.
// Si es local: cartas face-up, clickeables. Si es rival: dorsos.
// `AnimatePresence` permite que Framer Motion anime el enter/exit cuando
// las cartas se añaden o se sacan de la mano.
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
  const placeholders = Math.max(0, maxSlots - cards.length);

  return (
    <div className={clsx(styles.hand, isLocal ? styles.local : styles.opponent)}>
      <AnimatePresence mode="popLayout">
        {cards.map((card) => {
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
            />
          );
        })}
      </AnimatePresence>
      {Array.from({ length: placeholders }, (_, i) => (
        <div key={`ph-${playerId}-${i}`} className={styles.placeholder} />
      ))}
    </div>
  );
}
