import {
  SerializedBattle,
  BattleConfig,
  BattleSnapshot,
  UndoSnapshot,
  Unit,
  TerrainTile,
  BattleEvent,
  WinCondition,
  StatusEffectInstance,
} from './types';

export class BattleSerializer {
  private static VERSION = '1.0.0';

  serialize(
    config: BattleConfig,
    snapshot: BattleSnapshot,
    undoStack: UndoSnapshot[],
  ): string {
    const data: SerializedBattle = {
      version: BattleSerializer.VERSION,
      config: this.sanitizeConfig(config),
      snapshot: this.sanitizeSnapshot(snapshot),
      undoStack: undoStack.map((s: UndoSnapshot) => this.sanitizeUndoSnapshot(s)),
    };

    return JSON.stringify(data);
  }

  deserialize(json: string): SerializedBattle {
    const data = JSON.parse(json);
    if (!data.version || !data.config || !data.snapshot) {
      throw new Error('Invalid battle save data');
    }
    return data as SerializedBattle;
  }

  serializeConfig(config: BattleConfig): string {
    return JSON.stringify(this.sanitizeConfig(config));
  }

  deserializeConfig(json: string): BattleConfig {
    return JSON.parse(json);
  }

  serializeSnapshot(snapshot: BattleSnapshot): string {
    return JSON.stringify(this.sanitizeSnapshot(snapshot));
  }

  deserializeSnapshot(json: string): BattleSnapshot {
    return JSON.parse(json);
  }

  private sanitizeConfig(config: BattleConfig): BattleConfig {
    const sanitized = { ...config };
    sanitized.winConditions = sanitized.winConditions.map((wc: WinCondition) => {
      if (wc.type === 'custom') {
        return { type: 'eliminateAll' as const };
      }
      return wc;
    });
    sanitized.unitTemplates = sanitized.unitTemplates.map((ut: import('./types').UnitTemplate) => ({ ...ut }));
    sanitized.skillTemplates = sanitized.skillTemplates.map((st: import('./types').SkillTemplate) => ({ ...st }));
    sanitized.terrainTiles = sanitized.terrainTiles.map((t: TerrainTile) => ({
      ...t,
      terrain: { ...t.terrain },
    }));
    return sanitized;
  }

  private sanitizeSnapshot(snapshot: BattleSnapshot): BattleSnapshot {
    return {
      turn: snapshot.turn,
      phase: snapshot.phase,
      units: snapshot.units.map((u: Unit) => ({
        ...u,
        stats: { ...u.stats },
        skills: [...u.skills],
        statusEffects: u.statusEffects.map((e: StatusEffectInstance) => ({ ...e, template: { ...e.template } })),
        tags: [...u.tags],
        cooldowns: { ...u.cooldowns },
        position: { ...u.position },
      })),
      terrainTiles: snapshot.terrainTiles.map((t: TerrainTile) => ({
        ...t,
        terrain: { ...t.terrain },
        position: { ...t.position },
      })),
      mapType: snapshot.mapType,
      mapWidth: snapshot.mapWidth,
      mapHeight: snapshot.mapHeight,
      events: snapshot.events.map((e: BattleEvent) => ({ ...e, data: { ...e.data } })),
      winner: snapshot.winner,
      randomState: snapshot.randomState,
    };
  }

  private sanitizeUndoSnapshot(snapshot: UndoSnapshot): UndoSnapshot {
    return {
      units: snapshot.units.map((u: Unit) => ({
        ...u,
        stats: { ...u.stats },
        skills: [...u.skills],
        statusEffects: u.statusEffects.map((e: StatusEffectInstance) => ({ ...e, template: { ...e.template } })),
        tags: [...u.tags],
        cooldowns: { ...u.cooldowns },
        position: { ...u.position },
      })),
      turn: snapshot.turn,
      phase: snapshot.phase,
      events: snapshot.events.map((e: BattleEvent) => ({ ...e, data: { ...e.data } })),
      randomState: snapshot.randomState,
    };
  }
}
