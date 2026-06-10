import { GridMap } from './grid-map';
import { HexMap } from './hex-map';

export { GridMap } from './grid-map';
export { HexMap } from './hex-map';

export type BattleMap = GridMap | HexMap;

export function isGridMap(map: BattleMap): map is GridMap {
  return map instanceof GridMap;
}

export function isHexMap(map: BattleMap): map is HexMap {
  return map instanceof HexMap;
}
