// ============================================================================
// Motor del juego (Game). Implementa la máquina de estados (6.1) y el bucle
// de turno (6.2) del design doc de Olympus Protocol.
//
// **CONTRATO**: este archivo NO importa nada de UI, React, Firebase, ni nada
// del cliente. Solo depende de @shared. Cuando aparezca el backend real,
// esta carpeta entera se copia/mueve sin cambios.
// ============================================================================

import { buildDeck, countUnits, shuffle } from '../shared/cards';
import type {
  Card,
  GameConfig,
  GameOverData,
  GameOverReason,
  GamePhase,
  LogEntry,
  PendingEffect,
  PlayerId,
  PlayerSkill,
  PlayerState,
  Selection,
  SerializedGameState,
  SetupState,
  SkillCard,
  SlotIndicator,
  TurnState,
  UnitCard,
} from '../shared/types';
import { otherPlayer } from '../shared/types';
import { resolveAttack } from './combat';

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
    };

    // ─── Mazo común y reparto ───
    const fullDeck = shuffle(buildDeck()); // 40 cartas
    const p1Deck = fullDeck.slice(0, 20);
    const p2Deck = fullDeck.slice(20, 40);

    this.players = {
      1: createPlayer(p1Deck, this.config.vidaInicial),
      2: createPlayer(p2Deck, this.config.vidaInicial),
    };

    // Robar 5 iniciales
    this.drawTo(1, 5);
    this.drawTo(2, 5);

    // Estado general
    this.phase = 'setup';
    this.activePlayer = null;
    this.turnNumber = 1;
    this.turnsInFullTurn = 0;
    this.combatLog = [];

    // Fase de setup
    this.setupState = {
      currentPlayer: 1,
      step: 'mulligan_or_confirm',
    };

    // Estado de turno (sólo válido en phase=playing)
    this.turnState = null;

    // Resultado final
    this.gameOver = null;

    // Selección de carta por jugador (visible al rival): instanceId | null por seat.
    this.selection = { 1: null, 2: null };
  }

  // Actualiza la carta seleccionada por un jugador (null para limpiar).
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

  // ────────────────────────────────────────────────────────────────────
  // Fase de SETUP
  // ────────────────────────────────────────────────────────────────────

  canDeclareMulligan(playerId: PlayerId): boolean {
    if (this.phase !== 'setup') return false;
    if (!this.setupState) return false;
    if (this.setupState.currentPlayer !== playerId) return false;
    if (this.setupState.step !== 'mulligan_or_confirm') return false;
    return countUnits(this.players[playerId].hand) < 2;
  }

  declareMulligan(playerId: PlayerId): boolean {
    if (!this.canDeclareMulligan(playerId)) return false;
    const p = this.players[playerId];
    // Devolver mano al mazo
    p.deck.push(...p.hand);
    p.hand = [];
    // Barajar mazo personal
    p.deck = shuffle(p.deck);
    // Robar 5 nuevas
    this.drawTo(playerId, 5);
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

  /** Slots válidos para colocar la carta seleccionada. */
  validSlotsFor(playerId: PlayerId, instanceId: string): SlotIndicator[] {
    const card = this.players[playerId].hand.find((c) => c.instanceId === instanceId);
    if (!card) return [];
    const slots: SlotIndicator[] = [];

    if (this.phase === 'setup') {
      if (!this.setupState || this.setupState.currentPlayer !== playerId) return [];
      if (this.setupState.step === 'placing') {
        if (card.type === 'unit') {
          if (!this.players[playerId].frontLine) slots.push('frontLine');
          if (!this.players[playerId].rearGuard) slots.push('rearGuard');
        }
        if (card.type === 'skill') {
          if (!this.players[playerId].skill) slots.push('skill');
        }
      }
      return slots;
    }

    if (this.phase === 'playing') {
      if (this.activePlayer !== playerId || !this.turnState) return [];
      const ts = this.turnState;
      if (card.type === 'unit') {
        if (!this.players[playerId].frontLine) slots.push('frontLine');
        if (!this.players[playerId].rearGuard) slots.push('rearGuard');
      }
      if (card.type === 'skill') {
        if (!this.players[playerId].skill && !ts.skillPlacedThisTurn) slots.push('skill');
      }
      if (ts.isReplacingSkill && card.type === 'skill' && this.players[playerId].skill) {
        slots.push('skill_replace');
      }
      return slots;
    }

    return [];
  }

  placeCard(playerId: PlayerId, instanceId: string, slot: SlotIndicator): boolean {
    const valid = this.validSlotsFor(playerId, instanceId);
    if (!valid.includes(slot)) return false;
    const card = this.removeFromHand(playerId, instanceId);
    if (!card) return false;
    const p = this.players[playerId];

    if (slot === 'frontLine') {
      if (card.type !== 'unit') return false;
      p.frontLine = card;
    } else if (slot === 'rearGuard') {
      if (card.type !== 'unit') return false;
      p.rearGuard = card;
    } else if (slot === 'skill') {
      if (card.type !== 'skill') return false;
      p.skill = { card, state: 'hidden' };
      if (this.phase === 'playing' && this.turnState) {
        this.turnState.skillPlacedThisTurn = true;
      }
    } else if (slot === 'skill_replace') {
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

    if (slot !== 'skill_replace') {
      this.log(`Player ${playerId} places #${card.id} ${card.name} in ${slot}.`);
    }
    return true;
  }

  /** El jugador finaliza su setup; pasa al siguiente o al coin flip. */
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
      // Ambos jugadores listos → coin flip + reveal
      this.coinFlip();
    }
    return true;
  }

  coinFlip(): void {
    this.activePlayer = this.config.forceP1Start ? 1 : Math.random() < 0.5 ? 1 : 2;
    this.log(`🪙 Coin flip: Player ${this.activePlayer} attacks first.`);
    this.log(`🎴 Setup combat cards revealed.`);
    this.phase = 'playing';
    this.startTurn(this.activePlayer);
  }

  // ────────────────────────────────────────────────────────────────────
  // Fase de PLAYING — bucle de turno (sección 6.2)
  // ────────────────────────────────────────────────────────────────────

  startTurn(playerId: PlayerId): void {
    this.turnState = {
      isReplacingSkill: false,
      skillReplacedThisTurn: false,
      drawnThisTurn: false,
      skillPlacedThisTurn: false,
    };

    // Voltear skills:
    //  - Offensive del jugador activo (si tiene una hidden)
    //  - Defensive del rival (si tiene una hidden)
    //  - NO voltear trampas (esperan condición)
    const active = this.players[playerId];
    const rival = this.players[otherPlayer(playerId)];

    if (
      active.skill &&
      active.skill.state === 'hidden' &&
      active.skill.card.subtype === 'Offensive'
    ) {
      active.skill.state = 'active';
      this.log(
        `⚡ Player ${playerId} flips Offensive: #${active.skill.card.id} ${active.skill.card.name}`,
      );
    }
    if (rival.skill && rival.skill.state === 'hidden' && rival.skill.card.subtype === 'Defensive') {
      rival.skill.state = 'active';
      this.log(`🛡 Rival player flips Defensive: #${rival.skill.card.id} ${rival.skill.card.name}`);
    }

    this.log(`▶ Turn ${this.turnNumber}, active player: ${playerId}`);
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

  /** Paso 2: robar (automático, se llama tras posible reemplazo). */
  drawPhase(playerId: PlayerId): void {
    if (this.phase !== 'playing') return;
    if (this.activePlayer !== playerId || !this.turnState) return;
    if (this.turnState.drawnThisTurn) return;
    this.drawTo(playerId, 5);
    this.turnState.drawnThisTurn = true;
    this.log(
      `Player ${playerId} draws up to 5 cards (hand: ${this.players[playerId].hand.length}).`,
    );
  }

  /** Paso 3: reponer slots vacíos es obligatorio si hay unidades en mano. */
  needsRefill(playerId: PlayerId): boolean {
    if (this.phase !== 'playing') return false;
    if (this.activePlayer !== playerId) return false;
    const p = this.players[playerId];
    if (p.frontLine && p.rearGuard) return false;
    return p.hand.some((c) => c.type === 'unit');
  }

  canEndTurn(playerId: PlayerId): boolean {
    if (this.phase !== 'playing') return false;
    if (this.activePlayer !== playerId) return false;
    if (this.needsRefill(playerId)) return false;
    return true;
  }

  /** "Fin de turno": resolveAttack + consumeUsedSkills + checkVictory + switch active. */
  endTurn(): ReturnType<typeof resolveAttack> | null {
    if (this.activePlayer === null) return null;
    if (!this.canEndTurn(this.activePlayer)) return null;
    const attackerId = this.activePlayer;
    const defenderId = otherPlayer(attackerId);

    // Asegurar robo automático antes (edge case por flujo manual)
    if (this.turnState && !this.turnState.drawnThisTurn) {
      this.drawPhase(attackerId);
    }

    const attackResult = resolveAttack(this, attackerId, defenderId);
    for (const entry of attackResult.log) this.log(entry);

    // Aplicar destrucciones (al fondo del mazo del propietario)
    if (attackResult.destroyed.attackerFront && this.players[attackerId].frontLine) {
      this.sendToBottom(attackerId, this.players[attackerId].frontLine);
      this.players[attackerId].frontLine = null;
    }
    if (attackResult.destroyed.attackerRear && this.players[attackerId].rearGuard) {
      this.sendToBottom(attackerId, this.players[attackerId].rearGuard);
      this.players[attackerId].rearGuard = null;
    }
    if (attackResult.destroyed.defenderFront && this.players[defenderId].frontLine) {
      this.sendToBottom(defenderId, this.players[defenderId].frontLine);
      this.players[defenderId].frontLine = null;
    }
    if (attackResult.destroyed.defenderRear && this.players[defenderId].rearGuard) {
      this.sendToBottom(defenderId, this.players[defenderId].rearGuard);
      this.players[defenderId].rearGuard = null;
    }

    // Aplicar daño a vida
    this.players[defenderId].life -= attackResult.lifeDamage;
    if (this.players[defenderId].life < 0) this.players[defenderId].life = 0;

    // Consumir skills usadas (al fondo del mazo)
    for (const { playerId, skillId } of attackResult.consumedSkills) {
      const p = this.players[playerId];
      if (p.skill && p.skill.card.id === skillId) {
        this.sendToBottom(playerId, p.skill.card);
        p.skill = null;
      }
    }

    // Consumir pendingEffects que se aplicaron
    for (const { playerId, type } of attackResult.consumedPendingEffects) {
      const arr = this.players[playerId].pendingEffects;
      const idx = arr.findIndex((e) => e.type === type);
      if (idx >= 0) arr.splice(idx, 1);
    }

    // Añadir nuevos pendingEffects
    for (const { playerId, type, value } of attackResult.newPendingEffects) {
      this.players[playerId].pendingEffects.push({ type, value });
    }

    // Verificar victoria por vida 0
    if (this.players[defenderId].life <= 0) {
      this.endGame({ winner: attackerId, reason: 'life' });
      return attackResult;
    }

    // Cambiar jugador activo. Si se cierra el turno completo, incrementar turnNumber.
    this.activePlayer = defenderId;
    this.turnsInFullTurn += 1;
    if (this.turnsInFullTurn >= 2) {
      this.turnsInFullTurn = 0;
      this.turnNumber += 1;
    }

    // Verificar límite de turnos completos
    if (this.turnNumber > this.config.maxTurnos) {
      const l1 = this.players[1].life;
      const l2 = this.players[2].life;
      let winner: PlayerId | null = null;
      let reason: GameOverReason = 'turnLimit';
      if (l1 > l2) winner = 1;
      else if (l2 > l1) winner = 2;
      else reason = 'draw';
      this.endGame({ winner, reason });
      return attackResult;
    }

    this.startTurn(this.activePlayer);
    return attackResult;
  }

  endGame({ winner, reason }: { winner: PlayerId | null; reason: GameOverReason }): void {
    this.phase = 'over';
    const stats = {
      finalLife: { 1: this.players[1].life, 2: this.players[2].life },
      turnsPlayed: this.turnNumber - 1 + this.turnsInFullTurn * 0.5,
    };
    this.gameOver = { winner, reason, stats };
    let msg = '';
    if (reason === 'life') msg = `🏆 Player ${winner} wins by life reduction to 0.`;
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

  /** Serializa el estado a JSON-safe (para persistir en Firebase). */
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

  /** Reconstruye una instancia Game a partir del serializado de Firebase. */
  static fromSerialized(data: SerializedGameState): Game {
    const game = Object.create(Game.prototype) as Game;
    game.config = data.config;
    game.phase = data.phase;
    game.activePlayer = data.activePlayer;
    game.turnNumber = data.turnNumber;
    game.turnsInFullTurn = data.turnsInFullTurn ?? 0;
    game.combatLog = data.combatLog ?? [];
    game.setupState = data.setupState;
    game.turnState = data.turnState;
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
    frontLine: p.frontLine,
    rearGuard: p.rearGuard,
    skill: p.skill,
    pendingEffects: p.pendingEffects ?? [],
  };
}

function deserializePlayer(d: PlayerState): PlayerState {
  return {
    life: d.life,
    deck: d.deck ?? [],
    hand: d.hand ?? [],
    frontLine: d.frontLine,
    rearGuard: d.rearGuard,
    skill: d.skill,
    pendingEffects: d.pendingEffects ?? [],
  };
}

function createPlayer(deck: Card[], vidaInicial: number): PlayerState {
  return {
    life: vidaInicial,
    deck: [...deck],
    hand: [],
    frontLine: null,
    rearGuard: null,
    skill: null,
    pendingEffects: [],
  };
}

// Re-exports para que tests puedan importar tipos auxiliares.
export type { PlayerSkill, UnitCard, SkillCard, PendingEffect };

/**
 * Normaliza un SerializedGameState potencialmente "corrupto" (Firebase RTDB
 * elimina valores nulos y arrays vacíos al persistir, así que campos como
 * `selection: {1: null, 2: null}` desaparecen). Hace un roundtrip por
 * Game.fromSerialized().serialize() que rellena todos los defaults.
 */
export function normalizeSerializedState(data: SerializedGameState): SerializedGameState {
  return Game.fromSerialized(data).serialize();
}
