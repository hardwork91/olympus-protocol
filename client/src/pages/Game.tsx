// ============================================================================
// Game — vista de partida.
// - Si la sala tiene seat 2 libre: muestra Waiting screen con code + Copy URL.
// - Si ambos seats ocupados: monta el Board con todo el UI del juego.
// ============================================================================

import Board from '@components/Board/Board';
import { useRoom } from '@hooks/useRoom';
import { useUser } from '@hooks/useUser';
import { buildRoomURL } from '@services/roomService';
import { useUIStore } from '@store/uiStore';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './Game.module.css';

export default function Game() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { userId } = useUser();
  const { room, seat, loading } = useRoom(roomId ?? null, userId);
  const [copied, setCopied] = useState(false);
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
  if (!roomId || !seat) {
    return (
      <div className={styles.page}>
        <p>You are not seated in this room.</p>
        <button onClick={() => navigate('/')}>Back to menu</button>
      </div>
    );
  }

  const isWaiting = !room.seats[1] || !room.seats[2];

  const handleCopyUrl = async (): Promise<void> => {
    const url = buildRoomURL(roomId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard puede fallar; ignoramos
    }
  };

  if (isWaiting) {
    return (
      <div className={styles.page}>
        <h1>Waiting for player 2…</h1>
        <p>Share this code:</p>
        <div className={styles.code}>{roomId}</div>
        <button onClick={handleCopyUrl}>{copied ? 'Copied!' : 'Copy URL'}</button>
        <p className={styles.hint}>
          Your opponent must open the URL or enter the code in &quot;Join with code&quot;.
          <br />
          <strong>For testing in the same browser:</strong> open the URL in an incognito window
          (Ctrl+Shift+N).
        </p>
        <p className={styles.seat}>
          You are: <strong>Player {seat}</strong>
        </p>
        <button onClick={() => navigate('/')}>Exit to menu</button>
      </div>
    );
  }

  return (
    <>
      <Board roomId={roomId} state={room.state} localSeat={seat} />
      {errorMessage && <div className={styles.toast}>{errorMessage}</div>}
    </>
  );
}
