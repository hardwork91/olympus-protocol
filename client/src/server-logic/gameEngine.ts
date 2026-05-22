// ============================================================================
// Motor del juego (Game) — MECÁNICA NUEVA.
//
// Diferencias clave vs versión anterior:
//   - PlayerState.units es un array de 5 slots (en lugar de frontLine/rearGuard).
//   - Combate es target-selection: cada turno tiene N ataques (default 3),
//     cada ataque se declara individualmente y se resuelve enseguida.
//   - endTurn ya NO resuelve combate automáticamente — solo cierra el turno.
//   - Setup coloca hasta 5 unidades + 1 skill al inicio.
//
// **Contrato**: este archivo NO importa nada de UI, React, Firebase, ni nada
// del cliente. Solo depende de @shared.
// ============================================================================

import { buildDeck, countUnits, shuffle, SKILL_ID } from '../shared/cards';
import type {
  AttackResult,
  AttackTarget,
  Card,
  GameConfig,
  GameOverData,
  GameOverReason,
  GamePhase,
  LogEntry,
  PlayerId,
  PlayerSkill,
  PlayerState,
  Selection,
  SerializedGameState,
  SetupState,
  SkillCard,
  SlotRef,
  TurnState,
  UnitCard,
  UnitSlotIndex,
} from '../shared/types';
import { UNIT_SLOTS, getAttackType, isValidSlotIndex, otherPlayer } from '../shared/types';
import { resolveAttack } from './combat';

/** Cantidad inicial de cartas en mano para llenar el setup (5 units + 1 skill). */
const INITIAL_HAND_SIZE = 6;
/** Cantidad máxima de cartas en mano durante el juego (a la que se rellena por draw). */
const PLAY_HAND_SIZE = 5;
/** Default de ataques por turno. */
const DEFAULT_ATTACKS_PER_TURN = 3;

export class Game {
  config: GameConfig;
  phase: GamePhase;
  activePlayer: PlayerId | null;
  turnNumber: number;
  turnsInFullTurn: number;
  combatLog: LogEntry[];
  setupState: SetupState | null;
  turnState: TurnState | null;
  players: { 1: PlayerState; 2: PlayerState };
  gameOver: GameOverData | null;
  selection: Selection;

  constructor(config: Partial<GameConfig>) {
    this.config = {
      vidaInicial: config.vidaInicial ?? 20,
      maxTurnos: config.maxTurnos ?? 20,
      forceP1Start: config.forceP1Start ?? false,
      attacksPerTurn: config.attacksPerTurn ?? DEFAULT_ATTACKS_PER_TURN,
    };

    const fullDeck = shuffle(buildDeck()); // 40 cartas
    const p1Deck = fullDeck.slice(0, 20);
    const p2Deck = fullDeck.slice(20, 40);

    this.players = {
      1: createPlayer(p1Deck, this.config.vidaInicial),
      2: createPlayer(p2Deck, this.config.vidaInicial),
    };

    // Robo inicial = 6 cartas (alcanza para 5 units + 1 skill en setup)
    this.drawTo(1, INITIAL_HAND_SIZE);
    this.drawTo(2, INITIAL_HAND_SIZE);

    this.phase = 'setup';
    this.activePlayer = null;
    this.turnNumber = 1;
    this.turnsInFullTurn = 0;
    this.combatLog = [];

    this.setupState = {
      currentPlayer: 1,
      step: 'mulligan_or_confirm',
    };

    this.turnState = null;
    this.gameOver = null;
    this.selection = { 1: null, 2: null };
  }

  setSelection(playerId: PlayerId, instanceId: string | null): void {
    this.selection[playerId] = instanceId ?? null;
  }

  // ────────────────────────────────────────────────────────────────────
  // Utilidades de mazo / mano / slots
  // ────────────────────────────────────────────────────────────────────

  drawTo(playerId: PlayerId, targetSize: number): void {
    const p = this.players[playerId];
    while (p.hand.length < targetSize && p.deck.length > 0) {
      const card = p.deck.shift();
      if (card) p.hand.push(card);
    }
  }

  sendToBottom(playerId: PlayerId, card: Card): void {
    this.players[playerId].deck.push(card);
  }

  removeFromHand(playerId: PlayerId, instanceId: string): Card | null {
    const p = this.players[playerId];
    const idx = p.hand.findIndex((c) => c.instanceId === instanceId);
    if (idx < 0) return null;
    return p.hand.splice(idx, 1)[0] ?? null;
  }

  /** Devuelve true si TODOS los slots de unidad están vacíos. */
  hasNoUnits(playerId: PlayerId): boolean {
    return this.players[playerId].units.every((u) => u === null);
  }

  // ────────────────────────────────────────────────────────────────────
  // Fase de SETUP
  // ────────────────────────────────────────────────────────────────────

  canDeclareMulligan(playerId: PlayerId): boolean {
    if (this.phase !== 'setup') return false;
    if (!this.setupState) return false;
    if (this.setupState.currentPlayer !== playerId) return false;
    if (this.setupState.step !== 'mulligan_or_confirm') return false;
    // Mulligan si hay menos de 3 units en mano (no alcanza para fill aceptable).
    return countUnits(this.players[playerId].hand) < 3;
  }

  declareMulligan(playerId: PlayerId): boolean {
    if (!this.canDeclareMulligan(playerId)) return false;
    const p = this.players[playerId];
    p.deck.push(...p.hand);
    p.hand = [];
    p.deck = shuffle(p.deck);
    this.drawTo(playerId, INITIAL_HAND_SIZE);
    this.log(`Player ${playerId} declares mulligan. New hand: ${p.hand.length} cards.`);
    return true;
  }

  confirmHand(playerId: PlayerId): boolean {
    if (this.phase !== 'setup') return false;
    if (!this.setupState) return false;
    if (this.setupState.currentPlayer !== playerId) return false;
    if (this.setupState.step !== 'mulligan_or_confirm') return false;
    this.setupState.step = 'placing';
    this.log(`Player ${playerId} confirms hand and proceeds to place units and skill.`);
    return true;
  }

  /** Slots válidos donde puede colocarse la carta seleccionada. */
  validSlotsFor(playerId: PlayerId, instanceId: string): SlotRef[] {
    const card = this.players[playerId].hand.find((c) => c.instanceId === instanceId);
    if (!card) return [];
    const player = this.players[playerId];
    const slots: SlotRef[] = [];

    const isSetupPlacing =
      this.phase === 'setup' &&
      this.setupState?.currentPlayer === playerId &&
      this.setupState.step === 'placing';
    const isPlayingActive = this.phase === 'playing' && this.activePlayer === playerId;

    if (!isSetupPlacing && !isPlayingActive) return [];

    if (card.type === 'unit') {
      for (let i = 0; i < UNIT_SLOTS; i++) {
        if (player.units[i] === null && isValidSlotIndex(i)) {
          slots.push({ kind: 'unit', index: i });
        }
      }
    } else if (card.type === 'skill') {
      const skillPlacedThisTurn = isPlayingActive && this.turnState?.skillPlacedThisTurn;
      if (!player.skill && !skillPlacedThisTurn) {
        slots.push({ kind: 'skill' });
      }
      if (isPlayingActive && this.turnState?.isReplacingSkill && player.skill) {
        slots.push({ kind: 'skill_replace' });
      }
    }
    return slots;
  }

  placeCard(playerId: PlayerId, instanceId: string, slot: SlotRef): boolean {
    const valid = this.validSlotsFor(playerId, instanceId);
    if (!valid.some((s) => slotRefEquals(s, slot))) return false;
    const card = this.removeFromHand(playerId, instanceId);
    if (!card) return false;
    const p = this.players[playerId];

    if (slot.kind === 'unit') {
      if (card.type !== 'unit') return false;
      p.units[slot.index] = card;
      this.log(
        `Player ${playerId} places #${card.id} ${card.name} in unit slot ${slot.index}.`,
      );
    } else if (slot.kind === 'skill') {
      if (card.type !== 'skill') return false;
      p.skill = { card, state: 'hidden' };
      if (this.phase === 'playing' && this.turnState) {
        this.turnState.skillPlacedThisTurn = true;
      }
      this.log(`Player ${playerId} places #${card.id} ${card.name} in skill.`);
    } else if (slot.kind === 'skill_replace') {
      if (card.type !== 'skill') return false;
      const oldSkill = p.skill;
      if (!oldSkill) return false;
      p.skill = { card, state: 'hidden' };
      this.sendToBottom(playerId, oldSkill.card);
      this.log(
        `Player ${playerId} replaces their skill. Old (#${oldSkill.card.id} ${oldSkill.card.name}) goes to bottom of deck.`,
      );
      if (this.turnState) {
        this.turnState.isReplacingSkill = false;
        this.turnState.skillReplacedThisTurn = true;
      }
    }

    return true;
  }

  finishSetup(playerId: PlayerId): boolean {
    if (this.phase !== 'setup') return false;
    if (!this.setupState) return false;
    if (this.setupState.currentPlayer !== playerId) return false;
    if (this.setupState.step !== 'placing') return false;

    this.log(`Player ${playerId} finishes setup.`);
    if (playerId === 1) {
      this.setupState.currentPlayer = 2;
      this.setupState.step = 'mulligan_or_confirm';
    } else {
      this.coinFlip();
    }
    return true;
  }

  coinFlip(): void {
    this.activePlayer = this.config.forceP1Start ? 1 : Math.random() < 0.5 ? 1 : 2;
    this.log(`🪙 Coin flip: Player ${this.activePlayer} acts first.`);
    this.phase = 'playing';
    this.startTurn(this.activePlayer);
  }

  // ────────────────────────────────────────────────────────────────────
  // Fase de PLAYING
  // ────────────────────────────────────────────────────────────────────

  startTurn(playerId: PlayerId): void {
    this.turnState = {
      isReplacingSkill: false,
      skillReplacedThisTurn: false,
      drawnThisTurn: false,
      skillPlacedThisTurn: false,
      attacksRemaining: this.config.attacksPerTurn,
      cardsAttackedThisTurn: [],
    };

    const active = this.players[playerId];
    const rival = this.players[otherPlayer(playerId)];

    // Voltear Offensive del activo
    if (
      active.skill &&
      active.skill.state === 'hidden' &&
      active.skill.card.subtype === 'Offensive'
    ) {
      active.skill.state = 'active';
      this.log(
        `⚡ Player ${playerId} flips Offensive: #${active.skill.card.id} ${active.skill.card.name}`,
      );
      // DOUBLE-SHOT da un ataque extra este turno.
      if (active.skill.card.id === SKILL_ID.DOUBLE_SHOT) {
        this.turnState.attacksRemaining += 1;
        this.log(`⚡ DOUBLE-SHOT grants +1 attack this turn.`);
      }
    }

    // Voltear Defensive del rival
    if (
      rival.skill &&
      rival.skill.state === 'hidden' &&
      rival.skill.card.subtype === 'Defensive'
    ) {
      rival.skill.state = 'active';
      this.log(
        `🛡 Rival flips Defensive: #${rival.skill.card.id} ${rival.skill.card.name}`,
      );
    }

    this.log(
      `▶ Turn ${this.turnNumber}, active player: ${playerId} (${this.turnState.attacksRemaining} attacks available)`,
    );
  }

  canReplaceSkill(playerId: PlayerId): boolean {
    if (this.phase !== 'playing') return false;
    if (this.activePlayer !== playerId || !this.turnState) return false;
    if (this.turnState.drawnThisTurn) return false;
    if (this.turnState.skillReplacedThisTurn) return false;
    if (!this.players[playerId].skill) return false;
    return this.players[playerId].hand.some((c) => c.type === 'skill');
  }

  enterReplaceSkillMode(playerId: PlayerId): boolean {
    if (!this.canReplaceSkill(playerId) || !this.turnState) return false;
    this.turnState.isReplacingSkill = true;
    return true;
  }

  exitReplaceSkillMode(playerId: PlayerId): boolean {
    if (this.activePlayer !== playerId || !this.turnState) return false;
    this.turnState.isReplacingSkill = false;
    return true;
  }

  drawPhase(playerId: PlayerId): void {
    if (this.phase !== 'playing') return;
    if (this.activePlayer !== playerId || !this.turnState) return;
    if (this.turnState.drawnThisTurn) return;
    this.drawTo(playerId, PLAY_HAND_SIZE);
    this.turnState.drawnThisTurn = true;
    this.log(
      `Player ${playerId} draws up to ${PLAY_HAND_SIZE} cards (hand: ${this.players[playerId].hand.length}).`,
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Ataques (target-selection)
  // ────────────────────────────────────────────────────────────────────

  /** ¿Puede el jugador atacar con la unidad en slot `attackerSlot`? */
  canAttackWith(playerId: PlayerId, attackerSlot: UnitSlotIndex): boolean {
    if (this.phase !== 'playing') return false;
    if (this.activePlayer !== playerId || !this.turnState) return false;
    if (this.turnState.attacksRemaining <= 0) return false;

    const card = this.players[playerId].units[attackerSlot];
    if (!card) return false;
    if (getAttackType(card.subtype) === null) return false; // Support no ataca
    if (this.turnState.cardsAttackedThisTurn.includes(card.instanceId)) return false;
    return true;
  }

  /**
   * Declara y resuelve un ataque del atacante en `attackerSlot` contra `target`.
   * Aplica destrucción, daño a vida, y verifica victoria.
   * @returns AttackResult o null si la acción es inválida.
   */
  declareAttack(
    playerId: PlayerId,
    attackerSlot: UnitSlotIndex,
    target: AttackTarget,
  ): AttackResult | null {
    if (!this.canAttackWith(playerId, attackerSlot) || !this.turnState) return null;
    const attackerCard = this.players[playerId].units[attackerSlot];
    if (!attackerCard) return null;

    const result = resolveAttack(this, playerId, attackerSlot, target);

    // Si el log devuelve solo una entrada de "⚠ Invalid" significa que la
    // validación interna rechazó el ataque. No consumimos un ataque.
    // Con armor persistente, un ataque válido puede producir solo armorDamage
    // (diff < 0) sin destroyed ni lifeDamage — por eso lo incluimos en la guardia.
    const isInvalid =
      result.destroyed.length === 0 &&
      result.lifeDamage === 0 &&
      result.armorDamage.length === 0 &&
      result.log.length > 0 &&
      result.log[0]!.startsWith('⚠');
    if (isInvalid) {
      for (const entry of result.log) this.log(entry);
      return null;
    }

    // Consumir el ataque (esta carta atacó este turno).
    this.turnState.attacksRemaining -= 1;
    this.turnState.cardsAttackedThisTurn.push(attackerCard.instanceId);

    // Aplicar resultado al state.
    for (const entry of result.log) this.log(entry);

    for (const d of result.destroyed) {
      const card = this.players[d.playerId].units[d.slotIndex];
      if (card) {
        this.sendToBottom(d.playerId, card);
        this.players[d.playerId].units[d.slotIndex] = null;
      }
    }

    // Aplicar daño a armor (unidades que sobrevivieron con armor reducida).
    // La armor del UnitCard se muta directamente — persiste hasta que la
    // carta sea destruida o regrese al mazo.
    for (const { playerId: pid, slotIndex, newArmor } of result.armorDamage) {
      const unit = this.players[pid].units[slotIndex];
      if (unit) unit.armor = newArmor;
    }

    const defenderId = otherPlayer(playerId);
    if (result.lifeDamage > 0) {
      this.players[defenderId].life -= result.lifeDamage;
      if (this.players[defenderId].life < 0) this.players[defenderId].life = 0;
    }

    // Consumir skills + pendingEffects (lógica vieja, mantenida para
    // compatibilidad estructural; efectos reales vienen en Fase D).
    for (const { playerId: pid, skillId } of result.consumedSkills) {
      const p = this.players[pid];
      if (p.skill && p.skill.card.id === skillId) {
        this.sendToBottom(pid, p.skill.card);
        p.skill = null;
      }
    }
    for (const { playerId: pid, type } of result.consumedPendingEffects) {
      const arr = this.players[pid].pendingEffects;
      const idx = arr.findIndex((e) => e.type === type);
      if (idx >= 0) arr.splice(idx, 1);
    }
    for (const { playerId: pid, type, value } of result.newPendingEffects) {
      this.players[pid].pendingEffects.push({ type, value });
    }

    // Verificar victoria por vida 0
    if (this.players[defenderId].life <= 0) {
      this.endGame({ winner: playerId, reason: 'life' });
    }

    return result;
  }

  // ────────────────────────────────────────────────────────────────────
  // End turn (ya no resuelve combate)
  // ────────────────────────────────────────────────────────────────────

  canEndTurn(playerId: PlayerId): boolean {
    if (this.phase !== 'playing') return false;
    if (this.activePlayer !== playerId) return false;
    // El usuario puede terminar el turno cuando quiera (no obligamos a usar
    // todos los ataques).
    return true;
  }

  endTurn(): void {
    if (this.activePlayer === null) return;
    if (!this.canEndTurn(this.activePlayer)) return;
    const endingPlayer = this.activePlayer;
    const nextPlayer = otherPlayer(endingPlayer);

    this.log(`▶ Player ${endingPlayer} ends turn.`);

    // Consumir skills 'active' al cierre del turno (se desgastan).
    // Las traps en 'hidden' permanecen hasta dispararse.
    this.consumeActiveSkill(endingPlayer);
    this.consumeActiveSkill(nextPlayer);

    this.activePlayer = nextPlayer;
    this.turnsInFullTurn += 1;
    if (this.turnsInFullTurn >= 2) {
      this.turnsInFullTurn = 0;
      this.turnNumber += 1;
    }

    if (this.turnNumber > this.config.maxTurnos) {
      const l1 = this.players[1].life;
      const l2 = this.players[2].life;
      let winner: PlayerId | null = null;
      let reason: GameOverReason = 'turnLimit';
      if (l1 > l2) winner = 1;
      else if (l2 > l1) winner = 2;
      else reason = 'draw';
      this.endGame({ winner, reason });
      return;
    }

    this.startTurn(this.activePlayer);
  }

  /**
   * Si el jugador tiene una skill en estado 'active', la manda al fondo del
   * deck. Usado al cierre del turno (las activas se desgastan).
   */
  consumeActiveSkill(playerId: PlayerId): void {
    const p = this.players[playerId];
    if (!p.skill) return;
    if (p.skill.state !== 'active') return;
    this.log(
      `  P${playerId}'s ${p.skill.card.name} fades (active skill consumed).`,
    );
    this.sendToBottom(playerId, p.skill.card);
    p.skill = null;
  }

  endGame({ winner, reason }: { winner: PlayerId | null; reason: GameOverReason }): void {
    this.phase = 'over';
    const stats = {
      finalLife: { 1: this.players[1].life, 2: this.players[2].life },
      turnsPlayed: this.turnNumber - 1 + this.turnsInFullTurn * 0.5,
    };
    this.gameOver = { winner, reason, stats };
    let msg = '';
    if (reason === 'life') msg = `🏆 Player ${winner} wins by reducing rival life to 0.`;
    else if (reason === 'turnLimit')
      msg = `🏆 Player ${winner} wins by turn limit (more life remaining).`;
    else if (reason === 'draw') msg = `🤝 Technical draw by turn limit with equal life.`;
    this.log(msg);
  }

  log(message: string): void {
    this.combatLog.push({
      turn: this.turnNumber,
      player: this.activePlayer,
      message,
    });
  }

  serialize(): SerializedGameState {
    return {
      config: this.config,
      phase: this.phase,
      activePlayer: this.activePlayer,
      turnNumber: this.turnNumber,
      turnsInFullTurn: this.turnsInFullTurn,
      combatLog: this.combatLog,
      setupState: this.setupState,
      turnState: this.turnState,
      players: {
        1: serializePlayer(this.players[1]),
        2: serializePlayer(this.players[2]),
      },
      gameOver: this.gameOver,
      selection: this.selection,
    };
  }

  static fromSerialized(data: SerializedGameState): Game {
    const game = Object.create(Game.prototype) as Game;
    game.config = {
      vidaInicial: data.config?.vidaInicial ?? 20,
      maxTurnos: data.config?.maxTurnos ?? 20,
      forceP1Start: data.config?.forceP1Start ?? false,
      attacksPerTurn: data.config?.attacksPerTurn ?? DEFAULT_ATTACKS_PER_TURN,
    };
    game.phase = data.phase;
    game.activePlayer = data.activePlayer;
    game.turnNumber = data.turnNumber;
    game.turnsInFullTurn = data.turnsInFullTurn ?? 0;
    game.combatLog = data.combatLog ?? [];
    game.setupState = data.setupState;
    game.turnState = data.turnState
      ? {
          isReplacingSkill: !!data.turnState.isReplacingSkill,
          skillReplacedThisTurn: !!data.turnState.skillReplacedThisTurn,
          drawnThisTurn: !!data.turnState.drawnThisTurn,
          skillPlacedThisTurn: !!data.turnState.skillPlacedThisTurn,
          attacksRemaining:
            data.turnState.attacksRemaining ?? game.config.attacksPerTurn,
          cardsAttackedThisTurn: data.turnState.cardsAttackedThisTurn ?? [],
        }
      : null;
    game.players = {
      1: deserializePlayer(data.players[1]),
      2: deserializePlayer(data.players[2]),
    };
    game.gameOver = data.gameOver;
    game.selection = data.selection ?? { 1: null, 2: null };
    return game;
  }
}

// ─── Helpers internos ────────────────────────────────────────────────────

function serializePlayer(p: PlayerState): PlayerState {
  return {
    life: p.life,
    deck: p.deck ?? [],
    hand: p.hand ?? [],
    units: padUnits(p.units),
    skill: p.skill,
    pendingEffects: p.pendingEffects ?? [],
  };
}

function deserializePlayer(d: PlayerState | undefined): PlayerState {
  if (!d) return createPlayer([], 20);
  return {
    life: d.life,
    deck: d.deck ?? [],
    hand: d.hand ?? [],
    units: padUnits(d.units),
    skill: d.skill ?? null,
    pendingEffects: d.pendingEffects ?? [],
  };
}

/** Asegura que el array de units tenga exactamente UNIT_SLOTS elementos. */
function padUnits(units: (UnitCard | null)[] | undefined): (UnitCard | null)[] {
  const result: (UnitCard | null)[] = [];
  for (let i = 0; i < UNIT_SLOTS; i++) {
    result.push(units?.[i] ?? null);
  }
  return result;
}

function createPlayer(deck: Card[], vidaInicial: number): PlayerState {
  return {
    life: vidaInicial,
    deck: [...deck],
    hand: [],
    units: Array.from({ length: UNIT_SLOTS }, () => null),
    skill: null,
    pendingEffects: [],
  };
}

function slotRefEquals(a: SlotRef, b: SlotRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'unit' && b.kind === 'unit') return a.index === b.index;
  return true;
}

// Re-exports
export type { PlayerSkill, UnitCard, SkillCard };

/** Helper público — normalización para el listener de Firebase. */
export function normalizeSerializedState(data: SerializedGameState): SerializedGameState {
  return Game.fromSerialized(data).serialize();
}
