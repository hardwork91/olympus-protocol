// Resolución de combate de Olympus Protocol.
// Implementa la fórmula de la sección 2.6 + las reglas de slots vacíos (2.4) + habilidades (4.2).
// La función principal `resolveAttack` recibe el estado del juego, el id del atacante y el del defensor,
// y devuelve un objeto con:
//   - log: array de strings narrando el combate paso a paso.
//   - destroyed: qué slots resultaron destruidos.
//   - lifeDamage: daño total a la vida del defensor.
//   - consumedSkills: skills que se gastaron (offensive/defensive/trap activadas).
//   - newPendingEffects: efectos diferidos creados (ej. Trap Charge).
//   - consumedPendingEffects: efectos diferidos del atacante que se aplicaron en este ataque.

// IDs de habilidades para legibilidad
const SKILL_IDS = {
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
};

export function resolveAttack(game, attackerId, defenderId) {
  const log = [];
  const result = {
    log,
    destroyed: {
      attackerFront: false,
      attackerRear: false,
      defenderFront: false,
      defenderRear: false,
    },
    lifeDamage: 0,
    consumedSkills: [],   // { playerId, skillId }
    newPendingEffects: [], // { playerId, type, value }
    consumedPendingEffects: [], // { playerId, type }
  };

  const attacker = game.players[attackerId];
  const defender = game.players[defenderId];

  log.push(`▶ Player ${attackerId}'s attack begins`);

  // ───────────────────────────────────────────────────────────────────
  // Fase A: Determinar habilidades activas (Offensive del atacante, Defensive del defensor)
  // ───────────────────────────────────────────────────────────────────

  const attackerSkill = (attacker.skill && attacker.skill.state === 'active' && attacker.skill.card.subtype === 'Offensive')
    ? attacker.skill.card : null;
  const defenderSkill = (defender.skill && defender.skill.state === 'active' && defender.skill.card.subtype === 'Defensive')
    ? defender.skill.card : null;

  if (attackerSkill) {
    log.push(`⚡ Attacker activates Offensive: #${attackerSkill.id} ${attackerSkill.name}`);
    result.consumedSkills.push({ playerId: attackerId, skillId: attackerSkill.id });
  }
  if (defenderSkill) {
    log.push(`🛡 Defender activates Defensive: #${defenderSkill.id} ${defenderSkill.name}`);
    result.consumedSkills.push({ playerId: defenderId, skillId: defenderSkill.id });
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase B: Calcular modificadores
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
    if (attackerSkill.id === SKILL_IDS.REACTOR_OVERLOAD) aMods.frontFirepowerBonus += 3;
    if (attackerSkill.id === SKILL_IDS.EMP_PULSE) aMods.bypassRearArmor = true;
    if (attackerSkill.id === SKILL_IDS.TARGETING_OVERRIDE) aMods.autoDestroyFront = true;
    if (attackerSkill.id === SKILL_IDS.DOUBLE_SHOT) aMods.doubleAttack = true;
  }
  if (defenderSkill) {
    if (defenderSkill.id === SKILL_IDS.ENERGY_SHIELD) dMods.blockLifeDamage = true;
    if (defenderSkill.id === SKILL_IDS.REINFORCEMENT_PROTOCOL) {
      dMods.frontArmorBonus += 2;
      dMods.rearArmorBonus += 2;
    }
    if (defenderSkill.id === SKILL_IDS.EMERGENCY_REPULSORS) dMods.rearInvulnerable = true;
  }

  // Trap Charge pendiente del atacante: +5 Firepower a Front Line en este ataque
  const trapChargeIdx = attacker.pendingEffects.findIndex(e => e.type === 'trap_charge');
  if (trapChargeIdx >= 0) {
    if (attacker.frontLine) {
      aMods.frontFirepowerBonus += 5;
      log.push(`💥 Attacker's pending Trap Charge: +5 Firepower to Front Line`);
    } else {
      log.push(`⚠ Attacker's pending Trap Charge lost (Front Line empty)`);
    }
    result.consumedPendingEffects.push({ playerId: attackerId, type: 'trap_charge' });
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase C: Ejecutar el ataque
  // ───────────────────────────────────────────────────────────────────

  // Ejecutamos el bloque de ataque una vez. Si Double Shot, lo volvemos a ejecutar.
  const attackPasses = aMods.doubleAttack ? 2 : 1;

  for (let pass = 1; pass <= attackPasses; pass++) {
    if (attackPasses > 1) log.push(`━━ Pass ${pass}/${attackPasses} (Double Shot) ━━`);

    // Estado actual del tablero ANTES de este pase (pero ya considerando destrucciones de pases anteriores)
    const aFront = result.destroyed.attackerFront ? null : attacker.frontLine;
    const aRear  = result.destroyed.attackerRear  ? null : attacker.rearGuard;
    const dFront = result.destroyed.defenderFront ? null : defender.frontLine;
    const dRear  = result.destroyed.defenderRear  ? null : defender.rearGuard;

    // ─── Paso 1: Front Line vs Front Line ───
    let excess = 0;
    let step1Ended = false;

    if (!aFront && !aRear) {
      log.push(`⚠ Case C: both attacker slots empty → null attack`);
      step1Ended = true;
    } else if (!aFront && aRear) {
      // Case A: Rear Guard takes the role of Step 1
      log.push(`▸ Case A: Attacker Front Line empty. Rear Guard takes Step 1 role.`);
      const aRearFP = aRear.firepower; // Case A: no Front Line buffs apply (literal interpretation)
      const dFrontArmor = dFront ? (dFront.armor + dMods.frontArmorBonus) : 0;
      log.push(`▸ Step 1: Attacker Rear Guard FP ${aRearFP} vs Defender Front Line Armor ${dFrontArmor}`);
      const diff1 = aRearFP - dFrontArmor;
      if (diff1 <= 0) {
        log.push(`  diff1 = ${diff1} → no card destroyed (Rear Guard does not expose itself). End of attack.`);
        step1Ended = true;
      } else {
        log.push(`  diff1 = ${diff1} → Defender Front Line destroyed. Excess = ${diff1}`);
        if (dFront) result.destroyed.defenderFront = true;
        excess = diff1;
        // In Case A, the Attacker Rear Guard already fulfilled its role → no additional Firepower for Step 2.
      }
    } else {
      // Normal case or Case B: Attacker Front Line exists
      const aFrontFP = aFront.firepower + aMods.frontFirepowerBonus;
      const dFrontArmor = dFront ? (dFront.armor + dMods.frontArmorBonus) : 0;

      if (aMods.autoDestroyFront && dFront) {
        log.push(`▸ Step 1: Targeting Override → Defender Front Line auto-destroyed. Attacker survives. No excess.`);
        result.destroyed.defenderFront = true;
        step1Ended = true;
        // Auto-destroy generates no excess
      } else if (!dFront) {
        // Defender with empty FL → Armor 0
        log.push(`▸ Step 1: Defender Front Line empty (Armor 0). Attacker FP ${aFrontFP} passes through as excess.`);
        excess = aFrontFP;
      } else {
        log.push(`▸ Step 1: Attacker Front Line FP ${aFrontFP} vs Defender Front Line Armor ${dFrontArmor}`);
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

          // Defender's Minefield trap: activates when attacker destroys defender's FL.
          if (defender.skill && defender.skill.card.id === SKILL_IDS.MINEFIELD && defender.skill.state === 'hidden') {
            // Check if attacker has Cyberattack to cancel the trap
            if (attacker.skill && attacker.skill.card.id === SKILL_IDS.CYBERATTACK && attacker.skill.state === 'hidden') {
              log.push(`🚫 Attacker's Cyberattack cancels Defender's Minefield before it applies`);
              result.consumedSkills.push({ playerId: attackerId, skillId: SKILL_IDS.CYBERATTACK });
              result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_IDS.MINEFIELD });
            } else {
              log.push(`💣 Defender's Minefield activates: Attacker Front Line also destroyed, excess nullified`);
              result.destroyed.attackerFront = true;
              excess = 0;
              result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_IDS.MINEFIELD });
              step1Ended = true;
            }
          }
        }
      }
    }

    // ─── Step 2: Attack on Rear Guard / Life ───
    if (!step1Ended && excess > 0 || (!step1Ended && excess === 0 && (aRear || aFront))) {
      // EMP Pulse: if attacker FL destroyed defender FL, excess goes directly to life ignoring RG Armor.
      if (aMods.bypassRearArmor && excess > 0 && result.destroyed.defenderFront) {
        log.push(`▸ Step 2: EMP Pulse → excess ${excess} ignores Defender Rear Guard Armor and goes directly to life`);
        result.lifeDamage += excess;
      } else {
        // Determine Attacker Rear Guard Firepower contribution
        let aRearFP = 0;
        if (aRear && aFront) {
          // Normal case: both attacker slots present
          aRearFP = aRear.firepower;
        } else if (aRear && !aFront) {
          // Case A already handled in Step 1 (Rear Guard took the role). Does not attack again.
          aRearFP = 0;
        } else if (!aRear && aFront) {
          // Case B: Attacker Rear Guard empty
          aRearFP = 0;
          log.push(`▸ Case B: Attacker Rear Guard empty (Firepower 0)`);
        }

        const attackOnRear = aRearFP + excess;

        if (attackOnRear === 0) {
          // Nothing to attack
        } else if (dMods.rearInvulnerable) {
          log.push(`▸ Step 2: Emergency Repulsors → Defender Rear Guard invulnerable, attack (${attackOnRear}) nullified`);
        } else if (!defender.rearGuard) {
          // Defender with empty RG → Armor 0
          log.push(`▸ Step 2: Defender Rear Guard empty (Armor 0). attackOnRear ${attackOnRear} passes through to life.`);
          result.lifeDamage += attackOnRear;
        } else {
          const dRearArmor = defender.rearGuard.armor + dMods.rearArmorBonus;
          log.push(`▸ Step 2: attackOnRear ${attackOnRear} (RG ${aRearFP} + excess ${excess}) vs Defender Rear Guard Armor ${dRearArmor}`);
          const diff2 = attackOnRear - dRearArmor;
          if (diff2 < 0) {
            log.push(`  diff2 = ${diff2} → Defender Rear Guard survives. Attacker does not self-destruct. End of attack.`);
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

    // In Double Shot, the second pass does not accumulate excess from the first nor reuse the same variables.
    if (attackPasses > 1 && pass === 1) {
      log.push(`━━ End of pass 1, starting pass 2 with original Firepower ━━`);
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase D: Aplicar Energy Shield (bloqueo de daño a vida)
  // ───────────────────────────────────────────────────────────────────
  if (dMods.blockLifeDamage && result.lifeDamage > 0) {
    log.push(`🛡 Energy Shield blocks ${result.lifeDamage} points of life damage`);
    result.lifeDamage = 0;
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase E: Trap Charge del defensor — se activa si su Front Line sobrevivió el ataque
  // ───────────────────────────────────────────────────────────────────
  if (defender.skill && defender.skill.card.id === SKILL_IDS.TRAP_CHARGE && defender.skill.state === 'hidden') {
    const frontSurvived = !!defender.frontLine && !result.destroyed.defenderFront;
    if (frontSurvived) {
      // Verificar si el atacante tiene Cyberattack que cancele la trampa
      if (attacker.skill && attacker.skill.card.id === SKILL_IDS.CYBERATTACK && attacker.skill.state === 'hidden') {
        log.push(`🚫 Attacker's Cyberattack cancels Defender's Trap Charge before it applies`);
        result.consumedSkills.push({ playerId: attackerId, skillId: SKILL_IDS.CYBERATTACK });
        result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_IDS.TRAP_CHARGE });
      } else {
        log.push(`⚡ Defender's Trap Charge activates: +5 Firepower on next attack (deferred effect)`);
        result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_IDS.TRAP_CHARGE });
        result.newPendingEffects.push({ playerId: defenderId, type: 'trap_charge', value: 5 });
      }
    }
  }

  log.push(`▶ Attack finished. Life damage: ${result.lifeDamage}`);

  return result;
}
