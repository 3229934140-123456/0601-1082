import {
  Action,
  ActionResult,
  DamageResult,
  HealResult,
  ShieldResult,
  DamageType,
  SkillTemplate,
  SkillEffect,
  UnitId,
  StatusEffectInstance,
  Unit,
  UnitTemplate,
} from '../types';
import { UnitManager } from '../unit/unit-manager';
import { BattleMap } from '../map/index';
import { SeededRandom } from '../random';
import { ConfigLoader } from '../config';

export class SkillResolver {
  constructor(
    private map: BattleMap,
    private unitManager: UnitManager,
    private random: SeededRandom,
    private configLoader: ConfigLoader,
    private currentTurn: number = 0,
  ) {}

  setCurrentTurn(turn: number): void {
    this.currentTurn = turn;
  }

  resolveAction(action: Action, skillTemplate?: SkillTemplate): ActionResult {
    switch (action.type) {
      case 'move':
        return this.resolveMove(action);
      case 'attack':
        return this.resolveAttack(action);
      case 'skill':
        return this.resolveSkill(action, skillTemplate!);
      case 'wait':
        return this.resolveWait(action);
      case 'summon':
        return this.resolveSummon(action);
      default:
        return this.emptyResult(action);
    }
  }

  private resolveMove(action: Action): ActionResult {
    const unit = this.unitManager.getUnit(action.unitId);
    if (!unit) return this.emptyResult(action);

    const from = { ...unit.position };
    this.unitManager.moveUnit(action.unitId, action.targetPosition);

    unit.hasActed = true;

    return {
      action,
      damageResults: [],
      healResults: [],
      shieldResults: [],
      statusEffectsApplied: [],
      unitsMoved: [{ unitId: action.unitId, from, to: action.targetPosition }],
      unitsDied: [],
      unitsSummoned: [],
      actionPointSpent: 1,
    };
  }

  private resolveAttack(action: Action): ActionResult {
    const attacker = this.unitManager.getUnit(action.unitId);
    if (!attacker) return this.emptyResult(action);

    const damageResults: DamageResult[] = [];
    const unitsDied: UnitId[] = [];

    for (const targetId of action.targetUnitIds) {
      const target = this.unitManager.getUnit(targetId);
      if (!target || !target.isAlive) continue;

      const preCalc = this.computeRawDamage(attacker, target, 'physical');
      if (preCalc.avoided) {
        damageResults.push({
          targetId: target.id,
          damageType: 'physical',
          rawDamage: 0,
          shieldAbsorbed: 0,
          defenseReduced: 0,
          terrainBonus: 0,
          finalDamage: 0,
          isCrit: false,
          isKillingBlow: false,
        });
        continue;
      }

      const applyResult = this.unitManager.applyDamageDetailed(targetId, preCalc.rawDamage);

      damageResults.push({
        targetId: target.id,
        damageType: 'physical',
        rawDamage: preCalc.rawDamage,
        shieldAbsorbed: applyResult.shieldAbsorbed,
        defenseReduced: preCalc.defenseReduced,
        terrainBonus: preCalc.terrainBonus,
        finalDamage: applyResult.hpDamage,
        isCrit: preCalc.isCrit,
        isKillingBlow: applyResult.died,
      });

      if (applyResult.died) {
        unitsDied.push(targetId);
      }
    }

    attacker.hasActed = true;

    return {
      action,
      damageResults,
      healResults: [],
      shieldResults: [],
      statusEffectsApplied: [],
      unitsMoved: [],
      unitsDied,
      unitsSummoned: [],
      actionPointSpent: 1,
    };
  }

  private resolveSkill(action: Action, skillTemplate: SkillTemplate): ActionResult {
    const caster = this.unitManager.getUnit(action.unitId);
    if (!caster) return this.emptyResult(action);

    const damageResults: DamageResult[] = [];
    const healResults: HealResult[] = [];
    const shieldResults: ShieldResult[] = [];
    const statusEffectsApplied: StatusEffectInstance[] = [];
    const unitsDied: UnitId[] = [];
    const unitsSummoned: UnitId[] = [];

    for (const effect of skillTemplate.effects) {
      if (effect.summonTemplateId) {
        const summonTemplate = this.configLoader.getUnitTemplate(effect.summonTemplateId);
        if (summonTemplate) {
          const summonPos = this.resolveSummonPosition(effect.summonPosition, caster, action.targetPosition);
          if (summonPos && this.map.isPassable(summonPos) && !this.unitManager.getUnitAtPosition(summonPos)?.isAlive) {
            const summoned = this.unitManager.summonUnit(summonTemplate, summonPos, this.currentTurn);
            unitsSummoned.push(summoned.id);
          }
        }
      }

      const targets = this.resolveSkillTargets(action, skillTemplate);

      for (const targetId of targets) {
        const target = this.unitManager.getUnit(targetId);
        if (!target || !target.isAlive) continue;

        if (effect.baseDamage > 0 || effect.scalingStat) {
          const preCalc = this.computeSkillRawDamage(caster, target, effect);
          if (preCalc.avoided) {
            damageResults.push({
              targetId: target.id,
              damageType: effect.damageType,
              rawDamage: 0,
              shieldAbsorbed: 0,
              defenseReduced: 0,
              terrainBonus: 0,
              finalDamage: 0,
              isCrit: false,
              isKillingBlow: false,
            });
            continue;
          }

          const applyResult = this.unitManager.applyDamageDetailed(targetId, preCalc.rawDamage);

          damageResults.push({
            targetId: target.id,
            damageType: effect.damageType,
            rawDamage: preCalc.rawDamage,
            shieldAbsorbed: applyResult.shieldAbsorbed,
            defenseReduced: preCalc.defenseReduced,
            terrainBonus: preCalc.terrainBonus,
            finalDamage: applyResult.hpDamage,
            isCrit: preCalc.isCrit,
            isKillingBlow: applyResult.died,
          });

          if (applyResult.died) {
            unitsDied.push(targetId);
          }
        }

        if (effect.healAmount > 0) {
          const healed = this.unitManager.applyHeal(targetId, effect.healAmount);
          healResults.push({
            targetId,
            healAmount: healed,
            overheal: effect.healAmount - healed,
          });
        }

        if (effect.shieldAmount > 0) {
          const sm = this.unitManager.getStatusManager(targetId);
          if (sm) {
            const seInstance = sm.addEffect(
              {
                type: 'shield',
                name: 'Shield',
                duration: 2,
                damagePerTick: 0,
                healPerTick: 0,
                shieldAmount: effect.shieldAmount,
                statModifier: {},
                stun: false,
                root: false,
                silence: false,
                tickInterval: 1,
              },
              action.unitId,
              this.currentTurn,
            );
            this.unitManager.addStatusEffect(targetId, seInstance);
            statusEffectsApplied.push(seInstance);
          }
          shieldResults.push({
            targetId,
            shieldAmount: effect.shieldAmount,
            totalShield: this.unitManager.getStatusManager(targetId)?.getShieldTotal() || 0,
          });
        }

        for (const statusTpl of effect.statusEffects) {
          const sm = this.unitManager.getStatusManager(targetId);
          if (sm) {
            const seInstance = sm.addEffect(statusTpl, action.unitId, this.currentTurn);
            this.unitManager.addStatusEffect(targetId, seInstance);
            statusEffectsApplied.push(seInstance);
          }
        }
      }
    }

    this.unitManager.setSkillCooldown(action.unitId, action.skillId, skillTemplate.cooldown);
    caster.hasActed = true;

    return {
      action,
      damageResults,
      healResults,
      shieldResults,
      statusEffectsApplied,
      unitsMoved: [],
      unitsDied,
      unitsSummoned,
      actionPointSpent: skillTemplate.actionPointCost,
    };
  }

  private resolveSummonPosition(
    position: 'self' | 'target' | 'adjacent',
    caster: Unit,
    targetPosition: import('../types').Position,
  ): import('../types').Position | null {
    switch (position) {
      case 'self':
        return { ...caster.position };
      case 'target':
        return { ...targetPosition };
      case 'adjacent': {
        const neighbors = this.map.getNeighbors(caster.position);
        for (const n of neighbors) {
          if (this.map.isPassable(n) && !this.unitManager.getUnitAtPosition(n)?.isAlive) {
            return n;
          }
        }
        return null;
      }
      default:
        return null;
    }
  }

  private resolveWait(action: Action): ActionResult {
    const unit = this.unitManager.getUnit(action.unitId);
    if (unit) {
      unit.hasActed = true;
    }
    return {
      action,
      damageResults: [],
      healResults: [],
      shieldResults: [],
      statusEffectsApplied: [],
      unitsMoved: [],
      unitsDied: [],
      unitsSummoned: [],
      actionPointSpent: 0,
    };
  }

  private resolveSummon(action: Action): ActionResult {
    return {
      action,
      damageResults: [],
      healResults: [],
      shieldResults: [],
      statusEffectsApplied: [],
      unitsMoved: [],
      unitsDied: [],
      unitsSummoned: action.targetUnitIds,
      actionPointSpent: 2,
    };
  }

  private computeRawDamage(
    attacker: Unit,
    target: Unit,
    damageType: DamageType,
  ): { rawDamage: number; defenseReduced: number; terrainBonus: number; isCrit: boolean; avoided: boolean } {
    const terrain = this.map.getTerrain(target.position);
    let rawDamage = attacker.stats.attack;

    if (damageType === 'magical' || damageType === 'fire' || damageType === 'ice' || damageType === 'lightning') {
      rawDamage = attacker.stats.magicAttack;
    }

    let defense = target.stats.defense;
    if (damageType === 'magical' || damageType === 'fire' || damageType === 'ice' || damageType === 'lightning') {
      defense = target.stats.magicDefense;
    }

    let defenseReduced = 0;
    if (damageType !== 'true') {
      defenseReduced = Math.floor(defense * 0.5);
      rawDamage = Math.max(1, rawDamage - defenseReduced);
    }

    const isCrit = this.random.nextBool(attacker.stats.critRate);
    if (isCrit) {
      rawDamage = Math.floor(rawDamage * attacker.stats.critDamage);
    }

    const avoidCheck = this.random.nextBool(target.stats.avoidRate + terrain.avoidBonus);
    if (avoidCheck) {
      return { rawDamage: 0, defenseReduced: 0, terrainBonus: 0, isCrit: false, avoided: true };
    }

    const terrainBonus = terrain.attackBonus;
    rawDamage += terrainBonus;

    return { rawDamage, defenseReduced, terrainBonus, isCrit, avoided: false };
  }

  private computeSkillRawDamage(
    caster: Unit,
    target: Unit,
    effect: SkillEffect,
  ): { rawDamage: number; defenseReduced: number; terrainBonus: number; isCrit: boolean; avoided: boolean } {
    let rawDamage = effect.baseDamage;

    if (effect.scalingStat && effect.scalingRatio > 0) {
      const statValue = (caster.stats as unknown as Record<string, number>)[effect.scalingStat] || 0;
      rawDamage += Math.floor(statValue * effect.scalingRatio);
    }

    const terrain = this.map.getTerrain(target.position);

    let defenseReduced = 0;
    if (effect.damageType !== 'true') {
      let defense = target.stats.defense;
      if (effect.damageType === 'magical' || effect.damageType === 'fire' || effect.damageType === 'ice' || effect.damageType === 'lightning') {
        defense = target.stats.magicDefense;
      }
      defenseReduced = Math.floor(defense * 0.5);
      rawDamage = Math.max(1, rawDamage - defenseReduced);
    }

    const isCrit = this.random.nextBool(caster.stats.critRate);
    if (isCrit) {
      rawDamage = Math.floor(rawDamage * caster.stats.critDamage);
    }

    const avoidCheck = this.random.nextBool(target.stats.avoidRate + terrain.avoidBonus);
    if (avoidCheck) {
      return { rawDamage: 0, defenseReduced: 0, terrainBonus: 0, isCrit: false, avoided: true };
    }

    const terrainBonus = terrain.attackBonus;
    rawDamage += terrainBonus;

    return { rawDamage, defenseReduced, terrainBonus, isCrit, avoided: false };
  }

  private resolveSkillTargets(action: Action, skillTemplate: SkillTemplate): UnitId[] {
    const target = skillTemplate.targetType;
    if (target.type === 'self') return [action.unitId];

    const caster = this.unitManager.getUnit(action.unitId);
    if (!caster) return [];

    if (target.aoeRadius > 0) {
      const positions = this.map.getPositionsInRange(action.targetPosition, target.aoeRadius);
      const result: UnitId[] = [];
      for (const pos of positions) {
        const unit = this.unitManager.getUnitAtPosition(pos);
        if (unit && unit.isAlive && unit.id !== action.unitId) {
          if (target.type === 'enemy' && unit.team !== caster.team) result.push(unit.id);
          else if (target.type === 'ally' && unit.team === caster.team) result.push(unit.id);
          else if (target.type === 'any') result.push(unit.id);
        }
      }
      return result;
    }

    return action.targetUnitIds;
  }

  private emptyResult(action: Action): ActionResult {
    return {
      action,
      damageResults: [],
      healResults: [],
      shieldResults: [],
      statusEffectsApplied: [],
      unitsMoved: [],
      unitsDied: [],
      unitsSummoned: [],
      actionPointSpent: 0,
    };
  }
}
