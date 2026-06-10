import {
  StatusEffectTemplate,
  StatusEffectInstance,
  StatusEffectType,
  UnitId,
} from '../types';

export class StatusEffectManager {
  private effects: Map<string, StatusEffectInstance> = new Map();
  private nextId: number = 0;

  private generateId(): string {
    return `se_${this.nextId++}`;
  }

  addEffect(
    template: StatusEffectTemplate,
    sourceUnitId: UnitId,
    currentTurn: number,
  ): StatusEffectInstance {
    const instance: StatusEffectInstance = {
      id: this.generateId(),
      template: { ...template },
      remainingDuration: template.duration,
      remainingTicks: template.duration * (template.tickInterval > 0 ? Math.floor(1 / template.tickInterval) : 1),
      sourceUnitId,
      appliedAtTurn: currentTurn,
    };
    this.effects.set(instance.id, instance);
    return instance;
  }

  removeEffect(effectId: string): boolean {
    return this.effects.delete(effectId);
  }

  getEffect(effectId: string): StatusEffectInstance | undefined {
    return this.effects.get(effectId);
  }

  getAllEffects(): StatusEffectInstance[] {
    return Array.from(this.effects.values());
  }

  getEffectsByType(type: StatusEffectType): StatusEffectInstance[] {
    return this.getAllEffects().filter(e => e.template.type === type);
  }

  tickEffects(): {
    damageTicks: { effectId: string; damage: number }[];
    healTicks: { effectId: string; heal: number }[];
    expired: string[];
  } {
    const damageTicks: { effectId: string; damage: number }[] = [];
    const healTicks: { effectId: string; heal: number }[] = [];
    const expired: string[] = [];

    for (const [id, effect] of this.effects) {
      effect.remainingTicks--;

      if (effect.template.damagePerTick > 0) {
        damageTicks.push({ effectId: id, damage: effect.template.damagePerTick });
      }
      if (effect.template.healPerTick > 0) {
        healTicks.push({ effectId: id, heal: effect.template.healPerTick });
      }

      effect.remainingDuration--;
      if (effect.remainingDuration <= 0) {
        expired.push(id);
        this.effects.delete(id);
      }
    }

    return { damageTicks, healTicks, expired };
  }

  hasStatusType(type: StatusEffectType): boolean {
    return this.getAllEffects().some(e => e.template.type === type);
  }

  isStunned(): boolean {
    return this.hasStatusType('stun');
  }

  isRooted(): boolean {
    return this.hasStatusType('root');
  }

  isSilenced(): boolean {
    return this.hasStatusType('silence');
  }

  getShieldTotal(): number {
    return this.getEffectsByType('shield')
      .reduce((sum, e) => sum + e.template.shieldAmount, 0);
  }

  getStatModifiers(): Record<string, number> {
    const modifiers: Record<string, number> = {};
    for (const effect of this.getAllEffects()) {
      const mod = effect.template.statModifier;
      for (const [key, value] of Object.entries(mod)) {
        modifiers[key] = (modifiers[key] || 0) + value;
      }
    }
    return modifiers;
  }

  purgeByType(type: StatusEffectType): string[] {
    const removed: string[] = [];
    for (const [id, effect] of this.effects) {
      if (effect.template.type === type) {
        removed.push(id);
        this.effects.delete(id);
      }
    }
    return removed;
  }

  purgeAll(): string[] {
    const ids = Array.from(this.effects.keys());
    this.effects.clear();
    return ids;
  }

  restoreEffect(instance: StatusEffectInstance): void {
    if (!this.effects.has(instance.id)) {
      this.effects.set(instance.id, { ...instance, template: { ...instance.template } });
      const idNum = parseInt(instance.id.replace('se_', ''), 10);
      if (!isNaN(idNum) && idNum >= this.nextId) {
        this.nextId = idNum + 1;
      }
    }
  }

  clone(): StatusEffectManager {
    const cloned = new StatusEffectManager();
    cloned.nextId = this.nextId;
    for (const [id, effect] of this.effects) {
      cloned.effects.set(id, { ...effect, template: { ...effect.template } });
    }
    return cloned;
  }
}
