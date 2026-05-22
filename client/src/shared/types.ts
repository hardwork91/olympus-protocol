// ============================================================================
// Tipos compartidos cliente ↔ server-logic.
// MECÁNICA NUEVA (rama new-combat-mechanic):
//   - 5 unit slots en fila + 1 skill slot por jugador.
//   - Slots alineados verticalmente: tu slot N ↔ slot N del rival.
//   - 3 ataques por turno. Cada ataque: 1 atacante → 1 víctima.
//   - Subtipo determina el reach del ataque:
//       Assault    → Melee       (frente + 2 diagonales)
//       Tank       → Demolition  (solo frente directo)
//       Artillery  → Ranged      (cualquier slot enemigo)
//       Support    → no ataca; ability única por carta (buff/taunt/debuff)
// ============================================================================

// ─── Subtipos de carta ─────────────────────────────────────────────────────
export type UnitSubtype = 'Assault' | 'Tank' | 'Artillery' | 'Support';
export type SkillSubtype = 'Offensive' | 'Defensive' | 'Trap';

/** Tipo de ataque derivado del subtipo. Support no ataca → null. */
export type AttackType = 'melee' | 'demolition' | 'ranged';

/** Helper: ¿cuál es el reach de este subtipo? null si no ataca (Support). */
export function getAttackType(subtype: UnitSubtype): AttackType | null {
  switch (subtype) {
    case 'Assault':
      return 'melee';
    case 'Tank':
      return 'demolition';
    case 'Artillery':
      return 'ranged';
    case 'Support':
      return null;
  }
}

// ─── Cartas ────────────────────────────────────────────────────────────────
export type CardType = 'unit' | 'skill';

export interface UnitCard {
  readonly id: number;
  readonly instanceId: string;
  readonly type: 'unit';
  readonly name: string;
  readonly subtype: UnitSubtype;
  readonly firepower: number;
  readonly armor: number;
  /** Descripción de la ability (solo Support cards). Implementación en Fase D. */
  readonly ability?: string;
  readonly image?: string;
  readonly lore?: string;
}

export interface SkillCard {
  readonly id: number;
  readonly instanceId: string;
  readonly type: 'skill';
  readonly name: string;
  readonly subtype: SkillSubtype;
  readonly effect: string;
  readonly image?: string;
}

export type Card = UnitCard | SkillCard;

// ─── Slots ─────────────────────────────────────────────────────────────────

/** Número de slots de unidad por jugador. */
export const UNIT_SLOTS = 5;

/** Índice válido de slot de unidad (0..4). */
export type UnitSlotIndex = 0 | 1 | 2 | 3 | 4;

/** Referencia a un slot del tablero, para placeCard y validación. */
export type SlotRef =
  | { kind: 'unit'; index: UnitSlotIndex }
  | { kind: 'skill' }
  | { kind: 'skill_replace' };

/** Target de un ataque: un slot enemigo o la vida del rival. */
export type AttackTarget = { kind: 'unit'; index: UnitSlotIndex } | { kind: 'life' };

// ─── Jugador ───────────────────────────────────────────────────────────────
export type PlayerId = 1 | 2;

export type SkillState = 'hidden' | 'active' | 'consumed';

export interface PlayerSkill {
  card: SkillCard;
  state: SkillState;
}

export interface PendingEffect {
  type: string;
  value?: number;
}

export interface PlayerState {
  life: number;
  deck: Card[];
  hand: Card[];
  /** 5 slots de unidad. null = vacío. */
  units: (UnitCard | null)[];
  skill: PlayerSkill | null;
  pendingEffects: PendingEffect[];
}

// ─── Estado global del juego ───────────────────────────────────────────────
export type GamePhase = 'setup' | 'playing' | 'over';

export type SetupStep = 'mulligan_or_confirm' | 'placing' | 'done';

export interface SetupState {
  currentPlayer: PlayerId;
  step: SetupStep;
}

export interface TurnState {
  isReplacingSkill: boolean;
  skillReplacedThisTurn: boolean;
  drawnThisTurn: boolean;
  skillPlacedThisTurn: boolean;
  /** Ataques restantes este turno (inicia en 3). */
  attacksRemaining: number;
  /** instanceIds de unidades que ya atacaron este turno (cada unidad ataca máx 1 vez). */
  cardsAttackedThisTurn: string[];
}

export interface GameConfig {
  vidaInicial: number;
  maxTurnos: number;
  forceP1Start: boolean;
  /** Ataques por turno (default 3). */
  attacksPerTurn: number;
}

export interface Selection {
  1: string | null;
  2: string | null;
}

export interface LogEntry {
  turn: number;
  player: PlayerId | null;
  message: string;
}

export type GameOverReason = 'life' | 'turnLimit' | 'draw';

export interface GameOverStats {
  finalLife: { 1: number; 2: number };
  turnsPlayed: number;
}

export interface GameOverData {
  winner: PlayerId | null;
  reason: GameOverReason;
  stats: GameOverStats;
}

export interface SerializedGameState {
  config: GameConfig;
  phase: GamePhase;
  activePlayer: PlayerId | null;
  turnNumber: number;
  turnsInFullTurn: number;
  combatLog: LogEntry[];
  setupState: SetupState | null;
  turnState: TurnState | null;
  players: { 1: PlayerState; 2: PlayerState };
  gameOver: GameOverData | null;
  selection: Selection;
}

// ─── Resultado de un ataque individual ─────────────────────────────────────

export interface DestroyedRef {
  playerId: PlayerId;
  slotIndex: UnitSlotIndex;
}

export interface ConsumedSkillRef {
  playerId: PlayerId;
  skillId: number;
}

export interface NewPendingEffectRef {
  playerId: PlayerId;
  type: string;
  value: number;
}

export interface ConsumedPendingEffectRef {
  playerId: PlayerId;
  type: string;
}

/** Resultado de un solo ataque (1 atacante → 1 target). */
export interface AttackResult {
  log: string[];
  /** Slots destruidos por este ataque (atacante o defensor). */
  destroyed: DestroyedRef[];
  /** Daño a vida del defensor (no muta state, lo aplica el motor). */
  lifeDamage: number;
  /** Skills consumidas durante este ataque. */
  consumedSkills: ConsumedSkillRef[];
  /** Pending effects nuevos creados. */
  newPendingEffects: NewPendingEffectRef[];
  /** Pending effects que se consumieron al aplicarse. */
  consumedPendingEffects: ConsumedPendingEffectRef[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────
/** Devuelve el seat opuesto. */
export const otherPlayer = (id: PlayerId): PlayerId => (id === 1 ? 2 : 1);

/** Valida que un índice esté en rango 0..UNIT_SLOTS-1. */
export function isValidSlotIndex(n: number): n is UnitSlotIndex {
  return Number.isInteger(n) && n >= 0 && n < UNIT_SLOTS;
}

/**
 * Calcula los slots ENEMIGOS que un atacante puede alcanzar según su attackType.
 * - melee: frente directo + 2 diagonales
 * - demolition: solo frente directo
 * - ranged: todos los slots
 * Devuelve los índices de slot enemigo dentro de [0..UNIT_SLOTS-1].
 */
export function getReachableSlots(
  attackType: AttackType,
  attackerSlot: UnitSlotIndex,
): UnitSlotIndex[] {
  const result: UnitSlotIndex[] = [];
  if (attackType === 'ranged') {
    for (let i = 0; i < UNIT_SLOTS; i++) {
      if (isValidSlotIndex(i)) result.push(i);
    }
    return result;
  }
  // Frente directo (siempre alcanzable por melee y demolition)
  result.push(attackerSlot);
  if (attackType === 'melee') {
    // Diagonales: slot-1 y slot+1
    const left = attackerSlot - 1;
    const right = attackerSlot + 1;
    if (isValidSlotIndex(left)) result.push(left);
    if (isValidSlotIndex(right)) result.push(right);
  }
  return result;
}
