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
    firepower: 3,
    armor: 5,
    copies: 3,
    image: 'images/10-hermes.png',
    lore: 'Winged messenger, swift to flank and support his allies.',
  },
  {
    id: 11,
    name: 'ATH3N4',
    subtype: 'Support',
    firepower: 4,
    armor: 5,
    copies: 3,
    image: 'images/11-athena.png',
    lore: 'Strategist of war, her shield and spear command the line.',
  },
  {
    id: 12,
    name: 'HEPH435TUS',
    subtype: 'Support',
    firepower: 2,
    armor: 6,
    copies: 3,
    image: 'images/12-hephaestus.png',
    lore: 'Smith of the gods, forging armor and weapons mid-battle.',
  },
];

export const SKILLS: readonly SkillTemplate[] = [
  {
    id: 13,
    name: 'OVERLOAD',
    subtype: 'Offensive',
    effect: 'Your Front Line gains +3 Firepower this turn.',
    image: 'images/13-reactor-overload.png',
  },
  {
    id: 14,
    name: 'EMP-PULSE',
    subtype: 'Offensive',
    effect:
      'If your Front Line destroys the rival Front Line, the excess penetrates directly to rival life (ignores Rear Guard Armor).',
    image: 'images/14-emp-pulse.png',
  },
  {
    id: 15,
    name: 'TGT-OVERRIDE',
    subtype: 'Offensive',
    effect:
      'Your Front Line auto-destroys the rival Front Line regardless of Armor. No excess generated. Your Front Line survives intact.',
    image: 'images/15-targeting-override.png',
  },
  {
    id: 16,
    name: 'DOUBLE-SHOT',
    subtype: 'Offensive',
    effect:
      'Your Front Line attacks twice this turn. The second attack uses original Firepower, no excess from the first.',
    image: 'images/16-double-shot.png',
  },
  {
    id: 17,
    name: 'ENERGY-SHLD',
    subtype: 'Defensive',
    effect:
      'Your life takes no damage this turn. Cards may be destroyed, but residual life damage is fully blocked.',
    image: 'images/17-energy-shield.png',
  },
  {
    id: 18,
    name: 'REINFORCED',
    subtype: 'Defensive',
    effect: 'Your Front Line and Rear Guard gain +2 Armor during the rival attack.',
    image: 'images/18-reinforcement-protocol.png',
  },
  {
    id: 19,
    name: 'REPULSORS',
    subtype: 'Defensive',
    effect:
      'Your Rear Guard is invulnerable this turn. Excess hitting it is nullified. Life remains vulnerable to other damage vectors.',
    image: 'images/19-emergency-repulsors.png',
  },
  {
    id: 20,
    name: 'MINEFIELD',
    subtype: 'Trap',
    effect:
      'Activates when the rival destroys your Front Line. The attacker card is also destroyed. Excess heading to Rear Guard is nullified.',
    image: 'images/20-minefield.png',
  },
  {
    id: 21,
    name: 'CYBERATTACK',
    subtype: 'Trap',
    effect:
      'Activates when a rival trap meets its activation condition. Cancels the rival trap effect before it applies. Both cards are discarded.',
    image: 'images/21-cyberattack.png',
  },
  {
    id: 22,
    name: 'TRAP-CHARGE',
    subtype: 'Trap',
    effect:
      'Activates the first time your Front Line survives a rival attack. Your Front Line gains +5 Firepower on your next attack. If your Front Line is empty then, the bonus is lost.',
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
