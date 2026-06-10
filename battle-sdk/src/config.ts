import {
  BattleConfig,
  TerrainConfig,
  UnitTemplate,
  SkillTemplate,
  WinCondition,
} from './types';

const DEFAULT_TERRAIN: TerrainConfig = {
  type: 'plain',
  moveCost: 1,
  defenseBonus: 0,
  attackBonus: 0,
  avoidBonus: 0,
  isObstacle: false,
  blocksVision: false,
  healingPerTurn: 0,
  damagePerTurn: 0,
};

const TERRAIN_PRESETS: Record<string, TerrainConfig> = {
  plain: { ...DEFAULT_TERRAIN },
  forest: {
    type: 'forest',
    moveCost: 2,
    defenseBonus: 2,
    attackBonus: -1,
    avoidBonus: 0.15,
    isObstacle: false,
    blocksVision: true,
    healingPerTurn: 0,
    damagePerTurn: 0,
  },
  mountain: {
    type: 'mountain',
    moveCost: 3,
    defenseBonus: 3,
    attackBonus: 1,
    avoidBonus: 0.1,
    isObstacle: false,
    blocksVision: true,
    healingPerTurn: 0,
    damagePerTurn: 0,
  },
  water: {
    type: 'water',
    moveCost: 999,
    defenseBonus: 0,
    attackBonus: 0,
    avoidBonus: 0,
    isObstacle: true,
    blocksVision: false,
    healingPerTurn: 0,
    damagePerTurn: 0,
  },
  wall: {
    type: 'wall',
    moveCost: 999,
    defenseBonus: 0,
    attackBonus: 0,
    avoidBonus: 0,
    isObstacle: true,
    blocksVision: true,
    healingPerTurn: 0,
    damagePerTurn: 0,
  },
  swamp: {
    type: 'swamp',
    moveCost: 3,
    defenseBonus: -2,
    attackBonus: -1,
    avoidBonus: 0,
    isObstacle: false,
    blocksVision: false,
    healingPerTurn: 0,
    damagePerTurn: 5,
  },
  lava: {
    type: 'lava',
    moveCost: 2,
    defenseBonus: 0,
    attackBonus: 2,
    avoidBonus: 0,
    isObstacle: false,
    blocksVision: false,
    healingPerTurn: 0,
    damagePerTurn: 15,
  },
  ice: {
    type: 'ice',
    moveCost: 1,
    defenseBonus: -1,
    attackBonus: 0,
    avoidBonus: -0.05,
    isObstacle: false,
    blocksVision: false,
    healingPerTurn: 0,
    damagePerTurn: 0,
  },
};

export class ConfigLoader {
  private unitTemplates: Map<string, UnitTemplate> = new Map();
  private skillTemplates: Map<string, SkillTemplate> = new Map();
  private terrainPresets: Map<string, TerrainConfig> = new Map();
  private winConditions: WinCondition[] = [];

  constructor() {
    for (const [key, value] of Object.entries(TERRAIN_PRESETS)) {
      this.terrainPresets.set(key, value);
    }
  }

  loadConfig(raw: Partial<BattleConfig>): BattleConfig {
    this.unitTemplates.clear();
    this.skillTemplates.clear();
    this.winConditions = [];

    const unitTemplates = raw.unitTemplates || [];
    const skillTemplates = raw.skillTemplates || [];

    for (const ut of unitTemplates) {
      this.unitTemplates.set(ut.id, ut);
    }
    for (const st of skillTemplates) {
      this.skillTemplates.set(st.id, st);
    }

    this.winConditions = raw.winConditions || [{ type: 'eliminateAll' }];

    return {
      mapType: raw.mapType || 'grid',
      mapWidth: raw.mapWidth || 10,
      mapHeight: raw.mapHeight || 10,
      maxTurns: raw.maxTurns || 50,
      seed: raw.seed ?? Date.now(),
      winConditions: this.winConditions,
      terrainTiles: raw.terrainTiles || [],
      defaultTerrain: raw.defaultTerrain || { ...DEFAULT_TERRAIN },
      unitTemplates,
      skillTemplates,
      actionPointsPerTurn: raw.actionPointsPerTurn || 3,
      allowUndo: raw.allowUndo ?? true,
      teamOrder: raw.teamOrder || [],
    };
  }

  getUnitTemplate(id: string): UnitTemplate | undefined {
    return this.unitTemplates.get(id);
  }

  getSkillTemplate(id: string): SkillTemplate | undefined {
    return this.skillTemplates.get(id);
  }

  getTerrainPreset(type: string): TerrainConfig | undefined {
    return this.terrainPresets.get(type);
  }

  registerUnitTemplate(template: UnitTemplate): void {
    this.unitTemplates.set(template.id, template);
  }

  registerSkillTemplate(template: SkillTemplate): void {
    this.skillTemplates.set(template.id, template);
  }

  registerTerrainPreset(name: string, config: TerrainConfig): void {
    this.terrainPresets.set(name, config);
  }

  getAllUnitTemplates(): UnitTemplate[] {
    return Array.from(this.unitTemplates.values());
  }

  getAllSkillTemplates(): SkillTemplate[] {
    return Array.from(this.skillTemplates.values());
  }

  validateConfig(config: BattleConfig): string[] {
    const errors: string[] = [];

    if (config.mapWidth <= 0) errors.push('mapWidth must be positive');
    if (config.mapHeight <= 0) errors.push('mapHeight must be positive');
    if (config.maxTurns <= 0) errors.push('maxTurns must be positive');
    if (config.actionPointsPerTurn <= 0) errors.push('actionPointsPerTurn must be positive');

    for (const tile of config.terrainTiles) {
      if ('x' in tile.position && 'y' in tile.position) {
        if (tile.position.x < 0 || tile.position.x >= config.mapWidth ||
            tile.position.y < 0 || tile.position.y >= config.mapHeight) {
          errors.push(`Terrain tile at (${tile.position.x},${tile.position.y}) is out of bounds`);
        }
      }
    }

    for (const ut of config.unitTemplates) {
      if (ut.stats.maxHp <= 0) errors.push(`Unit ${ut.id}: maxHp must be positive`);
      if (ut.stats.hp > ut.stats.maxHp) errors.push(`Unit ${ut.id}: hp exceeds maxHp`);
      for (const sid of ut.skills) {
        if (!this.skillTemplates.has(sid)) {
          errors.push(`Unit ${ut.id} references unknown skill ${sid}`);
        }
      }
    }

    return errors;
  }
}
