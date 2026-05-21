// ============================================================================
// ActionBar — botones contextuales según fase + estado del juego.
// Toda la lógica de "¿qué puede hacer el local player ahora mismo?" vive acá.
// Cada botón llama a una función de gameService (server-authoritative).
// ============================================================================

import { Game } from '@server/gameEngine';
import * as gameService from '@services/gameService';
import type { PlayerId, SerializedGameState } from '@shared/types';
import { useUIStore } from '@store/uiStore';
import clsx from 'clsx';
import styles from './ActionBar.module.css';

interface ActionBarProps {
  roomId: string;
  state: SerializedGameState;
  localSeat: PlayerId;
}

const btnCls = 'fancy-button fancy-button-sm';

export default function ActionBar({ roomId, state, localSeat }: ActionBarProps) {
  const setErrorMessage = useUIStore((s) => s.setErrorMessage);
  const isAnimating = useUIStore((s) => s.isAnimating);
  const setIsAnimating = useUIStore((s) => s.setIsAnimating);
  const setSelectedInstanceId = useUIStore((s) => s.setSelectedInstanceId);

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

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
                className={btnCls}
                onClick={() => run(() => gameService.declareMulligan(roomId, localSeat))}
              >
                Mulligan
              </button>
            )}
            <button
              className={btnCls}
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
          <div className={styles.buttons}>
            <button
              className={btnCls}
              onClick={() => {
                setSelectedInstanceId(null);
                run(() => gameService.finishSetup(roomId, localSeat));
              }}
            >
              Finish setup
            </button>
          </div>
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
              className={btnCls}
              onClick={() => run(() => gameService.enterReplaceSkillMode(roomId, localSeat))}
            >
              Replace Skill
            </button>
          )}
          {isReplacing && (
            <button
              className={btnCls}
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
              className={btnCls}
              onClick={() => run(() => gameService.drawPhase(roomId, localSeat))}
            >
              Draw
            </button>
          )}
        </div>

        {needsRefill && (
          <div className={styles.warn}>⚠ Fill empty slots with units from your hand.</div>
        )}

        <div className={styles.buttons}>
          <button
            className={clsx(btnCls)}
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
      </div>
    );
  }

  // ─── Fase over ───────────────────────────────────────────────────────
  return (
    <div className={styles.bar}>
      <div className={styles.gameOver}>
        Game over
        {state.gameOver && (
          <div style={{ marginTop: 6, fontSize: 13 }}>
            {state.gameOver.reason === 'draw'
              ? 'Draw'
              : `Player ${state.gameOver.winner} wins (${state.gameOver.reason})`}
          </div>
        )}
      </div>
    </div>
  );
}
