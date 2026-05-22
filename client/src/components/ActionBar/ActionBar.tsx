// ============================================================================
// ActionBar — botones contextuales según fase + estado del juego.
// Mecánica nueva: muestra ataques restantes + End turn (sin needsRefill).
// ============================================================================

import { useSound } from '@hooks/useSound';
import { Game } from '@server/gameEngine';
import * as gameService from '@services/gameService';
import type { PlayerId, SerializedGameState } from '@shared/types';
import { useUIStore } from '@store/uiStore';
import { useEffect } from 'react';
import styles from './ActionBar.module.css';

interface ActionBarProps {
  roomId: string;
  state: SerializedGameState;
  localSeat: PlayerId;
}

const btnCls = 'fancy-button fancy-button-sm';

export default function ActionBar({ roomId, state, localSeat }: ActionBarProps) {
  const setErrorMessage = useUIStore((s) => s.setErrorMessage);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const playSound = useSound();

  // SFX al cambiar a phase=over (una sola vez).
  useEffect(() => {
    if (state.phase === 'over' && state.gameOver) {
      const winner = state.gameOver.winner;
      if (winner === localSeat) playSound('victory');
      else if (winner !== null) playSound('defeat');
    }
  }, [state.phase, state.gameOver, localSeat, playSound]);

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      playSound('error');
    }
  };

  const game = Game.fromSerialized(state);

  // ─── Fase setup ─────────────────────────────────────────────────────
  if (state.phase === 'setup') {
    if (!state.setupState) return null;
    const isMyTurn = state.setupState.currentPlayer === localSeat;
    if (!isMyTurn) {
      return (
        <div className={styles.bar}>
          <div className={styles.waiting}>
            Waiting for Player {state.setupState.currentPlayer}…
          </div>
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
                clearSelection();
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

  // ─── Fase playing ──────────────────────────────────────────────────
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
    const canEnd = game.canEndTurn(localSeat);
    const canReplace = game.canReplaceSkill(localSeat);
    const isReplacing = !!state.turnState?.isReplacingSkill;
    const attacksLeft = state.turnState?.attacksRemaining ?? 0;
    const handFull = state.players[localSeat].hand.length >= 6;

    return (
      <div className={styles.bar}>
        <div className={styles.status}>
          Turn {state.turnNumber}/{state.config.maxTurnos} · Your turn
        </div>
        <div className={styles.attacksLeft}>
          ⚔ Attacks remaining: <strong>{attacksLeft}</strong>
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
                clearSelection();
                run(() => gameService.exitReplaceSkillMode(roomId, localSeat));
              }}
            >
              Cancel replace
            </button>
          )}
          {!drawn && !handFull && (
            <button
              className={btnCls}
              onClick={() => run(() => gameService.drawPhase(roomId, localSeat))}
            >
              Draw
            </button>
          )}
        </div>

        <div className={styles.buttons}>
          <button
            className={btnCls}
            disabled={!canEnd}
            onClick={async () => {
              clearSelection();
              playSound('turnEnd');
              await run(() => gameService.endTurn(roomId, localSeat));
            }}
          >
            End turn
          </button>
        </div>
      </div>
    );
  }

  // ─── Fase over ──────────────────────────────────────────────────────
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
