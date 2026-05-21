// ============================================================================
// Hand — mano de cartas de un jugador.
// Si es la mano local: cartas face-up, clickeables.
// Si es la mano del rival: dorsos. Si el rival tiene una carta seleccionada
//   (visible en game.selection durante su turno), se le muestra el halo
//   dorado pero sigue siendo dorso.
// ============================================================================

import Card from '@components/Card/Card';
import type { Card as CardType, PlayerId } from '@shared/types';
import clsx from 'clsx';
import styles from './Hand.module.css';

interface HandProps {
  cards: CardType[];
  playerId: PlayerId;
  isLocal: boolean;
  /** instanceId seleccionado por este jugador (visible al rival si es su turno). */
  selectedInstanceId?: string | null;
  /** Mostrar el halo de selección del rival (solo durante su turno). */
  showOpponentSelection?: boolean;
  /** Slots válidos para la carta actualmente seleccionada (para highlight). */
  validInstanceIds?: Set<string>;
  onCardClick?: (instanceId: string) => void;
  /** Tope de cartas mostradas. Rellena con placeholders si hand tiene menos. */
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
      {cards.map((card) => {
        const isSelected =
          card.instanceId === selectedInstanceId &&
          (isLocal || (showOpponentSelection && !isLocal));
        return (
          <Card
            key={card.instanceId}
            card={card}
            faceDown={!isLocal}
            selected={isSelected}
            onClick={isLocal && onCardClick ? () => onCardClick(card.instanceId) : undefined}
          />
        );
      })}
      {/* Placeholders por huecos no robados todavía (solo visual). */}
      {Array.from({ length: placeholders }, (_, i) => (
        <div key={`ph-${playerId}-${i}`} className={styles.placeholder} />
      ))}
    </div>
  );
}
