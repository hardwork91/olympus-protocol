import { describe, expect, it } from 'vitest';
import { SKILL_ID } from '../shared/cards';
import type {
  PlayerSkill,
  PlayerState,
  SerializedGameState,
  SkillCard,
  UnitCard,
} from '../shared/types';
import { resolveAttack } from './combat';

// ─── Builders de test ───────────────────────────────────────────────────

function unit(name: string, fp: number, ar: number, id = 99): UnitCard {
  return {
    id,
    instanceId: `u${id}-${name}`,
    type: 'unit',
    name,
    subtype: 'Assault',
    firepower: fp,
    armor: ar,
  };
}

function skill(id: number, name: string, subtype: SkillCard['subtype']): SkillCard {
  return {
    id,
    instanceId: `s${id}`,
    type: 'skill',
    name,
    subtype,
    effect: 'test',
  };
}

function emptyPlayer(): PlayerState {
  return {
    life: 20,
    deck: [],
    hand: [],
    frontLine: null,
    rearGuard: null,
    skill: null,
    pendingEffects: [],
  };
}

function makeGameState(
  attackerOverrides: Partial<PlayerState> = {},
  defenderOverrides: Partial<PlayerState> = {},
): Pick<SerializedGameState, 'players'> {
  return {
    players: {
      1: { ...emptyPlayer(), ...attackerOverrides },
      2: { ...emptyPlayer(), ...defenderOverrides },
    },
  };
}

function activeSkill(s: SkillCard): PlayerSkill {
  return { card: s, state: 'active' };
}

function hiddenSkill(s: SkillCard): PlayerSkill {
  return { card: s, state: 'hidden' };
}

// ─── Casos básicos sin habilidades ──────────────────────────────────────

describe('Combat — casos básicos', () => {
  it('FL vs FL: atacante con más FP que armor → defender FL destruida + excess', () => {
    const game = makeGameState(
      { frontLine: unit('A_FL', 8, 3) }, // FP 8
      { frontLine: unit('D_FL', 5, 4), rearGuard: unit('D_RG', 3, 5) }, // armor 4
    );
    const result = resolveAttack(game, 1, 2);
    expect(result.destroyed.defenderFront).toBe(true);
    expect(result.destroyed.attackerFront).toBe(false);
    // Excess = 8 - 4 = 4 → ataca al RG con FP atacante RG (0, no hay) + 4
    // RG defensor armor=5 → 0 + 4 = 4 < 5 → sobrevive
  });

  it('FL vs FL: empate destruye ambos FL', () => {
    const game = makeGameState(
      { frontLine: unit('A', 5, 3) },
      { frontLine: unit('D', 4, 5) }, // 5 - 5 = 0
    );
    const result = resolveAttack(game, 1, 2);
    expect(result.destroyed.attackerFront).toBe(true);
    expect(result.destroyed.defenderFront).toBe(true);
  });

  it('FL atacante débil → solo atacante destruido', () => {
    const game = makeGameState(
      { frontLine: unit('A', 3, 3) },
      { frontLine: unit('D', 5, 8) }, // 3 - 8 = -5
    );
    const result = resolveAttack(game, 1, 2);
    expect(result.destroyed.attackerFront).toBe(true);
    expect(result.destroyed.defenderFront).toBe(false);
  });

  it('Defender sin FL: FP del atacante pasa como excess', () => {
    const game = makeGameState({ frontLine: unit('A', 7, 3) }, { rearGuard: unit('D_RG', 3, 4) });
    const result = resolveAttack(game, 1, 2);
    // excess = 7 → ataca RG con 7 vs armor 4 → diff = 3 → RG destruido + 3 life damage
    expect(result.destroyed.defenderRear).toBe(true);
    expect(result.lifeDamage).toBe(3);
  });

  it('Defender sin tablero: todo el FP del atacante va a vida', () => {
    const game = makeGameState({ frontLine: unit('A', 9, 3) }, {});
    const result = resolveAttack(game, 1, 2);
    expect(result.lifeDamage).toBe(9);
  });
});

// ─── Cases A, B, C ──────────────────────────────────────────────────────

describe('Combat — Cases A/B/C de slots vacíos del atacante', () => {
  it('Case A: atacante sin FL pero con RG → RG asume rol de Step 1', () => {
    const game = makeGameState(
      { rearGuard: unit('A_RG', 6, 4) }, // FL vacío
      { frontLine: unit('D_FL', 3, 2) }, // armor 2
    );
    const result = resolveAttack(game, 1, 2);
    // RG ataca con FP 6 vs armor 2 → diff = 4 → defender FL destruida
    expect(result.destroyed.defenderFront).toBe(true);
  });

  it('Case B: atacante con FL pero sin RG → solo FL ataca', () => {
    const game = makeGameState(
      { frontLine: unit('A_FL', 6, 3) }, // RG vacío
      { frontLine: unit('D_FL', 2, 2), rearGuard: unit('D_RG', 3, 3) },
    );
    const result = resolveAttack(game, 1, 2);
    // excess = 6 - 2 = 4 → ataca RG con 0 + 4 = 4 vs armor 3 → diff = 1 → 1 life damage
    expect(result.destroyed.defenderFront).toBe(true);
    expect(result.lifeDamage).toBe(1);
  });

  it('Case C: atacante sin FL ni RG → null attack', () => {
    const game = makeGameState({}, { frontLine: unit('D_FL', 5, 5) });
    const result = resolveAttack(game, 1, 2);
    expect(result.destroyed.defenderFront).toBe(false);
    expect(result.lifeDamage).toBe(0);
  });
});

// ─── Habilidades ofensivas ──────────────────────────────────────────────

describe('Combat — skills ofensivas', () => {
  it('REACTOR_OVERLOAD añade +3 Firepower a la Front Line', () => {
    const game = makeGameState(
      {
        frontLine: unit('A', 4, 3),
        skill: activeSkill(skill(SKILL_ID.REACTOR_OVERLOAD, 'OVERLOAD', 'Offensive')),
      },
      { frontLine: unit('D', 3, 6) }, // 4+3 = 7 vs 6 → diff = 1
    );
    const result = resolveAttack(game, 1, 2);
    expect(result.destroyed.defenderFront).toBe(true);
  });

  it('TARGETING_OVERRIDE auto-destruye FL defensora sin generar excess', () => {
    const game = makeGameState(
      {
        frontLine: unit('A', 2, 3),
        skill: activeSkill(skill(SKILL_ID.TARGETING_OVERRIDE, 'TGT', 'Offensive')),
      },
      { frontLine: unit('D', 3, 10), rearGuard: unit('D_RG', 1, 2) }, // armor 10, normalmente no muere
    );
    const result = resolveAttack(game, 1, 2);
    expect(result.destroyed.defenderFront).toBe(true);
    expect(result.destroyed.defenderRear).toBe(false);
    expect(result.lifeDamage).toBe(0);
    expect(result.destroyed.attackerFront).toBe(false);
  });

  it('DOUBLE_SHOT ejecuta 2 pases', () => {
    const game = makeGameState(
      {
        frontLine: unit('A', 5, 3),
        skill: activeSkill(skill(SKILL_ID.DOUBLE_SHOT, 'DBL', 'Offensive')),
      },
      { frontLine: unit('D', 1, 1), rearGuard: unit('D_RG', 1, 1) },
    );
    const result = resolveAttack(game, 1, 2);
    // Pase 1: 5 vs 1 → defender FL destruido + excess 4 → ataca RG con 4 vs 1 → diff 3 → RG destruido + 3 life
    // Pase 2: 5 vs 0 (FL ya destruido) → excess 5 → ataca con 5 vs 0 (RG ya destruido) → 5 a vida
    expect(result.destroyed.defenderFront).toBe(true);
    expect(result.destroyed.defenderRear).toBe(true);
    expect(result.lifeDamage).toBeGreaterThan(0);
  });

  it('EMP_PULSE manda el excess directo a vida (ignora RG armor)', () => {
    const game = makeGameState(
      {
        frontLine: unit('A', 8, 3),
        skill: activeSkill(skill(SKILL_ID.EMP_PULSE, 'EMP', 'Offensive')),
      },
      { frontLine: unit('D', 3, 5), rearGuard: unit('D_RG', 4, 10) }, // RG armor altísima
    );
    const result = resolveAttack(game, 1, 2);
    // excess = 8 - 5 = 3 → EMP → 3 directo a vida
    expect(result.lifeDamage).toBe(3);
    expect(result.destroyed.defenderRear).toBe(false);
  });
});

// ─── Habilidades defensivas ─────────────────────────────────────────────

describe('Combat — skills defensivas', () => {
  it('ENERGY_SHIELD bloquea todo el daño a vida', () => {
    const game = makeGameState(
      { frontLine: unit('A', 10, 3) },
      {
        skill: activeSkill(skill(SKILL_ID.ENERGY_SHIELD, 'SHIELD', 'Defensive')),
      },
    );
    const result = resolveAttack(game, 1, 2);
    // Sin FL ni RG defensor → 10 de damage normalmente, pero ENERGY_SHIELD lo bloquea.
    expect(result.lifeDamage).toBe(0);
  });

  it('REINFORCEMENT_PROTOCOL da +2 Armor a FL y RG', () => {
    const game = makeGameState(
      { frontLine: unit('A', 5, 3) },
      {
        frontLine: unit('D', 3, 4), // 4 + 2 = 6 con bonus
        skill: activeSkill(skill(SKILL_ID.REINFORCEMENT_PROTOCOL, 'REINFORCED', 'Defensive')),
      },
    );
    const result = resolveAttack(game, 1, 2);
    // 5 vs 6 → atacante destruido
    expect(result.destroyed.attackerFront).toBe(true);
    expect(result.destroyed.defenderFront).toBe(false);
  });

  it('EMERGENCY_REPULSORS hace el RG invulnerable', () => {
    const game = makeGameState(
      { frontLine: unit('A', 10, 3) },
      {
        rearGuard: unit('D_RG', 1, 1), // armor 1, normalmente muere
        skill: activeSkill(skill(SKILL_ID.EMERGENCY_REPULSORS, 'REPULSORS', 'Defensive')),
      },
    );
    const result = resolveAttack(game, 1, 2);
    expect(result.destroyed.defenderRear).toBe(false);
    expect(result.lifeDamage).toBe(0); // nulificado
  });
});

// ─── Trampas ────────────────────────────────────────────────────────────

describe('Combat — trampas', () => {
  it('MINEFIELD destruye al atacante cuando éste destruye FL del defensor', () => {
    const game = makeGameState(
      { frontLine: unit('A', 7, 3) },
      {
        frontLine: unit('D', 3, 4),
        skill: hiddenSkill(skill(SKILL_ID.MINEFIELD, 'MINE', 'Trap')),
      },
    );
    const result = resolveAttack(game, 1, 2);
    expect(result.destroyed.defenderFront).toBe(true);
    expect(result.destroyed.attackerFront).toBe(true);
    expect(result.lifeDamage).toBe(0);
  });

  it('CYBERATTACK del atacante cancela MINEFIELD del defensor', () => {
    const game = makeGameState(
      {
        frontLine: unit('A', 7, 3),
        skill: hiddenSkill(skill(SKILL_ID.CYBERATTACK, 'CYBER', 'Trap')),
      },
      {
        frontLine: unit('D', 3, 4),
        skill: hiddenSkill(skill(SKILL_ID.MINEFIELD, 'MINE', 'Trap')),
      },
    );
    const result = resolveAttack(game, 1, 2);
    expect(result.destroyed.defenderFront).toBe(true);
    expect(result.destroyed.attackerFront).toBe(false); // Minefield cancelado
  });

  it('TRAP_CHARGE crea pendingEffect cuando la FL defensora sobrevive', () => {
    const game = makeGameState(
      { frontLine: unit('A', 3, 3) }, // débil, FP 3
      {
        frontLine: unit('D', 4, 10), // armor 10, sobrevive
        skill: hiddenSkill(skill(SKILL_ID.TRAP_CHARGE, 'TRAP', 'Trap')),
      },
    );
    const result = resolveAttack(game, 1, 2);
    expect(result.newPendingEffects).toContainEqual({
      playerId: 2,
      type: 'trap_charge',
      value: 5,
    });
  });

  it('pendingEffect trap_charge añade +5 Firepower al próximo ataque', () => {
    const game = makeGameState(
      {
        frontLine: unit('A', 2, 3), // base FP 2
        pendingEffects: [{ type: 'trap_charge', value: 5 }],
      },
      { frontLine: unit('D', 3, 6) }, // armor 6 → necesita 7+ para destruir
    );
    const result = resolveAttack(game, 1, 2);
    // 2 + 5 = 7 vs 6 → diff 1 → defender FL destruido
    expect(result.destroyed.defenderFront).toBe(true);
    expect(result.consumedPendingEffects).toContainEqual({
      playerId: 1,
      type: 'trap_charge',
    });
  });
});
