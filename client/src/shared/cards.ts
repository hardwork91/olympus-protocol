// ============================================================================
// Catálogo de cartas + helpers (buildDeck, shuffle, countUnits).
// 22 cartas únicas: 12 unidades con copias múltiples (30 total) + 10 skills
// únicas. Mazo común = 40 cartas, repartido 20/20 entre los jugadores.
// ============================================================================

import type { Card, SkillCard, SkillSubtype, UnitCard, UnitSubtype } from './types';

interface UnitTemplate {
  id: number;
  name: string;
  subtype: UnitSubtype;
  firepower: number;
  armor: number;
  copies: number;
  image: string;
  lore: string;
  /** Ability text para cartas Support (no atacan, dan utility). Otras unidades: undefined. */
  ability?: string;
}

interface SkillTemplate {
  id: number;
  name: string;
  subtype: SkillSubtype;
  effect: string;
  image: string;
}

export const UNITS: readonly UnitTemplate[] = [
  {
    id: 1,
    name: 'HER4CL35',
    subtype: 'Assault',
    firepower: 6,
    armor: 3,
    copies: 2,
    image: 'images/1-heracles.png',
    lore: 'Mighty warrior clad in lion-hide armor, fearless in close combat.',
  },
  {
    id: 2,
    name: '4RE5',
    subtype: 'Assault',
    firepower: 7,
    armor: 2,
    copies: 2,
    image: 'images/2-ares.png',
    lore: 'Berserker of the battlefield, his fury ignites with every strike.',
  },
  {
    id: 3,
    name: 'TYPH0N',
    subtype: 'Assault',
    firepower: 5,
    armor: 4,
    copies: 3,
    image: 'images/3-typhon.png',
    lore: 'Monstrous mech with serpent appendages, born of ancient chaos.',
  },
  {
    id: 4,
    name: 'ATL45',
    subtype: 'Tank',
    firepower: 2,
    armor: 8,
    copies: 2,
    image: 'images/4-atlas.png',
    lore: 'Bears the weight of worlds, his armor unmoving against any assault.',
  },
  {
    id: 5,
    name: 'GOL14TH',
    subtype: 'Tank',
    firepower: 3,
    armor: 7,
    copies: 2,
    image: 'images/5-goliath.png',
    lore: 'Mountain of steel and missile pods, slow but devastating in defense.',
  },
  {
    id: 6,
    name: 'CR0N0S',
    subtype: 'Tank',
    firepower: 4,
    armor: 6,
    copies: 3,
    image: 'images/6-cronos.png',
    lore: 'Titan-king wielding a scythe, ancient and patient in his strikes.',
  },
  {
    id: 7,
    name: 'AP0LL0',
    subtype: 'Artillery',
    firepower: 5,
    armor: 2,
    copies: 2,
    image: 'images/7-apollo.png',
    lore: 'Divine archer of light, every shot finds its mark across the field.',
  },
  {
    id: 8,
    name: 'Z3U5',
    subtype: 'Artillery',
    firepower: 6,
    armor: 3,
    copies: 2,
    image: 'images/8-zeus.png',
    lore: 'Wields lightning as his weapon, judgment falls from the heavens.',
  },
  {
    id: 9,
    name: 'HEL105',
    subtype: 'Artillery',
    firepower: 4,
    armor: 4,
    copies: 3,
    image: 'images/9-helios.png',
    lore: 'Mech of the sun, blazing barrages illuminate the battlefield.',
  },
  {
    id: 10,
    name: 'HERM35',
    subtype: 'Support',
    firepower: 0, // Support no ataca
    armor: 5,
    copies: 3,
    image: 'images/10-hermes.png',
    lore: 'Adjacent allies gain +1 Firepower.',
    ability: 'Adjacent allies gain +1 Firepower.',
  },
  {
    id: 11,
    name: 'ATH3N4',
    subtype: 'Support',
    firepower: 0,
    armor: 5,
    copies: 3,
    image: 'images/11-athena.png',
    lore: 'Adjacent allies gain +2 Armor.',
    ability: 'Adjacent allies gain +2 Armor.',
  },
  {
    id: 12,
    name: 'HEPH435TUS',
    subtype: 'Support',
    firepower: 0,
    armor: 6,
    copies: 3,
    image: 'images/12-hephaestus.png',
    lore: 'Taunt — enemies in reach must target this unit if possible.',
    ability: 'Taunt — enemies in reach must target this unit if possible.',
  },
];

export const SKILLS: readonly SkillTemplate[] = [
  {
    id: 13,
    name: 'OVERLOAD',
    subtype: 'Offensive',
    effect: 'Your units gain +3 Firepower for attacks this turn.',
    image: 'images/13-reactor-overload.png',
  },
  {
    id: 14,
    name: 'EMP-PULSE',
    subtype: 'Offensive',
    effect:
      'Your attacks ignore the targets\' Armor this turn. Full Firepower lands as damage.',
    image: 'images/14-emp-pulse.png',
  },
  {
    id: 15,
    name: 'TGT-OVERRIDE',
    subtype: 'Offensive',
    effect:
      'Your next attack auto-destroys the target unit regardless of Armor. No excess generated. Your attacker survives.',
    image: 'images/15-targeting-override.png',
  },
  {
    id: 16,
    name: 'DOUBLE-SHOT',
    subtype: 'Offensive',
    effect:
      '+1 attack this turn. You can divide attacks between different units freely.',
    image: 'images/16-double-shot.png',
  },
  {
    id: 17,
    name: 'ENERGY-SHLD',
    subtype: 'Defensive',
    effect:
      'Your life takes no damage from the next enemy attack. Units may still be destroyed.',
    image: 'images/17-energy-shield.png',
  },
  {
    id: 18,
    name: 'REINFORCED',
    subtype: 'Defensive',
    effect: 'All your units gain +2 Armor against the rival attacks this turn.',
    image: 'images/18-reinforcement-protocol.png',
  },
  {
    id: 19,
    name: 'REPULSORS',
    subtype: 'Defensive',
    effect:
      'Your units cannot be destroyed this turn — attacks against them are nullified. Life damage from direct line still applies.',
    image: 'images/19-emergency-repulsors.png',
  },
  {
    id: 20,
    name: 'MINEFIELD',
    subtype: 'Trap',
    effect:
      'Activates when the rival destroys one of your units. The attacker card is also destroyed. Excess to life is still applied.',
    image: 'images/20-minefield.png',
  },
  {
    id: 21,
    name: 'CYBERATTACK',
    subtype: 'Trap',
    effect:
      'Activates when a rival trap would trigger during your attack. Cancels the rival trap and both cards are discarded.',
    image: 'images/21-cyberattack.png',
  },
  {
    id: 22,
    name: 'TRAP-CHARGE',
    subtype: 'Trap',
    effect:
      'Activates the first time one of your units survives an enemy attack. Your next attack gains +5 Firepower.',
    image: 'images/22-trap-charge.png',
  },
];

/** IDs de skills nombrados — referencia central en combat.ts y validators. */
export const SKILL_ID = {
  REACTOR_OVERLOAD: 13,
  EMP_PULSE: 14,
  TARGETING_OVERRIDE: 15,
  DOUBLE_SHOT: 16,
  ENERGY_SHIELD: 17,
  REINFORCEMENT_PROTOCOL: 18,
  EMERGENCY_REPULSORS: 19,
  MINEFIELD: 20,
  CYBERATTACK: 21,
  TRAP_CHARGE: 22,
} as const;

export type SkillId = (typeof SKILL_ID)[keyof typeof SKILL_ID];

/** Construye el mazo común de 40 cartas (30 unidades + 10 skills, una c/u). */
export function buildDeck(): Card[] {
  const deck: Card[] = [];

  for (const unit of UNITS) {
    for (let i = 0; i < unit.copies; i++) {
      const card: UnitCard = {
        id: unit.id,
        instanceId: `u${unit.id}-${i}`,
        type: 'unit',
        name: unit.name,
        subtype: unit.subtype,
        firepower: unit.firepower,
        armor: unit.armor,
        image: unit.image,
        lore: unit.lore,
        ...(unit.ability !== undefined ? { ability: unit.ability } : {}),
      };
      deck.push(card);
    }
  }

  for (const skill of SKILLS) {
    const card: SkillCard = {
      id: skill.id,
      instanceId: `s${skill.id}`,
      type: 'skill',
      name: skill.name,
      subtype: skill.subtype,
      effect: skill.effect,
      image: skill.image,
    };
    deck.push(card);
  }

  return deck;
}

/** Fisher-Yates shuffle (no muta el input). */
export function shuffle<T>(array: readonly T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Con noUncheckedIndexedAccess, arr[i] es T | undefined.
    // Un swap requiere asegurar que existen (siempre lo hacen en este loop).
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/** Cuenta unidades en una mano (usado para mulligan: < 2 unidades). */
export function countUnits(hand: readonly Card[]): number {
  return hand.filter((c): c is UnitCard => c.type === 'unit').length;
}
