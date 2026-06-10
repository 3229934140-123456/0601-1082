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
  ReplayRecord,
} from './types';

export class BattleSerializer {
  private static VERSION = '1.0.0';

  serialize(
    config: BattleConfig,
    snapshot: BattleSnapshot,
    undoStack: UndoSnapshot[],
    replayRecords: ReplayRecord[],
  ): string {
    const data: SerializedBattle = {
      version: BattleSerializer.VERSION,
      config: this.sanitizeConfig(config),
      snapshot: this.sanitizeSnapshot(snapshot),
      undoStack: undoStack.map((s: UndoSnapshot) => this.sanitizeUndoSnapshot(s)),
      replayRecords: this.sanitizeReplayRecords(replayRecords),
    };

    return JSON.stringify(data);
  }

  private sanitizeReplayRecords(records: ReplayRecord[]): ReplayRecord[] {
    return records.map(r => {
      const copy: ReplayRecord = {
        type: r.type,
        turn: r.turn,
        phase: r.phase,
      };
      if (r.action) copy.action = { ...r.action };
      if (r.result) {
        copy.result = {
          ...r.result,
          damageResults: r.result.damageResults.map(d => ({ ...d })),
          healResults: r.result.healResults.map(h => ({ ...h })),
          shieldResults: r.result.shieldResults.map(s => ({ ...s })),
          statusEffectsApplied: r.result.statusEffectsApplied.map(s => ({ ...s, template: { ...s.template } })),
          unitsMoved: r.result.unitsMoved.map(m => ({ ...m, from: { ...m.from }, to: { ...m.to } })),
          unitsDied: [...r.result.unitsDied],
          unitsSummoned: [...r.result.unitsSummoned],
          actionPointSpent: r.result.actionPointSpent,
          action: r.result.action ? { ...r.result.action } : undefined,
        } as typeof r.result;
      }
      if (r.unitId) copy.unitId = r.unitId;
      if (r.winner !== undefined) copy.winner = r.winner;
      return copy;
    });
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
      currentUnitIndex: snapshot.currentUnitIndex,
      turnOrder: snapshot.turnOrder.map(e => ({ ...e })),
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
      currentUnitIndex: snapshot.currentUnitIndex,
      turnOrder: snapshot.turnOrder.map(e => ({ ...e })),
      winner: snapshot.winner,
      recordCount: snapshot.recordCount,
    };
  }
}
