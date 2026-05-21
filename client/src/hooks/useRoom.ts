// ============================================================================
// useRoom — hook que suscribe al estado de la sala en Firebase RTDB.
// Re-renderiza cuando llega un cambio. Limpia el listener al unmount.
// ============================================================================

import { type RoomData, getMySeat, listenRoom } from '@services/roomService';
import type { PlayerId } from '@shared/types';
import { useEffect, useState } from 'react';

export interface RoomState {
  /** Datos completos de la sala, o null si no existe / aún no cargó. */
  room: RoomData | null;
  /** Seat del usuario actual (1 o 2), o null si no está asentado todavía. */
  seat: PlayerId | null;
  loading: boolean;
}

export function useRoom(roomId: string | null, userId: string | null): RoomState {
  const [activeState, setActiveState] = useState<RoomState>({
    room: null,
    seat: null,
    loading: true,
  });

  useEffect(() => {
    if (!roomId) return; // sin sala → no suscribir

    const unsub = listenRoom(roomId, (room) => {
      setActiveState({
        room,
        seat: room && userId ? getMySeat(room, userId) : null,
        loading: false,
      });
    });

    return () => {
      unsub();
    };
  }, [roomId, userId]);

  // Caso "no roomId": devolvemos un estado derivado en render (no setState).
  if (!roomId) {
    return { room: null, seat: null, loading: false };
  }
  return activeState;
}
