import {
  BattleConfig,
  BattleSnapshot,
  BattlePhase,
  Action,
  ActionResult,
  UnitTemplate,
  Position,
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
  action: Action;
  result: ActionResult;
  snapshotAfter: BattleSnapshot;
}

export class ReplayEngine {
  private config: BattleConfig;
  private configLoader: ConfigLoader;
  private actions: { turn: number; phase: BattlePhase; action: Action; result: ActionResult }[];

  constructor(config: BattleConfig) {
    this.configLoader = new ConfigLoader();
    this.config = this.configLoader.loadConfig(config);
    this.actions = [];
  }

  loadActions(actions: { turn: number; phase: BattlePhase; action: Action; result: ActionResult }[]): void {
    this.actions = actions.map(a => ({
      turn: a.turn,
      phase: a.phase,
      action: { ...a.action },
      result: { ...a.result },
    }));
  }

  getActionCount(): number {
    return this.actions.length;
  }

  replayToStep(stepIndex: number): BattleSnapshot | null {
    if (stepIndex < 0 || stepIndex > this.actions.length) return null;

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
      const startPos = this.findStartPosition(map, template);
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
    logger.logBattleStart();

    const skillResolver = new SkillResolver(map, unitManager, random, this.configLoader, 1);

    turnManager.startTurn(unitManager);

    for (let i = 0; i < stepIndex && i < this.actions.length; i++) {
      const record = this.actions[i];
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

      const nextEntry = turnManager.nextUnit(unitManager);
      if (nextEntry === null) {
        turnManager.startTurn(unitManager);
      }
    }

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

  replayAllSteps(): ReplayStep[] {
    const steps: ReplayStep[] = [];

    for (let i = 0; i < this.actions.length; i++) {
      const snapshot = this.replayToStep(i + 1);
      if (snapshot) {
        steps.push({
          index: i,
          action: this.actions[i].action,
          result: this.actions[i].result,
          snapshotAfter: snapshot,
        });
      }
    }

    return steps;
  }

  private findStartPosition(map: BattleMap, template: UnitTemplate): Position | null {
    const positions = map.getAllPositions();
    for (const pos of positions) {
      if (map.isPassable(pos)) {
        return pos;
      }
    }
    return positions.length > 0 ? positions[0] : null;
  }
}
