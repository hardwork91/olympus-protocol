import { describe, expect, it } from 'vitest';
import { SKILL_ID, SKILLS, UNITS, buildDeck, countUnits, shuffle } from './cards';
import type { Card } from './types';

describe('Catálogo de cartas', () => {
  it('hay 12 unidades únicas + 10 skills únicas', () => {
    expect(UNITS).toHaveLength(12);
    expect(SKILLS).toHaveLength(10);
  });

  it('todos los IDs son únicos en el catálogo', () => {
    const allIds = [...UNITS.map((u) => u.id), ...SKILLS.map((s) => s.id)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('IDs siguen convención: 1-12 unidades, 13-22 skills', () => {
    for (const unit of UNITS) {
      expect(unit.id).toBeGreaterThanOrEqual(1);
      expect(unit.id).toBeLessThanOrEqual(12);
    }
    for (const skill of SKILLS) {
      expect(skill.id).toBeGreaterThanOrEqual(13);
      expect(skill.id).toBeLessThanOrEqual(22);
    }
  });

  it('SKILL_ID constantes apuntan a las skills correctas', () => {
    expect(SKILL_ID.REACTOR_OVERLOAD).toBe(13);
    expect(SKILL_ID.MINEFIELD).toBe(20);
    expect(SKILL_ID.TRAP_CHARGE).toBe(22);
  });
});

describe('buildDeck()', () => {
  it('produce 40 cartas (30 unidades + 10 skills)', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(40);
    expect(deck.filter((c) => c.type === 'unit')).toHaveLength(30);
    expect(deck.filter((c) => c.type === 'skill')).toHaveLength(10);
  });

  it('cantidad de copias por unidad respeta el catálogo', () => {
    const deck = buildDeck();
    for (const unit of UNITS) {
      const copies = deck.filter((c) => c.type === 'unit' && c.id === unit.id);
      expect(copies).toHaveLength(unit.copies);
    }
  });

  it('cada skill tiene exactamente 1 copia', () => {
    const deck = buildDeck();
    for (const skill of SKILLS) {
      const copies = deck.filter((c) => c.type === 'skill' && c.id === skill.id);
      expect(copies).toHaveLength(1);
    }
  });

  it('todos los instanceId son únicos', () => {
    const deck = buildDeck();
    const ids = new Set(deck.map((c) => c.instanceId));
    expect(ids.size).toBe(deck.length);
  });

  it('las unidades preservan firepower, armor, subtype', () => {
    const deck = buildDeck();
    const ares = deck.find((c) => c.type === 'unit' && c.name === '4RE5');
    expect(ares).toBeDefined();
    if (ares?.type === 'unit') {
      expect(ares.firepower).toBe(7);
      expect(ares.armor).toBe(2);
      expect(ares.subtype).toBe('Assault');
    }
  });
});

describe('shuffle()', () => {
  it('no muta el array original', () => {
    const original: number[] = [1, 2, 3, 4, 5];
    const before = [...original];
    shuffle(original);
    expect(original).toEqual(before);
  });

  it('devuelve un array con los mismos elementos', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = shuffle(arr);
    expect(shuffled.sort()).toEqual([...arr].sort());
  });

  it('en arrays grandes el orden cambia (con alta probabilidad)', () => {
    const arr = Array.from({ length: 50 }, (_, i) => i);
    // Hacemos shuffles repetidos hasta que al menos uno difiera.
    // La probabilidad de NUNCA diferir en 5 intentos es esencialmente 0.
    let differed = false;
    for (let i = 0; i < 5; i++) {
      const shuffled = shuffle(arr);
      if (shuffled.some((v, idx) => v !== arr[idx])) {
        differed = true;
        break;
      }
    }
    expect(differed).toBe(true);
  });
});

describe('countUnits()', () => {
  it('cuenta solo cartas de tipo unit', () => {
    const hand: Card[] = [
      {
        id: 1,
        instanceId: 'u1-0',
        type: 'unit',
        name: 'A',
        subtype: 'Assault',
        firepower: 5,
        armor: 3,
      },
      {
        id: 2,
        instanceId: 'u2-0',
        type: 'unit',
        name: 'B',
        subtype: 'Tank',
        firepower: 3,
        armor: 7,
      },
      { id: 13, instanceId: 's13', type: 'skill', name: 'X', subtype: 'Offensive', effect: '...' },
    ];
    expect(countUnits(hand)).toBe(2);
  });

  it('devuelve 0 con mano vacía', () => {
    expect(countUnits([])).toBe(0);
  });
});
