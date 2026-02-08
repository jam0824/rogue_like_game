export function createBooleanGrid(width, height, initial = false) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => initial));
}

export function createSymbolGrid(width, height, initial = null) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => initial));
}

export function inBounds(grid, x, y) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

export function setCell(grid, x, y, value) {
  if (!inBounds(grid, x, y)) {
    return;
  }
  grid[y][x] = value;
}

export function getCell(grid, x, y) {
  if (!inBounds(grid, x, y)) {
    return undefined;
  }
  return grid[y][x];
}

export function fillRect(grid, x, y, width, height, value) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      setCell(grid, col, row, value);
    }
  }
}

export function forEachCell(grid, callback) {
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[0].length; x += 1) {
      callback(x, y, grid[y][x]);
    }
  }
}

export function isFloor(grid, x, y) {
  return getCell(grid, x, y) === true;
}
