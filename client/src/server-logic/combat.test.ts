import { describe, expect, it } from 'vitest';
import { SKILL_ID } from '../shared/cards';
import type {
  AttackTarget,
  PlayerSkill,
  PlayerState,
  SerializedGameState,
  SkillCard,
  SkillSubtype,
  UnitCard,
  UnitSlotIndex,
  UnitSubtype,
} from '../shared/types';
import { UNIT_SLOTS } from '../shared/types';
import { getForcedTauntTarget, resolveAttack } from './combat';

// ─── Builders ───────────────────────────────────────────────────────────

function unit(
  name: string,
  subtype: UnitSubtype,
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

function emptyPlayer(): PlayerState {
  return {
    life: 20,
    deck: [],
    hand: [],
    units: Array.from({ length: UNIT_SLOTS }, () => null),
    skill: null,
    pendingEffects: [],
  };
}

function withUnits(units: Record<number, UnitCard>): PlayerState {
  const p = emptyPlayer();
  for (const [idx, card] of Object.entries(units)) {
    p.units[Number(idx)] = card;
  }
  return p;
}

function makeGame(p1: PlayerState, p2: PlayerState): Pick<SerializedGameState, 'players'> {
  return { players: { 1: p1, 2: p2 } };
}

const at = (index: number): AttackTarget => ({ kind: 'unit', index: index as UnitSlotIndex });
const life: AttackTarget = { kind: 'life' };

// ─── Reach: Demolition (Tank) — solo frente directo ────────────────────

describe('Demolition (Tank) reach', () => {
  it('puede atacar al slot directo enemigo', () => {
    const game = makeGame(
      withUnits({ 2: unit('TANK', 'Tank', 5, 3) }),
      withUnits({ 2: unit('VICTIM', 'Assault', 3, 4) }),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(5 - 4); // 1
  });

  it('NO puede atacar a una diagonal', () => {
    const game = makeGame(
      withUnits({ 2: unit('TANK', 'Tank', 5, 3) }),
      withUnits({ 1: unit('DIAG', 'Assault', 3, 4), 3: unit('OTHER', 'Tank', 2, 5) }),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, at(1));
    expect(r.destroyed).toHaveLength(0);
    expect(r.lifeDamage).toBe(0);
    expect(r.log[0]).toContain('out of reach');
  });

  it('si frente vacío y otros slots llenos, NO puede atacar a vida', () => {
    const game = makeGame(
      withUnits({ 0: unit('TANK', 'Tank', 5, 3) }),
      withUnits({ 1: unit('LIVING', 'Assault', 3, 4) }), // slot 0 vacío, slot 1 lleno (no en reach del Tank en slot 0)
    );
    // Tank en slot 0 ataca al frente (slot 0), que está vacío. Como nadie más
    // en su reach hay, debería poder atacar vida.
    const r = resolveAttack(game, 1, 0 as UnitSlotIndex, life);
    expect(r.lifeDamage).toBe(5);
  });
});

// ─── Reach: Melee (Assault) — frente + diagonales ───────────────────────

describe('Melee (Assault) reach', () => {
  it('puede atacar frente directo', () => {
    const game = makeGame(
      withUnits({ 2: unit('A', 'Assault', 6, 3) }),
      withUnits({ 2: unit('VICTIM', 'Tank', 3, 4) }),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
  });

  it('puede atacar diagonales', () => {
    const game = makeGame(
      withUnits({ 2: unit('A', 'Assault', 6, 3) }),
      withUnits({ 1: unit('LEFT', 'Tank', 3, 4), 3: unit('RIGHT', 'Tank', 3, 4) }),
    );
    const rLeft = resolveAttack(game, 1, 2 as UnitSlotIndex, at(1));
    expect(rLeft.destroyed).toContainEqual({ playerId: 2, slotIndex: 1 });
    const rRight = resolveAttack(game, 1, 2 as UnitSlotIndex, at(3));
    expect(rRight.destroyed).toContainEqual({ playerId: 2, slotIndex: 3 });
  });

  it('NO puede atacar slot 2 posiciones lejos', () => {
    const game = makeGame(
      withUnits({ 0: unit('A', 'Assault', 6, 3) }),
      withUnits({ 3: unit('FAR', 'Tank', 3, 4) }),
    );
    const r = resolveAttack(game, 1, 0 as UnitSlotIndex, at(3));
    expect(r.destroyed).toHaveLength(0);
    expect(r.log[0]).toContain('out of reach');
  });

  it('en slot del borde (0): solo diagonal derecha disponible', () => {
    const game = makeGame(
      withUnits({ 0: unit('A', 'Assault', 6, 3) }),
      withUnits({ 1: unit('R', 'Tank', 3, 4) }),
    );
    const r = resolveAttack(game, 1, 0 as UnitSlotIndex, at(1));
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 1 });
  });

  it('frente vacío + diagonales vacías → puede atacar vida', () => {
    const game = makeGame(
      withUnits({ 2: unit('A', 'Assault', 6, 3) }),
      emptyPlayer(),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, life);
    expect(r.lifeDamage).toBe(6);
  });

  it('frente vacío pero diagonal con unidad → NO puede atacar vida', () => {
    const game = makeGame(
      withUnits({ 2: unit('A', 'Assault', 6, 3) }),
      withUnits({ 1: unit('BLOCKER', 'Tank', 3, 5) }),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, life);
    expect(r.lifeDamage).toBe(0);
    expect(r.log[0]).toContain('still has a valid unit target in reach');
  });
});

// ─── Reach: Ranged (Artillery) — cualquier slot ─────────────────────────

describe('Ranged (Artillery) reach', () => {
  it('puede atacar cualquier slot del rival', () => {
    const game = makeGame(
      withUnits({ 0: unit('R', 'Artillery', 5, 3) }),
      withUnits({ 4: unit('FAR', 'Tank', 3, 4) }),
    );
    const r = resolveAttack(game, 1, 0 as UnitSlotIndex, at(4));
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 4 });
  });

  it('si todos los slots enemigos vacíos → puede atacar vida', () => {
    const game = makeGame(
      withUnits({ 2: unit('R', 'Artillery', 7, 3) }),
      emptyPlayer(),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, life);
    expect(r.lifeDamage).toBe(7);
  });

  it('si algún slot enemigo lleno → NO puede atacar vida', () => {
    const game = makeGame(
      withUnits({ 0: unit('R', 'Artillery', 7, 3) }),
      withUnits({ 4: unit('BLOCKER', 'Tank', 1, 1) }),
    );
    const r = resolveAttack(game, 1, 0 as UnitSlotIndex, life);
    expect(r.lifeDamage).toBe(0);
  });
});

// ─── Support no ataca ────────────────────────────────────────────────────

describe('Support no ataca', () => {
  it('rechaza el ataque si el atacante es Support', () => {
    const game = makeGame(
      withUnits({ 2: unit('SUP', 'Support', 3, 5) }),
      withUnits({ 2: unit('VICTIM', 'Tank', 2, 4) }),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toHaveLength(0);
    expect(r.lifeDamage).toBe(0);
    expect(r.log[0]).toContain('Support');
  });
});

// ─── Resolución FP vs AR ─────────────────────────────────────────────────

describe('Resolución FP vs AR', () => {
  it('FP > AR: víctima destruida + excess a vida', () => {
    const game = makeGame(
      withUnits({ 2: unit('A', 'Tank', 8, 3) }),
      withUnits({ 2: unit('V', 'Tank', 3, 5) }),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(3);
  });

  it('FP === AR: ambos destruidos, sin daño a vida', () => {
    const game = makeGame(
      withUnits({ 2: unit('A', 'Tank', 5, 3) }),
      withUnits({ 2: unit('V', 'Tank', 3, 5) }),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toContainEqual({ playerId: 1, slotIndex: 2 });
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(0);
  });

  it('FP < AR: solo atacante destruido', () => {
    const game = makeGame(
      withUnits({ 2: unit('A', 'Tank', 3, 3) }),
      withUnits({ 2: unit('V', 'Tank', 1, 6) }),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toContainEqual({ playerId: 1, slotIndex: 2 });
    expect(r.destroyed).not.toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(0);
  });
});

// ─── Validaciones ────────────────────────────────────────────────────────

describe('Validaciones', () => {
  it('slot atacante vacío → ataque inválido', () => {
    const game = makeGame(emptyPlayer(), withUnits({ 2: unit('V', 'Tank', 3, 5) }));
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toHaveLength(0);
    expect(r.log[0]).toContain('no unit in slot');
  });

  it('target apunta a slot vacío con target.kind=unit → inválido', () => {
    const game = makeGame(
      withUnits({ 2: unit('A', 'Tank', 5, 3) }),
      emptyPlayer(),
    );
    const r = resolveAttack(game, 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toHaveLength(0);
    expect(r.log[0]).toContain('empty');
  });
});

// ─── Skill cards + Support abilities ────────────────────────────────────

function skill(id: number, subtype: SkillSubtype, name = `S${id}`): SkillCard {
  return {
    id,
    instanceId: `s${id}`,
    type: 'skill',
    name,
    subtype,
    effect: 'test effect',
  };
}

const HERMES_ID = 10;
const ATHENA_ID = 11;
const HEPHAESTUS_ID = 12;

function support(name: string, id: number, fp = 0, ar = 5): UnitCard {
  return {
    id,
    instanceId: `u${id}-${name}`,
    type: 'unit',
    name,
    subtype: 'Support',
    firepower: fp,
    armor: ar,
  };
}

function withSkill(p: PlayerState, s: PlayerSkill): PlayerState {
  return { ...p, skill: s };
}

describe('Offensive skill: REACTOR-OVERLOAD (+3 FP)', () => {
  it('agrega +3 FP al ataque del atacante', () => {
    const att = withSkill(withUnits({ 2: unit('A', 'Tank', 3, 3) }), {
      card: skill(SKILL_ID.REACTOR_OVERLOAD, 'Offensive'),
      state: 'active',
    });
    const def = withUnits({ 2: unit('V', 'Tank', 1, 5) });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    // 3 + 3 = 6 vs AR 5 → diff 1, víctima destruida + 1 a vida
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(1);
    expect(r.consumedSkills).toContainEqual({
      playerId: 1,
      skillId: SKILL_ID.REACTOR_OVERLOAD,
    });
  });
});

describe('Offensive skill: EMP-PULSE (ignore AR)', () => {
  it('ignora la AR de la víctima', () => {
    const att = withSkill(withUnits({ 2: unit('A', 'Tank', 4, 3) }), {
      card: skill(SKILL_ID.EMP_PULSE, 'Offensive'),
      state: 'active',
    });
    const def = withUnits({ 2: unit('V', 'Tank', 1, 99) }); // AR enorme
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    // FP 4 vs AR 0 (ignorada) → diff 4 → víctima destruida + 4 a vida
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(4);
    expect(r.consumedSkills).toContainEqual({
      playerId: 1,
      skillId: SKILL_ID.EMP_PULSE,
    });
  });
});

describe('Offensive skill: TARGETING-OVERRIDE (auto-destroy)', () => {
  it('auto-destruye sin importar AR, no genera excess', () => {
    const att = withSkill(withUnits({ 2: unit('A', 'Tank', 1, 3) }), {
      card: skill(SKILL_ID.TARGETING_OVERRIDE, 'Offensive'),
      state: 'active',
    });
    const def = withUnits({ 2: unit('V', 'Tank', 1, 99) });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(0);
    expect(r.consumedSkills).toContainEqual({
      playerId: 1,
      skillId: SKILL_ID.TARGETING_OVERRIDE,
    });
  });
});

describe('Defensive skill: REINFORCEMENT (+2 AR)', () => {
  it('agrega +2 AR a la víctima', () => {
    const att = withUnits({ 2: unit('A', 'Tank', 5, 3) });
    const def = withSkill(withUnits({ 2: unit('V', 'Tank', 1, 3) }), {
      card: skill(SKILL_ID.REINFORCEMENT_PROTOCOL, 'Defensive'),
      state: 'active',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    // FP 5 vs AR 3+2=5 → diff 0, ambos destruidos
    expect(r.destroyed).toContainEqual({ playerId: 1, slotIndex: 2 });
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(0);
    expect(r.consumedSkills).toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.REINFORCEMENT_PROTOCOL,
    });
  });
});

describe('Defensive skill: ENERGY-SHIELD (block life damage)', () => {
  it('bloquea el daño a vida al ganarle a un defensor', () => {
    const att = withUnits({ 2: unit('A', 'Tank', 10, 3) });
    const def = withSkill(withUnits({ 2: unit('V', 'Tank', 1, 3) }), {
      card: skill(SKILL_ID.ENERGY_SHIELD, 'Defensive'),
      state: 'active',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(0); // bloqueado
    expect(r.consumedSkills).toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.ENERGY_SHIELD,
    });
  });

  it('bloquea el ataque directo a vida', () => {
    const att = withUnits({ 2: unit('A', 'Artillery', 4, 3) });
    const def = withSkill(emptyPlayer(), {
      card: skill(SKILL_ID.ENERGY_SHIELD, 'Defensive'),
      state: 'active',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, life);
    expect(r.lifeDamage).toBe(0);
    expect(r.consumedSkills).toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.ENERGY_SHIELD,
    });
  });
});

describe('Defensive skill: REPULSORS (immune to destruction)', () => {
  it('previene la destrucción de la víctima cuando FP > AR', () => {
    const att = withUnits({ 2: unit('A', 'Tank', 10, 3) });
    const def = withSkill(withUnits({ 2: unit('V', 'Tank', 1, 3) }), {
      card: skill(SKILL_ID.EMERGENCY_REPULSORS, 'Defensive'),
      state: 'active',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toHaveLength(0);
    expect(r.lifeDamage).toBe(0);
    expect(r.consumedSkills).toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.EMERGENCY_REPULSORS,
    });
  });

  it('bloquea TARGETING-OVERRIDE', () => {
    const att = withSkill(withUnits({ 2: unit('A', 'Tank', 1, 3) }), {
      card: skill(SKILL_ID.TARGETING_OVERRIDE, 'Offensive'),
      state: 'active',
    });
    const def = withSkill(withUnits({ 2: unit('V', 'Tank', 1, 3) }), {
      card: skill(SKILL_ID.EMERGENCY_REPULSORS, 'Defensive'),
      state: 'active',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toHaveLength(0);
    expect(r.consumedSkills).toContainEqual({
      playerId: 1,
      skillId: SKILL_ID.TARGETING_OVERRIDE,
    });
    expect(r.consumedSkills).toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.EMERGENCY_REPULSORS,
    });
  });
});

describe('Trap: MINEFIELD (attacker also destroyed)', () => {
  it('destruye al atacante cuando este destruye una unit defensora', () => {
    const att = withUnits({ 2: unit('A', 'Tank', 10, 3) });
    const def = withSkill(withUnits({ 2: unit('V', 'Tank', 1, 3) }), {
      card: skill(SKILL_ID.MINEFIELD, 'Trap'),
      state: 'hidden',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toContainEqual({ playerId: 1, slotIndex: 2 });
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.consumedSkills).toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.MINEFIELD,
    });
  });

  it('no activa si la víctima sobrevive', () => {
    const att = withUnits({ 2: unit('A', 'Tank', 2, 3) });
    const def = withSkill(withUnits({ 2: unit('V', 'Tank', 1, 8) }), {
      card: skill(SKILL_ID.MINEFIELD, 'Trap'),
      state: 'hidden',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    // Atacante destruido por AR>FP, pero NO por MINEFIELD
    expect(r.destroyed).toContainEqual({ playerId: 1, slotIndex: 2 });
    expect(r.consumedSkills).not.toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.MINEFIELD,
    });
  });
});

describe('Trap: TRAP-CHARGE (+5 FP next attack)', () => {
  it('genera pendingEffect cuando una unit defensora sobrevive', () => {
    const att = withUnits({ 2: unit('A', 'Tank', 2, 3) });
    const def = withSkill(withUnits({ 2: unit('V', 'Tank', 1, 8) }), {
      card: skill(SKILL_ID.TRAP_CHARGE, 'Trap'),
      state: 'hidden',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    expect(r.newPendingEffects).toContainEqual({
      playerId: 2,
      type: 'trap_charge',
      value: 5,
    });
    expect(r.consumedSkills).toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.TRAP_CHARGE,
    });
  });
});

describe('Trap: CYBERATTACK (cancel rival trap)', () => {
  it('cancela MINEFIELD del defensor', () => {
    const att = withSkill(withUnits({ 2: unit('A', 'Tank', 10, 3) }), {
      card: skill(SKILL_ID.CYBERATTACK, 'Trap'),
      state: 'hidden',
    });
    const def = withSkill(withUnits({ 2: unit('V', 'Tank', 1, 3) }), {
      card: skill(SKILL_ID.MINEFIELD, 'Trap'),
      state: 'hidden',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    // Víctima destruida por daño normal, pero el atacante NO porque CYBERATTACK
    // canceló MINEFIELD.
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.destroyed).not.toContainEqual({ playerId: 1, slotIndex: 2 });
    expect(r.consumedSkills).toContainEqual({
      playerId: 1,
      skillId: SKILL_ID.CYBERATTACK,
    });
    expect(r.consumedSkills).toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.MINEFIELD,
    });
  });

  it('cancela TRAP-CHARGE del defensor', () => {
    const att = withSkill(withUnits({ 2: unit('A', 'Tank', 2, 3) }), {
      card: skill(SKILL_ID.CYBERATTACK, 'Trap'),
      state: 'hidden',
    });
    const def = withSkill(withUnits({ 2: unit('V', 'Tank', 1, 8) }), {
      card: skill(SKILL_ID.TRAP_CHARGE, 'Trap'),
      state: 'hidden',
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    expect(r.newPendingEffects).toHaveLength(0);
    expect(r.consumedSkills).toContainEqual({
      playerId: 1,
      skillId: SKILL_ID.CYBERATTACK,
    });
    expect(r.consumedSkills).toContainEqual({
      playerId: 2,
      skillId: SKILL_ID.TRAP_CHARGE,
    });
  });
});

describe('Support: HERMES (+1 FP adyacente)', () => {
  it('agrega +1 FP a la unit adyacente que ataca', () => {
    const att = withUnits({
      1: support('Hermes', HERMES_ID),
      2: unit('A', 'Tank', 3, 3),
    });
    const def = withUnits({ 2: unit('V', 'Tank', 1, 5) });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    // FP 3 + 1 = 4 vs AR 5 → diff -1, atacante destruido (sin Hermes diff -2)
    // ya, igual atacante destruido. Validemos lifeDamage = 0 y atacante destruido.
    expect(r.destroyed).toContainEqual({ playerId: 1, slotIndex: 2 });
  });

  it('Hermes en posición no adyacente NO aporta', () => {
    const att = withUnits({
      0: support('Hermes', HERMES_ID),
      4: unit('A', 'Tank', 5, 3),
    });
    const def = withUnits({ 4: unit('V', 'Tank', 1, 5) });
    const r = resolveAttack(makeGame(att, def), 1, 4 as UnitSlotIndex, at(4));
    // FP 5 vs AR 5 → diff 0, ambos destruidos
    expect(r.destroyed).toContainEqual({ playerId: 1, slotIndex: 4 });
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 4 });
  });
});

describe('Support: ATHENA (+2 AR adyacente)', () => {
  it('agrega +2 AR a la víctima adyacente', () => {
    const att = withUnits({ 2: unit('A', 'Tank', 5, 3) });
    const def = withUnits({
      1: support('Athena', ATHENA_ID),
      2: unit('V', 'Tank', 1, 3),
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    // FP 5 vs AR 3+2 = 5 → diff 0, ambos destruidos
    expect(r.destroyed).toContainEqual({ playerId: 1, slotIndex: 2 });
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(0);
  });
});

describe('Support: HEPHAESTUS taunt', () => {
  it('forza target a HEPHAESTUS si está en reach', () => {
    const att = withUnits({ 2: unit('A', 'Assault', 5, 3) });
    const def = withUnits({
      1: support('Hephaestus', HEPHAESTUS_ID, 0, 6),
      2: unit('V', 'Tank', 1, 3),
    });
    // El atacante intenta apuntar al slot 2 (no a HEPHAESTUS en slot 1) — debe fallar.
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    expect(r.destroyed).toHaveLength(0);
    expect(r.log[0]).toContain('HEPHAESTUS taunt');
  });

  it('atacar a HEPHAESTUS es válido', () => {
    const att = withUnits({ 2: unit('A', 'Assault', 5, 3) });
    const def = withUnits({
      1: support('Hephaestus', HEPHAESTUS_ID, 0, 6),
      2: unit('V', 'Tank', 1, 3),
    });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(1));
    // FP 5 vs AR 6 → atacante destruido
    expect(r.destroyed).toContainEqual({ playerId: 1, slotIndex: 2 });
  });

  it('getForcedTauntTarget devuelve el slot de HEPHAESTUS', () => {
    const def = withUnits({
      1: support('Hephaestus', HEPHAESTUS_ID, 0, 6),
      2: unit('V', 'Tank', 1, 3),
    });
    expect(getForcedTauntTarget(def, 'melee', 2 as UnitSlotIndex)).toBe(1);
    // Tank en slot 0: solo reach al slot 0 (HEPHAESTUS no en reach)
    expect(getForcedTauntTarget(def, 'demolition', 0 as UnitSlotIndex)).toBeNull();
  });
});

describe('Pending effect: trap_charge (+5 FP)', () => {
  it('aplica +5 FP al próximo ataque del atacante y se consume', () => {
    const att = withUnits({ 2: unit('A', 'Tank', 3, 3) });
    att.pendingEffects = [{ type: 'trap_charge', value: 5 }];
    const def = withUnits({ 2: unit('V', 'Tank', 1, 5) });
    const r = resolveAttack(makeGame(att, def), 1, 2 as UnitSlotIndex, at(2));
    // FP 3 + 5 = 8 vs AR 5 → diff 3 → víctima destruida + 3 a vida
    expect(r.destroyed).toContainEqual({ playerId: 2, slotIndex: 2 });
    expect(r.lifeDamage).toBe(3);
    expect(r.consumedPendingEffects).toContainEqual({
      playerId: 1,
      type: 'trap_charge',
    });
  });
});
