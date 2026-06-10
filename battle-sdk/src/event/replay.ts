import {
  BattleEvent,
  BattleConfig,
  ReplayData,
  Action,
  ActionResult,
  BattlePhase,
} from '../types';
import { BattleLogger } from './logger';

export class ReplayManager {
  private recordedActions: {
    turn: number;
    phase: BattlePhase;
    action: Action;
    result: ActionResult;
  }[] = [];

  record(turn: number, phase: BattlePhase, action: Action, result: ActionResult): void {
    this.recordedActions.push({ turn, phase, action, result });
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

  getRecordedActions(): typeof this.recordedActions {
    return [...this.recordedActions];
  }

  getActionsByTurn(turn: number): typeof this.recordedActions {
    return this.recordedActions.filter(a => a.turn === turn);
  }

  private calculateDuration(): number {
    const events = this.recordedActions;
    if (events.length === 0) return 0;
    return events[events.length - 1].turn - events[0].turn + 1;
  }

  clear(): void {
    this.recordedActions = [];
  }

  clone(): ReplayManager {
    const cloned = new ReplayManager();
    cloned.recordedActions = this.recordedActions.map(a => ({
      ...a,
      action: { ...a.action },
      result: { ...a.result },
    }));
    return cloned;
  }
}
