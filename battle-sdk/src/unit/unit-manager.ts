import {
  Unit,
  UnitId,
  UnitTemplate,
  UnitStats,
  Position,
  SkillId,
  TeamId,
  StatusEffectInstance,
} from '../types';
import { StatusEffectManager } from './status-effect';

let unitIdCounter = 0;

function generateUnitId(): UnitId {
  return `unit_${unitIdCounter++}`;
}

export function resetUnitIdCounter(): void {
  unitIdCounter = 0;
}

export class UnitManager {
  private units: Map<UnitId, Unit> = new Map();
  private statusManagers: Map<UnitId, StatusEffectManager> = new Map();
  private positionMap: Map<string, UnitId> = new Map();

  private posKey(pos: Position): string {
    if ('q' in pos) return `h${pos.q},${pos.r}`;
    return `g${(pos as { x: number; y: number }).x},${(pos as { x: number; y: number }).y}`;
  }

  createUnit(template: UnitTemplate, position: Position): Unit {
    const id = generateUnitId();
    const unit: Unit = {
      id,
      templateId: template.id,
      name: template.name,
      team: template.team,
      position,
      stats: { ...template.stats },
      skills: [...template.skills],
      statusEffects: [],
      tags: [...template.tags],
      isAlive: true,
      isSummon: template.isSummon,
      summonDuration: template.summonDuration,
      summonTurn: 0,
      cooldowns: {},
      priority: template.priority,
      hasActed: false,
    };
    this.units.set(id, unit);
    this.statusManagers.set(id, new StatusEffectManager());
    this.positionMap.set(this.posKey(position), id);
    return unit;
  }

  summonUnit(template: UnitTemplate, position: Position, currentTurn: number): Unit {
    const unit = this.createUnit(template, position);
    unit.isSummon = true;
    unit.summonTurn = currentTurn;
    unit.summonDuration = template.summonDuration > 0 ? template.summonDuration : 3;
    return unit;
  }

  getUnit(id: UnitId): Unit | undefined {
    return this.units.get(id);
  }

  getUnitAtPosition(pos: Position): Unit | undefined {
    const id = this.positionMap.get(this.posKey(pos));
    return id ? this.units.get(id) : undefined;
  }

  getAllUnits(): Unit[] {
    return Array.from(this.units.values());
  }

  getAliveUnits(): Unit[] {
    return this.getAllUnits().filter(u => u.isAlive);
  }

  getTeamUnits(team: TeamId): Unit[] {
    return this.getAliveUnits().filter(u => u.team === team);
  }

  getEnemyUnits(team: TeamId): Unit[] {
    return this.getAliveUnits().filter(u => u.team !== team);
  }

  removeUnit(id: UnitId): void {
    const unit = this.units.get(id);
    if (unit) {
      this.positionMap.delete(this.posKey(unit.position));
      this.units.delete(id);
      this.statusManagers.delete(id);
    }
  }

  killUnit(id: UnitId): void {
    const unit = this.units.get(id);
    if (unit) {
      unit.isAlive = false;
      unit.stats.hp = 0;
      this.positionMap.delete(this.posKey(unit.position));
    }
  }

  moveUnit(id: UnitId, newPos: Position): void {
    const unit = this.units.get(id);
    if (unit) {
      this.positionMap.delete(this.posKey(unit.position));
      unit.position = newPos;
      this.positionMap.set(this.posKey(newPos), id);
    }
  }

  addStatusEffect(unitId: UnitId, effect: StatusEffectInstance): void {
    const unit = this.units.get(unitId);
    if (unit) {
      unit.statusEffects.push(effect);
    }
  }

  removeStatusEffect(unitId: UnitId, effectId: string): void {
    const unit = this.units.get(unitId);
    if (unit) {
      unit.statusEffects = unit.statusEffects.filter(e => e.id !== effectId);
    }
  }

  getStatusManager(unitId: UnitId): StatusEffectManager | undefined {
    return this.statusManagers.get(unitId);
  }

  tickStatusEffects(unitId: UnitId): void {
    const manager = this.statusManagers.get(unitId);
    const unit = this.units.get(unitId);
    if (manager && unit) {
      const result = manager.tickEffects();
      for (const dt of result.damageTicks) {
        this.applyDamage(unitId, dt.damage, 'true');
      }
      for (const ht of result.healTicks) {
        this.applyHeal(unitId, ht.heal);
      }
      for (const expId of result.expired) {
        unit.statusEffects = unit.statusEffects.filter(e => e.id !== expId);
      }
      unit.statusEffects = [...manager.getAllEffects()];
    }
  }

  applyDamage(unitId: UnitId, rawDamage: number, _damageType: string): number {
    const unit = this.units.get(unitId);
    if (!unit || !unit.isAlive) return 0;

    const shieldManager = this.statusManagers.get(unitId);
    let remaining = rawDamage;

    if (shieldManager) {
      const shields = shieldManager.getEffectsByType('shield');
      for (const shield of shields) {
        const absorbed = Math.min(remaining, shield.template.shieldAmount);
        remaining -= absorbed;
        shield.template.shieldAmount -= absorbed;
        if (shield.template.shieldAmount <= 0) {
          shieldManager.removeEffect(shield.id);
          unit.statusEffects = unit.statusEffects.filter(e => e.id !== shield.id);
        }
      }
    }

    unit.stats.hp = Math.max(0, unit.stats.hp - remaining);
    if (unit.stats.hp <= 0) {
      this.killUnit(unitId);
    }
    return remaining;
  }

  applyHeal(unitId: UnitId, amount: number): number {
    const unit = this.units.get(unitId);
    if (!unit || !unit.isAlive) return 0;
    const healed = Math.min(amount, unit.stats.maxHp - unit.stats.hp);
    unit.stats.hp += healed;
    return healed;
  }

  setSkillCooldown(unitId: UnitId, skillId: SkillId, turns: number): void {
    const unit = this.units.get(unitId);
    if (unit) {
      unit.cooldowns[skillId] = turns;
    }
  }

  tickCooldowns(unitId: UnitId): void {
    const unit = this.units.get(unitId);
    if (unit) {
      for (const skillId of Object.keys(unit.cooldowns)) {
        unit.cooldowns[skillId]--;
        if (unit.cooldowns[skillId] <= 0) {
          delete unit.cooldowns[skillId];
        }
      }
    }
  }

  checkSummonExpiry(unitId: UnitId, currentTurn: number): boolean {
    const unit = this.units.get(unitId);
    if (unit && unit.isSummon) {
      if (currentTurn - unit.summonTurn >= unit.summonDuration) {
        this.killUnit(unitId);
        return true;
      }
    }
    return false;
  }

  getEffectiveStats(unitId: UnitId): UnitStats {
    const unit = this.units.get(unitId);
    if (!unit) throw new Error(`Unit ${unitId} not found`);
    const manager = this.statusManagers.get(unitId);
    const mods = manager ? manager.getStatModifiers() : {};
    const stats = { ...unit.stats };
    for (const [key, value] of Object.entries(mods)) {
      if (key in stats) {
        (stats as Record<string, number>)[key] += value;
      }
    }
    return stats;
  }

  getTeams(): TeamId[] {
    const teams = new Set<TeamId>();
    for (const unit of this.units.values()) {
      if (unit.isAlive) teams.add(unit.team);
    }
    return Array.from(teams);
  }

  clone(): UnitManager {
    const cloned = new UnitManager();
    for (const [id, unit] of this.units) {
      cloned.units.set(id, {
        ...unit,
        stats: { ...unit.stats },
        skills: [...unit.skills],
        statusEffects: unit.statusEffects.map(e => ({ ...e, template: { ...e.template } })),
        tags: [...unit.tags],
        cooldowns: { ...unit.cooldowns },
        position: { ...unit.position } as Position,
      });
      cloned.positionMap.set(this.posKey(unit.position), id);
      const sm = this.statusManagers.get(id);
      if (sm) {
        cloned.statusManagers.set(id, sm.clone());
      }
    }
    return cloned;
  }
}
