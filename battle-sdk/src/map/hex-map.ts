import {
  Position,
  HexPosition,
  TerrainConfig,
  TerrainTile,
  Unit,
} from '../types';

export class HexMap {
  readonly width: number;
  readonly height: number;
  private tiles: Map<string, TerrainConfig> = new Map();
  private defaultTerrain: TerrainConfig;

  constructor(width: number, height: number, defaultTerrain: TerrainConfig, terrainTiles: TerrainTile[] = []) {
    this.width = width;
    this.height = height;
    this.defaultTerrain = defaultTerrain;

    for (const tile of terrainTiles) {
      const key = this.posKey(tile.position as HexPosition);
      this.tiles.set(key, tile.terrain);
    }
  }

  private posKey(pos: HexPosition): string {
    return `${pos.q},${pos.r}`;
  }

  private parseKey(key: string): HexPosition {
    const [q, r] = key.split(',').map(Number);
    return { q, r, s: -q - r };
  }

  offsetToAxial(col: number, row: number): HexPosition {
    const q = col - (row - (row & 1)) / 2;
    const r = row;
    return { q, r, s: -q - r };
  }

  axialToOffset(pos: HexPosition): { col: number; row: number } {
    const col = pos.q + (pos.r - (pos.r & 1)) / 2;
    const row = pos.r;
    return { col, row };
  }

  isInBounds(pos: Position): boolean {
    const h = pos as HexPosition;
    const { col, row } = this.axialToOffset(h);
    return col >= 0 && col < this.width && row >= 0 && row < this.height;
  }

  getTerrain(pos: Position): TerrainConfig {
    if (!this.isInBounds(pos)) return this.defaultTerrain;
    return this.tiles.get(this.posKey(pos as HexPosition)) || this.defaultTerrain;
  }

  setTerrain(pos: Position, terrain: TerrainConfig): void {
    if (this.isInBounds(pos)) {
      this.tiles.set(this.posKey(pos as HexPosition), terrain);
    }
  }

  isPassable(pos: Position, unit?: Unit): boolean {
    if (!this.isInBounds(pos)) return false;
    const terrain = this.getTerrain(pos);
    if (terrain.isObstacle) return false;
    if (unit) {
      const blockedTags: Record<string, string[]> = {
        water: ['ground'],
        lava: ['ground'],
      };
      const blocked = blockedTags[terrain.type];
      if (blocked && unit.tags.some(t => blocked.includes(t))) return false;
    }
    return true;
  }

  getNeighbors(pos: Position): Position[] {
    const h = pos as HexPosition;
    const dirs: [number, number, number][] = [
      [1, 0, -1], [1, -1, 0], [0, -1, 1],
      [-1, 0, 1], [-1, 1, 0], [0, 1, -1],
    ];
    const result: Position[] = [];
    for (const [dq, dr, ds] of dirs) {
      const np: HexPosition = { q: h.q + dq, r: h.r + dr, s: h.s + ds };
      if (this.isInBounds(np)) {
        result.push(np);
      }
    }
    return result;
  }

  distance(a: Position, b: Position): number {
    const ha = a as HexPosition;
    const hb = b as HexPosition;
    return Math.max(
      Math.abs(ha.q - hb.q),
      Math.abs(ha.r - hb.r),
      Math.abs(ha.s - hb.s)
    );
  }

  getPositionsInRange(center: Position, range: number): Position[] {
    const hc = center as HexPosition;
    const result: Position[] = [];
    for (let q = hc.q - range; q <= hc.q + range; q++) {
      for (let r = hc.r - range; r <= hc.r + range; r++) {
        const s = -q - r;
        const pos: HexPosition = { q, r, s };
        if (this.isInBounds(pos) && this.distance(center, pos) <= range) {
          result.push(pos);
        }
      }
    }
    return result;
  }

  getLineOfSight(from: Position, to: Position): boolean {
    const hf = from as HexPosition;
    const ht = to as HexPosition;
    const dist = this.distance(from, to);
    if (dist === 0) return true;

    const n = dist;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const q = Math.round(hf.q + (ht.q - hf.q) * t);
      const r = Math.round(hf.r + (ht.r - hf.r) * t);
      const s = -q - r;
      const pos: HexPosition = { q, r, s };
      if (this.isInBounds(pos)) {
        const terrain = this.getTerrain(pos);
        if (terrain.blocksVision) return false;
      }
    }
    return true;
  }

  getAllPositions(): Position[] {
    const result: Position[] = [];
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        result.push(this.offsetToAxial(col, row));
      }
    }
    return result;
  }

  getTerrainTiles(): TerrainTile[] {
    const result: TerrainTile[] = [];
    for (const [key, terrain] of this.tiles) {
      const pos = this.parseKey(key);
      result.push({ position: pos, terrain });
    }
    return result;
  }

  clone(): HexMap {
    const tiles = this.getTerrainTiles();
    return new HexMap(this.width, this.height, { ...this.defaultTerrain }, tiles.map(t => ({
      position: { ...t.position } as HexPosition,
      terrain: { ...t.terrain },
    })));
  }
}
