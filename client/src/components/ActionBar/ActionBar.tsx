// ============================================================================
// ActionBar — botones contextuales según fase + estado del juego.
// Toda la lógica de "¿qué puede hacer el local player ahora mismo?" vive acá.
// Cada botón llama a una función de gameService (server-authoritative).
// ============================================================================

import { Game } from '@server/gameEngine';
import * as gameService from '@services/gameService';
import type { PlayerId, SerializedGameState } from '@shared/types';
import { useUIStore } from '@store/uiStore';
import styles from './ActionBar.module.css';

interface ActionBarProps {
  roomId: string;
  state: SerializedGameState;
  localSeat: PlayerId;
}

export default function ActionBar({ roomId, state, localSeat }: ActionBarProps) {
  const setErrorMessage = useUIStore((s) => s.setErrorMessage);
  const isAnimating = useUIStore((s) => s.isAnimating);
  const setIsAnimating = useUIStore((s) => s.setIsAnimating);
  const setSelectedInstanceId = useUIStore((s) => s.setSelectedInstanceId);

  // Helper: ejecuta una acción del service con manejo de errores uniforme.
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

  // Reconstruimos un Game local para llamar a los métodos de inspección
  // (canDeclareMulligan, canReplaceSkill, etc.). NO mutamos — solo lectura.
  const game = Game.fromSerialized(state);

  // ─── Fase setup ──────────────────────────────────────────────────────
  if (state.phase === 'setup') {
    if (!state.setupState) return null;
    const isMyTurn = state.setupState.currentPlayer === localSeat;
    if (!isMyTurn) {
      return (
        <div className={styles.bar}>
          <div className={styles.waiting}>Waiting for Player {state.setupState.currentPlayer}…</div>
        </div>
      );
    }

    if (state.setupState.step === 'mulligan_or_confirm') {
      return (
        <div className={styles.bar}>
          <div className={styles.status}>Setup · Confirm hand or mulligan</div>
          <div className={styles.buttons}>
            {game.canDeclareMulligan(localSeat) && (
              <button
                className={styles.btnSecondary}
                onClick={() => run(() => gameService.declareMulligan(roomId, localSeat))}
              >
                Declare Mulligan
              </button>
            )}
            <button
              className={styles.btnPrimary}
              onClick={() => run(() => gameService.confirmHand(roomId, localSeat))}
            >
              Confirm hand
            </button>
          </div>
        </div>
      );
    }

    if (state.setupState.step === 'placing') {
      return (
        <div className={styles.bar}>
          <div className={styles.status}>Setup · Place units & skill</div>
          <button
            className={styles.btnPrimary}
            onClick={() => {
              setSelectedInstanceId(null);
              run(() => gameService.finishSetup(roomId, localSeat));
            }}
          >
            Finish setup
          </button>
        </div>
      );
    }
  }

  // ─── Fase playing ────────────────────────────────────────────────────
  if (state.phase === 'playing') {
    const isMyTurn = state.activePlayer === localSeat;
    if (!isMyTurn) {
      return (
        <div className={styles.bar}>
          <div className={styles.waiting}>Waiting for Player {state.activePlayer}…</div>
        </div>
      );
    }

    const drawn = !!state.turnState?.drawnThisTurn;
    const needsRefill = game.needsRefill(localSeat);
    const canEnd = game.canEndTurn(localSeat);
    const canReplace = game.canReplaceSkill(localSeat);
    const isReplacing = !!state.turnState?.isReplacingSkill;

    return (
      <div className={styles.bar}>
        <div className={styles.status}>
          Turn {state.turnNumber}/{state.config.maxTurnos} · Your turn
        </div>

        <div className={styles.buttons}>
          {!drawn && canReplace && !isReplacing && (
            <button
              className={styles.btnSecondary}
              onClick={() => run(() => gameService.enterReplaceSkillMode(roomId, localSeat))}
            >
              Replace Skill
            </button>
          )}
          {isReplacing && (
            <button
              className={styles.btnSecondary}
              onClick={() => {
                setSelectedInstanceId(null);
                run(() => gameService.exitReplaceSkillMode(roomId, localSeat));
              }}
            >
              Cancel replace
            </button>
          )}
          {!drawn && (
            <button
              className={styles.btnSecondary}
              onClick={() => run(() => gameService.drawPhase(roomId, localSeat))}
            >
              Draw
            </button>
          )}
        </div>

        {needsRefill && (
          <div className={styles.warn}>⚠ Fill empty slots with units from your hand.</div>
        )}

        <button
          className={styles.btnEndTurn}
          disabled={!canEnd || isAnimating}
          onClick={async () => {
            setIsAnimating(true);
            setSelectedInstanceId(null);
            await run(() => gameService.endTurn(roomId, localSeat));
            setIsAnimating(false);
          }}
        >
          {isAnimating ? 'Resolving…' : 'End turn'}
        </button>
      </div>
    );
  }

  // ─── Fase over ───────────────────────────────────────────────────────
  return (
    <div className={styles.bar}>
      <div className={styles.gameOver}>
        Game over
        {state.gameOver && (
          <span>
            {' · '}
            {state.gameOver.reason === 'draw'
              ? 'Draw'
              : `Player ${state.gameOver.winner} wins (${state.gameOver.reason})`}
          </span>
        )}
      </div>
    </div>
  );
}
