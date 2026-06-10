import {
  BattleEvent,
  BattleConfig,
  ReplayData,
  Action,
  ActionResult,
  BattlePhase,
  TeamId,
  UnitId,
  ReplayRecord,
} from '../types';
import { BattleLogger } from './logger';

export class ReplayManager {
  private records: ReplayRecord[] = [];

  recordAction(turn: number, phase: BattlePhase, action: Action, result: ActionResult): void {
    this.records.push({
      type: 'action',
      turn,
      phase,
      action: { ...action },
      result: { ...result },
    });
  }

  recordNextUnit(turn: number, phase: BattlePhase, unitId: UnitId): void {
    this.records.push({
      type: 'nextUnit',
      turn,
      phase,
      unitId,
    });
  }

  recordTurnStart(turn: number, phase: BattlePhase): void {
    this.records.push({
      type: 'turnStart',
      turn,
      phase,
    });
  }

  recordTurnEnd(turn: number, phase: BattlePhase): void {
    this.records.push({
      type: 'turnEnd',
      turn,
      phase,
    });
  }

  recordBattleStart(turn: number, phase: BattlePhase): void {
    this.records.push({
      type: 'battleStart',
      turn,
      phase,
    });
  }

  recordBattleEnd(turn: number, phase: BattlePhase, winner: TeamId | null): void {
    this.records.push({
      type: 'battleEnd',
      turn,
      phase,
      winner,
    });
  }

  getRecords(): ReplayRecord[] {
    return [...this.records];
  }

  getActionCount(): number {
    return this.records.filter(r => r.type === 'action').length;
  }

  getRecordCount(): number {
    return this.records.length;
  }

  exportReplay(config: BattleConfig, logger: BattleLogger): ReplayData {
    return {
      version: '1.0.0',
      config,
      events: logger.getEvents(),
      seed: config.seed,
      duration: this.calculateDuration(),
    };
  }

  exportReplayJson(config: BattleConfig, logger: BattleLogger): string {
    const data = this.exportReplay(config, logger);
    return JSON.stringify(data, null, 2);
  }

  importReplay(json: string): ReplayData {
    return JSON.parse(json) as ReplayData;
  }

  getRecordedActions(): { turn: number; phase: BattlePhase; action: Action; result: ActionResult }[] {
    return this.records
      .filter(r => r.type === 'action' && r.action && r.result)
      .map(r => ({
        turn: r.turn,
        phase: r.phase,
        action: r.action as Action,
        result: r.result as ActionResult,
      }));
  }

  getActionsByTurn(turn: number): { turn: number; phase: BattlePhase; action: Action; result: ActionResult }[] {
    return this.getRecordedActions().filter(a => a.turn === turn);
  }

  private calculateDuration(): number {
    const actions = this.getRecordedActions();
    if (actions.length === 0) return 0;
    return actions[actions.length - 1].turn - actions[0].turn + 1;
  }

  clear(): void {
    this.records = [];
  }

  truncateTo(recordCount: number): void {
    if (recordCount < 0) recordCount = 0;
    if (recordCount < this.records.length) {
      this.records = this.records.slice(0, recordCount);
    }
  }

  getRecordedActionCount(): number {
    return this.getRecordedActions().length;
  }

  restoreRecords(records: ReplayRecord[]): void {
    this.records = records.map(r => {
      const copy: ReplayRecord = {
        type: r.type,
        turn: r.turn,
        phase: r.phase,
      };
      if (r.action) copy.action = { ...r.action };
      if (r.result) copy.result = { ...r.result };
      if (r.unitId) copy.unitId = r.unitId;
      if (r.winner !== undefined) copy.winner = r.winner;
      return copy;
    });
  }

  clone(): ReplayManager {
    const cloned = new ReplayManager();
    cloned.records = this.records.map(r => {
      const copy: ReplayRecord = {
        type: r.type,
        turn: r.turn,
        phase: r.phase,
      };
      if (r.action) copy.action = { ...r.action };
      if (r.result) copy.result = { ...r.result };
      if (r.unitId) copy.unitId = r.unitId;
      if (r.winner !== undefined) copy.winner = r.winner;
      return copy;
    });
    return cloned;
  }
}
