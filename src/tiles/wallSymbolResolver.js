import { createSymbolGrid, isFloor } from "../core/grid.js";

const WALL_SYMBOL_SET = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);

function hasAdjacentFloor(grid, x, y) {
  return (
    isFloor(grid, x, y - 1) ||
    isFloor(grid, x + 1, y) ||
    isFloor(grid, x, y + 1) ||
    isFloor(grid, x - 1, y)
  );
}

function decideBaseSymbol(up, right, down, left) {
  if (down && right && !up && !left) return "A";
  if (down && left && !up && !right) return "C";
  if (up && right && !down && !left) return "K";
  if (up && left && !down && !right) return "L";

  if (left && right && down && !up) return "B";
  if (left && right && up && !down) return "I";
  if (up && down && right && !left) return "D";
  if (up && down && left && !right) return "E";

  if (down && right) return "A";
  if (down && left) return "C";
  if (up && right) return "K";
  if (up && left) return "L";

  if (down) return "B";
  if (up) return "I";
  if (right) return "D";
  if (left) return "E";

  return null;
}

function isWallSymbol(symbol) {
  return WALL_SYMBOL_SET.has(symbol);
}

function applySecondaryCornerRules(symbolGrid) {
  const height = symbolGrid.length;
  const width = symbolGrid[0].length;
  const output = symbolGrid.map((row) => [...row]);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const symbol = symbolGrid[y][x];

      if (symbol === "A") {
        output[y][x] = "G";
      } else if (symbol === "C") {
        output[y][x] = "F";
      } else if (symbol === "K") {
        const below = symbolGrid[y + 1]?.[x];
        const left = symbolGrid[y]?.[x - 1];
        if (isWallSymbol(below) && isWallSymbol(left)) {
          output[y][x] = "J";
        }
      } else if (symbol === "L") {
        const below = symbolGrid[y + 1]?.[x];
        const right = symbolGrid[y]?.[x + 1];
        if (isWallSymbol(below) && isWallSymbol(right)) {
          output[y][x] = "H";
        }
      }
    }
  }

  return output;
}

/**
 * @param {boolean[][]} floorGrid
 * @returns {(string|null)[][]}
 */
export function resolveWallSymbols(floorGrid) {
  const height = floorGrid.length;
  const width = floorGrid[0].length;
  const symbolGrid = createSymbolGrid(width, height, null);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isFloor(floorGrid, x, y)) {
        symbolGrid[y][x] = " ";
        continue;
      }

      if (!hasAdjacentFloor(floorGrid, x, y)) {
        continue;
      }

      const up = isFloor(floorGrid, x, y - 1);
      const right = isFloor(floorGrid, x + 1, y);
      const down = isFloor(floorGrid, x, y + 1);
      const left = isFloor(floorGrid, x - 1, y);

      symbolGrid[y][x] = decideBaseSymbol(up, right, down, left);
    }
  }

  return applySecondaryCornerRules(symbolGrid);
}
