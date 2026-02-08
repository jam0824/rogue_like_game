import { TALL_WALL_TILE_HEIGHT } from "../config/constants.js";
import { TALL_WALL_SYMBOLS } from "./tileCatalog.js";

function createBaseWalkableGrid(floorGrid) {
  return floorGrid.map((row) => row.map((cell) => cell === true));
}

function applyTallWallBlocking(walkableGrid, symbolGrid) {
  const height = symbolGrid.length;
  const width = symbolGrid[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const symbol = symbolGrid[y][x];
      if (!TALL_WALL_SYMBOLS.has(symbol)) {
        continue;
      }

      for (let offset = 0; offset < TALL_WALL_TILE_HEIGHT; offset += 1) {
        const targetY = y + offset;
        if (targetY < 0 || targetY >= height) {
          break;
        }
        walkableGrid[targetY][x] = false;
      }
    }
  }
}

/**
 * @param {boolean[][]} floorGrid
 * @param {(string|null)[][]} symbolGrid
 * @returns {boolean[][]}
 */
export function buildWalkableGrid(floorGrid, symbolGrid) {
  const walkableGrid = createBaseWalkableGrid(floorGrid);
  applyTallWallBlocking(walkableGrid, symbolGrid);
  return walkableGrid;
}
