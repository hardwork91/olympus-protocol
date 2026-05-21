// Estado del juego y flujo de turno de Olympus Protocol.
// Implementa la máquina de estados de la sección 6.1 y el bucle de turno de 6.2.

import { buildDeck, shuffle, countUnits } from './cards.js';
import { resolveAttack } from './combat.js';

const SKILL_TRAP_IDS = new Set([20, 21, 22]); // Minefield, Cyberattack, Trap Charge

export class Game {
  constructor(config) {
    this.config = {
      vidaInicial: config.vidaInicial || 20,
      maxTurnos: config.maxTurnos || 20,
      forceP1Start: !!config.forceP1Start,
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
    this.phase = 'setup';          // 'setup' | 'playing' | 'over'
    this.activePlayer = null;       // se establece en coin flip
    this.turnNumber = 1;
    this.combatLog = [];

    // Fase de setup
    this.setupState = {
      currentPlayer: 1,             // jugador que está haciendo setup ahora
      step: 'mulligan_or_confirm',  // 'mulligan_or_confirm' | 'placing_units' | 'placing_skill' | 'done'
    };

    // Estado de turno (sólo válido en phase=playing)
    this.turnState = null;

    // Resultado final
    this.gameOver = null; // { winner: 1|2|null, reason: 'life'|'turnLimit'|'draw', stats: {...} }

    // Selección de carta por jugador (visible al rival): instanceId | null por seat.
    this.selection = { 1: null, 2: null };
  }

  // Actualiza la carta seleccionada por un jugador (null para limpiar).
  setSelection(playerId, instanceId) {
    if (!this.selection) this.selection = { 1: null, 2: null };
    this.selection[playerId] = instanceId || null;
  }

  // ──────────────────────────────────────────────────────────────────
  // Utilidades de mazo / mano / slots
  // ──────────────────────────────────────────────────────────────────

  drawTo(playerId, targetSize) {
    const p = this.players[playerId];
    while (p.hand.length < targetSize && p.deck.length > 0) {
      p.hand.push(p.deck.shift());
    }
  }

  sendToBottom(playerId, card) {
    this.players[playerId].deck.push(card);
  }

  removeFromHand(playerId, instanceId) {
    const p = this.players[playerId];
    const idx = p.hand.findIndex(c => c.instanceId === instanceId);
    if (idx < 0) return null;
    return p.hand.splice(idx, 1)[0];
  }

  // ──────────────────────────────────────────────────────────────────
  // Fase de SETUP
  // ──────────────────────────────────────────────────────────────────

  canDeclareMulligan(playerId) {
    if (this.phase !== 'setup') return false;
    if (this.setupState.currentPlayer !== playerId) return false;
    if (this.setupState.step !== 'mulligan_or_confirm') return false;
    return countUnits(this.players[playerId].hand) < 2;
  }

  declareMulligan(playerId) {
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

  confirmHand(playerId) {
    if (this.phase !== 'setup') return false;
    if (this.setupState.currentPlayer !== playerId) return false;
    if (this.setupState.step !== 'mulligan_or_confirm') return false;
    this.setupState.step = 'placing';
    this.log(`Player ${playerId} confirms hand and proceeds to place units and skill.`);
    return true;
  }

  // Devuelve los slots válidos donde se puede colocar la carta seleccionada.
  validSlotsFor(playerId, instanceId) {
    const card = this.players[playerId].hand.find(c => c.instanceId === instanceId);
    if (!card) return [];
    const slots = [];

    if (this.phase === 'setup') {
      if (this.setupState.currentPlayer !== playerId) return [];
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
      if (this.activePlayer !== playerId) return [];
      const ts = this.turnState;
      // Reponer slots (paso 3): obligatorio si hay vacíos y la carta es unidad
      if (card.type === 'unit') {
        if (!this.players[playerId].frontLine) slots.push('frontLine');
        if (!this.players[playerId].rearGuard) slots.push('rearGuard');
      }
      // Colocar skill (paso 4): opcional si slot vacío
      if (card.type === 'skill') {
        if (!this.players[playerId].skill && !ts.skillPlacedThisTurn) slots.push('skill');
      }
      // Reemplazar skill (paso 1): solo si está en modo reemplazo
      if (ts.isReplacingSkill && card.type === 'skill' && this.players[playerId].skill) {
        slots.push('skill_replace');
      }
      return slots;
    }

    return [];
  }

  placeCard(playerId, instanceId, slot) {
    const valid = this.validSlotsFor(playerId, instanceId);
    if (!valid.includes(slot)) return false;
    const card = this.removeFromHand(playerId, instanceId);
    if (!card) return false;
    const p = this.players[playerId];

    if (slot === 'frontLine') {
      p.frontLine = card;
    } else if (slot === 'rearGuard') {
      p.rearGuard = card;
    } else if (slot === 'skill') {
      p.skill = { card, state: 'hidden' };
      if (this.phase === 'playing') this.turnState.skillPlacedThisTurn = true;
    } else if (slot === 'skill_replace') {
      const oldSkill = p.skill;
      p.skill = { card, state: 'hidden' };
      this.sendToBottom(playerId, oldSkill.card);
      this.log(`Player ${playerId} replaces their skill. Old (#${oldSkill.card.id} ${oldSkill.card.name}) goes to bottom of deck.`);
      this.turnState.isReplacingSkill = false;
      this.turnState.skillReplacedThisTurn = true;
    }

    if (slot !== 'skill_replace') {
      this.log(`Player ${playerId} places #${card.id} ${card.name} in ${slot}.`);
    }
    return true;
  }

  // El jugador finaliza su setup; pasa al siguiente o al coin flip.
  finishSetup(playerId) {
    if (this.phase !== 'setup') return false;
    if (this.setupState.currentPlayer !== playerId) return false;
    if (this.setupState.step !== 'placing') return false;

    this.log(`Player ${playerId} finishes setup.`);
    if (playerId === 1) {
      this.setupState.currentPlayer = 2;
      this.setupState.step = 'mulligan_or_confirm';
    } else {
      // Both players ready → coin flip + reveal
      this.coinFlip();
    }
    return true;
  }

  coinFlip() {
    this.activePlayer = this.config.forceP1Start ? 1 : (Math.random() < 0.5 ? 1 : 2);
    this.log(`🪙 Coin flip: Player ${this.activePlayer} attacks first.`);
    this.log(`🎴 Setup combat cards revealed.`);
    this.phase = 'playing';
    this.startTurn(this.activePlayer);
  }

  // ──────────────────────────────────────────────────────────────────
  // Fase de PLAYING — bucle de turno (sección 6.2)
  // ──────────────────────────────────────────────────────────────────

  startTurn(playerId) {
    // Inicializa el estado del turno
    this.turnState = {
      isReplacingSkill: false,
      skillReplacedThisTurn: false,
      drawnThisTurn: false,
      skillPlacedThisTurn: false,
    };

    // Paso 1 firmware: processSkillReveals
    // - Voltear Offensive del jugador activo (si tiene una hidden)
    // - Voltear Defensive del rival (si tiene una hidden)
    // - NO voltear trampas (esperan condición)
    const active = this.players[playerId];
    const rival = this.players[playerId === 1 ? 2 : 1];

    if (active.skill && active.skill.state === 'hidden' && active.skill.card.subtype === 'Offensive') {
      active.skill.state = 'active';
      this.log(`⚡ Player ${playerId} flips Offensive: #${active.skill.card.id} ${active.skill.card.name}`);
    }
    if (rival.skill && rival.skill.state === 'hidden' && rival.skill.card.subtype === 'Defensive') {
      rival.skill.state = 'active';
      this.log(`🛡 Rival player flips Defensive: #${rival.skill.card.id} ${rival.skill.card.name}`);
    }

    this.log(`▶ Turn ${this.turnNumber}, active player: ${playerId}`);
  }

  canReplaceSkill(playerId) {
    if (this.phase !== 'playing') return false;
    if (this.activePlayer !== playerId) return false;
    if (this.turnState.drawnThisTurn) return false;          // sólo antes del robo
    if (this.turnState.skillReplacedThisTurn) return false;  // una vez por turno
    if (!this.players[playerId].skill) return false;         // necesita una skill bocaabajo
    const handHasSkill = this.players[playerId].hand.some(c => c.type === 'skill');
    return handHasSkill;
  }

  enterReplaceSkillMode(playerId) {
    if (!this.canReplaceSkill(playerId)) return false;
    this.turnState.isReplacingSkill = true;
    return true;
  }

  exitReplaceSkillMode(playerId) {
    if (this.activePlayer !== playerId) return false;
    this.turnState.isReplacingSkill = false;
    return true;
  }

  // Paso 2: robar (automático, se llama tras posible reemplazo)
  drawPhase(playerId) {
    if (this.phase !== 'playing') return;
    if (this.activePlayer !== playerId) return;
    if (this.turnState.drawnThisTurn) return;
    this.drawTo(playerId, 5);
    this.turnState.drawnThisTurn = true;
    this.log(`Player ${playerId} draws up to 5 cards (hand: ${this.players[playerId].hand.length}).`);
  }

  // Paso 3: reponer slots vacíos es obligatorio si hay unidades.
  needsRefill(playerId) {
    if (this.phase !== 'playing') return false;
    if (this.activePlayer !== playerId) return false;
    const p = this.players[playerId];
    const hasFL = !!p.frontLine;
    const hasRG = !!p.rearGuard;
    if (hasFL && hasRG) return false;
    const hasUnitInHand = p.hand.some(c => c.type === 'unit');
    return hasUnitInHand;
  }

  canEndTurn(playerId) {
    if (this.phase !== 'playing') return false;
    if (this.activePlayer !== playerId) return false;
    // No puede terminar si todavía debe reponer slots
    if (this.needsRefill(playerId)) return false;
    return true;
  }

  // Pulsar "Fin de turno": resolveAttack + consumeUsedSkills + checkVictory + switchActivePlayer
  endTurn() {
    if (!this.canEndTurn(this.activePlayer)) return null;
    const attackerId = this.activePlayer;
    const defenderId = attackerId === 1 ? 2 : 1;

    // Asegurar robo automático antes (si el jugador no robó por flujo edge case)
    if (!this.turnState.drawnThisTurn) {
      this.drawPhase(attackerId);
    }

    const attackResult = resolveAttack(this, attackerId, defenderId);
    for (const entry of attackResult.log) this.log(entry);

    // Aplicar destrucciones (las cartas destruidas van al fondo del mazo propietario)
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

    // Consumir skills usadas (van al fondo del mazo del propietario)
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
      const idx = arr.findIndex(e => e.type === type);
      if (idx >= 0) arr.splice(idx, 1);
    }

    // Añadir nuevos pendingEffects
    for (const { playerId, type, value } of attackResult.newPendingEffects) {
      this.players[playerId].pendingEffects.push({ type, value });
    }

    // Restaurar Armor (no persistente entre turnos — implícito ya que no lo trackeamos)

    // Restaurar state 'active' a 'hidden' no aplica (Offensive/Defensive ya consumidas).
    // Si por algún motivo queda alguna 'active' sin consumir, la dejamos consumida.

    // Verificar victoria
    if (this.players[defenderId].life <= 0) {
      this.endGame({ winner: attackerId, reason: 'life' });
      return attackResult;
    }

    // Cambiar jugador activo. Si se cierra el turno completo, incrementar turnNumber.
    const wasSecondInFullTurn = (attackerId === 2 && this.activePlayer === 2) || (this.turnNumber > 1 || attackerId === 2);
    // Forma más simple: si el atacante actual era el segundo del turno completo, incrementar.
    // Usamos un contador interno.
    this.activePlayer = defenderId;
    this.turnsInFullTurn = (this.turnsInFullTurn || 0) + 1;
    if (this.turnsInFullTurn >= 2) {
      this.turnsInFullTurn = 0;
      this.turnNumber += 1;
    }

    // Verificar límite de turnos completos
    if (this.turnNumber > this.config.maxTurnos) {
      const l1 = this.players[1].life;
      const l2 = this.players[2].life;
      let winner = null, reason = 'turnLimit';
      if (l1 > l2) winner = 1;
      else if (l2 > l1) winner = 2;
      else reason = 'draw';
      this.endGame({ winner, reason });
      return attackResult;
    }

    this.startTurn(this.activePlayer);
    return attackResult;
  }

  endGame({ winner, reason }) {
    this.phase = 'over';
    const stats = {
      finalLife: { 1: this.players[1].life, 2: this.players[2].life },
      turnsPlayed: this.turnNumber - 1 + (this.turnsInFullTurn || 0) * 0.5,
    };
    this.gameOver = { winner, reason, stats };
    let msg = '';
    if (reason === 'life') msg = `🏆 Player ${winner} wins by life reduction to 0.`;
    else if (reason === 'turnLimit') msg = `🏆 Player ${winner} wins by turn limit (more life remaining).`;
    else if (reason === 'draw') msg = `🤝 Technical draw by turn limit with equal life.`;
    this.log(msg);
  }

  log(message) {
    this.combatLog.push({ turn: this.turnNumber, player: this.activePlayer, message });
  }

  // Serializa el estado a un objeto plano (JSON-safe) para guardar en Firebase.
  serialize() {
    return {
      config: this.config,
      phase: this.phase,
      activePlayer: this.activePlayer,
      turnNumber: this.turnNumber,
      turnsInFullTurn: this.turnsInFullTurn || 0,
      combatLog: this.combatLog || [],
      setupState: this.setupState || null,
      turnState: this.turnState || null,
      players: {
        1: serializePlayer(this.players[1]),
        2: serializePlayer(this.players[2]),
      },
      gameOver: this.gameOver || null,
      selection: this.selection || { 1: null, 2: null },
    };
  }

  // Reconstruye una instancia Game a partir del objeto plano serializado.
  static fromSerialized(data) {
    const game = Object.create(Game.prototype);
    game.config = data.config;
    game.phase = data.phase;
    game.activePlayer = data.activePlayer;
    game.turnNumber = data.turnNumber;
    game.turnsInFullTurn = data.turnsInFullTurn || 0;
    game.combatLog = data.combatLog || [];
    game.setupState = data.setupState || null;
    game.turnState = data.turnState || null;
    game.players = {
      1: deserializePlayer(data.players[1]),
      2: deserializePlayer(data.players[2]),
    };
    game.gameOver = data.gameOver || null;
    game.selection = data.selection || { 1: null, 2: null };
    return game;
  }
}

function serializePlayer(p) {
  return {
    life: p.life,
    deck: p.deck || [],
    hand: p.hand || [],
    frontLine: p.frontLine || null,
    rearGuard: p.rearGuard || null,
    skill: p.skill || null,
    pendingEffects: p.pendingEffects || [],
  };
}

function deserializePlayer(d) {
  return {
    life: d.life,
    deck: d.deck || [],
    hand: d.hand || [],
    frontLine: d.frontLine || null,
    rearGuard: d.rearGuard || null,
    skill: d.skill || null,
    pendingEffects: d.pendingEffects || [],
  };
}

function createPlayer(deck, vidaInicial) {
  return {
    life: vidaInicial,
    deck: [...deck],
    hand: [],
    frontLine: null,
    rearGuard: null,
    skill: null, // { card, state: 'hidden'|'active'|'consumed' }
    pendingEffects: [],
  };
}
