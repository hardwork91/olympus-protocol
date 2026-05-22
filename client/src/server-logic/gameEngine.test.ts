import { beforeEach, describe, expect, it } from 'vitest';
import { SKILL_ID } from '../shared/cards';
import type { AttackTarget, SkillCard, SkillSubtype, UnitCard, UnitSlotIndex } from '../shared/types';
import { Game } from './gameEngine';

function makeSkill(id: number, subtype: SkillSubtype, name = `S${id}`): SkillCard {
  return {
    id,
    instanceId: `s${id}`,
    type: 'skill',
    name,
    subtype,
    effect: 'test effect',
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function makeGame(overrides: { vidaInicial?: number; maxTurnos?: number; attacksPerTurn?: number } = {}) {
  return new Game({
    vidaInicial: overrides.vidaInicial ?? 20,
    maxTurnos: overrides.maxTurnos ?? 20,
    forceP1Start: true,
    attacksPerTurn: overrides.attacksPerTurn ?? 3,
  });
}

/** Atajo para colocar una carta directamente en el state (skip placement flow). */
function place(
  game: Game,
  playerId: 1 | 2,
  slotIndex: UnitSlotIndex,
  card: UnitCard,
): void {
  game.players[playerId].units[slotIndex] = card;
}

const at = (i: number): AttackTarget => ({ kind: 'unit', index: i as UnitSlotIndex });

function makeUnit(
  name: string,
  subtype: 'Assault' | 'Tank' | 'Artillery' | 'Support',
  fp: number,
  ar: number,
  id = 99,
): UnitCard {
  return {
    id,
    instanceId: `u${id}-${name}`,
    type: 'unit',
    name,
    subtype,
    firepower: fp,
    armor: ar,
  };
}

// ─── Init ───────────────────────────────────────────────────────────────

describe('Game — inicialización', () => {
  let game: Game;
  beforeEach(() => {
    game = makeGame();
  });

  it('phase=setup, activePlayer=null al inicio', () => {
    expect(game.phase).toBe('setup');
    expect(game.activePlayer).toBeNull();
  });

  it('cada jugador empieza con 20 de vida', () => {
    expect(game.players[1].life).toBe(20);
    expect(game.players[2].life).toBe(20);
  });

  it('cada jugador empieza con 6 cartas en mano (initial draw)', () => {
    expect(game.players[1].hand).toHaveLength(6);
    expect(game.players[2].hand).toHaveLength(6);
  });

  it('cada mazo tiene 14 cartas tras robar 6 iniciales (20 - 6)', () => {
    expect(game.players[1].deck).toHaveLength(14);
    expect(game.players[2].deck).toHaveLength(14);
  });

  it('cada jugador tiene 5 unit slots vacíos', () => {
    expect(game.players[1].units).toHaveLength(5);
    expect(game.players[1].units.every((u) => u === null)).toBe(true);
    expect(game.players[2].units).toHaveLength(5);
  });

  it('config.attacksPerTurn default = 3', () => {
    expect(game.config.attacksPerTurn).toBe(3);
  });
});

// ─── Setup flow ─────────────────────────────────────────────────────────

describe('Game — setup', () => {
  it('confirmHand pasa step a placing', () => {
    const game = makeGame();
    expect(game.confirmHand(1)).toBe(true);
    expect(game.setupState?.step).toBe('placing');
  });

  it('confirmHand rechaza si no es tu turno de setup', () => {
    const game = makeGame();
    expect(game.confirmHand(2)).toBe(false);
  });

  it('placeCard coloca unit en slot indicado', () => {
    const game = makeGame();
    game.confirmHand(1);
    const unitCard = game.players[1].hand.find((c) => c.type === 'unit');
    if (!unitCard) throw new Error('No unit in hand');
    const ok = game.placeCard(1, unitCard.instanceId, { kind: 'unit', index: 2 });
    expect(ok).toBe(true);
    expect(game.players[1].units[2]?.instanceId).toBe(unitCard.instanceId);
  });

  it('placeCard rechaza colocar skill en unit slot', () => {
    const game = makeGame();
    game.confirmHand(1);
    const skill = game.players[1].hand.find((c) => c.type === 'skill');
    if (!skill) return; // si no hay skill en la mano random, no testeamos
    const ok = game.placeCard(1, skill.instanceId, { kind: 'unit', index: 0 });
    expect(ok).toBe(false);
  });

  it('finishSetup de P1 pasa el turno a P2', () => {
    const game = makeGame();
    game.confirmHand(1);
    game.finishSetup(1);
    expect(game.setupState?.currentPlayer).toBe(2);
    expect(game.setupState?.step).toBe('mulligan_or_confirm');
  });

  it('finishSetup de P2 dispara coinFlip → phase=playing', () => {
    const game = makeGame();
    game.confirmHand(1);
    game.finishSetup(1);
    game.confirmHand(2);
    game.finishSetup(2);
    expect(game.phase).toBe('playing');
    expect(game.activePlayer).toBe(1);
  });
});

// ─── Turn flow ──────────────────────────────────────────────────────────

describe('Game — turn flow', () => {
  function advanceToPlaying(g: Game) {
    g.confirmHand(1);
    g.finishSetup(1);
    g.confirmHand(2);
    g.finishSetup(2);
  }

  it('startTurn inicia turnState con attacksRemaining = 3', () => {
    const game = makeGame();
    advanceToPlaying(game);
    expect(game.turnState?.attacksRemaining).toBe(3);
    expect(game.turnState?.cardsAttackedThisTurn).toEqual([]);
  });

  it('drawPhase marca drawnThisTurn = true', () => {
    const game = makeGame();
    advanceToPlaying(game);
    expect(game.turnState?.drawnThisTurn).toBe(false);
    game.drawPhase(1);
    expect(game.turnState?.drawnThisTurn).toBe(true);
  });

  it('endTurn alterna el activePlayer', () => {
    const game = makeGame();
    advanceToPlaying(game);
    const startActive = game.activePlayer;
    game.endTurn();
    expect(game.activePlayer).not.toBe(startActive);
  });

  it('endTurn ya NO resuelve combate automáticamente', () => {
    const game = makeGame();
    advanceToPlaying(game);
    const attackerId = game.activePlayer as 1 | 2;
    const defenderId = attackerId === 1 ? 2 : 1;
    place(game, attackerId, 2, makeUnit('STRONG', 'Tank', 50, 1));
    const lifeBefore = game.players[defenderId].life;
    game.endTurn();
    expect(game.players[defenderId].life).toBe(lifeBefore);
  });
});

// ─── Ataques ────────────────────────────────────────────────────────────

describe('Game — ataques', () => {
  function setupCombat(g: Game) {
    g.confirmHand(1);
    g.finishSetup(1);
    g.confirmHand(2);
    g.finishSetup(2);
  }

  it('canAttackWith true cuando hay carta y attacksRemaining > 0', () => {
    const game = makeGame();
    setupCombat(game);
    const active = game.activePlayer as 1 | 2;
    place(game, active, 2, makeUnit('TANK', 'Tank', 5, 3));
    expect(game.canAttackWith(active, 2 as UnitSlotIndex)).toBe(true);
  });

  it('canAttackWith false si la unidad ya atacó este turno', () => {
    const game = makeGame();
    setupCombat(game);
    const active = game.activePlayer as 1 | 2;
    const defender = active === 1 ? 2 : 1;
    place(game, active, 2, makeUnit('TANK', 'Tank', 5, 3));
    place(game, defender, 2, makeUnit('V', 'Tank', 1, 1));
    game.declareAttack(active, 2 as UnitSlotIndex, at(2));
    expect(game.canAttackWith(active, 2 as UnitSlotIndex)).toBe(false);
  });

  it('canAttackWith false si Support', () => {
    const game = makeGame();
    setupCombat(game);
    const active = game.activePlayer as 1 | 2;
    place(game, active, 2, makeUnit('SUP', 'Support', 0, 5));
    expect(game.canAttackWith(active, 2 as UnitSlotIndex)).toBe(false);
  });

  it('declareAttack consume 1 ataque', () => {
    const game = makeGame();
    setupCombat(game);
    const active = game.activePlayer as 1 | 2;
    const defender = active === 1 ? 2 : 1;
    place(game, active, 2, makeUnit('A', 'Tank', 5, 3));
    place(game, defender, 2, makeUnit('V', 'Tank', 1, 2));
    const before = game.turnState?.attacksRemaining ?? 0;
    game.declareAttack(active, 2 as UnitSlotIndex, at(2));
    expect(game.turnState?.attacksRemaining).toBe(before - 1);
  });

  it('declareAttack permite máximo 3 ataques por turno', () => {
    const game = makeGame();
    setupCombat(game);
    const active = game.activePlayer as 1 | 2;
    const defender = active === 1 ? 2 : 1;
    // Coloca 4 atacantes y 4 víctimas
    place(game, active, 0, makeUnit('A0', 'Tank', 5, 3, 1));
    place(game, active, 1, makeUnit('A1', 'Tank', 5, 3, 2));
    place(game, active, 2, makeUnit('A2', 'Tank', 5, 3, 3));
    place(game, active, 3, makeUnit('A3', 'Tank', 5, 3, 4));
    place(game, defender, 0, makeUnit('V0', 'Tank', 1, 1, 11));
    place(game, defender, 1, makeUnit('V1', 'Tank', 1, 1, 12));
    place(game, defender, 2, makeUnit('V2', 'Tank', 1, 1, 13));
    place(game, defender, 3, makeUnit('V3', 'Tank', 1, 1, 14));

    expect(game.declareAttack(active, 0 as UnitSlotIndex, at(0))).not.toBeNull();
    expect(game.declareAttack(active, 1 as UnitSlotIndex, at(1))).not.toBeNull();
    expect(game.declareAttack(active, 2 as UnitSlotIndex, at(2))).not.toBeNull();
    // 4° ataque debe rechazarse
    expect(game.declareAttack(active, 3 as UnitSlotIndex, at(3))).toBeNull();
    expect(game.turnState?.attacksRemaining).toBe(0);
  });

  it('declareAttack aplica daño a vida del defensor (ataque a vida)', () => {
    const game = makeGame();
    setupCombat(game);
    const active = game.activePlayer as 1 | 2;
    const defender = active === 1 ? 2 : 1;
    // Coloca un Tank en slot 0; defensor totalmente vacío → puede atacar vida
    place(game, active, 0, makeUnit('T', 'Tank', 5, 3));
    const lifeBefore = game.players[defender].life;
    game.declareAttack(active, 0 as UnitSlotIndex, { kind: 'life' });
    expect(game.players[defender].life).toBe(lifeBefore - 5);
  });

  it('declareAttack destruye unidad enemiga si FP > AR', () => {
    const game = makeGame();
    setupCombat(game);
    const active = game.activePlayer as 1 | 2;
    const defender = active === 1 ? 2 : 1;
    place(game, active, 2, makeUnit('A', 'Tank', 6, 3));
    place(game, defender, 2, makeUnit('V', 'Tank', 1, 2));
    game.declareAttack(active, 2 as UnitSlotIndex, at(2));
    expect(game.players[defender].units[2]).toBeNull();
  });
});

// ─── EndGame ────────────────────────────────────────────────────────────

describe('Game — endGame', () => {
  it('si vida del defensor llega a 0 → atacante gana', () => {
    const game = makeGame();
    game.confirmHand(1);
    game.finishSetup(1);
    game.confirmHand(2);
    game.finishSetup(2);
    const attackerId = game.activePlayer as 1 | 2;
    const defenderId = attackerId === 1 ? 2 : 1;

    place(game, attackerId, 0, makeUnit('STRONG', 'Tank', 50, 1));
    game.players[defenderId].units = Array.from({ length: 5 }, () => null);
    game.players[defenderId].life = 1;

    game.declareAttack(attackerId, 0 as UnitSlotIndex, { kind: 'life' });
    expect(game.phase).toBe('over');
    expect(game.gameOver?.winner).toBe(attackerId);
    expect(game.gameOver?.reason).toBe('life');
  });
});

// ─── Serialize / fromSerialized ─────────────────────────────────────────

describe('Game — serialize / fromSerialized', () => {
  it('round-trip preserva state', () => {
    const game = makeGame({ vidaInicial: 25, maxTurnos: 30, attacksPerTurn: 5 });
    game.confirmHand(1);
    game.setSelection(1, 'card-abc');
    const serialized = game.serialize();
    const restored = Game.fromSerialized(serialized);
    expect(restored.phase).toBe(game.phase);
    expect(restored.config).toEqual(game.config);
    expect(restored.players[1].hand).toEqual(game.players[1].hand);
    expect(restored.players[1].units).toEqual(game.players[1].units);
    expect(restored.selection).toEqual(game.selection);
  });

  it('serialize es JSON-safe', () => {
    const game = makeGame();
    const serialized = game.serialize();
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });

  it('fromSerialized rellena defaults faltantes (Firebase strip nulls)', () => {
    const game = makeGame();
    const serialized = game.serialize();
    // Simular state que perdió campos en Firebase
    const partial = {
      ...serialized,
      players: {
        1: { ...serialized.players[1], units: undefined as unknown as never },
        2: serialized.players[2],
      },
    };
    const restored = Game.fromSerialized(partial as unknown as Parameters<typeof Game.fromSerialized>[0]);
    expect(restored.players[1].units).toHaveLength(5);
    expect(restored.players[1].units.every((u) => u === null)).toBe(true);
  });
});

// ─── Selection ──────────────────────────────────────────────────────────

describe('Game — selección', () => {
  it('setSelection actualiza el campo del jugador', () => {
    const game = makeGame();
    game.setSelection(1, 'foo');
    expect(game.selection[1]).toBe('foo');
    expect(game.selection[2]).toBeNull();
  });

  it('setSelection con null limpia', () => {
    const game = makeGame();
    game.setSelection(1, 'foo');
    game.setSelection(1, null);
    expect(game.selection[1]).toBeNull();
  });
});

// ─── Skill flips + DOUBLE-SHOT + consumption ─────────────────────────────

describe('Game — skill flips y DOUBLE-SHOT', () => {
  function advanceToPlaying(g: Game) {
    g.confirmHand(1);
    g.finishSetup(1);
    g.confirmHand(2);
    g.finishSetup(2);
  }

  it('Offensive skill se flippea hidden → active al inicio del turno', () => {
    const game = makeGame();
    advanceToPlaying(game);
    const active = game.activePlayer as 1 | 2;
    game.players[active].skill = {
      card: makeSkill(SKILL_ID.REACTOR_OVERLOAD, 'Offensive'),
      state: 'hidden',
    };
    // Forzar arranque del turno (ya inició, así que reiniciamos manualmente).
    game.startTurn(active);
    expect(game.players[active].skill?.state).toBe('active');
  });

  it('Defensive skill del rival se flippea cuando empieza el turno del atacante', () => {
    const game = makeGame();
    advanceToPlaying(game);
    const active = game.activePlayer as 1 | 2;
    const rival = active === 1 ? 2 : 1;
    game.players[rival].skill = {
      card: makeSkill(SKILL_ID.REINFORCEMENT_PROTOCOL, 'Defensive'),
      state: 'hidden',
    };
    game.startTurn(active);
    expect(game.players[rival].skill?.state).toBe('active');
  });

  it('DOUBLE-SHOT agrega +1 a attacksRemaining al voltear', () => {
    const game = makeGame({ attacksPerTurn: 3 });
    advanceToPlaying(game);
    const active = game.activePlayer as 1 | 2;
    game.players[active].skill = {
      card: makeSkill(SKILL_ID.DOUBLE_SHOT, 'Offensive'),
      state: 'hidden',
    };
    game.startTurn(active);
    expect(game.turnState?.attacksRemaining).toBe(4);
  });

  it('endTurn consume las skills activas (se mandan al fondo del deck)', () => {
    const game = makeGame();
    advanceToPlaying(game);
    const active = game.activePlayer as 1 | 2;
    const skill = makeSkill(SKILL_ID.REACTOR_OVERLOAD, 'Offensive');
    game.players[active].skill = { card: skill, state: 'active' };
    const deckSizeBefore = game.players[active].deck.length;
    game.endTurn();
    expect(game.players[active].skill).toBeNull();
    expect(game.players[active].deck.length).toBe(deckSizeBefore + 1);
    // La skill está al fondo del deck
    const last = game.players[active].deck[game.players[active].deck.length - 1];
    expect(last?.id).toBe(SKILL_ID.REACTOR_OVERLOAD);
  });

  it('endTurn NO consume skills hidden (traps persisten)', () => {
    const game = makeGame();
    advanceToPlaying(game);
    const active = game.activePlayer as 1 | 2;
    const trap = makeSkill(SKILL_ID.MINEFIELD, 'Trap');
    game.players[active].skill = { card: trap, state: 'hidden' };
    game.endTurn();
    expect(game.players[active].skill).not.toBeNull();
    expect(game.players[active].skill?.card.id).toBe(SKILL_ID.MINEFIELD);
  });
});
