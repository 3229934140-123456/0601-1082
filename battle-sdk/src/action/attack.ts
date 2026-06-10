import {
  Position,
  AttackRangeResult,
  UnitId,
  SkillId,
  SkillTemplate,
} from '../types';
import { BattleMap } from '../map/index';
import { UnitManager } from '../unit/unit-manager';

export class AttackCalculator {
  constructor(
    private map: BattleMap,
    private unitManager: UnitManager,
  ) {}

  getAttackRange(unitId: UnitId, skillId?: SkillId, skillTemplate?: SkillTemplate): AttackRangeResult {
    const unit = this.unitManager.getUnit(unitId);
    if (!unit || !unit.isAlive) {
      return { inRange: [], unitsInRange: [] };
    }

    let range = unit.stats.attackRange;
    if (skillId && skillTemplate) {
      range = skillTemplate.targetType.range;
    }

    const positions = this.map.getPositionsInRange(unit.position, range);
    const inRange: Position[] = [];
    const unitsInRange: UnitId[] = [];

    for (const pos of positions) {
      if (skillId && skillTemplate && skillTemplate.targetType.lineOfSight) {
        if (!this.map.getLineOfSight(unit.position, pos)) continue;
      }

      inRange.push(pos);

      const target = this.unitManager.getUnitAtPosition(pos);
      if (target && target.isAlive && target.id !== unitId) {
        const isAlly = target.team === unit.team;
        const targetType = skillTemplate?.targetType.type || 'enemy';
        if (
          targetType === 'any' ||
          (targetType === 'enemy' && !isAlly) ||
          (targetType === 'ally' && isAlly)
        ) {
          unitsInRange.push(target.id);
        }
      }
    }

    return { inRange, unitsInRange };
  }

  isInRange(attackerId: UnitId, targetPosition: Position, skillId?: SkillId, skillTemplate?: SkillTemplate): boolean {
    const unit = this.unitManager.getUnit(attackerId);
    if (!unit || !unit.isAlive) return false;

    let range = unit.stats.attackRange;
    if (skillId && skillTemplate) {
      range = skillTemplate.targetType.range;
    }

    const dist = this.map.distance(unit.position, targetPosition);
    if (dist > range) return false;

    if (skillId && skillTemplate && skillTemplate.targetType.lineOfSight) {
      return this.map.getLineOfSight(unit.position, targetPosition);
    }

    return true;
  }

  getAoEPositions(
    center: Position,
    radius: number,
    shape: 'circle' | 'cross' | 'line' | 'cone',
  ): Position[] {
    switch (shape) {
      case 'circle':
        return this.map.getPositionsInRange(center, radius);
      case 'cross': {
        const positions: Position[] = [center];
        const neighbors = this.map.getNeighbors(center);
        for (let i = 0; i < radius; i++) {
          const expanded: Position[] = [];
          for (const pos of positions) {
            expanded.push(...this.map.getNeighbors(pos));
          }
          for (const pos of expanded) {
            if (!positions.some(p => this.posEqual(p, pos))) {
              positions.push(pos);
            }
          }
        }
        return positions;
      }
      case 'line':
        return this.map.getPositionsInRange(center, radius).filter(pos => {
          const dist = this.map.distance(center, pos);
          return dist <= radius;
        });
      case 'cone':
        return this.map.getPositionsInRange(center, radius);
      default:
        return this.map.getPositionsInRange(center, radius);
    }
  }

  private posEqual(a: Position, b: Position): boolean {
    if ('x' in a && 'x' in b) {
      return a.x === b.x && a.y === b.y;
    }
    if ('q' in a && 'q' in b) {
      return a.q === b.q && a.r === b.r;
    }
    return false;
  }
}
