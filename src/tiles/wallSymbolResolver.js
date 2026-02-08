import { createSymbolGrid, isFloor } from "../core/grid.js";

const FLOOR_SYMBOL = " ";
const WALL_SYMBOL_SET = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);

function getFloorAdjacency(floorGrid, x, y) {
  return {
    up: isFloor(floorGrid, x, y - 1),
    right: isFloor(floorGrid, x + 1, y),
    down: isFloor(floorGrid, x, y + 1),
    left: isFloor(floorGrid, x - 1, y),
  };
}

function hasAdjacentFloor(adjacency) {
  return adjacency.up || adjacency.right || adjacency.down || adjacency.left;
}

function decidePrimarySymbol(adjacency) {
  const { up, right, down, left } = adjacency;

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

function getSymbol(symbolGrid, x, y) {
  if (y < 0 || y >= symbolGrid.length || x < 0 || x >= symbolGrid[0].length) {
    return null;
  }
  return symbolGrid[y][x];
}

function decideSecondarySymbol(symbolGrid, x, y) {
  const symbol = symbolGrid[y][x];

  if (symbol === "A") {
    return "G";
  }
  if (symbol === "C") {
    return "F";
  }
  if (symbol === "K") {
    const below = getSymbol(symbolGrid, x, y + 1);
    const left = getSymbol(symbolGrid, x - 1, y);
    if (isWallSymbol(below) || (below === null && isWallSymbol(left))) {
      return "J";
    }
    return symbol;
  }
  if (symbol === "L") {
    const below = getSymbol(symbolGrid, x, y + 1);
    const right = getSymbol(symbolGrid, x + 1, y);
    if (isWallSymbol(below) || (below === null && isWallSymbol(right))) {
      return "H";
    }
    return symbol;
  }

  return symbol;
}

function applySecondaryCornerRules(primaryGrid) {
  const height = primaryGrid.length;
  const width = primaryGrid[0].length;
  const output = primaryGrid.map((row) => [...row]);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      output[y][x] = decideSecondarySymbol(primaryGrid, x, y);
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
  const primaryGrid = createSymbolGrid(width, height, null);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isFloor(floorGrid, x, y)) {
        primaryGrid[y][x] = FLOOR_SYMBOL;
        continue;
      }

      const adjacency = getFloorAdjacency(floorGrid, x, y);
      if (!hasAdjacentFloor(adjacency)) {
        continue;
      }

      primaryGrid[y][x] = decidePrimarySymbol(adjacency);
    }
  }

  return applySecondaryCornerRules(primaryGrid);
}
