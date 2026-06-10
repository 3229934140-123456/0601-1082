import {
  BattleConfig,
  BattleSnapshot,
  BattlePhase,
  Action,
  ActionResult,
  UnitTemplate,
  Position,
  ReplayRecord,
} from '../types';
import { ConfigLoader } from '../config';
import { SeededRandom } from '../random';
import { GridMap } from '../map/grid-map';
import { HexMap } from '../map/hex-map';
import { BattleMap, isGridMap } from '../map/index';
import { UnitManager, resetUnitIdCounter } from '../unit/unit-manager';
import { TurnManager } from '../turn/turn-manager';
import { SkillResolver } from '../skill/resolver';
import { BattleLogger } from './logger';

export interface ReplayStep {
  index: number;
  record: ReplayRecord;
  snapshotAfter: BattleSnapshot;
}

export class ReplayEngine {
  private config: BattleConfig;
  private configLoader: ConfigLoader;
  private records: ReplayRecord[] = [];

  constructor(config: BattleConfig) {
    this.configLoader = new ConfigLoader();
    this.config = this.configLoader.loadConfig(config);
  }

  loadRecords(records: ReplayRecord[]): void {
    this.records = records.map(r => {
      const copy: ReplayRecord = { type: r.type, turn: r.turn, phase: r.phase };
      if (r.action) copy.action = { ...r.action };
      if (r.result) copy.result = { ...r.result };
      if (r.unitId) copy.unitId = r.unitId;
      if (r.winner !== undefined) copy.winner = r.winner;
      return copy;
    });
  }

  loadRecordedActions(actions: { turn: number; phase: BattlePhase; action: Action; result: ActionResult }[]): void {
    this.records = actions.map(a => ({
      type: 'action' as const,
      turn: a.turn,
      phase: a.phase,
      action: { ...a.action },
      result: { ...a.result },
    }));
  }

  getRecordCount(): number {
    return this.records.length;
  }

  getActionCount(): number {
    return this.records.filter(r => r.type === 'action').length;
  }

  replayToStep(stepIndex: number): BattleSnapshot | null {
    if (stepIndex < 0 || stepIndex > this.records.length) return null;

    const { map, unitManager, turnManager, random, logger, skillResolver } = this.createInitialState();

    for (let i = 0; i < stepIndex && i < this.records.length; i++) {
      const record = this.records[i];
      this.applyRecord(record, map, unitManager, turnManager, random, logger, skillResolver);
    }

    return this.buildSnapshot(map, unitManager, turnManager, random, logger);
  }

  replayAllSteps(): ReplayStep[] {
    const steps: ReplayStep[] = [];
    const { map, unitManager, turnManager, random, logger, skillResolver } = this.createInitialState();

    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i];
      this.applyRecord(record, map, unitManager, turnManager, random, logger, skillResolver);
      const snapshot = this.buildSnapshot(map, unitManager, turnManager, random, logger);
      steps.push({ index: i, record, snapshotAfter: snapshot });
    }

    return steps;
  }

  private createInitialState(): {
    map: BattleMap;
    unitManager: UnitManager;
    turnManager: TurnManager;
    random: SeededRandom;
    logger: BattleLogger;
    skillResolver: SkillResolver;
  } {
    const random = new SeededRandom(this.config.seed);
    resetUnitIdCounter();

    let map: BattleMap;
    if (this.config.mapType === 'hex') {
      map = new HexMap(
        this.config.mapWidth,
        this.config.mapHeight,
        this.config.defaultTerrain,
        this.config.terrainTiles,
      );
    } else {
      map = new GridMap(
        this.config.mapWidth,
        this.config.mapHeight,
        this.config.defaultTerrain,
        this.config.terrainTiles,
      );
    }

    const unitManager = new UnitManager();
    for (const template of this.config.unitTemplates) {
      const startPos = this.findStartPosition(map, unitManager, template);
      if (startPos) {
        unitManager.createUnit(template, startPos);
      }
    }

    const turnManager = new TurnManager(
      this.config.maxTurns,
      this.config.actionPointsPerTurn,
      this.config.teamOrder,
      random,
    );

    const logger = new BattleLogger();
    const skillResolver = new SkillResolver(map, unitManager, random, this.configLoader, 1);

    return { map, unitManager, turnManager, random, logger, skillResolver };
  }

  private applyRecord(
    record: ReplayRecord,
    map: BattleMap,
    unitManager: UnitManager,
    turnManager: TurnManager,
    random: SeededRandom,
    logger: BattleLogger,
    skillResolver: SkillResolver,
  ): void {
    switch (record.type) {
      case 'battleStart':
        logger.logBattleStart();
        break;

      case 'turnStart':
        turnManager.startTurn(unitManager);
        skillResolver.setCurrentTurn(turnManager.getCurrentTurn());
        break;

      case 'nextUnit':
        turnManager.nextUnit(unitManager);
        skillResolver.setCurrentTurn(turnManager.getCurrentTurn());
        break;

      case 'action':
        if (!record.action || !record.result) break;
        const skillTemplate = record.action.skillId
          ? this.configLoader.getSkillTemplate(record.action.skillId)
          : undefined;

        skillResolver.setCurrentTurn(turnManager.getCurrentTurn());
        skillResolver.resolveAction(record.action, skillTemplate);

        const unit = unitManager.getUnit(record.action.unitId);
        if (unit) {
          unit.stats.actionPoints -= record.result.actionPointSpent;
        }

        logger.logAction(turnManager.getCurrentTurn(), record.result);

        for (const diedId of record.result.unitsDied) {
          logger.logUnitDeath(turnManager.getCurrentTurn(), diedId);
        }

        for (const summonedId of record.result.unitsSummoned) {
          logger.logSummon(turnManager.getCurrentTurn(), summonedId, record.action.unitId);
        }

        const snap = this.buildSnapshot(map, unitManager, turnManager, random, logger);
        turnManager.checkWinCondition(this.config.winConditions, snap);
        break;

      case 'turnEnd':
        break;

      case 'battleEnd':
        if (record.winner) {
          logger.logBattleEnd(record.winner);
        }
        break;
    }
  }

  private buildSnapshot(
    map: BattleMap,
    unitManager: UnitManager,
    turnManager: TurnManager,
    random: SeededRandom,
    logger: BattleLogger,
  ): BattleSnapshot {
    const turnState = turnManager.getState();
    return {
      turn: turnManager.getCurrentTurn(),
      phase: turnManager.getPhase(),
      units: unitManager.getAllUnits(),
      terrainTiles: isGridMap(map) ? (map as GridMap).getTerrainTiles() : (map as HexMap).getTerrainTiles(),
      mapType: this.config.mapType,
      mapWidth: this.config.mapWidth,
      mapHeight: this.config.mapHeight,
      events: logger.getEvents(),
      winner: turnManager.getWinner(),
      randomState: random.getState(),
      currentUnitIndex: turnState.currentUnitIndex,
      turnOrder: turnState.turnOrder,
    };
  }

  private findStartPosition(map: BattleMap, unitManager: UnitManager, template: UnitTemplate): Position | null {
    const positions = map.getAllPositions();
    for (const pos of positions) {
      if (map.isPassable(pos) && !unitManager.getUnitAtPosition(pos)) {
        return pos;
      }
    }
    return positions.length > 0 ? positions[0] : null;
  }
}
