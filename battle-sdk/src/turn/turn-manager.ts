import {
  UnitId,
  TeamId,
  Unit,
  WinCondition,
  BattleSnapshot,
  BattlePhase,
} from '../types';
import { UnitManager } from '../unit/unit-manager';
import { SeededRandom } from '../random';

export interface TurnOrderEntry {
  unitId: UnitId;
  team: TeamId;
  priority: number;
  speed: number;
}

export class TurnManager {
  private currentTurn: number = 1;
  private phase: BattlePhase = 'start';
  private currentUnitIndex: number = 0;
  private turnOrder: TurnOrderEntry[] = [];
  private maxTurns: number;
  private actionPointsPerTurn: number;
  private teamOrder: TeamId[];
  private winner: TeamId | null = null;
  private random: SeededRandom;

  constructor(
    maxTurns: number,
    actionPointsPerTurn: number,
    teamOrder: TeamId[],
    random: SeededRandom,
  ) {
    this.maxTurns = maxTurns;
    this.actionPointsPerTurn = actionPointsPerTurn;
    this.teamOrder = teamOrder;
    this.random = random;
  }

  calculateTurnOrder(units: Unit[]): TurnOrderEntry[] {
    const alive = units.filter(u => u.isAlive);

    const entries: TurnOrderEntry[] = alive.map(u => ({
      unitId: u.id,
      team: u.team,
      priority: u.priority,
      speed: u.stats.speed,
    }));

    entries.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.speed !== b.speed) return b.speed - a.speed;
      if (this.teamOrder.length > 0) {
        const aIdx = this.teamOrder.indexOf(a.team);
        const bIdx = this.teamOrder.indexOf(b.team);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      }
      return this.random.nextBool() ? -1 : 1;
    });

    this.turnOrder = entries;
    return entries;
  }

  startTurn(unitManager: UnitManager): TurnOrderEntry | null {
    this.phase = 'turnStart';
    const alive = unitManager.getAliveUnits();
    this.calculateTurnOrder(alive);

    if (this.turnOrder.length === 0) return null;

    this.currentUnitIndex = 0;
    const entry = this.turnOrder[this.currentUnitIndex];

    const unit = unitManager.getUnit(entry.unitId);
    if (unit) {
      unit.stats.actionPoints = Math.min(
        unit.stats.actionPoints + this.actionPointsPerTurn,
        unit.stats.maxActionPoints,
      );
      unit.hasActed = false;
    }

    this.phase = 'action';
    return entry;
  }

  nextUnit(unitManager: UnitManager): TurnOrderEntry | null {
    this.currentUnitIndex++;
    if (this.currentUnitIndex >= this.turnOrder.length) {
      this.endRound(unitManager);
      return null;
    }

    const entry = this.turnOrder[this.currentUnitIndex];
    const unit = unitManager.getUnit(entry.unitId);
    if (unit && unit.isAlive) {
      if (unit.stats.actionPoints <= 0) {
        unit.stats.actionPoints = Math.min(
          unit.stats.actionPoints + this.actionPointsPerTurn,
          unit.stats.maxActionPoints,
        );
      }
      unit.hasActed = false;
      this.phase = 'action';
      return entry;
    }

    return this.nextUnit(unitManager);
  }

  endRound(unitManager: UnitManager): void {
    this.phase = 'turnEnd';
    const alive = unitManager.getAliveUnits();
    for (const unit of alive) {
      unitManager.tickStatusEffects(unit.id);
      unitManager.tickCooldowns(unit.id);
      unitManager.checkSummonExpiry(unit.id, this.currentTurn);

      const terrain = null;
      void terrain;
    }
    this.currentTurn++;
    this.phase = this.currentTurn > this.maxTurns ? 'end' : 'start';
  }

  checkWinCondition(
    winConditions: WinCondition[],
    snapshot: BattleSnapshot,
  ): TeamId | null {
    if (this.winner) return this.winner;

    for (const condition of winConditions) {
      const result = this.evaluateCondition(condition, snapshot);
      if (result) {
        this.winner = result;
        this.phase = 'end';
        return result;
      }
    }

    const aliveTeams = new Set(snapshot.units.filter(u => u.isAlive).map(u => u.team));
    if (aliveTeams.size <= 1) {
      this.winner = aliveTeams.values().next().value || null;
      this.phase = 'end';
      return this.winner;
    }

    if (this.currentTurn > this.maxTurns) {
      this.phase = 'end';
      return null;
    }

    return null;
  }

  private evaluateCondition(condition: WinCondition, snapshot: BattleSnapshot): TeamId | null {
    switch (condition.type) {
      case 'eliminateAll': {
        const alive = snapshot.units.filter(u => u.isAlive);
        const teams = new Set(alive.map(u => u.team));
        if (teams.size <= 1) {
          return alive.length > 0 ? alive[0].team : null;
        }
        return null;
      }
      case 'eliminateTeam': {
        const teamAlive = snapshot.units.some(
          u => u.team === condition.team && u.isAlive,
        );
        if (!teamAlive) {
          return snapshot.units.find(u => u.isAlive && u.team !== condition.team)?.team || null;
        }
        return null;
      }
      case 'reachPosition': {
        const units = snapshot.units.filter(
          u => u.team === condition.team && u.isAlive,
        );
        const reached = units.some(u => {
          if ('x' in u.position && 'x' in condition.position) {
            return u.position.x === condition.position.x && u.position.y === condition.position.y;
          }
          if ('q' in u.position && 'q' in condition.position) {
            return u.position.q === condition.position.q && u.position.r === condition.position.r;
          }
          return false;
        });
        return reached ? condition.team : null;
      }
      case 'surviveTurns': {
        return snapshot.turn >= condition.turns ? condition.team : null;
      }
      case 'protectUnit': {
        const unit = snapshot.units.find(u => u.id === condition.unitId);
        if (!unit || !unit.isAlive) {
          const killer = snapshot.units.find(u => u.isAlive && u.team !== unit?.team);
          return killer?.team || null;
        }
        return null;
      }
      case 'custom': {
        return condition.check(snapshot);
      }
      default:
        return null;
    }
  }

  getCurrentTurn(): number {
    return this.currentTurn;
  }

  getPhase(): BattlePhase {
    return this.phase;
  }

  getWinner(): TeamId | null {
    return this.winner;
  }

  getTurnOrder(): TurnOrderEntry[] {
    return [...this.turnOrder];
  }

  getCurrentUnitIndex(): number {
    return this.currentUnitIndex;
  }

  getCurrentUnitId(): UnitId | null {
    if (this.currentUnitIndex < this.turnOrder.length) {
      return this.turnOrder[this.currentUnitIndex].unitId;
    }
    return null;
  }

  isBattleOver(): boolean {
    return this.phase === 'end';
  }

  spendActionPoints(unit: Unit, amount: number): boolean {
    if (unit.stats.actionPoints < amount) return false;
    unit.stats.actionPoints -= amount;
    return true;
  }

  clone(): TurnManager {
    const cloned = new TurnManager(
      this.maxTurns,
      this.actionPointsPerTurn,
      [...this.teamOrder],
      this.random,
    );
    cloned.currentTurn = this.currentTurn;
    cloned.phase = this.phase;
    cloned.currentUnitIndex = this.currentUnitIndex;
    cloned.turnOrder = this.turnOrder.map(e => ({ ...e }));
    cloned.winner = this.winner;
    return cloned;
  }
}
