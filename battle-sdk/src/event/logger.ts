import {
  BattleEvent,
  BattlePhase,
  ActionResult,
  UnitId,
} from '../types';

let eventIdCounter = 0;

export class BattleLogger {
  private events: BattleEvent[] = [];

  log(
    turn: number,
    phase: BattlePhase,
    type: string,
    data: Record<string, unknown>,
  ): BattleEvent {
    const event: BattleEvent = {
      id: `evt_${eventIdCounter++}`,
      turn,
      phase,
      timestamp: Date.now(),
      type,
      data,
    };
    this.events.push(event);
    return event;
  }

  logAction(turn: number, result: ActionResult): void {
    this.log(turn, 'action', 'action_executed', {
      actionType: result.action.type,
      unitId: result.action.unitId,
      targetPosition: result.action.targetPosition,
      skillId: result.action.skillId,
      damageResults: result.damageResults,
      healResults: result.healResults,
      shieldResults: result.shieldResults,
      unitsMoved: result.unitsMoved,
      unitsDied: result.unitsDied,
      unitsSummoned: result.unitsSummoned,
      actionPointSpent: result.actionPointSpent,
    });
  }

  logTurnStart(turn: number, unitId: UnitId): void {
    this.log(turn, 'turnStart', 'turn_started', { turn, unitId });
  }

  logTurnEnd(turn: number): void {
    this.log(turn, 'turnEnd', 'turn_ended', { turn });
  }

  logBattleStart(): void {
    this.log(1, 'start', 'battle_started', {});
  }

  logBattleEnd(winner: string | null): void {
    this.log(-1, 'end', 'battle_ended', { winner });
  }

  logUnitDeath(turn: number, unitId: UnitId): void {
    this.log(turn, 'action', 'unit_died', { unitId });
  }

  logStatusEffectApplied(turn: number, unitId: UnitId, effectName: string): void {
    this.log(turn, 'action', 'status_effect_applied', { unitId, effectName });
  }

  logSummon(turn: number, summonId: UnitId, summonerId: UnitId): void {
    this.log(turn, 'action', 'unit_summoned', { summonId, summonerId });
  }

  getEvents(): BattleEvent[] {
    return [...this.events];
  }

  getEventsByTurn(turn: number): BattleEvent[] {
    return this.events.filter(e => e.turn === turn);
  }

  getEventsByType(type: string): BattleEvent[] {
    return this.events.filter(e => e.type === type);
  }

  getEventsByPhase(phase: BattlePhase): BattleEvent[] {
    return this.events.filter(e => e.phase === phase);
  }

  getEventCount(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
    eventIdCounter = 0;
  }

  clone(): BattleLogger {
    const cloned = new BattleLogger();
    cloned.events = this.events.map(e => ({ ...e, data: { ...e.data } }));
    return cloned;
  }
}
