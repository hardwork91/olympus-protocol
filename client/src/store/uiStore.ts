// ============================================================================
// uiStore — estado de UI del cliente (Zustand).
// IMPORTANTE: el estado autoritativo del juego vive en Firebase. Este store
// solo guarda lo que NO se sincroniza con el rival:
//   - selection: modo de interacción actual (placing una carta de mano,
//     o atacando con una unidad propia). Mutuamente exclusivos.
//   - isAnimating: flag mientras se procesa un ataque.
//   - errorMessage: toast transitorio.
// ============================================================================

import type { Card, UnitSlotIndex } from '@shared/types';
import { create } from 'zustand';

/** Selección actual del jugador local — modo placement o modo attack. */
export type LocalSelection =
  | null
  | { kind: 'hand'; instanceId: string }
  | { kind: 'attacker'; slotIndex: UnitSlotIndex };

interface UIStore {
  selection: LocalSelection;
  setSelection: (sel: LocalSelection) => void;
  clearSelection: () => void;

  isAnimating: boolean;
  setIsAnimating: (v: boolean) => void;

  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;

  /** Carta que el jugador local tiene bajo el cursor (para el preview del sidebar izquierdo). */
  hoveredCard: Card | null;
  setHoveredCard: (card: Card | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selection: null,
  setSelection: (sel) => set({ selection: sel }),
  clearSelection: () => set({ selection: null }),

  isAnimating: false,
  setIsAnimating: (v) => set({ isAnimating: v }),

  errorMessage: null,
  setErrorMessage: (msg) => set({ errorMessage: msg }),

  hoveredCard: null,
  setHoveredCard: (card) => set({ hoveredCard: card }),
}));
