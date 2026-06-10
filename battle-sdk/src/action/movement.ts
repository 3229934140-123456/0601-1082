import {
  Position,
  MovementRangeResult,
  Unit,
  UnitId,
  ActionType,
  Action,
  SkillId,
} from '../types';
import { BattleMap, isGridMap, isHexMap } from '../map/index';
import { UnitManager } from '../unit/unit-manager';

export class MovementCalculator {
  constructor(
    private map: BattleMap,
    private unitManager: UnitManager,
  ) {}

  calculateMovableRange(unitId: UnitId): MovementRangeResult {
    const unit = this.unitManager.getUnit(unitId);
    if (!unit || !unit.isAlive) {
      return { reachable: [], paths: new Map(), costs: new Map() };
    }

    const sm = this.unitManager.getStatusManager(unitId);
    if (sm && sm.isRooted()) {
      return { reachable: [], paths: new Map(), costs: new Map() };
    }

    const moveRange = unit.stats.moveRange;
    const start = unit.position;

    const reachable: Position[] = [];
    const paths = new Map<string, Position[]>();
    const costs = new Map<string, number>();
    const visited = new Map<string, number>();

    const startKey = this.posKey(start);
    visited.set(startKey, 0);
    paths.set(startKey, [start]);
    costs.set(startKey, 0);

    const queue: { pos: Position; cost: number; path: Position[] }[] = [
      { pos: start, cost: 0, path: [start] },
    ];

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;

      const neighbors = this.getNeighbors(current.pos);
      for (const neighbor of neighbors) {
        if (!this.map.isPassable(neighbor, unit)) continue;

        const occupant = this.unitManager.getUnitAtPosition(neighbor);
        if (occupant && occupant.id !== unitId && occupant.isAlive) continue;

        const terrain = this.map.getTerrain(neighbor);
        const moveCost = terrain.moveCost;
        const totalCost = current.cost + moveCost;

        if (totalCost > moveRange) continue;

        const nKey = this.posKey(neighbor);
        const prevCost = visited.get(nKey);
        if (prevCost !== undefined && prevCost <= totalCost) continue;

        visited.set(nKey, totalCost);
        const newPath = [...current.path, neighbor];
        paths.set(nKey, newPath);
        costs.set(nKey, totalCost);

        queue.push({ pos: neighbor, cost: totalCost, path: newPath });
      }
    }

    for (const [key, cost] of costs) {
      if (cost > 0) {
        reachable.push(this.parseKey(key));
      }
    }

    return { reachable, paths, costs };
  }

  calculatePath(from: Position, to: Position, unitId: UnitId): Position[] | null {
    const unit = this.unitManager.getUnit(unitId);
    if (!unit) return null;

    const fromKey = this.posKey(from);
    const toKey = this.posKey(to);

    const visited = new Map<string, number>();
    const pathMap = new Map<string, Position>();
    visited.set(fromKey, 0);

    const queue: { pos: Position; cost: number }[] = [{ pos: from, cost: 0 }];

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;

      if (this.posKey(current.pos) === toKey) {
        const path: Position[] = [];
        let key: string | undefined = toKey;
        while (key) {
          path.unshift(this.parseKey(key));
          const prevPos = pathMap.get(key);
          key = prevPos ? this.posKey(prevPos) : undefined;
        }
        return path;
      }

      const neighbors = this.getNeighbors(current.pos);
      for (const neighbor of neighbors) {
        if (!this.map.isPassable(neighbor, unit)) continue;

        const occupant = this.unitManager.getUnitAtPosition(neighbor);
        if (occupant && occupant.id !== unitId && occupant.isAlive) continue;

        const terrain = this.map.getTerrain(neighbor);
        const totalCost = current.cost + terrain.moveCost;
        const nKey = this.posKey(neighbor);
        const prevCost = visited.get(nKey);
        if (prevCost !== undefined && prevCost <= totalCost) continue;

        visited.set(nKey, totalCost);
        pathMap.set(nKey, current.pos);
        queue.push({ pos: neighbor, cost: totalCost });
      }
    }

    return null;
  }

  private getNeighbors(pos: Position): Position[] {
    if (isGridMap(this.map)) {
      return this.map.getNeighbors(pos);
    }
    if (isHexMap(this.map)) {
      return this.map.getNeighbors(pos);
    }
    return [];
  }

  private posKey(pos: Position): string {
    if ('q' in pos) return `h${(pos as { q: number; r: number }).q},${(pos as { q: number; r: number }).r}`;
    return `g${(pos as { x: number; y: number }).x},${(pos as { x: number; y: number }).y}`;
  }

  private parseKey(key: string): Position {
    if (key.startsWith('h')) {
      const parts = key.substring(1).split(',').map(Number);
      return { q: parts[0], r: parts[1], s: -parts[0] - parts[1] };
    }
    const parts = key.substring(1).split(',').map(Number);
    return { x: parts[0], y: parts[1] };
  }
}
