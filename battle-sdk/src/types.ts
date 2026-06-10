export type MapType = 'grid' | 'hex';

export type TerrainType = 'plain' | 'forest' | 'mountain' | 'water' | 'wall' | 'swamp' | 'lava' | 'ice';

export type DamageType = 'physical' | 'magical' | 'true' | 'fire' | 'ice' | 'lightning' | 'poison';

export type ActionType = 'move' | 'attack' | 'skill' | 'wait' | 'summon';

export type StatusEffectType = 'buff' | 'debuff' | 'dot' | 'hot' | 'shield' | 'stun' | 'root' | 'silence';

export type TeamId = string;
export type UnitId = string;
export type SkillId = string;

export interface GridPosition {
  x: number;
  y: number;
}

export interface HexPosition {
  q: number;
  r: number;
  s: number;
}

export type Position = GridPosition | HexPosition;

export function isGridPosition(pos: Position): pos is GridPosition {
  return 'x' in pos && 'y' in pos;
}

export function isHexPosition(pos: Position): pos is HexPosition {
  return 'q' in pos && 'r' in pos && 's' in pos;
}

export interface TerrainConfig {
  type: TerrainType;
  moveCost: number;
  defenseBonus: number;
  attackBonus: number;
  avoidBonus: number;
  isObstacle: boolean;
  blocksVision: boolean;
  healingPerTurn: number;
  damagePerTurn: number;
}

export interface TerrainTile {
  position: Position;
  terrain: TerrainConfig;
}

export interface SkillTargetType {
  type: 'self' | 'ally' | 'enemy' | 'any' | 'area' | 'direction';
  range: number;
  aoeRadius: number;
  aoeShape: 'circle' | 'cross' | 'line' | 'cone';
  lineOfSight: boolean;
}

export interface SkillEffect {
  damageType: DamageType;
  baseDamage: number;
  scalingStat: keyof UnitStats;
  scalingRatio: number;
  healAmount: number;
  shieldAmount: number;
  statusEffects: StatusEffectTemplate[];
  summonTemplateId: string;
  summonPosition: 'self' | 'target' | 'adjacent';
}

export interface SkillTemplate {
  id: SkillId;
  name: string;
  description: string;
  actionPointCost: number;
  cooldown: number;
  targetType: SkillTargetType;
  effects: SkillEffect[];
  requiresTerrain: TerrainType[];
  forbiddenTerrain: TerrainType[];
}

export interface StatusEffectTemplate {
  type: StatusEffectType;
  name: string;
  duration: number;
  damagePerTick: number;
  healPerTick: number;
  shieldAmount: number;
  statModifier: Partial<UnitStats>;
  stun: boolean;
  root: boolean;
  silence: boolean;
  tickInterval: number;
}

export interface UnitStats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  magicAttack: number;
  magicDefense: number;
  speed: number;
  moveRange: number;
  attackRange: number;
  actionPoints: number;
  maxActionPoints: number;
  critRate: number;
  critDamage: number;
  avoidRate: number;
}

export interface UnitTemplate {
  id: string;
  name: string;
  team: TeamId;
  stats: UnitStats;
  skills: SkillId[];
  tags: string[];
  isSummon: boolean;
  summonDuration: number;
  priority: number;
}

export interface StatusEffectInstance {
  id: string;
  template: StatusEffectTemplate;
  remainingDuration: number;
  remainingTicks: number;
  sourceUnitId: UnitId;
  appliedAtTurn: number;
}

export interface Unit {
  id: UnitId;
  templateId: string;
  name: string;
  team: TeamId;
  position: Position;
  stats: UnitStats;
  skills: SkillId[];
  statusEffects: StatusEffectInstance[];
  tags: string[];
  isAlive: boolean;
  isSummon: boolean;
  summonDuration: number;
  summonTurn: number;
  cooldowns: Record<SkillId, number>;
  priority: number;
  hasActed: boolean;
}

export interface Action {
  type: ActionType;
  unitId: UnitId;
  targetPosition: Position;
  skillId: SkillId;
  targetUnitIds: UnitId[];
}

export interface DamageResult {
  targetId: UnitId;
  damageType: DamageType;
  rawDamage: number;
  shieldAbsorbed: number;
  defenseReduced: number;
  terrainBonus: number;
  finalDamage: number;
  isCrit: boolean;
  isKillingBlow: boolean;
}

export interface HealResult {
  targetId: UnitId;
  healAmount: number;
  overheal: number;
}

export interface ActionResult {
  action: Action;
  damageResults: DamageResult[];
  healResults: HealResult[];
  shieldResults: ShieldResult[];
  statusEffectsApplied: StatusEffectInstance[];
  unitsMoved: { unitId: UnitId; from: Position; to: Position }[];
  unitsDied: UnitId[];
  unitsSummoned: UnitId[];
  actionPointSpent: number;
}

export interface ShieldResult {
  targetId: UnitId;
  shieldAmount: number;
  totalShield: number;
}

export interface BattleEvent {
  id: string;
  turn: number;
  phase: BattlePhase;
  timestamp: number;
  type: string;
  data: Record<string, unknown>;
}

export type BattlePhase = 'start' | 'turnStart' | 'action' | 'turnEnd' | 'end';

export type WinCondition =
  | { type: 'eliminateAll' }
  | { type: 'eliminateTeam'; team: TeamId }
  | { type: 'reachPosition'; team: TeamId; position: Position }
  | { type: 'surviveTurns'; team: TeamId; turns: number }
  | { type: 'protectUnit'; unitId: UnitId }
  | { type: 'custom'; check: (battle: BattleSnapshot) => TeamId | null };

export interface BattleSnapshot {
  turn: number;
  phase: BattlePhase;
  units: Unit[];
  terrainTiles: TerrainTile[];
  mapType: MapType;
  mapWidth: number;
  mapHeight: number;
  events: BattleEvent[];
  winner: TeamId | null;
  randomState: number;
}

export interface BattleConfig {
  mapType: MapType;
  mapWidth: number;
  mapHeight: number;
  maxTurns: number;
  seed: number;
  winConditions: WinCondition[];
  terrainTiles: TerrainTile[];
  defaultTerrain: TerrainConfig;
  unitTemplates: UnitTemplate[];
  skillTemplates: SkillTemplate[];
  actionPointsPerTurn: number;
  allowUndo: boolean;
  teamOrder: TeamId[];
}

export interface MovementRangeResult {
  reachable: Position[];
  paths: Map<string, Position[]>;
  costs: Map<string, number>;
}

export interface AttackRangeResult {
  inRange: Position[];
  unitsInRange: UnitId[];
}

export interface UndoSnapshot {
  units: Unit[];
  turn: number;
  phase: BattlePhase;
  events: BattleEvent[];
  randomState: number;
}

export interface ReplayData {
  version: string;
  config: BattleConfig;
  events: BattleEvent[];
  seed: number;
  duration: number;
}

export interface AISuggestion {
  action: Action;
  score: number;
  reasoning: string;
}

export interface SerializedBattle {
  version: string;
  config: BattleConfig;
  snapshot: BattleSnapshot;
  undoStack: UndoSnapshot[];
}
