// ============================================================================
// Menu — pantalla inicial. Flujo:
//   1. Estado 'idle': muestra botones "Create" / "Join".
//   2. Estado 'creating': formulario de configuración del juego.
//   3. Estado 'joining': input del room code.
//
// Al detectar ?room=XYZ en la URL, pre-abrimos el flujo de Join con el código.
// ============================================================================

import { useUser } from '@hooks/useUser';
import { createRoom, getRoomIdFromURL, joinRoom } from '@services/roomService';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Menu.module.css';

const modeMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
  transition: { duration: 0.22 },
};

type MenuMode = 'idle' | 'creating' | 'joining';

export default function Menu() {
  const navigate = useNavigate();
  const { userId, loading: authLoading, error: authError } = useUser();
  // Lee ?room=XYZ del URL UNA VEZ durante el render inicial (lazy initializer)
  // — más limpio que un useEffect que hace setState en mount.
  const initialUrlCode = useState(() => getRoomIdFromURL())[0];
  const [mode, setMode] = useState<MenuMode>(initialUrlCode ? 'joining' : 'idle');
  const [vida, setVida] = useState(20);
  const [turnos, setTurnos] = useState(20);
  const [code, setCode] = useState(initialUrlCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const { roomId } = await createRoom({
        vidaInicial: vida,
        maxTurnos: turnos,
        forceP1Start: false,
      });
      navigate(`/game/${roomId}`);
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
      <header className={styles.header}>
        <h1 className={styles.title}>OLYMPUS PROTOCOL</h1>
        <p className={styles.subtitle}>1v1 Online Simulator · Phase 3</p>
      </header>

      <div className={styles.cardWrapper}>
        <div className={styles.cardDeco} />
        <div className={clsx(styles.card, 'fancy-border')}>
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
          </AnimatePresence>

          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
