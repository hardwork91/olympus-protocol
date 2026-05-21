// ============================================================================
// Hand — mano de cartas de un jugador.
//
// Layout en dos capas (CSS grid stack):
//   1. placeholdersLayer: 5 slot.png siempre visibles, columnas 1..5.
//   2. cardsLayer: las cartas reales, cada una en una columna específica
//      según su slot tracked.
//
// Tracking de posiciones:
//   Cada carta recuerda en qué slot (0..4) está. Cuando una carta sale
//   (porque se jugó al tablero), su slot queda vacío. Cuando una carta
//   nueva entra (robo), toma el slot vacío más bajo. Así no se desplazan
//   las cartas que se quedan.
//
// Animación de entrada:
//   - enterFromY: '100vh' o '-100vh' según local/rival (entra desde fuera
//     del viewport vertical).
//   - enterDelay: cascade por posición en el array (i * 0.08s).
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
  // Robo viene desde fuera del viewport (abajo si es local, arriba si rival).
  const enterFromY = isLocal ? '100vh' : '-100vh';

  // Map persistente: instanceId → slot index (0..maxSlots-1).
  const [positions, setPositions] = useState<Map<string, number>>(() => new Map());
  // Key estable de la mano para detectar cambios reales (no rerenders por
  // referencia nueva del array).
  const [prevCardsKey, setPrevCardsKey] = useState('');
  const cardsKey = cards.map((c) => c.instanceId).join(',');

  // Patrón oficial React: setState durante render con guardia para "adjusting
  // state based on props". React batchea el setState con el render actual,
  // así no causa cascading renders. La guardia `cardsKey !== prevCardsKey`
  // previene loops infinitos.
  if (cardsKey !== prevCardsKey) {
    setPrevCardsKey(cardsKey);
    setPositions((prev) => {
      const next = new Map(prev);
      const currentIds = new Set(cards.map((c) => c.instanceId));
      let changed = false;

      // 1) Quitar entradas de cartas que ya no están en la mano.
      for (const id of Array.from(next.keys())) {
        if (!currentIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      // 2) Asignar slot libre más bajo a las cartas nuevas.
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

  return (
    <div className={clsx(styles.hand, isLocal ? styles.local : styles.opponent)}>
      {/* Capa 1 — placeholders estáticos. Siempre maxSlots, nunca se animan. */}
      <div
        className={styles.placeholdersLayer}
        style={{ gridTemplateColumns: `repeat(${maxSlots}, 190px)` }}
      >
        {Array.from({ length: maxSlots }, (_, i) => (
          <div className={styles.placeholder} key={`ph-${playerId}-${i}`} />
        ))}
      </div>

      {/* Capa 2 — cartas animadas en sus slots tracked. */}
      <div
        className={styles.cardsLayer}
        style={{ gridTemplateColumns: `repeat(${maxSlots}, 190px)` }}
      >
        <AnimatePresence>
          {cards.map((card, i) => {
            const slot = positions.get(card.instanceId) ?? i;
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
                style={{ gridColumn: slot + 1 }}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
