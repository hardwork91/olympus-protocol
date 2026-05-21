// ============================================================================
// Menu — pantalla única para todo el lobby (no saltos entre páginas).
// Estados (mode):
//   1. 'idle'     — botones Create / Join
//   2. 'creating' — formulario de configuración
//   3. 'joining'  — formulario de código de sala
//   4. 'waiting'  — sala creada, esperando a player 2 (con Copy URL)
//
// Al detectar ?room=XYZ en la URL → auto-abre el flujo de Join con el código.
// Cuando ambos jugadores están en la sala → navega a /game/:roomId.
// La URL se actualiza con history.replaceState al entrar en 'waiting' para
// que sea shareable sin navegación.
// ============================================================================

import { useRoom } from '@hooks/useRoom';
import { useUser } from '@hooks/useUser';
import { buildRoomURL, createRoom, getRoomIdFromURL, joinRoom } from '@services/roomService';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Menu.module.css';

const modeMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
  transition: { duration: 0.22 },
};

type MenuMode = 'idle' | 'creating' | 'joining' | 'waiting';

export default function Menu() {
  const navigate = useNavigate();
  const { userId, loading: authLoading, error: authError } = useUser();

  // Lee ?room=XYZ del URL UNA VEZ en mount.
  const initialUrlCode = useState(() => getRoomIdFromURL())[0];

  const [mode, setMode] = useState<MenuMode>(initialUrlCode ? 'joining' : 'idle');
  const [vida, setVida] = useState(20);
  const [turnos, setTurnos] = useState(20);
  const [code, setCode] = useState(initialUrlCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingRoomId, setWaitingRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Suscripción a la sala (solo activa cuando estamos en 'waiting').
  const { room } = useRoom(mode === 'waiting' ? waitingRoomId : null, userId);

  // Cuando ambos seats estén ocupados → navega al game.
  useEffect(() => {
    if (
      mode === 'waiting' &&
      waitingRoomId &&
      room &&
      room.seats[1] &&
      room.seats[2]
    ) {
      navigate(`/game/${waitingRoomId}`);
    }
  }, [mode, room, waitingRoomId, navigate]);

  const handleCreate = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const { roomId } = await createRoom({
        vidaInicial: vida,
        maxTurnos: turnos,
        forceP1Start: false,
      });
      setWaitingRoomId(roomId);
      setMode('waiting');
      // Actualiza la URL para que sea shareable, sin navegación.
      window.history.replaceState({}, '', `/?room=${roomId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (): Promise<void> => {
    setError(null);
    if (!code.trim()) {
      setError('Enter a room code.');
      return;
    }
    setBusy(true);
    try {
      const { roomId } = await joinRoom(code.trim().toUpperCase());
      navigate(`/game/${roomId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyUrl = async (): Promise<void> => {
    if (!waitingRoomId) return;
    try {
      await navigator.clipboard.writeText(buildRoomURL(waitingRoomId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleCancelWaiting = (): void => {
    setMode('idle');
    setWaitingRoomId(null);
    window.history.replaceState({}, '', '/');
  };

  if (authLoading) {
    return <div className={styles.menu}>Connecting…</div>;
  }
  if (authError) {
    return <div className={styles.menu}>Auth error: {authError.message}</div>;
  }
  if (!userId) {
    return <div className={styles.menu}>No user. Reload.</div>;
  }

  return (
    <div className={styles.menu}>
      <div className={styles.cardWrapper}>
        <div className={styles.cardDeco} />
        <div className={clsx(styles.card, 'fancy-border')}>
          <h1 className={styles.title}>OLYMPUS PROTOCOL</h1>
          <p className={styles.subtitle}>1v1 Online Simulator</p>

          <AnimatePresence mode="wait">
            {mode === 'idle' && (
              <motion.div key="idle" className={styles.buttons} {...modeMotion}>
                <button
                  className="fancy-button fancy-button-sm"
                  onClick={() => setMode('creating')}
                  disabled={busy}
                >
                  Create
                </button>
                <button
                  className="fancy-button fancy-button-sm"
                  onClick={() => setMode('joining')}
                  disabled={busy}
                >
                  Join
                </button>
              </motion.div>
            )}

            {mode === 'creating' && (
              <motion.div key="creating" className={styles.form} {...modeMotion}>
                <h2>Create game</h2>
                <label>
                  Starting life (10–50):
                  <input
                    type="number"
                    min={10}
                    max={50}
                    value={vida}
                    onChange={(e) => setVida(parseInt(e.target.value, 10))}
                  />
                </label>
                <label>
                  Max turns (10–40):
                  <input
                    type="number"
                    min={10}
                    max={40}
                    value={turnos}
                    onChange={(e) => setTurnos(parseInt(e.target.value, 10))}
                  />
                </label>
                <div className={styles.buttons}>
                  <button
                    className="fancy-button fancy-button-sm"
                    onClick={handleCreate}
                    disabled={busy}
                  >
                    {busy ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    className="fancy-button fancy-button-sm"
                    onClick={() => setMode('idle')}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}

            {mode === 'joining' && (
              <motion.div key="joining" className={styles.form} {...modeMotion}>
                <h2>Join game</h2>
                <label>
                  Room code (6 characters):
                  <input
                    type="text"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
                  />
                </label>
                <div className={styles.buttons}>
                  <button
                    className="fancy-button fancy-button-sm"
                    onClick={handleJoin}
                    disabled={busy}
                  >
                    {busy ? 'Joining…' : 'Join'}
                  </button>
                  <button
                    className="fancy-button fancy-button-sm"
                    onClick={() => setMode('idle')}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}

            {mode === 'waiting' && waitingRoomId && (
              <motion.div key="waiting" className={styles.form} {...modeMotion}>
                <h2>Waiting for player 2…</h2>
                <p className={styles.waitingHint}>Share this code:</p>
                <div className={clsx('fancy-label', styles.codeLabel)}>
                  <span className={clsx('fancy-label-text', styles.codeText)}>
                    {waitingRoomId}
                  </span>
                </div>
                <div className={styles.buttons}>
                  <button
                    className="fancy-button fancy-button-sm"
                    onClick={handleCopyUrl}
                  >
                    {copied ? 'Copied!' : 'Share invite link'}
                  </button>
                </div>
                <p className={styles.waitingHint}>
                  Your opponent must open the URL or enter the code in &quot;Join&quot;.
                  <br />
                  <strong>Same browser test:</strong> open the URL in an incognito window
                  (Ctrl+Shift+N).
                </p>
                <div className={styles.buttons}>
                  <button
                    className="fancy-button fancy-button-sm"
                    onClick={handleCancelWaiting}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
