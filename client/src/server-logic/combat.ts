// ============================================================================
// Combate de Olympus Protocol — MECÁNICA NUEVA + SKILLS + SUPPORT ABILITIES.
//
// Pipeline de resolveAttack:
//   1. Validar atacante + target + reach.
//   2. Calcular FP bonuses (Offensive skill, Support adyacentes, trap_charge).
//   3. Calcular AR bonuses (Defensive skill, Support adyacentes).
//   4. Aplicar special skills (TGT-OVERRIDE = auto-destroy, ENERGY-SHLD =
//      bloquear life damage).
//   5. Resolver FP vs AR → destrucción + excess.
//   6. Verificar traps (MINEFIELD activa si unit defensora destruida,
//      TRAP-CHARGE si unit defensora sobrevive).
//   7. Marcar skills consumidas.
//
// Las skills consumidas (que aparecen en result.consumedSkills) las quita
// el motor del estado al aplicar el resultado.
// ============================================================================

import { SKILL_ID } from '../shared/cards';
import type {
  ArmorDamageRef,
  AttackResult,
  AttackTarget,
  PlayerId,
  PlayerState,
  SerializedGameState,
  UnitCard,
  UnitSlotIndex,
} from '../shared/types';
import {
  UNIT_SLOTS,
  getAttackType,
  getReachableSlots,
  isValidSlotIndex,
  otherPlayer,
} from '../shared/types';

type CombatGameState = Pick<SerializedGameState, 'players'>;

/** IDs de cartas Support con ability conocida. */
const SUPPORT_ID = {
  HERMES: 10, // +1 FP adyacentes
  ATHENA: 11, // +2 AR adyacentes
  HEPHAESTUS: 12, // taunt (sin implementar en esta fase)
} as const;

/**
 * Resuelve un ataque individual. PURA: no muta el state, devuelve un
 * AttackResult que el motor aplica fuera.
 */
export function resolveAttack(
  game: CombatGameState,
  attackerId: PlayerId,
  attackerSlotIndex: UnitSlotIndex,
  target: AttackTarget,
): AttackResult {
  const defenderId: PlayerId = otherPlayer(attackerId);
  const log: string[] = [];
  const result: AttackResult = {
    log,
    destroyed: [],
    lifeDamage: 0,
    consumedSkills: [],
    newPendingEffects: [],
    consumedPendingEffects: [],
    armorDamage: [],
  };

  const attacker = game.players[attackerId];
  const defender = game.players[defenderId];

  const attackerCard = attacker.units[attackerSlotIndex];
  if (!attackerCard) {
    log.push(`⚠ Invalid attack: no unit in slot ${attackerSlotIndex} of attacker.`);
    return result;
  }

  const attackType = getAttackType(attackerCard.subtype);
  if (attackType === null) {
    log.push(`⚠ ${attackerCard.name} is Support — cannot attack.`);
    return result;
  }

  // ─── Validar reach ────────────────────────────────────────────────
  const reachable = getReachableSlots(attackType, attackerSlotIndex);

  // ─── Validar taunt (HEPHAESTUS) ───────────────────────────────────
  // Si HEPHAESTUS está en reach, el atacante DEBE apuntar a HEPHAESTUS.
  const tauntSlot = findTauntInReach(defender, reachable);
  if (tauntSlot !== null && !(target.kind === 'unit' && target.index === tauntSlot)) {
    log.push(
      `⚠ HEPHAESTUS taunt forces attacker to target slot ${tauntSlot}.`,
    );
    return result;
  }

  if (target.kind === 'unit') {
    if (!reachable.includes(target.index)) {
      log.push(
        `⚠ Target slot ${target.index} out of reach for ${attackerCard.name} (${attackType}).`,
      );
      return result;
    }
    const victim = defender.units[target.index];
    if (!victim) {
      log.push(`⚠ Target slot ${target.index} is empty. Use { kind: 'life' } instead.`);
      return result;
    }
    return resolveUnitAttack({
      game,
      attackerCard,
      victim,
      attackerId,
      defenderId,
      attackerSlot: attackerSlotIndex,
      victimSlot: target.index,
    });
  }

  // target.kind === 'life'
  if (!isLifeAttackValid(attackType, attackerSlotIndex, defender)) {
    log.push(
      `⚠ Attack to life invalid: ${attackerCard.name} still has a valid unit target in reach.`,
    );
    return result;
  }

  // Ataque a vida — calcular FP con bonuses
  const { fpBonus, attackerSkillUsed, trapChargeUsed } = computeAttackerBonuses(
    attacker,
    attackerSlotIndex,
    attackerCard,
  );
  const totalFp = attackerCard.firepower + fpBonus;

  // ¿Defender tiene ENERGY-SHLD activo?
  const defSkill =
    defender.skill && defender.skill.state === 'active' ? defender.skill.card : null;
  const blockLife =
    defSkill !== null && defSkill.id === SKILL_ID.ENERGY_SHIELD;

  let lifeDamage = totalFp;
  log.push(
    `▶ ${attackerCard.name} (slot ${attackerSlotIndex}, ${attackType}, FP ${attackerCard.firepower}${fpBonus !== 0 ? `+${fpBonus}` : ''}) attacks life of P${defenderId}.`,
  );
  if (blockLife) {
    log.push(`🛡 P${defenderId}'s Energy Shield blocks ${lifeDamage} life damage.`);
    lifeDamage = 0;
    result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_ID.ENERGY_SHIELD });
  } else {
    log.push(`  ${lifeDamage} damage → life P${defenderId}.`);
  }
  result.lifeDamage = lifeDamage;

  // Marcar skills/effects usados
  if (attackerSkillUsed) result.consumedSkills.push({ playerId: attackerId, skillId: attackerSkillUsed });
  if (trapChargeUsed) result.consumedPendingEffects.push({ playerId: attackerId, type: 'trap_charge' });
  // Las habilidades pasivas de Support (HERMES adyacente) no se consumen.

  return result;
}

// ─── Resolución de ataque unit → unit ────────────────────────────────────

interface ResolveUnitAttackParams {
  game: CombatGameState;
  attackerCard: UnitCard;
  victim: UnitCard;
  attackerId: PlayerId;
  defenderId: PlayerId;
  attackerSlot: UnitSlotIndex;
  victimSlot: UnitSlotIndex;
}

function resolveUnitAttack({
  game,
  attackerCard,
  victim,
  attackerId,
  defenderId,
  attackerSlot,
  victimSlot,
}: ResolveUnitAttackParams): AttackResult {
  const log: string[] = [];
  const result: AttackResult = {
    log,
    destroyed: [],
    lifeDamage: 0,
    consumedSkills: [],
    newPendingEffects: [],
    consumedPendingEffects: [],
    armorDamage: [],
  };

  const attacker = game.players[attackerId];
  const defender = game.players[defenderId];

  // Calcular bonuses
  const aBon = computeAttackerBonuses(attacker, attackerSlot, attackerCard);
  const dBon = computeDefenderBonuses(defender, victimSlot, victim);

  // ─── TGT-OVERRIDE: auto-destruye sin importar AR ─────────────────
  const attackerSkill =
    attacker.skill && attacker.skill.state === 'active' ? attacker.skill.card : null;
  const isAutoDestroy =
    attackerSkill !== null && attackerSkill.id === SKILL_ID.TARGETING_OVERRIDE;

  if (isAutoDestroy) {
    log.push(
      `▶ ${attackerCard.name} → ${victim.name}: 🎯 TARGETING-OVERRIDE auto-destroys target.`,
    );
    // Si el defensor tiene REPULSORS activo, anula incluso el auto-destroy.
    const defSkillActive =
      defender.skill && defender.skill.state === 'active' ? defender.skill.card : null;
    if (defSkillActive !== null && defSkillActive.id === SKILL_ID.EMERGENCY_REPULSORS) {
      log.push(
        `🛡 P${defenderId}'s REPULSORS nullifies TARGETING-OVERRIDE: ${victim.name} survives.`,
      );
      result.consumedSkills.push({ playerId: attackerId, skillId: SKILL_ID.TARGETING_OVERRIDE });
      result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_ID.EMERGENCY_REPULSORS });
      return result;
    }
    result.destroyed.push({ playerId: defenderId, slotIndex: victimSlot });
    result.consumedSkills.push({ playerId: attackerId, skillId: SKILL_ID.TARGETING_OVERRIDE });
    // Aun así verificar traps del defensor
    checkDefenderTraps(result, defender, defenderId, attacker, attackerId, attackerSlot, victimSlot, true);
    return result;
  }

  const fp = attackerCard.firepower + aBon.fpBonus;
  const effectiveAr = aBon.ignoreArmor ? 0 : victim.armor + dBon.arBonus;

  log.push(
    `▶ ${attackerCard.name} (FP ${attackerCard.firepower}${aBon.fpBonus !== 0 ? `+${aBon.fpBonus}` : ''}) vs ${victim.name} (AR ${aBon.ignoreArmor ? '0 [EMP]' : `${victim.armor}${dBon.arBonus !== 0 ? `+${dBon.arBonus}` : ''}`})`,
  );

  // ─── Resolución de daño (armor persistente) ─────────────────────
  // La armor ya no se reinicia entre turnos. FP golpea la armor actual.
  //   diff > 0  : defensor destruido, exceso → vida. Atacante sobrevive.
  //   diff = 0  : defensor destruido exactamente. Atacante sobrevive.
  //   diff < 0  : defensor sobrevive con armor reducida (newArmor = -diff).
  //               El atacante siempre sobrevive.
  // REPULSORS anula tanto la destrucción como el daño a armor.

  const diff = fp - effectiveAr;
  let victimDestroyed = false;

  if (diff >= 0) {
    if (dBon.immuneToDestroy) {
      // REPULSORS: ataque completamente anulado
      log.push(
        `🛡 P${defenderId}'s REPULSORS nullifies attack: ${victim.name} untouched.`,
      );
      result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_ID.EMERGENCY_REPULSORS });
    } else {
      // Defensor destruido
      result.destroyed.push({ playerId: defenderId, slotIndex: victimSlot });
      victimDestroyed = true;

      if (diff > 0) {
        log.push(
          `  diff ${diff} → ${victim.name} destroyed. Excess ${diff} → life P${defenderId}.`,
        );
        // ¿ENERGY-SHLD bloquea el life damage?
        const defSkill =
          defender.skill && defender.skill.state === 'active' ? defender.skill.card : null;
        if (defSkill !== null && defSkill.id === SKILL_ID.ENERGY_SHIELD) {
          log.push(`🛡 P${defenderId}'s Energy Shield blocks ${diff} life damage.`);
          result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_ID.ENERGY_SHIELD });
        } else {
          result.lifeDamage = diff;
        }
      } else {
        log.push(`  diff 0 → ${victim.name} destroyed. No excess damage.`);
      }
    }
  } else {
    // diff < 0: defensor sobrevive, armor reducida
    const newArmor = -diff; // = effectiveAr - fp, siempre > 0
    if (dBon.immuneToDestroy) {
      // REPULSORS también bloquea el daño a armor
      log.push(
        `🛡 P${defenderId}'s REPULSORS nullifies attack: ${victim.name} takes no armor damage.`,
      );
      result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_ID.EMERGENCY_REPULSORS });
    } else {
      const armorDmgRef: ArmorDamageRef = { playerId: defenderId, slotIndex: victimSlot, newArmor };
      result.armorDamage.push(armorDmgRef);
      log.push(
        `  diff ${diff} → ${victim.name} survives. Armor reduced to ${newArmor}.`,
      );
    }
  }

  // Marcar skills/effects consumidos
  if (aBon.attackerSkillUsed)
    result.consumedSkills.push({ playerId: attackerId, skillId: aBon.attackerSkillUsed });
  if (dBon.defenderSkillUsed && !dBon.immuneToDestroy)
    result.consumedSkills.push({ playerId: defenderId, skillId: dBon.defenderSkillUsed });
  if (aBon.trapChargeUsed)
    result.consumedPendingEffects.push({ playerId: attackerId, type: 'trap_charge' });

  // ─── Traps del defensor ──────────────────────────────────────────
  checkDefenderTraps(
    result,
    defender,
    defenderId,
    attacker,
    attackerId,
    attackerSlot,
    victimSlot,
    victimDestroyed,
  );

  return result;
}

// ─── Cálculo de bonuses ─────────────────────────────────────────────────

interface AttackerBonusInfo {
  fpBonus: number;
  /** ID de skill ofensiva que se usó (si alguna). */
  attackerSkillUsed: number | null;
  /** True si trap_charge pendingEffect se consumió. */
  trapChargeUsed: boolean;
  /** True si EMP-PULSE está activo (atacante ignora AR). */
  ignoreArmor: boolean;
}

function computeAttackerBonuses(
  attacker: PlayerState,
  attackerSlot: UnitSlotIndex,
  attackerCard: UnitCard,
): AttackerBonusInfo {
  let fpBonus = 0;
  let attackerSkillUsed: number | null = null;
  let trapChargeUsed = false;
  let ignoreArmor = false;

  // Offensive skill
  const skill = attacker.skill && attacker.skill.state === 'active' ? attacker.skill.card : null;
  if (skill !== null) {
    if (skill.id === SKILL_ID.REACTOR_OVERLOAD) {
      fpBonus += 3;
      attackerSkillUsed = SKILL_ID.REACTOR_OVERLOAD;
    } else if (skill.id === SKILL_ID.EMP_PULSE) {
      ignoreArmor = true;
      attackerSkillUsed = SKILL_ID.EMP_PULSE;
    }
    // TGT-OVERRIDE se maneja en otro path (auto-destroy)
    // DOUBLE-SHOT se maneja en gameEngine.startTurn (atacante extra)
  }

  // Support adyacentes (HERM35: +1 FP)
  for (const adj of adjacentSlots(attackerSlot)) {
    const adjCard = attacker.units[adj];
    if (adjCard && adjCard.id === SUPPORT_ID.HERMES) {
      fpBonus += 1;
    }
  }

  // Pending trap_charge: +5 FP
  const tc = attacker.pendingEffects.find((e) => e.type === 'trap_charge');
  if (tc) {
    fpBonus += tc.value ?? 5;
    trapChargeUsed = true;
  }

  void attackerCard;
  return { fpBonus, attackerSkillUsed, trapChargeUsed, ignoreArmor };
}

interface DefenderBonusInfo {
  arBonus: number;
  defenderSkillUsed: number | null;
  /** True si REPULSORS está activo (defensor inmune a destrucción). */
  immuneToDestroy: boolean;
}

function computeDefenderBonuses(
  defender: PlayerState,
  victimSlot: UnitSlotIndex,
  victimCard: UnitCard,
): DefenderBonusInfo {
  let arBonus = 0;
  let defenderSkillUsed: number | null = null;
  let immuneToDestroy = false;

  // Defensive skill
  const skill = defender.skill && defender.skill.state === 'active' ? defender.skill.card : null;
  if (skill !== null) {
    if (skill.id === SKILL_ID.REINFORCEMENT_PROTOCOL) {
      arBonus += 2;
      defenderSkillUsed = SKILL_ID.REINFORCEMENT_PROTOCOL;
    } else if (skill.id === SKILL_ID.EMERGENCY_REPULSORS) {
      immuneToDestroy = true;
      defenderSkillUsed = SKILL_ID.EMERGENCY_REPULSORS;
    }
    // ENERGY-SHLD se maneja como bloqueo de life damage (no AR bonus)
  }

  // Support adyacentes (ATH3N4: +2 AR)
  for (const adj of adjacentSlots(victimSlot)) {
    const adjCard = defender.units[adj];
    if (adjCard && adjCard.id === SUPPORT_ID.ATHENA) {
      arBonus += 2;
    }
  }

  void victimCard;
  return { arBonus, defenderSkillUsed, immuneToDestroy };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function adjacentSlots(slot: UnitSlotIndex): UnitSlotIndex[] {
  const result: UnitSlotIndex[] = [];
  if (isValidSlotIndex(slot - 1)) result.push((slot - 1) as UnitSlotIndex);
  if (isValidSlotIndex(slot + 1)) result.push((slot + 1) as UnitSlotIndex);
  return result;
}

function isLifeAttackValid(
  attackType: 'melee' | 'demolition' | 'ranged',
  attackerSlot: UnitSlotIndex,
  defender: PlayerState,
): boolean {
  const reachable = getReachableSlots(attackType, attackerSlot);
  for (const slot of reachable) {
    if (defender.units[slot]) return false;
  }
  return true;
}

/**
 * Si HEPHAESTUS está en alguno de los slots `reachable` del defensor, devuelve
 * su slot. En otro caso devuelve null.
 */
function findTauntInReach(
  defender: PlayerState,
  reachable: readonly UnitSlotIndex[],
): UnitSlotIndex | null {
  for (const slot of reachable) {
    const card = defender.units[slot];
    if (card && card.id === SUPPORT_ID.HEPHAESTUS) return slot;
  }
  return null;
}

/**
 * Calcula FP y AR efectivos de una unidad en el campo, incluyendo bonos de
 * cartas Support adyacentes (HERMES +1 FP, ATHENA +2 AR).
 * Usado por la UI para mostrar estadísticas modificadas en tiempo real.
 * Devuelve null si el slot está vacío.
 */
export function getEffectiveStats(
  player: PlayerState,
  slotIndex: UnitSlotIndex,
): { effectiveFp: number; effectiveAr: number } | null {
  const card = player.units[slotIndex];
  if (!card) return null;

  let fpBonus = 0;
  let arBonus = 0;

  for (const adj of adjacentSlots(slotIndex)) {
    const adjCard = player.units[adj];
    if (adjCard?.id === SUPPORT_ID.HERMES) fpBonus += 1;
    if (adjCard?.id === SUPPORT_ID.ATHENA) arBonus += 2;
  }

  return {
    effectiveFp: card.firepower + fpBonus,
    effectiveAr: card.armor + arBonus,
  };
}

/**
 * Helper público para la UI: dado un atacante y el defender state, devuelve
 * el slot al que el taunt obliga (o null si no hay taunt forzado).
 *
 * Si esto devuelve un valor, el Board debe restringir validAttackTargets a
 * únicamente ese slot.
 */
export function getForcedTauntTarget(
  defender: { units: (UnitCard | null)[] },
  attackType: 'melee' | 'demolition' | 'ranged',
  attackerSlot: UnitSlotIndex,
): UnitSlotIndex | null {
  const reachable = getReachableSlots(attackType, attackerSlot);
  for (const slot of reachable) {
    const card = defender.units[slot];
    if (card && card.id === SUPPORT_ID.HEPHAESTUS) return slot;
  }
  return null;
}

/**
 * Verifica si el defensor tiene una trap hidden que se activa con este ataque.
 * - MINEFIELD: activa cuando una unit del defensor es destruida. Destruye al atacante.
 * - TRAP-CHARGE: activa cuando una unit del defensor sobrevive un ataque.
 *   Agrega pendingEffect 'trap_charge' al defensor para próximo ataque.
 * - Si el atacante tiene CYBERATTACK hidden, cancela la trap del defensor y
 *   ambas cartas se descartan (ambos consumedSkills).
 */
function checkDefenderTraps(
  result: AttackResult,
  defender: PlayerState,
  defenderId: PlayerId,
  attacker: PlayerState,
  attackerId: PlayerId,
  attackerSlot: UnitSlotIndex,
  victimSlot: UnitSlotIndex,
  victimDestroyed: boolean,
): void {
  const trap = defender.skill && defender.skill.state === 'hidden' ? defender.skill.card : null;
  if (trap === null) return;
  if (trap.subtype !== 'Trap') return;

  // ¿Se cumple la condición de activación?
  const wouldFireMinefield = trap.id === SKILL_ID.MINEFIELD && victimDestroyed;
  const wouldFireTrapCharge =
    trap.id === SKILL_ID.TRAP_CHARGE && !victimDestroyed && defender.units[victimSlot] !== null;
  const willFire = wouldFireMinefield || wouldFireTrapCharge;

  if (!willFire) return;

  // CYBERATTACK del atacante: intercepta y cancela la trap rival.
  const attackerTrap =
    attacker.skill && attacker.skill.state === 'hidden' ? attacker.skill.card : null;
  if (attackerTrap !== null && attackerTrap.id === SKILL_ID.CYBERATTACK) {
    result.log.push(
      `🕷 P${attackerId}'s CYBERATTACK cancels P${defenderId}'s ${trap.name}. Both discarded.`,
    );
    result.consumedSkills.push({ playerId: attackerId, skillId: SKILL_ID.CYBERATTACK });
    result.consumedSkills.push({ playerId: defenderId, skillId: trap.id });
    return;
  }

  if (wouldFireMinefield) {
    result.log.push(`💣 P${defenderId}'s MINEFIELD activates: attacker also destroyed.`);
    // Si el atacante no está ya destruido, lo destruimos
    const alreadyDestroyed = result.destroyed.some(
      (d) => d.playerId === attackerId && d.slotIndex === attackerSlot,
    );
    if (!alreadyDestroyed) {
      result.destroyed.push({ playerId: attackerId, slotIndex: attackerSlot });
    }
    result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_ID.MINEFIELD });
    return;
  }

  if (wouldFireTrapCharge) {
    result.log.push(
      `⚡ P${defenderId}'s TRAP-CHARGE activates: +5 FP next attack (pending).`,
    );
    result.newPendingEffects.push({ playerId: defenderId, type: 'trap_charge', value: 5 });
    result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_ID.TRAP_CHARGE });
  }
}

// Helper para silenciar el unused warning de UNIT_SLOTS si TS lo detecta.
void UNIT_SLOTS;
