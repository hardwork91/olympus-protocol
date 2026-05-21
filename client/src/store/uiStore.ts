// ============================================================================
// uiStore — estado de UI del cliente (Zustand).
// IMPORTANTE: el estado autoritativo del juego vive en Firebase, no acá.
// Este store guarda solo cosas que NO se sincronizan con el rival:
//   - selección de carta local (la que se sí broadcastea va por gameService)
//   - flag de animación (mientras endTurn está procesando)
//   - mensajes de error transitorios
// ============================================================================

import { create } from 'zustand';

interface UIStore {
  /** ID de la carta seleccionada por el jugador local. */
  selectedInstanceId: string | null;
  setSelectedInstanceId: (id: string | null) => void;

  /** True mientras endTurn está animando el combate. Bloquea otras acciones. */
  isAnimating: boolean;
  setIsAnimating: (v: boolean) => void;

  /** Mensaje de error transitorio (toast). */
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedInstanceId: null,
  setSelectedInstanceId: (id) => set({ selectedInstanceId: id }),

  isAnimating: false,
  setIsAnimating: (v) => set({ isAnimating: v }),

  errorMessage: null,
  setErrorMessage: (msg) => set({ errorMessage: msg }),
}));
