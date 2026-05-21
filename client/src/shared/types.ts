// ============================================================================
// Tipos compartidos cliente ↔ server-logic (futuro backend).
// Esta es la "fuente de verdad" del modelo de datos del juego.
// ============================================================================

// ─── Subtipos de carta ─────────────────────────────────────────────────────
export type UnitSubtype = 'Assault' | 'Tank' | 'Artillery' | 'Support';
export type SkillSubtype = 'Offensive' | 'Defensive' | 'Trap';

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
export type SlotName = 'frontLine' | 'rearGuard' | 'skill';

/** Slot indicator usado en validSlotsFor() / placeCard().
 *  `'skill_replace'` no es un slot físico, indica reemplazo de la skill ya colocada. */
export type SlotIndicator = SlotName | 'skill_replace';

// ─── Jugador ───────────────────────────────────────────────────────────────
export type PlayerId = 1 | 2;

export type SkillState = 'hidden' | 'active' | 'consumed';

export interface PlayerSkill {
  card: SkillCard;
  state: SkillState;
}

/** Efecto diferido en el jugador (ej. Trap Charge → +5 Firepower próximo ataque). */
export interface PendingEffect {
  type: 'trap_charge';
  value?: number;
}

export interface PlayerState {
  life: number;
  deck: Card[];
  hand: Card[];
  frontLine: UnitCard | null;
  rearGuard: UnitCard | null;
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
}

export interface GameConfig {
  vidaInicial: number;
  maxTurnos: number;
  forceP1Start: boolean;
}

export interface Selection {
  1: string | null;
  2: string | null;
}

/** Entrada del log de combate. Se persiste con esta forma en Firebase. */
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

/** Estado JSON-safe que se persiste en Firebase y se reconstruye en el cliente. */
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

// ─── Resultado del combate ─────────────────────────────────────────────────
export interface DestroyedSlots {
  attackerFront: boolean;
  attackerRear: boolean;
  defenderFront: boolean;
  defenderRear: boolean;
}

export interface ConsumedSkillRef {
  playerId: PlayerId;
  skillId: number;
}

export interface NewPendingEffectRef {
  playerId: PlayerId;
  type: PendingEffect['type'];
  value: number;
}

export interface ConsumedPendingEffectRef {
  playerId: PlayerId;
  type: PendingEffect['type'];
}

export interface AttackResult {
  log: string[];
  destroyed: DestroyedSlots;
  lifeDamage: number;
  consumedSkills: ConsumedSkillRef[];
  newPendingEffects: NewPendingEffectRef[];
  consumedPendingEffects: ConsumedPendingEffectRef[];
}

// ─── Helpers de tipos ──────────────────────────────────────────────────────
/** Devuelve el seat opuesto. Útil en muchísimas reglas. */
export const otherPlayer = (id: PlayerId): PlayerId => (id === 1 ? 2 : 1);
