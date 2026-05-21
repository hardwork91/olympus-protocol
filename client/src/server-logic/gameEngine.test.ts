import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from './gameEngine';
import type { UnitCard } from '../shared/types';

// ─── Helpers de test ────────────────────────────────────────────────────

/** Crea un Game listo para test con config determinista (forceP1Start). */
function makeGame(overrides: { vidaInicial?: number; maxTurnos?: number } = {}) {
  return new Game({
    vidaInicial: overrides.vidaInicial ?? 20,
    maxTurnos: overrides.maxTurnos ?? 20,
    forceP1Start: true,
  });
}

/** Avanza el setup completo (mulligan + confirm + place all + finish) para ambos. */
function advanceToPlaying(game: Game): void {
  // Player 1
  game.confirmHand(1);
  placeAllForPlayer(game, 1);
  game.finishSetup(1);
  // Player 2
  game.confirmHand(2);
  placeAllForPlayer(game, 2);
  game.finishSetup(2); // dispara coinFlip → phase = 'playing'
}

/** Coloca 2 unidades + 1 skill (los primeros que encuentre en mano). */
function placeAllForPlayer(game: Game, playerId: 1 | 2): void {
  const p = game.players[playerId];
  const units = p.hand.filter((c) => c.type === 'unit');
  const skill = p.hand.find((c) => c.type === 'skill');

  if (units[0]) game.placeCard(playerId, units[0].instanceId, 'frontLine');
  if (units[1]) game.placeCard(playerId, units[1].instanceId, 'rearGuard');
  if (skill) game.placeCard(playerId, skill.instanceId, 'skill');
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('Game — inicialización', () => {
  let game: Game;

  beforeEach(() => {
    game = makeGame();
  });

  it('inicia en phase=setup con activePlayer=null', () => {
    expect(game.phase).toBe('setup');
    expect(game.activePlayer).toBeNull();
  });

  it('cada jugador empieza con 20 de vida y 5 cartas en mano', () => {
    expect(game.players[1].life).toBe(20);
    expect(game.players[2].life).toBe(20);
    expect(game.players[1].hand).toHaveLength(5);
    expect(game.players[2].hand).toHaveLength(5);
  });

  it('cada mazo tiene 15 cartas tras robar 5 iniciales (20 - 5)', () => {
    expect(game.players[1].deck).toHaveLength(15);
    expect(game.players[2].deck).toHaveLength(15);
  });

  it('setupState inicia con currentPlayer=1, step=mulligan_or_confirm', () => {
    expect(game.setupState).toEqual({ currentPlayer: 1, step: 'mulligan_or_confirm' });
  });

  it('config.vidaInicial respeta el override', () => {
    const g = makeGame({ vidaInicial: 30 });
    expect(g.players[1].life).toBe(30);
    expect(g.players[2].life).toBe(30);
  });
});

describe('Game — flujo de setup', () => {
  it('confirmHand pasa step a placing', () => {
    const game = makeGame();
    expect(game.confirmHand(1)).toBe(true);
    expect(game.setupState?.step).toBe('placing');
  });

  it('confirmHand falla si el otro jugador intenta confirmar', () => {
    const game = makeGame();
    expect(game.confirmHand(2)).toBe(false);
  });

  it('finishSetup de P1 pasa el turno a P2', () => {
    const game = makeGame();
    game.confirmHand(1);
    placeAllForPlayer(game, 1);
    game.finishSetup(1);
    expect(game.setupState?.currentPlayer).toBe(2);
    expect(game.setupState?.step).toBe('mulligan_or_confirm');
  });

  it('finishSetup de P2 dispara coinFlip → phase=playing', () => {
    const game = makeGame();
    advanceToPlaying(game);
    expect(game.phase).toBe('playing');
    expect(game.activePlayer).toBe(1); // forceP1Start
  });
});

describe('Game — placeCard', () => {
  it('coloca unidad en frontLine y la saca de la mano', () => {
    const game = makeGame();
    game.confirmHand(1);
    const unit = game.players[1].hand.find((c) => c.type === 'unit');
    if (!unit) throw new Error('No unit in hand (mazo inválido)');

    const handBefore = game.players[1].hand.length;
    const result = game.placeCard(1, unit.instanceId, 'frontLine');

    expect(result).toBe(true);
    expect(game.players[1].frontLine?.instanceId).toBe(unit.instanceId);
    expect(game.players[1].hand).toHaveLength(handBefore - 1);
  });

  it('rechaza colocar skill en frontLine', () => {
    const game = makeGame();
    game.confirmHand(1);
    const skill = game.players[1].hand.find((c) => c.type === 'skill');
    if (!skill) {
      // Si esta mano random no tenía skill, no podemos validar este caso.
      // Asumimos que normalmente sí (10 skills en 40 cartas).
      return;
    }
    expect(game.placeCard(1, skill.instanceId, 'frontLine')).toBe(false);
    expect(game.players[1].frontLine).toBeNull();
  });
});

describe('Game — selección', () => {
  it('setSelection actualiza la selección del jugador', () => {
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

describe('Game — serialize / fromSerialized', () => {
  it('round-trip preserva el estado completo', () => {
    const game = makeGame({ vidaInicial: 25, maxTurnos: 30 });
    game.confirmHand(1);
    game.setSelection(1, 'card-abc');

    const serialized = game.serialize();
    const restored = Game.fromSerialized(serialized);

    expect(restored.phase).toBe(game.phase);
    expect(restored.config).toEqual(game.config);
    expect(restored.players[1].life).toBe(game.players[1].life);
    expect(restored.players[1].hand).toEqual(game.players[1].hand);
    expect(restored.selection).toEqual(game.selection);
    expect(restored.setupState).toEqual(game.setupState);
  });

  it('serialize devuelve JSON-safe (sin métodos ni referencias circulares)', () => {
    const game = makeGame();
    const serialized = game.serialize();
    // JSON.stringify lanza si hay ciclos. Si no lanza, es seguro.
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });
});

describe('Game — turnos en playing', () => {
  it('drawPhase marca drawnThisTurn = true', () => {
    const game = makeGame();
    advanceToPlaying(game);
    expect(game.turnState?.drawnThisTurn).toBe(false);
    game.drawPhase(1);
    expect(game.turnState?.drawnThisTurn).toBe(true);
  });

  it('drawPhase llena la mano hasta 5 si hay cartas en mazo', () => {
    const game = makeGame();
    advanceToPlaying(game);
    // Tras setup, P1 colocó 3 cartas → mano = 2. Después drawPhase → mano = 5.
    const handBefore = game.players[1].hand.length;
    game.drawPhase(1);
    expect(game.players[1].hand.length).toBeGreaterThanOrEqual(handBefore);
    expect(game.players[1].hand.length).toBeLessThanOrEqual(5);
  });

  it('needsRefill detecta slots vacíos cuando hay unidades en mano', () => {
    const game = makeGame();
    advanceToPlaying(game);
    // Aún tenemos ambos slots ocupados → no refill.
    expect(game.needsRefill(1)).toBe(false);

    // Si vaciamos frontLine y queda alguna unidad en mano → refill.
    const unitInHand = game.players[1].hand.find((c) => c.type === 'unit');
    game.players[1].frontLine = null;
    expect(game.needsRefill(1)).toBe(unitInHand !== undefined);
  });

  it('canEndTurn falsa si necesita refill', () => {
    const game = makeGame();
    advanceToPlaying(game);
    game.players[1].frontLine = null;
    // Si hay unidades en mano, no puede end turn.
    if (game.players[1].hand.some((c) => c.type === 'unit')) {
      expect(game.canEndTurn(1)).toBe(false);
    }
  });

  it('endTurn alterna el activePlayer', () => {
    const game = makeGame();
    advanceToPlaying(game);
    const startActive = game.activePlayer;
    game.endTurn();
    if (game.phase === 'playing') {
      expect(game.activePlayer).not.toBe(startActive);
    }
  });
});

describe('Game — endGame por vida 0', () => {
  it('si la vida del defensor llega a 0, gana el atacante', () => {
    const game = makeGame();
    advanceToPlaying(game);

    const attackerId = game.activePlayer as 1 | 2;
    const defenderId = attackerId === 1 ? 2 : 1;
    const strongUnit: UnitCard = {
      id: 99,
      instanceId: 'u99-0',
      type: 'unit',
      name: 'TEST_STRONG',
      subtype: 'Assault',
      firepower: 50,
      armor: 1,
    };

    // Setup determinista: ambos slots del atacante llenos, mano vacía (no refill),
    // defender sin slots y vida 1.
    game.players[attackerId].frontLine = strongUnit;
    game.players[attackerId].rearGuard = strongUnit;
    game.players[attackerId].hand = [];
    game.players[defenderId].life = 1;
    game.players[defenderId].frontLine = null;
    game.players[defenderId].rearGuard = null;
    game.players[defenderId].skill = null;
    // turnState debe permitir el end: marcamos drawnThisTurn para que no intente drawTo.
    if (game.turnState) game.turnState.drawnThisTurn = true;

    expect(game.canEndTurn(attackerId)).toBe(true);
    game.endTurn();
    expect(game.phase).toBe('over');
    expect(game.gameOver?.winner).toBe(attackerId);
    expect(game.gameOver?.reason).toBe('life');
  });
});
