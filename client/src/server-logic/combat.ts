// ============================================================================
// Resolución de combate de Olympus Protocol.
// Implementa la fórmula 2.6 + reglas de slots vacíos (2.4) + habilidades (4.2).
// `resolveAttack` es PURA (no muta el game state): devuelve un AttackResult que
// el motor aplica fuera (en gameEngine.endTurn). Así es testeable y portable.
// ============================================================================

import { SKILL_ID } from '../shared/cards';
import type {
  AttackResult,
  PlayerId,
  PlayerState,
  SerializedGameState,
  SkillCard,
} from '../shared/types';

/** Estado mínimo del juego que necesita el combate (subconjunto de SerializedGameState). */
type CombatGameState = Pick<SerializedGameState, 'players'>;

export function resolveAttack(
  game: CombatGameState,
  attackerId: PlayerId,
  defenderId: PlayerId,
): AttackResult {
  const log: string[] = [];
  const result: AttackResult = {
    log,
    destroyed: {
      attackerFront: false,
      attackerRear: false,
      defenderFront: false,
      defenderRear: false,
    },
    lifeDamage: 0,
    consumedSkills: [],
    newPendingEffects: [],
    consumedPendingEffects: [],
  };

  const attacker: PlayerState = game.players[attackerId];
  const defender: PlayerState = game.players[defenderId];

  log.push(`▶ Player ${attackerId}'s attack begins`);

  // ───────────────────────────────────────────────────────────────────
  // Fase A: skills activas (Offensive del atacante, Defensive del defensor)
  // ───────────────────────────────────────────────────────────────────

  const attackerSkill: SkillCard | null =
    attacker.skill &&
    attacker.skill.state === 'active' &&
    attacker.skill.card.subtype === 'Offensive'
      ? attacker.skill.card
      : null;

  const defenderSkill: SkillCard | null =
    defender.skill &&
    defender.skill.state === 'active' &&
    defender.skill.card.subtype === 'Defensive'
      ? defender.skill.card
      : null;

  if (attackerSkill) {
    log.push(`⚡ Attacker activates Offensive: #${attackerSkill.id} ${attackerSkill.name}`);
    result.consumedSkills.push({ playerId: attackerId, skillId: attackerSkill.id });
  }
  if (defenderSkill) {
    log.push(`🛡 Defender activates Defensive: #${defenderSkill.id} ${defenderSkill.name}`);
    result.consumedSkills.push({ playerId: defenderId, skillId: defenderSkill.id });
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase B: modificadores
  // ───────────────────────────────────────────────────────────────────

  const aMods = {
    frontFirepowerBonus: 0,
    bypassRearArmor: false,
    autoDestroyFront: false,
    doubleAttack: false,
  };
  const dMods = {
    frontArmorBonus: 0,
    rearArmorBonus: 0,
    blockLifeDamage: false,
    rearInvulnerable: false,
  };

  if (attackerSkill) {
    if (attackerSkill.id === SKILL_ID.REACTOR_OVERLOAD) aMods.frontFirepowerBonus += 3;
    if (attackerSkill.id === SKILL_ID.EMP_PULSE) aMods.bypassRearArmor = true;
    if (attackerSkill.id === SKILL_ID.TARGETING_OVERRIDE) aMods.autoDestroyFront = true;
    if (attackerSkill.id === SKILL_ID.DOUBLE_SHOT) aMods.doubleAttack = true;
  }
  if (defenderSkill) {
    if (defenderSkill.id === SKILL_ID.ENERGY_SHIELD) dMods.blockLifeDamage = true;
    if (defenderSkill.id === SKILL_ID.REINFORCEMENT_PROTOCOL) {
      dMods.frontArmorBonus += 2;
      dMods.rearArmorBonus += 2;
    }
    if (defenderSkill.id === SKILL_ID.EMERGENCY_REPULSORS) dMods.rearInvulnerable = true;
  }

  // Trap Charge pendiente del atacante: +5 Firepower a Front Line en este ataque
  const trapChargeIdx = attacker.pendingEffects.findIndex((e) => e.type === 'trap_charge');
  if (trapChargeIdx >= 0) {
    if (attacker.frontLine) {
      aMods.frontFirepowerBonus += 5;
      log.push(`💥 Attacker's pending Trap Charge: +5 Firepower to Front Line`);
    } else {
      log.push(`⚠ Attacker's pending Trap Charge lost (Front Line empty)`);
    }
    result.consumedPendingEffects.push({
      playerId: attackerId,
      type: 'trap_charge',
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase C: ejecutar el ataque (1 o 2 pases si Double Shot)
  // ───────────────────────────────────────────────────────────────────

  const attackPasses = aMods.doubleAttack ? 2 : 1;

  for (let pass = 1; pass <= attackPasses; pass++) {
    if (attackPasses > 1) log.push(`━━ Pass ${pass}/${attackPasses} (Double Shot) ━━`);

    // Estado del tablero ANTES de este pase (considerando destrucciones previas).
    const aFront = result.destroyed.attackerFront ? null : attacker.frontLine;
    const aRear = result.destroyed.attackerRear ? null : attacker.rearGuard;
    const dFront = result.destroyed.defenderFront ? null : defender.frontLine;

    // ─── Step 1: Front Line vs Front Line ───
    let excess = 0;
    let step1Ended = false;

    if (!aFront && !aRear) {
      log.push(`⚠ Case C: both attacker slots empty → null attack`);
      step1Ended = true;
    } else if (!aFront && aRear) {
      // Case A: Rear Guard asume el rol del Step 1
      log.push(`▸ Case A: Attacker Front Line empty. Rear Guard takes Step 1 role.`);
      const aRearFP = aRear.firepower; // Case A: sin buffs de Front Line
      const dFrontArmor = dFront ? dFront.armor + dMods.frontArmorBonus : 0;
      log.push(
        `▸ Step 1: Attacker Rear Guard FP ${aRearFP} vs Defender Front Line Armor ${dFrontArmor}`,
      );
      const diff1 = aRearFP - dFrontArmor;
      if (diff1 <= 0) {
        log.push(
          `  diff1 = ${diff1} → no card destroyed (Rear Guard does not expose itself). End of attack.`,
        );
        step1Ended = true;
      } else {
        log.push(`  diff1 = ${diff1} → Defender Front Line destroyed. Excess = ${diff1}`);
        if (dFront) result.destroyed.defenderFront = true;
        excess = diff1;
        // En Case A el RG ya cumplió su rol → no aporta más en Step 2.
      }
    } else if (aFront) {
      // Caso normal o Case B: Attacker Front Line existe.
      const aFrontFP = aFront.firepower + aMods.frontFirepowerBonus;
      const dFrontArmor = dFront ? dFront.armor + dMods.frontArmorBonus : 0;

      if (aMods.autoDestroyFront && dFront) {
        log.push(
          `▸ Step 1: Targeting Override → Defender Front Line auto-destroyed. Attacker survives. No excess.`,
        );
        result.destroyed.defenderFront = true;
        step1Ended = true;
      } else if (!dFront) {
        log.push(
          `▸ Step 1: Defender Front Line empty (Armor 0). Attacker FP ${aFrontFP} passes through as excess.`,
        );
        excess = aFrontFP;
      } else {
        log.push(
          `▸ Step 1: Attacker Front Line FP ${aFrontFP} vs Defender Front Line Armor ${dFrontArmor}`,
        );
        const diff1 = aFrontFP - dFrontArmor;
        if (diff1 < 0) {
          log.push(`  diff1 = ${diff1} → Attacker Front Line destroyed. End of attack.`);
          result.destroyed.attackerFront = true;
          step1Ended = true;
        } else if (diff1 === 0) {
          log.push(`  diff1 = 0 → both Front Lines destroyed. End of attack.`);
          result.destroyed.attackerFront = true;
          result.destroyed.defenderFront = true;
          step1Ended = true;
        } else {
          log.push(`  diff1 = ${diff1} → Defender Front Line destroyed. Excess = ${diff1}`);
          result.destroyed.defenderFront = true;
          excess = diff1;

          // Minefield del defensor: se activa cuando el atacante destruye su FL.
          if (
            defender.skill &&
            defender.skill.card.id === SKILL_ID.MINEFIELD &&
            defender.skill.state === 'hidden'
          ) {
            if (
              attacker.skill &&
              attacker.skill.card.id === SKILL_ID.CYBERATTACK &&
              attacker.skill.state === 'hidden'
            ) {
              log.push(`🚫 Attacker's Cyberattack cancels Defender's Minefield before it applies`);
              result.consumedSkills.push({
                playerId: attackerId,
                skillId: SKILL_ID.CYBERATTACK,
              });
              result.consumedSkills.push({
                playerId: defenderId,
                skillId: SKILL_ID.MINEFIELD,
              });
            } else {
              log.push(
                `💣 Defender's Minefield activates: Attacker Front Line also destroyed, excess nullified`,
              );
              result.destroyed.attackerFront = true;
              excess = 0;
              result.consumedSkills.push({
                playerId: defenderId,
                skillId: SKILL_ID.MINEFIELD,
              });
              step1Ended = true;
            }
          }
        }
      }
    }

    // ─── Step 2: Rear Guard / Life ───
    const canDoStep2 = !step1Ended && (excess > 0 || (excess === 0 && (aRear || aFront)));
    if (canDoStep2) {
      // EMP Pulse: si el atacante destruyó la FL defensora, excess va directo a vida
      // ignorando la Armor del RG.
      if (aMods.bypassRearArmor && excess > 0 && result.destroyed.defenderFront) {
        log.push(
          `▸ Step 2: EMP Pulse → excess ${excess} ignores Defender Rear Guard Armor and goes directly to life`,
        );
        result.lifeDamage += excess;
      } else {
        // Firepower que aporta el RG del atacante
        let aRearFP = 0;
        if (aRear && aFront) {
          aRearFP = aRear.firepower;
        } else if (aRear && !aFront) {
          // Case A: el RG ya atacó en Step 1, no vuelve a atacar.
          aRearFP = 0;
        } else if (!aRear && aFront) {
          aRearFP = 0;
          log.push(`▸ Case B: Attacker Rear Guard empty (Firepower 0)`);
        }

        const attackOnRear = aRearFP + excess;

        if (attackOnRear === 0) {
          // Nada que atacar
        } else if (dMods.rearInvulnerable) {
          log.push(
            `▸ Step 2: Emergency Repulsors → Defender Rear Guard invulnerable, attack (${attackOnRear}) nullified`,
          );
        } else if (!defender.rearGuard) {
          log.push(
            `▸ Step 2: Defender Rear Guard empty (Armor 0). attackOnRear ${attackOnRear} passes through to life.`,
          );
          result.lifeDamage += attackOnRear;
        } else {
          const dRearArmor = defender.rearGuard.armor + dMods.rearArmorBonus;
          log.push(
            `▸ Step 2: attackOnRear ${attackOnRear} (RG ${aRearFP} + excess ${excess}) vs Defender Rear Guard Armor ${dRearArmor}`,
          );
          const diff2 = attackOnRear - dRearArmor;
          if (diff2 < 0) {
            log.push(
              `  diff2 = ${diff2} → Defender Rear Guard survives. Attacker does not self-destruct. End of attack.`,
            );
          } else if (diff2 === 0) {
            log.push(`  diff2 = 0 → Defender Rear Guard destroyed. No life damage.`);
            result.destroyed.defenderRear = true;
          } else {
            log.push(`  diff2 = ${diff2} → Defender Rear Guard destroyed. Life damage: ${diff2}`);
            result.destroyed.defenderRear = true;
            result.lifeDamage += diff2;
          }
        }
      }
    }

    if (attackPasses > 1 && pass === 1) {
      log.push(`━━ End of pass 1, starting pass 2 with original Firepower ━━`);
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase D: Energy Shield bloquea daño a vida
  // ───────────────────────────────────────────────────────────────────
  if (dMods.blockLifeDamage && result.lifeDamage > 0) {
    log.push(`🛡 Energy Shield blocks ${result.lifeDamage} points of life damage`);
    result.lifeDamage = 0;
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase E: Trap Charge del defensor — si su FL sobrevivió el ataque
  // ───────────────────────────────────────────────────────────────────
  if (
    defender.skill &&
    defender.skill.card.id === SKILL_ID.TRAP_CHARGE &&
    defender.skill.state === 'hidden'
  ) {
    const frontSurvived = !!defender.frontLine && !result.destroyed.defenderFront;
    if (frontSurvived) {
      if (
        attacker.skill &&
        attacker.skill.card.id === SKILL_ID.CYBERATTACK &&
        attacker.skill.state === 'hidden'
      ) {
        log.push(`🚫 Attacker's Cyberattack cancels Defender's Trap Charge before it applies`);
        result.consumedSkills.push({
          playerId: attackerId,
          skillId: SKILL_ID.CYBERATTACK,
        });
        result.consumedSkills.push({
          playerId: defenderId,
          skillId: SKILL_ID.TRAP_CHARGE,
        });
      } else {
        log.push(
          `⚡ Defender's Trap Charge activates: +5 Firepower on next attack (deferred effect)`,
        );
        result.consumedSkills.push({
          playerId: defenderId,
          skillId: SKILL_ID.TRAP_CHARGE,
        });
        result.newPendingEffects.push({
          playerId: defenderId,
          type: 'trap_charge',
          value: 5,
        });
      }
    }
  }

  log.push(`▶ Attack finished. Life damage: ${result.lifeDamage}`);

  return result;
}
