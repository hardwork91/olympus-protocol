// ============================================================================
// Hand — mano de cartas de un jugador.
//
// Layout: 5 slots independientes en fila. Cada slot tiene:
//   - placeholder (slot.png) siempre visible al fondo.
//   - opcionalmente una Card encima (position: absolute inset:0).
//
// Tracking de posiciones: cada carta recuerda su slot. Cuando una carta sale
// (porque se jugó al tablero), su slot queda vacío y las demás no se mueven.
// Cuando entra una carta nueva, toma el slot vacío más bajo.
//
// Animación de entrada: las cartas vienen desde fuera del viewport vertical
// (enterFromY '100vh' local / '-100vh' rival), con stagger por slot.
// ============================================================================

import Card from '@components/Card/Card';
import type { Card as CardType, PlayerId } from '@shared/types';
import clsx from 'clsx';
import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';
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
  const enterFromY = isLocal ? '100vh' : '-100vh';

  // Map persistente: instanceId → slot index (0..maxSlots-1).
  const [positions, setPositions] = useState<Map<string, number>>(() => new Map());
  const [prevCardsKey, setPrevCardsKey] = useState('');
  const cardsKey = cards.map((c) => c.instanceId).join(',');

  // Patrón oficial React: setState durante render con guardia para
  // "adjusting state based on props". React batchea sin cascading renders.
  if (cardsKey !== prevCardsKey) {
    setPrevCardsKey(cardsKey);
    setPositions((prev) => {
      const next = new Map(prev);
      const currentIds = new Set(cards.map((c) => c.instanceId));
      let changed = false;

      // Quitar entradas de cartas que ya no están en la mano.
      for (const id of Array.from(next.keys())) {
        if (!currentIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      // Asignar slot libre más bajo a las cartas nuevas.
      const usedSlots = new Set(next.values());
      for (const card of cards) {
        if (!next.has(card.instanceId)) {
          for (let slot = 0; slot < maxSlots; slot++) {
            if (!usedSlots.has(slot)) {
              next.set(card.instanceId, slot);
              usedSlots.add(slot);
              changed = true;
              break;
            }
          }
        }
      }

      return changed ? next : prev;
    });
  }

  // Para cada slot 0..maxSlots-1, encuentra qué carta lo ocupa (si alguna).
  const cardBySlot = new Map<number, CardType>();
  for (const card of cards) {
    const slot = positions.get(card.instanceId);
    if (slot !== undefined) cardBySlot.set(slot, card);
  }

  return (
    <div className={clsx(styles.hand, isLocal ? styles.local : styles.opponent)}>
      {Array.from({ length: maxSlots }, (_, slotIndex) => {
        const card = cardBySlot.get(slotIndex);
        const isSelected =
          card && card.instanceId === selectedInstanceId && (isLocal || !!showOpponentSelection);
        return (
          <div className={styles.slot} key={`slot-${playerId}-${slotIndex}`}>
            <div className={styles.placeholder} aria-hidden="true" />
            <AnimatePresence>
              {card && (
                <Card
                  key={card.instanceId}
                  card={card}
                  faceDown={!isLocal}
                  selected={isLocal && !!isSelected}
                  opponentSelected={!isLocal && !!isSelected}
                  onClick={
                    isLocal && onCardClick ? () => onCardClick(card.instanceId) : undefined
                  }
                  enterFromY={enterFromY}
                  enterDelay={slotIndex * 0.08}
                  style={{ position: 'absolute', inset: 0 }}
                />
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
