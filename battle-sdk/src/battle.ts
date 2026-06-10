import {
  BattleConfig,
  BattleSnapshot,
  BattlePhase,
  Action,
  ActionResult,
  Unit,
  UnitId,
  UnitTemplate,
  TeamId,
  Position,
  SkillId,
  SkillTemplate,
  MovementRangeResult,
  AttackRangeResult,
  AISuggestion,
  ReplayData,
  WinCondition,
  TerrainConfig,
  TerrainTile,
  UndoSnapshot,
  StatusEffectInstance,
} from './types';
import { ValidationResult as ValidationResult } from './action/validator';
import { ConfigLoader } from './config';
import { SeededRandom } from './random';
import { GridMap } from './map/grid-map';
import { HexMap } from './map/hex-map';
import { BattleMap, isGridMap } from './map/index';
import { UnitManager, resetUnitIdCounter } from './unit/unit-manager';
import { StatusEffectManager } from './unit/status-effect';
import { TurnManager, TurnOrderEntry } from './turn/turn-manager';
import { MovementCalculator } from './action/movement';
import { AttackCalculator } from './action/attack';
import { ActionValidator } from './action/validator';
import { UndoManager } from './action/undo';
import { SkillResolver } from './skill/resolver';
import { BattleLogger } from './event/logger';
import { ReplayManager } from './event/replay';
import { BattleSerializer } from './serialize';
import { AIAdvisor } from './ai/advisor';

export class Battle {
  private config: BattleConfig;
  private configLoader: ConfigLoader;
  private map: BattleMap;
  private unitManager: UnitManager;
  private turnManager: TurnManager;
  private random: SeededRandom;
  private skillResolver: SkillResolver;
  private actionValidator: ActionValidator;
  private movementCalc: MovementCalculator;
  private attackCalc: AttackCalculator;
  private undoManager: UndoManager;
  private logger: BattleLogger;
  private replayManager: ReplayManager;
  private serializer: BattleSerializer;
  private aiAdvisor: AIAdvisor;
  private initialized: boolean = false;

  constructor() {
    this.configLoader = new ConfigLoader();
    this.config = this.configLoader.loadConfig({});
    this.random = new SeededRandom(0);
    this.map = new GridMap(0, 0, this.config.defaultTerrain);
    this.unitManager = new UnitManager();
    this.turnManager = new TurnManager(0, 0, [], this.random);
    this.skillResolver = new SkillResolver(this.map, this.unitManager, this.random, this.configLoader);
    this.actionValidator = new ActionValidator(this.map, this.unitManager);
    this.movementCalc = new MovementCalculator(this.map, this.unitManager);
    this.attackCalc = new AttackCalculator(this.map, this.unitManager);
    this.undoManager = new UndoManager();
    this.logger = new BattleLogger();
    this.replayManager = new ReplayManager();
    this.serializer = new BattleSerializer();
    this.aiAdvisor = new AIAdvisor(this.map, this.unitManager, this.configLoader);
  }

  init(config: Partial<BattleConfig>): string[] {
    this.config = this.configLoader.loadConfig(config);
    const errors = this.configLoader.validateConfig(this.config);
    if (errors.length > 0) return errors;

    this.random = new SeededRandom(this.config.seed);
    resetUnitIdCounter();

    if (this.config.mapType === 'hex') {
      this.map = new HexMap(
        this.config.mapWidth,
        this.config.mapHeight,
        this.config.defaultTerrain,
        this.config.terrainTiles,
      );
    } else {
      this.map = new GridMap(
        this.config.mapWidth,
        this.config.mapHeight,
        this.config.defaultTerrain,
        this.config.terrainTiles,
      );
    }

    this.unitManager = new UnitManager();

    for (const template of this.config.unitTemplates) {
      const startPos = this.findStartPosition(template);
      if (startPos) {
        this.unitManager.createUnit(template, startPos);
      }
    }

    this.turnManager = new TurnManager(
      this.config.maxTurns,
      this.config.actionPointsPerTurn,
      this.config.teamOrder,
      this.random,
    );

    this.rebuildSubsystems();

    this.undoManager = new UndoManager(this.config.allowUndo);
    this.logger.clear();
    this.replayManager.clear();
    this.logger.logBattleStart();
    this.initialized = true;

    return [];
  }

  private findStartPosition(template: UnitTemplate): Position | null {
    const positions = this.map.getAllPositions();
    for (const pos of positions) {
      if (this.map.isPassable(pos) && !this.unitManager.getUnitAtPosition(pos)) {
        return pos;
      }
    }
    return null;
  }

  private rebuildSubsystems(): void {
    this.skillResolver = new SkillResolver(this.map, this.unitManager, this.random, this.configLoader);
    this.actionValidator = new ActionValidator(this.map, this.unitManager);
    this.movementCalc = new MovementCalculator(this.map, this.unitManager);
    this.attackCalc = new AttackCalculator(this.map, this.unitManager);
    this.aiAdvisor = new AIAdvisor(this.map, this.unitManager, this.configLoader);
  }

  startBattle(): TurnOrderEntry | null {
    this.ensureInitialized();
    return this.turnManager.startTurn(this.unitManager);
  }

  nextUnit(): TurnOrderEntry | null {
    this.ensureInitialized();
    const result = this.turnManager.nextUnit(this.unitManager);

    if (result === null) {
      this.processEndOfRoundTerrainEffects();
    }

    return result;
  }

  private processEndOfRoundTerrainEffects(): void {
    const alive = this.unitManager.getAliveUnits();
    const terrainDeaths: UnitId[] = [];

    for (const unit of alive) {
      const terrain = this.map.getTerrain(unit.position);

      if (terrain.damagePerTurn > 0) {
        const damage = terrain.damagePerTurn;
        const actualDamage = this.unitManager.applyDamage(unit.id, damage, 'true');
        if (actualDamage > 0) {
          this.logger.log(this.turnManager.getCurrentTurn(), 'turnEnd', 'terrain_damage', {
            unitId: unit.id,
            terrainType: terrain.type,
            damage: actualDamage,
          });
          if (!this.unitManager.getUnit(unit.id)?.isAlive) {
            terrainDeaths.push(unit.id);
          }
        }
      }

      if (terrain.healingPerTurn > 0 && this.unitManager.getUnit(unit.id)?.isAlive) {
        const healed = this.unitManager.applyHeal(unit.id, terrain.healingPerTurn);
        if (healed > 0) {
          this.logger.log(this.turnManager.getCurrentTurn(), 'turnEnd', 'terrain_heal', {
            unitId: unit.id,
            terrainType: terrain.type,
            heal: healed,
          });
        }
      }
    }

    for (const diedId of terrainDeaths) {
      this.logger.logUnitDeath(this.turnManager.getCurrentTurn(), diedId);
    }

    if (terrainDeaths.length > 0) {
      const snapshot = this.getSnapshot();
      const winner = this.turnManager.checkWinCondition(this.config.winConditions, snapshot);
      if (winner) {
        this.logger.logBattleEnd(winner);
      }
    }
  }

  executeAction(action: Action): ActionResult {
    this.ensureInitialized();

    const skillTemplate = action.skillId
      ? this.configLoader.getSkillTemplate(action.skillId)
      : undefined;

    const validation = this.actionValidator.validateAction(action, skillTemplate);
    if (!validation.valid) {
      return {
        action,
        damageResults: [],
        healResults: [],
        shieldResults: [],
        statusEffectsApplied: [],
        unitsMoved: [],
        unitsDied: [],
        unitsSummoned: [],
        actionPointSpent: 0,
      };
    }

    this.undoManager.pushSnapshot(
      this.unitManager,
      this.turnManager,
      this.logger.getEvents(),
      this.random.getState(),
      this.replayManager.getRecordedActionCount(),
    );

    const result = this.skillResolver.resolveAction(action, skillTemplate);

    const unit = this.unitManager.getUnit(action.unitId);
    if (unit) {
      unit.stats.actionPoints -= result.actionPointSpent;
    }

    this.logger.logAction(this.turnManager.getCurrentTurn(), result);
    this.replayManager.record(
      this.turnManager.getCurrentTurn(),
      this.turnManager.getPhase(),
      action,
      result,
    );

    for (const diedId of result.unitsDied) {
      this.logger.logUnitDeath(this.turnManager.getCurrentTurn(), diedId);
    }

    for (const summonedId of result.unitsSummoned) {
      this.logger.logSummon(this.turnManager.getCurrentTurn(), summonedId, action.unitId);
    }

    const snapshot = this.getSnapshot();
    const winner = this.turnManager.checkWinCondition(this.config.winConditions, snapshot);
    if (winner) {
      this.logger.logBattleEnd(winner);
    }

    return result;
  }

  getMovementRange(unitId: UnitId): MovementRangeResult {
    this.ensureInitialized();
    return this.movementCalc.calculateMovableRange(unitId);
  }

  getAttackRange(unitId: UnitId, skillId?: SkillId): AttackRangeResult {
    this.ensureInitialized();
    const template = skillId ? this.configLoader.getSkillTemplate(skillId) : undefined;
    return this.attackCalc.getAttackRange(unitId, skillId, template);
  }

  validateAction(action: Action): ValidationResult {
    this.ensureInitialized();
    const skillTemplate = action.skillId
      ? this.configLoader.getSkillTemplate(action.skillId)
      : undefined;
    return this.actionValidator.validateAction(action, skillTemplate);
  }

  undo(): boolean {
    this.ensureInitialized();
    const snapshot = this.undoManager.undo();
    if (!snapshot) return false;

    this.unitManager = new UnitManager();
    for (const u of snapshot.units) {
      this.unitManager.restoreUnitFromSnapshot(u);
    }

    this.random.setState(snapshot.randomState);

    this.turnManager.restoreState({
      currentTurn: snapshot.turn,
      phase: snapshot.phase,
      currentUnitIndex: snapshot.currentUnitIndex,
      turnOrder: snapshot.turnOrder,
      winner: snapshot.winner,
    });

    this.logger.restoreEvents(snapshot.events);

    this.replayManager.truncateTo(snapshot.recordedActionCount);

    this.rebuildSubsystems();
    return true;
  }

  canUndo(): boolean {
    return this.undoManager.canUndo();
  }

  previewUndo(): UndoSnapshot | null {
    return this.undoManager.previewUndo();
  }

  summonUnit(templateId: string, position: Position): Unit | null {
    this.ensureInitialized();
    const template = this.configLoader.getUnitTemplate(templateId);
    if (!template) return null;

    const occupant = this.unitManager.getUnitAtPosition(position);
    if (occupant && occupant.isAlive) return null;
    if (!this.map.isPassable(position)) return null;

    const unit = this.unitManager.summonUnit(template, position, this.turnManager.getCurrentTurn());
    this.logger.logSummon(this.turnManager.getCurrentTurn(), unit.id, '');
    return unit;
  }

  getUnit(id: UnitId): Unit | undefined {
    return this.unitManager.getUnit(id);
  }

  getAliveUnits(): Unit[] {
    return this.unitManager.getAliveUnits();
  }

  getTeamUnits(team: TeamId): Unit[] {
    return this.unitManager.getTeamUnits(team);
  }

  getCurrentTurn(): number {
    return this.turnManager.getCurrentTurn();
  }

  getPhase(): BattlePhase {
    return this.turnManager.getPhase();
  }

  getTurnOrder(): TurnOrderEntry[] {
    return this.turnManager.getTurnOrder();
  }

  getCurrentUnitId(): UnitId | null {
    return this.turnManager.getCurrentUnitId();
  }

  getWinner(): TeamId | null {
    return this.turnManager.getWinner();
  }

  isBattleOver(): boolean {
    return this.turnManager.isBattleOver();
  }

  getEffectiveStats(unitId: UnitId): import('./types').UnitStats {
    return this.unitManager.getEffectiveStats(unitId);
  }

  getSnapshot(): BattleSnapshot {
    return {
      turn: this.turnManager.getCurrentTurn(),
      phase: this.turnManager.getPhase(),
      units: this.unitManager.getAllUnits(),
      terrainTiles: isGridMap(this.map) ? this.map.getTerrainTiles() : (this.map as HexMap).getTerrainTiles(),
      mapType: this.config.mapType,
      mapWidth: this.config.mapWidth,
      mapHeight: this.config.mapHeight,
      events: this.logger.getEvents(),
      winner: this.turnManager.getWinner(),
      randomState: this.random.getState(),
    };
  }

  getBattleLog(): import('./types').BattleEvent[] {
    return this.logger.getEvents();
  }

  exportReplay(): ReplayData {
    return this.replayManager.exportReplay(this.config, this.logger);
  }

  exportReplayJson(): string {
    return this.replayManager.exportReplayJson(this.config, this.logger);
  }

  importReplay(json: string): ReplayData {
    return this.replayManager.importReplay(json);
  }

  serialize(): string {
    return this.serializer.serialize(
      this.config,
      this.getSnapshot(),
      this.undoManager.getStack(),
    );
  }

  deserialize(json: string): boolean {
    try {
      const data = this.serializer.deserialize(json);
      this.config = data.config;
      this.configLoader.loadConfig(data.config);
      this.random = new SeededRandom(data.config.seed);
      this.random.setState(data.snapshot.randomState);

      if (this.config.mapType === 'hex') {
        this.map = new HexMap(
          this.config.mapWidth,
          this.config.mapHeight,
          this.config.defaultTerrain,
          this.config.terrainTiles,
        );
      } else {
        this.map = new GridMap(
          this.config.mapWidth,
          this.config.mapHeight,
          this.config.defaultTerrain,
          this.config.terrainTiles,
        );
      }

      this.unitManager = new UnitManager();
      for (const u of data.snapshot.units) {
        this.unitManager.restoreUnitFromSnapshot(u);
      }

      this.turnManager = new TurnManager(
        this.config.maxTurns,
        this.config.actionPointsPerTurn,
        this.config.teamOrder,
        this.random,
      );

      this.turnManager.restoreState({
        currentTurn: data.snapshot.turn,
        phase: data.snapshot.phase,
        currentUnitIndex: 0,
        turnOrder: this.turnManager.getTurnOrder(),
        winner: data.snapshot.winner,
      });

      this.turnManager.calculateTurnOrder(this.unitManager.getAliveUnits());

      this.rebuildSubsystems();

      this.logger.clear();
      this.logger.restoreEvents(data.snapshot.events);

      this.replayManager.clear();

      this.undoManager = new UndoManager(this.config.allowUndo);

      this.initialized = true;
      return true;
    } catch {
      return false;
    }
  }

  getAISuggestions(unitId: UnitId, topN?: number): AISuggestion[] {
    this.ensureInitialized();
    return this.aiAdvisor.getSuggestions(unitId, topN);
  }

  getTerrain(pos: Position): TerrainConfig {
    return this.map.getTerrain(pos);
  }

  setTerrain(pos: Position, terrain: TerrainConfig): void {
    this.map.setTerrain(pos, terrain);
  }

  isPassable(pos: Position): boolean {
    return this.map.isPassable(pos);
  }

  getLineOfSight(from: Position, to: Position): boolean {
    return this.map.getLineOfSight(from, to);
  }

  registerUnitTemplate(template: UnitTemplate): void {
    this.configLoader.registerUnitTemplate(template);
  }

  registerSkillTemplate(template: SkillTemplate): void {
    this.configLoader.registerSkillTemplate(template);
  }

  registerTerrainPreset(name: string, config: TerrainConfig): void {
    this.configLoader.registerTerrainPreset(name, config);
  }

  getConfig(): BattleConfig {
    return { ...this.config };
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Battle not initialized. Call init() first.');
    }
  }
}
