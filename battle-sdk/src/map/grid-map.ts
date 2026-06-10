import {
  Position,
  GridPosition,
  TerrainConfig,
  TerrainTile,
  Unit,
} from '../types';

export class GridMap {
  readonly width: number;
  readonly height: number;
  private tiles: Map<string, TerrainConfig> = new Map();
  private defaultTerrain: TerrainConfig;

  constructor(width: number, height: number, defaultTerrain: TerrainConfig, terrainTiles: TerrainTile[] = []) {
    this.width = width;
    this.height = height;
    this.defaultTerrain = defaultTerrain;

    for (const tile of terrainTiles) {
      const key = this.posKey(tile.position as GridPosition);
      this.tiles.set(key, tile.terrain);
    }
  }

  private posKey(pos: GridPosition): string {
    return `${pos.x},${pos.y}`;
  }

  private parseKey(key: string): GridPosition {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }

  isInBounds(pos: Position): boolean {
    const g = pos as GridPosition;
    return g.x >= 0 && g.x < this.width && g.y >= 0 && g.y < this.height;
  }

  getTerrain(pos: Position): TerrainConfig {
    if (!this.isInBounds(pos)) {
      return this.defaultTerrain;
    }
    return this.tiles.get(this.posKey(pos as GridPosition)) || this.defaultTerrain;
  }

  setTerrain(pos: Position, terrain: TerrainConfig): void {
    if (this.isInBounds(pos)) {
      this.tiles.set(this.posKey(pos as GridPosition), terrain);
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
    const g = pos as GridPosition;
    const dirs: [number, number][] = [
      [0, -1], [1, 0], [0, 1], [-1, 0],
    ];
    const result: Position[] = [];
    for (const [dx, dy] of dirs) {
      const np: GridPosition = { x: g.x + dx, y: g.y + dy };
      if (this.isInBounds(np)) {
        result.push(np);
      }
    }
    return result;
  }

  getDiagonalNeighbors(pos: Position): Position[] {
    const g = pos as GridPosition;
    const dirs: [number, number][] = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ];
    const result: Position[] = [];
    for (const [dx, dy] of dirs) {
      const np: GridPosition = { x: g.x + dx, y: g.y + dy };
      if (this.isInBounds(np)) {
        result.push(np);
      }
    }
    return result;
  }

  distance(a: Position, b: Position): number {
    const ga = a as GridPosition;
    const gb = b as GridPosition;
    return Math.abs(ga.x - gb.x) + Math.abs(ga.y - gb.y);
  }

  chebyshevDistance(a: Position, b: Position): number {
    const ga = a as GridPosition;
    const gb = b as GridPosition;
    return Math.max(Math.abs(ga.x - gb.x), Math.abs(ga.y - gb.y));
  }

  getPositionsInRange(center: Position, range: number): Position[] {
    const gc = center as GridPosition;
    const result: Position[] = [];
    for (let x = gc.x - range; x <= gc.x + range; x++) {
      for (let y = gc.y - range; y <= gc.y + range; y++) {
        const pos: GridPosition = { x, y };
        if (this.isInBounds(pos) && this.distance(center, pos) <= range) {
          result.push(pos);
        }
      }
    }
    return result;
  }

  getPositionsInChebyshevRange(center: Position, range: number): Position[] {
    const gc = center as GridPosition;
    const result: Position[] = [];
    for (let x = gc.x - range; x <= gc.x + range; x++) {
      for (let y = gc.y - range; y <= gc.y + range; y++) {
        const pos: GridPosition = { x, y };
        if (this.isInBounds(pos) && this.chebyshevDistance(center, pos) <= range) {
          result.push(pos);
        }
      }
    }
    return result;
  }

  getLineOfSight(from: Position, to: Position): boolean {
    const gf = from as GridPosition;
    const gt = to as GridPosition;
    let x0 = gf.x;
    let y0 = gf.y;
    const x1 = gt.x;
    const y1 = gt.y;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      if (x0 === x1 && y0 === y1) return true;
      const pos: GridPosition = { x: x0, y: y0 };
      if (!(x0 === gf.x && y0 === gf.y)) {
        const terrain = this.getTerrain(pos);
        if (terrain.blocksVision) return false;
      }
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  getAllPositions(): Position[] {
    const result: Position[] = [];
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        result.push({ x, y } as GridPosition);
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

  clone(): GridMap {
    const tiles = this.getTerrainTiles();
    return new GridMap(this.width, this.height, { ...this.defaultTerrain }, tiles.map(t => ({
      position: { ...t.position },
      terrain: { ...t.terrain },
    })));
  }
}
