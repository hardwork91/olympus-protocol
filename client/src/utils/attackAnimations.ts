// ============================================================================
// attackAnimations — calcula qué números de daño mostrar cuando se declara
// un ataque. Se ejecuta localmente (antes del round-trip a Firebase) para
// que la animación sea instantánea al hacer click.
//
// Replica la misma lógica de bonuses que combat.ts (FP/AR) pero solo para
// determinar los valores visuales; el resultado autoritativo siempre viene
// del gameEngine.
// ============================================================================

import { SKILL_ID } from '@shared/cards';
import type { AttackTarget, PlayerId, SerializedGameState, UnitSlotIndex } from '@shared/types';
import { isValidSlotIndex, otherPlayer } from '@shared/types';

const HERMES_ID = 10;
const ATHENA_ID = 11;

export interface AttackAnimResult {
  /** Daño sobre la carta de la víctima (cantidad de armor absorbida o FP recibido). */
  slotDamage: { slotIndex: UnitSlotIndex; amount: number } | null;
  /** Daño excedente a la vida del defensor. */
  lifeDamage: number;
}

/**
 * Calcula localmente los valores de daño a mostrar en pantalla cuando
 * se declara un ataque. Tiene en cuenta skills activas y bonos de Support.
 */
export function computeAttackAnimations(
  state: SerializedGameState,
  attackerId: PlayerId,
  attackerSlot: UnitSlotIndex,
  target: AttackTarget,
): AttackAnimResult {
  const defenderId = otherPlayer(attackerId);
  const attackerCard = state.players[attackerId].units[attackerSlot];
  if (!attackerCard) return { slotDamage: null, lifeDamage: 0 };

  // ─── FP del atacante ──────────────────────────────────────────────
  let fp = attackerCard.firepower;
  let ignoreArmor = false;
  let autoDestroy = false;

  const attackerSkill = state.players[attackerId].skill;
  if (attackerSkill?.state === 'active') {
    if (attackerSkill.card.id === SKILL_ID.REACTOR_OVERLOAD) fp += 3;
    else if (attackerSkill.card.id === SKILL_ID.EMP_PULSE) ignoreArmor = true;
    else if (attackerSkill.card.id === SKILL_ID.TARGETING_OVERRIDE) autoDestroy = true;
  }

  // HERMES adyacente: +1 FP
  for (const delta of [-1, +1]) {
    const adj = attackerSlot + delta;
    if (isValidSlotIndex(adj)) {
      const adjCard = state.players[attackerId].units[adj as UnitSlotIndex];
      if (adjCard?.id === HERMES_ID) fp += 1;
    }
  }

  // TRAP_CHARGE pendiente: +FP
  const tc = state.players[attackerId].pendingEffects.find((e) => e.type === 'trap_charge');
  if (tc) fp += tc.value ?? 5;

  // ─── Ataque directo a vida ────────────────────────────────────────
  if (target.kind === 'life') {
    const defSkill = state.players[defenderId].skill;
    const blocked = defSkill?.state === 'active' && defSkill.card.id === SKILL_ID.ENERGY_SHIELD;
    return { slotDamage: null, lifeDamage: blocked ? 0 : fp };
  }

  // ─── Ataque a unidad ─────────────────────────────────────────────
  const victimCard = state.players[defenderId].units[target.index];
  if (!victimCard) return { slotDamage: null, lifeDamage: 0 };

  // REPULSORS: anula todo
  const defSkill = state.players[defenderId].skill;
  if (defSkill?.state === 'active' && defSkill.card.id === SKILL_ID.EMERGENCY_REPULSORS) {
    return { slotDamage: null, lifeDamage: 0 };
  }

  // TARGETING_OVERRIDE: destrucción automática — muestra la armor de la víctima
  if (autoDestroy) {
    const shown = victimCard.armor > 0 ? victimCard.armor : fp;
    return { slotDamage: { slotIndex: target.index, amount: shown }, lifeDamage: 0 };
  }

  // ─── AR del defensor ──────────────────────────────────────────────
  let effectiveAr = ignoreArmor ? 0 : victimCard.armor;

  if (!ignoreArmor) {
    if (defSkill?.state === 'active' && defSkill.card.id === SKILL_ID.REINFORCEMENT_PROTOCOL) {
      effectiveAr += 2;
    }
    // ATHENA adyacente: +2 AR
    for (const delta of [-1, +1]) {
      const adj = target.index + delta;
      if (isValidSlotIndex(adj)) {
        const adjCard = state.players[defenderId].units[adj as UnitSlotIndex];
        if (adjCard?.id === ATHENA_ID) effectiveAr += 2;
      }
    }
  }

  // ─── Calcular montos a mostrar ────────────────────────────────────
  // slotDamage = cuánto absorbió la unidad (min(FP, effectiveAr))
  // lifeDamage = excedente (max(0, FP - effectiveAr))
  const slotDamageAmount = Math.min(fp, effectiveAr);
  const lifeDamageAmount = Math.max(0, fp - effectiveAr);

  return {
    slotDamage: slotDamageAmount > 0 ? { slotIndex: target.index, amount: slotDamageAmount } : null,
    lifeDamage: lifeDamageAmount,
  };
}
