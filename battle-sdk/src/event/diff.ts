import {
  BattleSnapshot,
  Unit,
  UnitId,
  StatusEffectInstance,
  SerializedBattle,
} from '../types';

export interface DiffEntry {
  field: string;
  leftValue: unknown;
  rightValue: unknown;
}

export interface UnitDiff {
  unitId: UnitId;
  unitName: string;
  differences: DiffEntry[];
}

export interface BattleDiffResult {
  metaDifferences: DiffEntry[];
  unitDifferences: UnitDiff[];
  missingInRight: UnitId[];
  missingInLeft: UnitId[];
  statusEffectDifferences: {
    unitId: UnitId;
    unitName: string;
    onlyInLeft: string[];
    onlyInRight: string[];
  }[];
  hasDifferences: boolean;
}

export class BattleDiff {
  static diffSnapshots(left: BattleSnapshot, right: BattleSnapshot): BattleDiffResult {
    const metaDifferences = BattleDiff.diffMeta(left, right);
    const unitDifferences = BattleDiff.diffUnits(left.units, right.units);
    const { missingInRight, missingInLeft } = BattleDiff.diffUnitPresence(left.units, right.units);
    const statusEffectDifferences = BattleDiff.diffStatusEffects(left.units, right.units);

    const hasDifferences =
      metaDifferences.length > 0 ||
      unitDifferences.some(ud => ud.differences.length > 0) ||
      missingInRight.length > 0 ||
      missingInLeft.length > 0 ||
      statusEffectDifferences.some(sed => sed.onlyInLeft.length > 0 || sed.onlyInRight.length > 0);

    return {
      metaDifferences,
      unitDifferences,
      missingInRight,
      missingInLeft,
      statusEffectDifferences,
      hasDifferences,
    };
  }

  static diffSerialized(left: SerializedBattle, right: SerializedBattle): BattleDiffResult {
    return BattleDiff.diffSnapshots(left.snapshot, right.snapshot);
  }

  static diffSerializedJson(leftJson: string, rightJson: string): BattleDiffResult {
    const left = JSON.parse(leftJson) as SerializedBattle;
    const right = JSON.parse(rightJson) as SerializedBattle;
    return BattleDiff.diffSerialized(left, right);
  }

  private static diffMeta(left: BattleSnapshot, right: BattleSnapshot): DiffEntry[] {
    const diffs: DiffEntry[] = [];
    const fields: { key: keyof BattleSnapshot; label: string }[] = [
      { key: 'turn', label: '回合' },
      { key: 'phase', label: '阶段' },
      { key: 'winner', label: '胜负' },
      { key: 'randomState', label: '随机状态' },
      { key: 'currentUnitIndex', label: '当前行动单位索引' },
    ];

    for (const { key, label } of fields) {
      if (left[key] !== right[key]) {
        diffs.push({
          field: label,
          leftValue: left[key],
          rightValue: right[key],
        });
      }
    }

    const leftCurrentUnit = left.currentUnitIndex < left.turnOrder.length
      ? left.turnOrder[left.currentUnitIndex]?.unitId : null;
    const rightCurrentUnit = right.currentUnitIndex < right.turnOrder.length
      ? right.turnOrder[right.currentUnitIndex]?.unitId : null;

    if (leftCurrentUnit !== rightCurrentUnit) {
      diffs.push({
        field: '当前行动单位',
        leftValue: leftCurrentUnit,
        rightValue: rightCurrentUnit,
      });
    }

    if (left.turnOrder.length !== right.turnOrder.length) {
      diffs.push({
        field: '行动队列长度',
        leftValue: left.turnOrder.length,
        rightValue: right.turnOrder.length,
      });
    } else {
      for (let i = 0; i < left.turnOrder.length; i++) {
        if (left.turnOrder[i].unitId !== right.turnOrder[i].unitId) {
          diffs.push({
            field: `行动队列位置${i}`,
            leftValue: left.turnOrder[i].unitId,
            rightValue: right.turnOrder[i].unitId,
          });
        }
      }
    }

    if (left.events.length !== right.events.length) {
      diffs.push({
        field: '事件数量',
        leftValue: left.events.length,
        rightValue: right.events.length,
      });
    }

    return diffs;
  }

  private static diffUnits(leftUnits: Unit[], rightUnits: Unit[]): UnitDiff[] {
    const rightMap = new Map(rightUnits.map(u => [u.id, u]));
    const diffs: UnitDiff[] = [];

    for (const leftUnit of leftUnits) {
      const rightUnit = rightMap.get(leftUnit.id);
      if (!rightUnit) continue;

      const differences = BattleDiff.diffSingleUnit(leftUnit, rightUnit);
      if (differences.length > 0) {
        diffs.push({
          unitId: leftUnit.id,
          unitName: leftUnit.name,
          differences,
        });
      }
    }

    return diffs;
  }

  private static diffSingleUnit(left: Unit, right: Unit): DiffEntry[] {
    const diffs: DiffEntry[] = [];

    if (left.isAlive !== right.isAlive) {
      diffs.push({ field: '存活状态', leftValue: left.isAlive, rightValue: right.isAlive });
    }

    const statFields: { key: keyof import('../types').UnitStats; label: string }[] = [
      { key: 'hp', label: 'HP' },
      { key: 'maxHp', label: 'MaxHP' },
      { key: 'mp', label: 'MP' },
      { key: 'attack', label: '攻击' },
      { key: 'defense', label: '防御' },
      { key: 'magicAttack', label: '魔攻' },
      { key: 'magicDefense', label: '魔防' },
      { key: 'speed', label: '速度' },
      { key: 'actionPoints', label: '行动点' },
      { key: 'moveRange', label: '移动范围' },
      { key: 'attackRange', label: '攻击范围' },
    ];

    for (const { key, label } of statFields) {
      if (left.stats[key] !== right.stats[key]) {
        diffs.push({ field: label, leftValue: left.stats[key], rightValue: right.stats[key] });
      }
    }

    const leftShield = left.statusEffects
      .filter(e => e.template.type === 'shield')
      .reduce((sum, e) => sum + e.template.shieldAmount, 0);
    const rightShield = right.statusEffects
      .filter(e => e.template.type === 'shield')
      .reduce((sum, e) => sum + e.template.shieldAmount, 0);

    if (leftShield !== rightShield) {
      diffs.push({ field: '护盾总量', leftValue: leftShield, rightValue: rightShield });
    }

    if ('x' in left.position && 'x' in right.position) {
      if (left.position.x !== right.position.x || left.position.y !== right.position.y) {
        diffs.push({
          field: '位置',
          leftValue: `(${left.position.x},${(left.position as { x: number; y: number }).y})`,
          rightValue: `(${(right.position as { x: number; y: number }).x},${(right.position as { x: number; y: number }).y})`,
        });
      }
    } else if ('q' in left.position && 'q' in right.position) {
      const lp = left.position as { q: number; r: number };
      const rp = right.position as { q: number; r: number };
      if (lp.q !== rp.q || lp.r !== rp.r) {
        diffs.push({ field: '位置', leftValue: `(${lp.q},${lp.r})`, rightValue: `(${rp.q},${rp.r})` });
      }
    }

    if (left.hasActed !== right.hasActed) {
      diffs.push({ field: '已行动', leftValue: left.hasActed, rightValue: right.hasActed });
    }

    const leftCooldownKeys = Object.keys(left.cooldowns);
    const rightCooldownKeys = Object.keys(right.cooldowns);
    if (leftCooldownKeys.length !== rightCooldownKeys.length) {
      diffs.push({
        field: '技能冷却数',
        leftValue: leftCooldownKeys.length,
        rightValue: rightCooldownKeys.length,
      });
    } else {
      for (const key of leftCooldownKeys) {
        if (left.cooldowns[key] !== right.cooldowns[key]) {
          diffs.push({
            field: `冷却[${key}]`,
            leftValue: left.cooldowns[key],
            rightValue: right.cooldowns[key],
          });
        }
      }
    }

    return diffs;
  }

  private static diffUnitPresence(leftUnits: Unit[], rightUnits: Unit[]): {
    missingInRight: UnitId[];
    missingInLeft: UnitId[];
  } {
    const leftIds = new Set(leftUnits.map(u => u.id));
    const rightIds = new Set(rightUnits.map(u => u.id));

    const missingInRight = leftUnits.filter(u => !rightIds.has(u.id)).map(u => u.id);
    const missingInLeft = rightUnits.filter(u => !leftIds.has(u.id)).map(u => u.id);

    return { missingInRight, missingInLeft };
  }

  private static diffStatusEffects(leftUnits: Unit[], rightUnits: Unit[]): {
    unitId: UnitId;
    unitName: string;
    onlyInLeft: string[];
    onlyInRight: string[];
  }[] {
    const rightMap = new Map(rightUnits.map(u => [u.id, u]));
    const result: { unitId: UnitId; unitName: string; onlyInLeft: string[]; onlyInRight: string[] }[] = [];

    for (const leftUnit of leftUnits) {
      const rightUnit = rightMap.get(leftUnit.id);
      if (!rightUnit) continue;

      const leftEffects = new Set(leftUnit.statusEffects.map(e => `${e.template.type}:${e.template.name}`));
      const rightEffects = new Set(rightUnit.statusEffects.map(e => `${e.template.type}:${e.template.name}`));

      const onlyInLeft = Array.from(leftEffects).filter(e => !rightEffects.has(e));
      const onlyInRight = Array.from(rightEffects).filter(e => !leftEffects.has(e));

      if (onlyInLeft.length > 0 || onlyInRight.length > 0) {
        result.push({
          unitId: leftUnit.id,
          unitName: leftUnit.name,
          onlyInLeft,
          onlyInRight,
        });
      }
    }

    return result;
  }
}
