// ============================================================================
// Game — vista de partida. En Fase 3 solo muestra:
//   - Mensaje "Waiting for player 2..." si la sala tiene un seat libre.
//   - Estado básico cuando ambos jugadores están dentro (placeholder).
//
// El UI real del tablero (cartas, slots, action bar) llega en Fase 4.
// ============================================================================

import { useRoom } from '@hooks/useRoom';
import { useUser } from '@hooks/useUser';
import { buildRoomURL } from '@services/roomService';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './Game.module.css';

export default function Game() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { userId } = useUser();
  const { room, seat, loading } = useRoom(roomId ?? null, userId);
  const [copied, setCopied] = useState(false);

  if (loading) return <div className={styles.page}>Loading room…</div>;
  if (!room) {
    return (
      <div className={styles.page}>
        <p>Room not found.</p>
        <button onClick={() => navigate('/')}>Back to menu</button>
      </div>
    );
  }

  const isWaiting = !room.seats[1] || !room.seats[2];

  const handleCopyUrl = async (): Promise<void> => {
    if (!roomId) return;
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
          You are: <strong>Player {seat ?? '?'}</strong>
        </p>
        <button onClick={() => navigate('/')}>Exit to menu</button>
      </div>
    );
  }

  // Ambos jugadores conectados — placeholder de Fase 4.
  return (
    <div className={styles.page}>
      <h1>Game in progress</h1>
      <p className={styles.seat}>
        Seat: <strong>Player {seat ?? '?'}</strong>
      </p>
      <p>Phase: {room.state.phase}</p>
      <p>Active player: {room.state.activePlayer ?? '—'}</p>
      <p>Turn: {room.state.turnNumber}</p>
      <p style={{ marginTop: 24, color: 'var(--text-dim)' }}>UI del tablero llega en Fase 4.</p>
      <button onClick={() => navigate('/')}>Exit to menu</button>
    </div>
  );
}
