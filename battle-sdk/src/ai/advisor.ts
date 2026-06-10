import {
  AISuggestion,
  Action,
  UnitId,
  SkillId,
  SkillTemplate,
  Unit,
  Position,
} from '../types';
import { UnitManager } from '../unit/unit-manager';
import { BattleMap } from '../map/index';
import { MovementCalculator } from '../action/movement';
import { AttackCalculator } from '../action/attack';
import { ConfigLoader } from '../config';

export class AIAdvisor {
  private movementCalc: MovementCalculator;
  private attackCalc: AttackCalculator;

  constructor(
    private map: BattleMap,
    private unitManager: UnitManager,
    private configLoader: ConfigLoader,
  ) {
    this.movementCalc = new MovementCalculator(map, unitManager);
    this.attackCalc = new AttackCalculator(map, unitManager);
  }

  getSuggestions(unitId: UnitId, topN: number = 5): AISuggestion[] {
    const unit = this.unitManager.getUnit(unitId);
    if (!unit || !unit.isAlive) return [];

    const suggestions: AISuggestion[] = [];

    suggestions.push(...this.evaluateAttackActions(unit));
    suggestions.push(...this.evaluateSkillActions(unit));
    suggestions.push(...this.evaluateMoveActions(unit));
    suggestions.push(this.evaluateWaitAction(unit));

    suggestions.sort((a, b) => b.score - a.score);

    return suggestions.slice(0, topN);
  }

  private evaluateAttackActions(unit: Unit): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    const attackRange = this.attackCalc.getAttackRange(unit.id);

    for (const targetId of attackRange.unitsInRange) {
      const target = this.unitManager.getUnit(targetId);
      if (!target || !target.isAlive || target.team === unit.team) continue;

      const damageEstimate = this.estimateDamage(unit, target);
      const killPotential = target.stats.hp <= damageEstimate ? 50 : 0;
      const urgencyScore = 1 - (target.stats.hp / target.stats.maxHp);
      const score = 30 + killPotential + urgencyScore * 20;

      suggestions.push({
        action: {
          type: 'attack',
          unitId: unit.id,
          targetPosition: { ...target.position },
          skillId: '',
          targetUnitIds: [targetId],
        },
        score,
        reasoning: `Attack ${target.name}: est. ${damageEstimate} damage${killPotential > 0 ? ' (potential kill)' : ''}`,
      });
    }

    return suggestions;
  }

  private evaluateSkillActions(unit: Unit): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    for (const skillId of unit.skills) {
      if (unit.cooldowns[skillId] > 0) continue;

      const template = this.configLoader.getSkillTemplate(skillId);
      if (!template) continue;

      if (unit.stats.actionPoints < template.actionPointCost) continue;

      const skillScore = this.evaluateSkill(unit, template);
      if (skillScore) {
        suggestions.push(skillScore);
      }
    }

    return suggestions;
  }

  private evaluateSkill(unit: Unit, template: SkillTemplate): AISuggestion | null {
    const targetType = template.targetType.type;

    if (targetType === 'self') {
      const healScore = template.effects.reduce((sum, e) => sum + e.healAmount, 0);
      const shieldScore = template.effects.reduce((sum, e) => sum + e.shieldAmount, 0);
      const missingHp = unit.stats.maxHp - unit.stats.hp;
      const score = (healScore > 0 ? Math.min(healScore, missingHp) / unit.stats.maxHp * 40 : 0)
        + (shieldScore > 0 ? 15 : 0);

      if (score > 0) {
        return {
          action: {
            type: 'skill',
            unitId: unit.id,
            targetPosition: { ...unit.position },
            skillId: template.id,
            targetUnitIds: [unit.id],
          },
          score,
          reasoning: `Use ${template.name} on self: heal ${healScore}, shield ${shieldScore}`,
        };
      }
    }

    if (targetType === 'enemy' || targetType === 'any') {
      const attackRange = this.attackCalc.getAttackRange(unit.id, template.id, template);
      const totalDamage = template.effects.reduce((sum, e) => sum + e.baseDamage, 0);

      if (attackRange.unitsInRange.length > 0) {
        const bestTarget = this.pickBestTarget(attackRange.unitsInRange, unit);
        if (bestTarget) {
          const score = 25 + (totalDamage > 0 ? totalDamage / 50 * 20 : 0);
          return {
            action: {
              type: 'skill',
              unitId: unit.id,
              targetPosition: { ...bestTarget.position },
              skillId: template.id,
              targetUnitIds: [bestTarget.id],
            },
            score,
            reasoning: `Use ${template.name} on ${bestTarget.name}: ${totalDamage} damage`,
          };
        }
      }
    }

    if (targetType === 'ally') {
      const allies = this.unitManager.getTeamUnits(unit.team).filter(a => a.id !== unit.id);
      for (const ally of allies) {
        const missingHp = ally.stats.maxHp - ally.stats.hp;
        const healScore = template.effects.reduce((sum, e) => sum + e.healAmount, 0);
        if (healScore > 0 && missingHp > 0) {
          return {
            action: {
              type: 'skill',
              unitId: unit.id,
              targetPosition: { ...ally.position },
              skillId: template.id,
              targetUnitIds: [ally.id],
            },
            score: 20 + (missingHp / ally.stats.maxHp) * 30,
            reasoning: `Use ${template.name} on ${ally.name}: heal ${healScore}`,
          };
        }
      }
    }

    return null;
  }

  private evaluateMoveActions(unit: Unit): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    const range = this.movementCalc.calculateMovableRange(unit.id);

    const enemies = this.unitManager.getEnemyUnits(unit.team);
    if (enemies.length === 0) return suggestions;

    for (const pos of range.reachable) {
      let score = 5;

      const terrain = this.map.getTerrain(pos);
      score += terrain.defenseBonus * 3;
      score -= terrain.damagePerTurn * 2;

      const nearestEnemy = this.findNearestEnemy(pos, enemies);
      if (nearestEnemy) {
        const dist = this.map.distance(pos, nearestEnemy.position);
        if (dist <= unit.stats.attackRange) {
          score += 15;
        } else {
          score += Math.max(0, 10 - dist) * 2;
        }
      }

      suggestions.push({
        action: {
          type: 'move',
          unitId: unit.id,
          targetPosition: pos,
          skillId: '',
          targetUnitIds: [],
        },
        score,
        reasoning: `Move to defensible position (terrain: ${terrain.type}, defense: +${terrain.defenseBonus})`,
      });
    }

    return suggestions.slice(0, 10);
  }

  private evaluateWaitAction(unit: Unit): AISuggestion {
    return {
      action: {
        type: 'wait',
        unitId: unit.id,
        targetPosition: { ...unit.position },
        skillId: '',
        targetUnitIds: [],
      },
      score: 1,
      reasoning: 'Wait and save action points',
    };
  }

  private estimateDamage(attacker: Unit, target: Unit): number {
    const attack = attacker.stats.attack;
    const defense = target.stats.defense;
    const reduced = Math.floor(defense * 0.5);
    return Math.max(1, attack - reduced);
  }

  private pickBestTarget(targetIds: UnitId[], attacker: Unit): Unit | null {
    let best: Unit | null = null;
    let bestScore = -Infinity;

    for (const id of targetIds) {
      const target = this.unitManager.getUnit(id);
      if (!target || !target.isAlive || target.team === attacker.team) continue;

      const score = (1 - target.stats.hp / target.stats.maxHp) * 100
        + target.stats.attack * 0.5;

      if (score > bestScore) {
        bestScore = score;
        best = target;
      }
    }

    return best;
  }

  private findNearestEnemy(pos: Position, enemies: Unit[]): Unit | null {
    let nearest: Unit | null = null;
    let minDist = Infinity;

    for (const enemy of enemies) {
      const dist = this.map.distance(pos, enemy.position);
      if (dist < minDist) {
        minDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }
}
