// ============================================================================
// Board — vista principal del juego.
// Layout: 2 filas (campo del rival, campo del jugador) + hand local debajo,
// más sidebar a la derecha.
//
// Maneja TODOS los handlers de click del juego — calcula slots válidos según
// la selección actual (carta de mano o atacante) y llama a gameService.
// ============================================================================

import Hand from '@components/Hand/Hand';
import InfoSidebar from '@components/InfoSidebar/InfoSidebar';
import PlayerArea from '@components/PlayerArea/PlayerArea';
import Sidebar from '@components/Sidebar/Sidebar';
import TurnBanner from '@components/TurnBanner/TurnBanner';
import { useSound } from '@hooks/useSound';
import { getForcedTauntTarget } from '@server/combat';
import { Game } from '@server/gameEngine';
import * as gameService from '@services/gameService';
import type { PlayerId, SerializedGameState, UnitSlotIndex } from '@shared/types';
import { UNIT_SLOTS, getAttackType, getReachableSlots, otherPlayer } from '@shared/types';
import { useUIStore } from '@store/uiStore';
import { asset } from '@utils/asset';
import { computeAttackAnimations } from '@utils/attackAnimations';
import clsx from 'clsx';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import styles from './Board.module.css';

interface BoardProps {
  roomId: string;
  state: SerializedGameState;
  localSeat: PlayerId;
}

export default function Board({ roomId, state, localSeat }: BoardProps) {
  const selection = useUIStore((s) => s.selection);
  const setSelection = useUIStore((s) => s.setSelection);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const setErrorMessage = useUIStore((s) => s.setErrorMessage);
  const playSound = useSound();

  const opponentSeat: PlayerId = otherPlayer(localSeat);
  const game = Game.fromSerialized(state);

  // ─── Estado de animaciones de daño ───────────────────────────────────
  type SlotAnimMap = Partial<Record<UnitSlotIndex, { id: number; amount: number }>>;
  const nextAnimId = useRef(0);
  const [opponentSlotAnims, setOpponentSlotAnims] = useState<SlotAnimMap>({});
  const [opponentLifeAnim, setOpponentLifeAnim] = useState<{ id: number; amount: number } | null>(null);

  // ─── Banner de turno ─────────────────────────────────────────────────
  const [turnBanner, setTurnBanner] = useState<{ id: number; playerId: PlayerId } | null>(null);
  const prevActivePlayer = useRef<PlayerId | null>(null);
  const turnBannerId = useRef(0);

  useEffect(() => {
    if (state.phase !== 'playing') return;
    const current = state.activePlayer;
    if (current === prevActivePlayer.current) return;
    prevActivePlayer.current = current;
    const id = turnBannerId.current++;
    setTurnBanner({ id, playerId: current });
    const timer = setTimeout(() => {
      setTurnBanner((prev) => (prev?.id === id ? null : prev));
    }, 3000);
    return () => clearTimeout(timer);
  }, [state.activePlayer, state.phase]);

  /** Calcula y dispara las animaciones de daño de un ataque. Se llama ANTES del
   *  round-trip a Firebase para que la animación sea inmediata al click. */
  const fireAttackAnims = (
    attackerSlot: UnitSlotIndex,
    target: Parameters<typeof computeAttackAnimations>[3],
  ): void => {
    const anim = computeAttackAnimations(state, localSeat, attackerSlot, target);
    const id = nextAnimId.current++;
    const ANIM_DURATION = 1450;

    if (anim.slotDamage) {
      const { slotIndex, amount } = anim.slotDamage;
      setOpponentSlotAnims((prev) => ({ ...prev, [slotIndex]: { id, amount } }));
      setTimeout(() => {
        setOpponentSlotAnims((prev) => {
          const next = { ...prev };
          if (next[slotIndex]?.id === id) delete next[slotIndex];
          return next;
        });
      }, ANIM_DURATION);
    }

    if (anim.lifeDamage > 0) {
      setOpponentLifeAnim({ id, amount: anim.lifeDamage });
      setTimeout(() => {
        setOpponentLifeAnim((prev) => (prev?.id === id ? null : prev));
      }, ANIM_DURATION);
    }
  };

  // ─── Slots agotados: unidades que ya atacaron este turno ─────────────

  const exhaustedSlots = new Set<UnitSlotIndex>();
  if (state.phase === 'playing' && state.activePlayer === localSeat && state.turnState) {
    const attackedIds = new Set(state.turnState.cardsAttackedThisTurn);
    for (let i = 0; i < UNIT_SLOTS; i++) {
      const unit = state.players[localSeat].units[i as UnitSlotIndex];
      if (unit && attackedIds.has(unit.instanceId)) {
        exhaustedSlots.add(i as UnitSlotIndex);
      }
    }
  }

  // ─── Computar slots válidos según la selección actual ────────────────

  // Si seleccioné una carta de mi mano: ¿qué slots míos la aceptan?
  const validUnitPlacementsLocal = new Set<UnitSlotIndex>();
  let validSkillPlacementLocal = false;
  let validSkillReplaceLocal = false;
  if (selection?.kind === 'hand') {
    const slots = game.validSlotsFor(localSeat, selection.instanceId);
    for (const s of slots) {
      if (s.kind === 'unit') validUnitPlacementsLocal.add(s.index);
      else if (s.kind === 'skill') validSkillPlacementLocal = true;
      else if (s.kind === 'skill_replace') validSkillReplaceLocal = true;
    }
  }

  // Si seleccioné una unidad mía como atacante: ¿qué slots enemigos están en reach?
  const validAttackTargets = new Set<UnitSlotIndex>();
  let canAttackLifeWithCurrent = false;
  if (selection?.kind === 'attacker') {
    const attackerCard = state.players[localSeat].units[selection.slotIndex];
    if (attackerCard) {
      const attackType = getAttackType(attackerCard.subtype);
      if (attackType !== null) {
        const reachable = getReachableSlots(attackType, selection.slotIndex);
        // ¿Hephaestus en reach? Fuerza el target al taunt.
        const forced = getForcedTauntTarget(
          state.players[opponentSeat],
          attackType,
          selection.slotIndex,
        );
        if (forced !== null) {
          validAttackTargets.add(forced);
        } else {
          // Solo highlightear los slots OCUPADOS (los vacíos no son target válido,
          // se ataca a vida si todos en reach están vacíos).
          let anyOccupied = false;
          for (const slot of reachable) {
            if (state.players[opponentSeat].units[slot]) {
              validAttackTargets.add(slot);
              anyOccupied = true;
            }
          }
          // Si todos los slots en reach están vacíos, puede atacar a vida.
          if (!anyOccupied) canAttackLifeWithCurrent = true;
        }
      }
    }
  }

  // ─── Handlers de click ───────────────────────────────────────────────

  const handleHandCardClick = (instanceId: string): void => {
    if (selection?.kind === 'hand' && selection.instanceId === instanceId) {
      clearSelection();
      playSound('cardClick');
    } else {
      setSelection({ kind: 'hand', instanceId });
      playSound('cardSelect');
    }
  };

  const handleLocalUnitSlotClick = (index: UnitSlotIndex): void => {
    // Si tengo una carta de mano seleccionada → intentar colocar.
    if (selection?.kind === 'hand') {
      if (!validUnitPlacementsLocal.has(index)) return;
      const instanceId = selection.instanceId;
      clearSelection();
      gameService
        .placeCard(roomId, localSeat, instanceId, { kind: 'unit', index })
        .then(() => playSound('cardPlace'))
        .catch((err: unknown) => {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          playSound('error');
        });
      return;
    }
    // Si no hay selección, intentar seleccionar esta unidad como atacante.
    const card = state.players[localSeat].units[index];
    if (!card) return;
    if (!game.canAttackWith(localSeat, index)) return;
    if (selection?.kind === 'attacker' && selection.slotIndex === index) {
      clearSelection();
    } else {
      setSelection({ kind: 'attacker', slotIndex: index });
      playSound('cardSelect');
    }
  };

  const handleOpponentUnitSlotClick = (index: UnitSlotIndex): void => {
    // Solo válido si tengo un atacante seleccionado y ese slot es target.
    if (selection?.kind !== 'attacker') return;
    if (!validAttackTargets.has(index)) return;
    const attackerSlot = selection.slotIndex;
    clearSelection();
    // Disparar animación de inmediato (antes del round-trip a Firebase)
    fireAttackAnims(attackerSlot, { kind: 'unit', index });
    gameService
      .declareAttack(roomId, localSeat, attackerSlot, { kind: 'unit', index })
      .then(() => playSound('cardPlace'))
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        playSound('error');
      });
  };

  const handleSkillSlotClick = (): void => {
    if (selection?.kind !== 'hand') return;
    if (!validSkillPlacementLocal && !validSkillReplaceLocal) return;
    const instanceId = selection.instanceId;
    const slotKind = validSkillReplaceLocal ? 'skill_replace' : 'skill';
    clearSelection();
    gameService
      .placeCard(roomId, localSeat, instanceId, { kind: slotKind })
      .then(() => playSound('cardPlace'))
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        playSound('error');
      });
  };

  const handleAttackLife = (): void => {
    if (selection?.kind !== 'attacker') return;
    if (!canAttackLifeWithCurrent) return;
    const attackerSlot = selection.slotIndex;
    clearSelection();
    // Disparar animación de inmediato
    fireAttackAnims(attackerSlot, { kind: 'life' });
    gameService
      .declareAttack(roomId, localSeat, attackerSlot, { kind: 'life' })
      .then(() => playSound('damageTaken'))
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        playSound('error');
      });
  };

  // ─── Computar info de display ────────────────────────────────────────

  const attackModeActive = selection?.kind === 'attacker';

  const topId = opponentSeat;
  const bottomId = localSeat;
  const isActive = (id: PlayerId): boolean =>
    state.phase === 'setup'
      ? state.setupState?.currentPlayer === id
      : state.activePlayer === id;

  return (
    <div className={styles.app} data-local-seat={localSeat}>
      {/* Columna izquierda: preview de carta hover + stats de la partida */}
      <InfoSidebar state={state} localSeat={localSeat} />

      <main className={styles.main}>
        {/* Fila superior: dos battlefields apilados (rival arriba, local abajo).
            Cada battlefield ocupa exactamente la mitad de los 2/3 superiores. */}
        <div className={styles.battlefields}>
          <PlayerArea
            playerId={topId}
            player={state.players[topId]}
            isLocal={false}
            isActive={isActive(topId)}
            validUnitPlacements={new Set()}
            validSkillPlacement={false}
            validSkillReplace={false}
            validAttackTargets={validAttackTargets}
            selectedAttackerSlot={null}
            onUnitSlotClick={
              selection?.kind === 'attacker' ? handleOpponentUnitSlotClick : undefined
            }
            attackModeActive={attackModeActive}
            slotAnims={opponentSlotAnims}
            lifeDamageAnim={opponentLifeAnim}
          />

          <PlayerArea
            playerId={bottomId}
            player={state.players[bottomId]}
            isLocal={true}
            isActive={isActive(bottomId)}
            validUnitPlacements={validUnitPlacementsLocal}
            validSkillPlacement={validSkillPlacementLocal}
            validSkillReplace={validSkillReplaceLocal}
            validAttackTargets={new Set()}
            selectedAttackerSlot={
              selection?.kind === 'attacker' ? selection.slotIndex : null
            }
            onUnitSlotClick={handleLocalUnitSlotClick}
            onSkillSlotClick={handleSkillSlotClick}
            attackModeActive={attackModeActive}
            exhaustedSlots={exhaustedSlots}
          />

          {/* Botón "Attack Life" como overlay centrado entre las dos filas */}
          {canAttackLifeWithCurrent && (
            <button className={styles.attackLifeBtn} onClick={handleAttackLife}>
              ⚔ Attack life of Player {opponentSeat}
            </button>
          )}

          {/* Ícono de ataque — separador decorativo centrado entre los dos campos */}
          <div className={styles.attackIcon} aria-hidden="true">
            <img src={asset('/images/attack-icon.png')} alt="" />
          </div>

          {/* Decoraciones flotantes — dentro del terreno, centradas verticalmente */}
          <div className={clsx(styles.fly, styles.flyRight)} aria-hidden="true">
            <img src={asset('/images/fly.png')} alt="" />
          </div>
          <div className={clsx(styles.fly, styles.flyLeft)} aria-hidden="true">
            <img src={asset('/images/fly.png')} alt="" />
          </div>

          {/* Banner de turno — aparece al centro cuando cambia el jugador activo */}
          <AnimatePresence>
            {turnBanner && (
              <TurnBanner key={turnBanner.id} playerId={turnBanner.playerId} />
            )}
          </AnimatePresence>
        </div>

        {/* Fila inferior: mano local (1/3 del alto) */}
        <div className={styles.handZone}>
          <Hand
            cards={state.players[localSeat].hand}
            playerId={localSeat}
            isLocal={true}
            selectedInstanceId={
              selection?.kind === 'hand' ? selection.instanceId : null
            }
            onCardClick={handleHandCardClick}
            attackModeActive={attackModeActive}
          />
        </div>
      </main>

      <Sidebar roomId={roomId} state={state} localSeat={localSeat} />

      {/* Decorativo sobre InfoSidebar izquierdo (espejado horizontalmente) */}
      <div className={styles.infoSidebarDeco} aria-hidden="true">
        <img src={asset('/images/sider-header.png')} alt="" />
      </div>

      {/* Decorativo sobre Sidebar derecho */}
      <div className={styles.sidebarDeco} aria-hidden="true">
        <img src={asset('/images/sider-header.png')} alt="" />
      </div>
    </div>
  );
}
