// ============================================================================
// Sidebar — columna derecha con: header (room code + exit), combat log,
// action bar contextual.
// ============================================================================

import ActionBar from '@components/ActionBar/ActionBar';
import CombatLog from '@components/CombatLog/CombatLog';
import type { PlayerId, SerializedGameState } from '@shared/types';
import { useNavigate } from 'react-router-dom';
import styles from './Sidebar.module.css';

interface SidebarProps {
  roomId: string;
  state: SerializedGameState;
  localSeat: PlayerId;
}

export default function Sidebar({ roomId, state, localSeat }: SidebarProps) {
  const navigate = useNavigate();

  return (
    <aside className={styles.sidebar}>
      <header className={styles.header}>
        <h1 className={styles.title}>OLYMPUS PROTOCOL</h1>
        <div className={styles.seatInfo}>You are Player {localSeat}</div>
        <div className={styles.roomCode}>Room: {roomId}</div>
        <button className={styles.exitBtn} onClick={() => navigate('/')}>
          Exit to menu
        </button>
      </header>

      <CombatLog entries={state.combatLog} />

      <ActionBar roomId={roomId} state={state} localSeat={localSeat} />
    </aside>
  );
}
