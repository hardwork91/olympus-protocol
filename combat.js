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

  log.push(`▶ Comienza el ataque del Jugador ${attackerId}`);

  // ───────────────────────────────────────────────────────────────────
  // Fase A: Determinar habilidades activas (Offensive del atacante, Defensive del defensor)
  // ───────────────────────────────────────────────────────────────────

  const attackerSkill = (attacker.skill && attacker.skill.state === 'active' && attacker.skill.card.subtype === 'Offensive')
    ? attacker.skill.card : null;
  const defenderSkill = (defender.skill && defender.skill.state === 'active' && defender.skill.card.subtype === 'Defensive')
    ? defender.skill.card : null;

  if (attackerSkill) {
    log.push(`⚡ Atacante activa Offensive: #${attackerSkill.id} ${attackerSkill.name}`);
    result.consumedSkills.push({ playerId: attackerId, skillId: attackerSkill.id });
  }
  if (defenderSkill) {
    log.push(`🛡 Defensor activa Defensive: #${defenderSkill.id} ${defenderSkill.name}`);
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
      log.push(`💥 Trap Charge pendiente del atacante: +5 Firepower a Front Line`);
    } else {
      log.push(`⚠ Trap Charge pendiente del atacante se pierde (Front Line vacía)`);
    }
    result.consumedPendingEffects.push({ playerId: attackerId, type: 'trap_charge' });
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase C: Ejecutar el ataque
  // ───────────────────────────────────────────────────────────────────

  // Ejecutamos el bloque de ataque una vez. Si Double Shot, lo volvemos a ejecutar.
  const attackPasses = aMods.doubleAttack ? 2 : 1;

  for (let pass = 1; pass <= attackPasses; pass++) {
    if (attackPasses > 1) log.push(`━━ Pasada ${pass}/${attackPasses} (Double Shot) ━━`);

    // Estado actual del tablero ANTES de este pase (pero ya considerando destrucciones de pases anteriores)
    const aFront = result.destroyed.attackerFront ? null : attacker.frontLine;
    const aRear  = result.destroyed.attackerRear  ? null : attacker.rearGuard;
    const dFront = result.destroyed.defenderFront ? null : defender.frontLine;
    const dRear  = result.destroyed.defenderRear  ? null : defender.rearGuard;

    // ─── Paso 1: Front Line vs Front Line ───
    let excess = 0;
    let step1Ended = false;

    if (!aFront && !aRear) {
      log.push(`⚠ Caso C: ambos slots atacantes vacíos → ataque nulo`);
      step1Ended = true;
    } else if (!aFront && aRear) {
      // Caso A: Rear Guard asume el rol del Paso 1
      log.push(`▸ Caso A: Front Line atacante vacía. Rear Guard asume rol del Paso 1.`);
      const aRearFP = aRear.firepower; // Caso A: no aplican buffs de Front Line (interpretación literal)
      const dFrontArmor = dFront ? (dFront.armor + dMods.frontArmorBonus) : 0;
      log.push(`▸ Paso 1: Rear Guard atacante FP ${aRearFP} vs Front Line defensora Armor ${dFrontArmor}`);
      const diff1 = aRearFP - dFrontArmor;
      if (diff1 <= 0) {
        log.push(`  diff1 = ${diff1} → ninguna carta destruida (Rear Guard no se expone). Fin del ataque.`);
        step1Ended = true;
      } else {
        log.push(`  diff1 = ${diff1} → Front Line defensora destruida. Excedente = ${diff1}`);
        if (dFront) result.destroyed.defenderFront = true;
        excess = diff1;
        // En Caso A, la Rear Guard atacante ya cumplió su rol → no aporta Firepower adicional al Paso 2.
        // La variable `aRear` la nuleamos lógicamente para el paso 2.
      }
    } else {
      // Caso normal o Caso B: Front Line atacante existe
      const aFrontFP = aFront.firepower + aMods.frontFirepowerBonus;
      const dFrontArmor = dFront ? (dFront.armor + dMods.frontArmorBonus) : 0;

      if (aMods.autoDestroyFront && dFront) {
        log.push(`▸ Paso 1: Targeting Override → Front Line defensora destruida automáticamente. Atacante sobrevive. Sin excedente.`);
        result.destroyed.defenderFront = true;
        step1Ended = true;
        // Auto-destroy no genera excedente
      } else if (!dFront) {
        // Defensor con FL vacía → Armor 0
        log.push(`▸ Paso 1: Front Line defensora vacía (Armor 0). Atacante FP ${aFrontFP} pasa todo como excedente.`);
        excess = aFrontFP;
      } else {
        log.push(`▸ Paso 1: Front Line atacante FP ${aFrontFP} vs Front Line defensora Armor ${dFrontArmor}`);
        const diff1 = aFrontFP - dFrontArmor;
        if (diff1 < 0) {
          log.push(`  diff1 = ${diff1} → Front Line atacante destruida. Fin del ataque.`);
          result.destroyed.attackerFront = true;
          step1Ended = true;
        } else if (diff1 === 0) {
          log.push(`  diff1 = 0 → ambas Front Lines destruidas. Fin del ataque.`);
          result.destroyed.attackerFront = true;
          result.destroyed.defenderFront = true;
          step1Ended = true;
        } else {
          log.push(`  diff1 = ${diff1} → Front Line defensora destruida. Excedente = ${diff1}`);
          result.destroyed.defenderFront = true;
          excess = diff1;

          // Trampa Minefield del defensor: se activa cuando el atacante destruye la FL del defensor.
          if (defender.skill && defender.skill.card.id === SKILL_IDS.MINEFIELD && defender.skill.state === 'hidden') {
            // Verificar si el atacante tiene Cyberattack que cancele la trampa
            if (attacker.skill && attacker.skill.card.id === SKILL_IDS.CYBERATTACK && attacker.skill.state === 'hidden') {
              log.push(`🚫 Cyberattack del atacante cancela Minefield del defensor antes de aplicarse`);
              result.consumedSkills.push({ playerId: attackerId, skillId: SKILL_IDS.CYBERATTACK });
              result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_IDS.MINEFIELD });
            } else {
              log.push(`💣 Minefield del defensor se activa: Front Line atacante también destruida, excedente anulado`);
              result.destroyed.attackerFront = true;
              excess = 0;
              result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_IDS.MINEFIELD });
              step1Ended = true;
            }
          }
        }
      }
    }

    // ─── Paso 2: Ataque a Rear Guard / Vida ───
    if (!step1Ended && excess > 0 || (!step1Ended && excess === 0 && (aRear || aFront))) {
      // EMP Pulse: si la FL atacante destruyó la FL defensora, el excedente va directo a vida ignorando Armor RG.
      if (aMods.bypassRearArmor && excess > 0 && result.destroyed.defenderFront) {
        log.push(`▸ Paso 2: EMP Pulse → excedente ${excess} ignora Armor de Rear Guard defensora y va directo a vida`);
        result.lifeDamage += excess;
      } else {
        // Determinar aporte de Firepower de la Rear Guard atacante
        let aRearFP = 0;
        if (aRear && aFront) {
          // Caso normal: ambos slots atacantes presentes
          aRearFP = aRear.firepower;
        } else if (aRear && !aFront) {
          // Caso A ya manejado en Paso 1 (la Rear Guard asumió rol). No vuelve a atacar.
          aRearFP = 0;
        } else if (!aRear && aFront) {
          // Caso B: Rear Guard atacante vacía
          aRearFP = 0;
          log.push(`▸ Caso B: Rear Guard atacante vacía (Firepower 0)`);
        }

        const attackOnRear = aRearFP + excess;

        if (attackOnRear === 0) {
          // Nada que atacar
        } else if (dMods.rearInvulnerable) {
          log.push(`▸ Paso 2: Emergency Repulsors → Rear Guard defensora invulnerable, ataque (${attackOnRear}) anulado`);
        } else if (!defender.rearGuard) {
          // Defensor con RG vacía → Armor 0
          log.push(`▸ Paso 2: Rear Guard defensora vacía (Armor 0). attackOnRear ${attackOnRear} pasa todo a vida.`);
          result.lifeDamage += attackOnRear;
        } else {
          const dRearArmor = defender.rearGuard.armor + dMods.rearArmorBonus;
          log.push(`▸ Paso 2: attackOnRear ${attackOnRear} (RG ${aRearFP} + excedente ${excess}) vs Rear Guard defensora Armor ${dRearArmor}`);
          const diff2 = attackOnRear - dRearArmor;
          if (diff2 < 0) {
            log.push(`  diff2 = ${diff2} → Rear Guard defensora sobrevive. Atacante no se autodestruye. Fin del ataque.`);
          } else if (diff2 === 0) {
            log.push(`  diff2 = 0 → Rear Guard defensora destruida. Sin daño a vida.`);
            result.destroyed.defenderRear = true;
          } else {
            log.push(`  diff2 = ${diff2} → Rear Guard defensora destruida. Daño a vida: ${diff2}`);
            result.destroyed.defenderRear = true;
            result.lifeDamage += diff2;
          }
        }
      }
    }

    // En Double Shot la segunda pasada no acumula excedente del primero ni reusa las mismas variables.
    if (attackPasses > 1 && pass === 1) {
      log.push(`━━ Fin pasada 1, comienza pasada 2 con Firepower original ━━`);
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // Fase D: Aplicar Energy Shield (bloqueo de daño a vida)
  // ───────────────────────────────────────────────────────────────────
  if (dMods.blockLifeDamage && result.lifeDamage > 0) {
    log.push(`🛡 Energy Shield bloquea ${result.lifeDamage} puntos de daño a vida`);
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
        log.push(`🚫 Cyberattack del atacante cancela Trap Charge del defensor antes de aplicarse`);
        result.consumedSkills.push({ playerId: attackerId, skillId: SKILL_IDS.CYBERATTACK });
        result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_IDS.TRAP_CHARGE });
      } else {
        log.push(`⚡ Trap Charge del defensor se activa: +5 Firepower a su próximo ataque (efecto diferido)`);
        result.consumedSkills.push({ playerId: defenderId, skillId: SKILL_IDS.TRAP_CHARGE });
        result.newPendingEffects.push({ playerId: defenderId, type: 'trap_charge', value: 5 });
      }
    }
  }

  log.push(`▶ Ataque finalizado. Daño a vida: ${result.lifeDamage}`);

  return result;
}
