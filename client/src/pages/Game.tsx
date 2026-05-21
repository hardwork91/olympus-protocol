// ============================================================================
// Game — vista de la partida (tablero completo).
// Asume que ambos jugadores ya están en la sala — la pantalla de espera
// vive en /  (Menu) para que la transición sea continua sin saltos.
//
// Si el usuario llega aquí sin estar asentado, lo redirigimos a /?room=XYZ
// para que el Menu maneje el flujo de Join.
// ============================================================================

import Board from '@components/Board/Board';
import { useRoom } from '@hooks/useRoom';
import { useUser } from '@hooks/useUser';
import { useUIStore } from '@store/uiStore';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import styles from './Game.module.css';

export default function Game() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { userId } = useUser();
  const { room, seat, loading } = useRoom(roomId ?? null, userId);
  const errorMessage = useUIStore((s) => s.errorMessage);
  const setErrorMessage = useUIStore((s) => s.setErrorMessage);

  // Auto-clear errores tras 4s
  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(() => setErrorMessage(null), 4000);
    return () => clearTimeout(t);
  }, [errorMessage, setErrorMessage]);

  if (loading) return <div className={styles.page}>Loading room…</div>;

  if (!room) {
    return (
      <div className={styles.page}>
        <p>Room not found.</p>
        <button onClick={() => navigate('/')}>Back to menu</button>
      </div>
    );
  }

  // No estoy asentado en esta sala → redirige al Menu con ?room para que
  // ofrezca el flujo de Join.
  if (!seat && roomId) {
    return <Navigate to={`/?room=${roomId}`} replace />;
  }

  // Si todavía hay un seat libre (caso edge: el rival se desconectó después
  // de unirse) → volver al menu/waiting.
  if (!room.seats[1] || !room.seats[2]) {
    return <Navigate to={`/?room=${roomId}`} replace />;
  }

  if (!roomId || !seat) return null;

  return (
    <>
      <Board roomId={roomId} state={room.state} localSeat={seat} />
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            key="toast"
            className={styles.toast}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24, transition: { duration: 0.18 } }}
            transition={{ duration: 0.22 }}
          >
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
