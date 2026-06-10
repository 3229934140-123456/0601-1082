import {
  Action,
  ActionType,
  UnitId,
  SkillTemplate,
  SkillId,
} from '../types';
import { UnitManager } from '../unit/unit-manager';
import { BattleMap } from '../map/index';
import { MovementCalculator } from './movement';
import { AttackCalculator } from './attack';

export interface ValidationResult {
  valid: boolean;
  reason: string;
}

export class ActionValidator {
  private movementCalc: MovementCalculator;
  private attackCalc: AttackCalculator;

  constructor(
    private map: BattleMap,
    private unitManager: UnitManager,
  ) {
    this.movementCalc = new MovementCalculator(map, unitManager);
    this.attackCalc = new AttackCalculator(map, unitManager);
  }

  validateAction(
    action: Action,
    skillTemplate?: SkillTemplate,
  ): ValidationResult {
    const unit = this.unitManager.getUnit(action.unitId);
    if (!unit) return { valid: false, reason: 'Unit not found' };
    if (!unit.isAlive) return { valid: false, reason: 'Unit is dead' };

    const sm = this.unitManager.getStatusManager(action.unitId);
    if (sm) {
      if (sm.isStunned()) return { valid: false, reason: 'Unit is stunned' };
      if (action.type === 'move' && sm.isRooted()) return { valid: false, reason: 'Unit is rooted' };
      if (action.type === 'skill' && sm.isSilenced()) return { valid: false, reason: 'Unit is silenced' };
    }

    switch (action.type) {
      case 'move':
        return this.validateMove(action, unit.stats.actionPoints);
      case 'attack':
        return this.validateAttack(action, unit.stats.actionPoints);
      case 'skill':
        return this.validateSkill(action, unit.stats.actionPoints, skillTemplate);
      case 'wait':
        return { valid: true, reason: '' };
      case 'summon':
        return this.validateSummon(action, unit.stats.actionPoints);
      default:
        return { valid: false, reason: `Unknown action type: ${action.type}` };
    }
  }

  private validateMove(action: Action, actionPoints: number): ValidationResult {
    if (actionPoints < 1) {
      return { valid: false, reason: 'Not enough action points' };
    }

    const range = this.movementCalc.calculateMovableRange(action.unitId);
    const targetKey = this.posKey(action.targetPosition);
    if (!range.reachable.some(p => this.posKey(p) === targetKey)) {
      return { valid: false, reason: 'Target position not in movable range' };
    }

    const occupant = this.unitManager.getUnitAtPosition(action.targetPosition);
    if (occupant && occupant.isAlive) {
      return { valid: false, reason: 'Target position occupied' };
    }

    return { valid: true, reason: '' };
  }

  private validateAttack(action: Action, actionPoints: number): ValidationResult {
    if (actionPoints < 1) {
      return { valid: false, reason: 'Not enough action points' };
    }

    if (!this.attackCalc.isInRange(action.unitId, action.targetPosition)) {
      return { valid: false, reason: 'Target not in attack range' };
    }

    if (action.targetUnitIds.length === 0) {
      return { valid: false, reason: 'No target specified' };
    }

    const attacker = this.unitManager.getUnit(action.unitId)!;
    for (const tid of action.targetUnitIds) {
      const target = this.unitManager.getUnit(tid);
      if (!target || !target.isAlive) {
        return { valid: false, reason: 'Target is not alive' };
      }
      if (target.team === attacker.team) {
        return { valid: false, reason: 'Cannot attack ally' };
      }
    }

    return { valid: true, reason: '' };
  }

  private validateSkill(
    action: Action,
    actionPoints: number,
    skillTemplate?: SkillTemplate,
  ): ValidationResult {
    if (!skillTemplate) {
      return { valid: false, reason: 'Skill template not found' };
    }

    if (actionPoints < skillTemplate.actionPointCost) {
      return { valid: false, reason: 'Not enough action points for skill' };
    }

    const unit = this.unitManager.getUnit(action.unitId);
    if (unit && unit.cooldowns[action.skillId] > 0) {
      return { valid: false, reason: `Skill on cooldown: ${unit.cooldowns[action.skillId]} turns` };
    }

    if (!unit?.skills.includes(action.skillId)) {
      return { valid: false, reason: 'Unit does not have this skill' };
    }

    const terrain = this.map.getTerrain(unit.position);
    if (skillTemplate.requiresTerrain.length > 0 && !skillTemplate.requiresTerrain.includes(terrain.type)) {
      return { valid: false, reason: 'Terrain requirement not met' };
    }
    if (skillTemplate.forbiddenTerrain.includes(terrain.type)) {
      return { valid: false, reason: 'Terrain forbids this skill' };
    }

    if (skillTemplate.targetType.type !== 'self') {
      if (!this.attackCalc.isInRange(action.unitId, action.targetPosition, action.skillId, skillTemplate)) {
        return { valid: false, reason: 'Target not in skill range' };
      }
    }

    return { valid: true, reason: '' };
  }

  private validateSummon(action: Action, actionPoints: number): ValidationResult {
    if (actionPoints < 2) {
      return { valid: false, reason: 'Not enough action points for summon' };
    }

    const occupant = this.unitManager.getUnitAtPosition(action.targetPosition);
    if (occupant && occupant.isAlive) {
      return { valid: false, reason: 'Summon position occupied' };
    }

    if (!this.map.isPassable(action.targetPosition)) {
      return { valid: false, reason: 'Summon position not passable' };
    }

    return { valid: true, reason: '' };
  }

  private posKey(pos: import('../types').Position): string {
    if ('q' in pos) return `h${(pos as { q: number; r: number }).q},${(pos as { q: number; r: number }).r}`;
    return `g${(pos as { x: number; y: number }).x},${(pos as { x: number; y: number }).y}`;
  }
}
