const STAIR_SYMBOL = "S";
const PRIMARY_STAIR_SOURCE_SYMBOL = "B";
const STAIR_WIDTH_TILES = 2;
const TALL_WALL_SOURCE_SYMBOLS = new Set(["B", "F", "G"]);
const WALL_SOURCE_SYMBOLS = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "S"]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWallHeightTiles(value, fallback = 3) {
  if (!Number.isFinite(value)) {
    return Math.max(1, Math.floor(fallback));
  }
  return Math.max(1, Math.floor(Number(value)));
}

function normalizeDistance(value, fallback = 1) {
  if (!Number.isFinite(value)) {
    return Math.max(0, Math.floor(fallback));
  }
  return Math.max(0, Math.floor(Number(value)));
}

function normalizeTile(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return Math.floor(fallback);
  }
  return Math.floor(Number(value));
}

function cloneSymbolGrid(symbolGrid) {
  return symbolGrid.map((row) => [...row]);
}

function findStairsRoom(dungeon) {
  if (!Array.isArray(dungeon?.rooms)) {
    return null;
  }

  return dungeon.rooms.find((room) => room?.id === dungeon.stairsRoomId) ?? null;
}

function buildAnchorCandidates(symbolGrid, rowY, room) {
  const width = symbolGrid[0].length;
  const minX = clamp(Math.floor(room.x), 0, width - STAIR_WIDTH_TILES);
  const maxX = clamp(Math.floor(room.x + room.w - STAIR_WIDTH_TILES), 0, width - STAIR_WIDTH_TILES);
  if (maxX < minX) {
    return [];
  }

  const centerX = Number.isFinite(room.centerX) ? room.centerX : room.x + room.w / 2;
  const candidates = [];
  for (let x = minX; x <= maxX; x += 1) {
    const left = symbolGrid[rowY][x];
    const right = symbolGrid[rowY][x + 1];

    if (left === PRIMARY_STAIR_SOURCE_SYMBOL && right === PRIMARY_STAIR_SOURCE_SYMBOL) {
      candidates.push({
        x,
        priority: 0,
        score: Math.abs(x + 0.5 - centerX),
      });
      continue;
    }

    if (TALL_WALL_SOURCE_SYMBOLS.has(left) && TALL_WALL_SOURCE_SYMBOLS.has(right)) {
      candidates.push({
        x,
        priority: 1,
        score: Math.abs(x + 0.5 - centerX),
      });
      continue;
    }

    if (WALL_SOURCE_SYMBOLS.has(left) && WALL_SOURCE_SYMBOLS.has(right)) {
      candidates.push({
        x,
        priority: 2,
        score: Math.abs(x + 0.5 - centerX),
      });
      continue;
    }

    // Fallback: force place stairs even when corridor carving breaks the top wall shape.
    candidates.push({
      x,
      priority: 3,
      score: Math.abs(x + 0.5 - centerX),
    });
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return a.x - b.x;
  });

  return candidates;
}

function buildTriggerTiles(anchorTileX, anchorTileY, wallHeightTiles, gridWidth, gridHeight) {
  const triggerY = anchorTileY + normalizeWallHeightTiles(wallHeightTiles);
  const triggerTiles = [];

  for (let offsetX = 0; offsetX < STAIR_WIDTH_TILES; offsetX += 1) {
    const tileX = anchorTileX + offsetX;
    if (tileX < 0 || tileX >= gridWidth || triggerY < 0 || triggerY >= gridHeight) {
      continue;
    }
    triggerTiles.push({ tileX, tileY: triggerY });
  }

  return triggerTiles;
}

/**
 * @param {(string|null)[][]} symbolGrid
 * @param {{rooms?:Array<{id:number,x:number,y:number,w:number,h:number,centerX:number}>,stairsRoomId?:number}} dungeon
 * @param {number} wallHeightTiles
 * @returns {{symbolGrid:(string|null)[][],downStair:{anchorTileX:number,anchorTileY:number,widthTiles:number,heightTiles:number,triggerTiles:{tileX:number,tileY:number}[],isEnabled:boolean}|null}}
 */
export function placeDownStairSymbols(symbolGrid, dungeon, wallHeightTiles) {
  if (!Array.isArray(symbolGrid) || symbolGrid.length <= 0 || !Array.isArray(symbolGrid[0])) {
    return { symbolGrid, downStair: null };
  }

  const outputGrid = cloneSymbolGrid(symbolGrid);
  const stairsRoom = findStairsRoom(dungeon);
  if (!stairsRoom) {
    return { symbolGrid: outputGrid, downStair: null };
  }

  const rowY = Math.floor(stairsRoom.y) - 1;
  if (rowY < 0 || rowY >= outputGrid.length) {
    return { symbolGrid: outputGrid, downStair: null };
  }

  const candidates = buildAnchorCandidates(outputGrid, rowY, stairsRoom);
  const anchor = candidates[0] ?? null;
  if (!anchor) {
    return { symbolGrid: outputGrid, downStair: null };
  }

  outputGrid[rowY][anchor.x] = STAIR_SYMBOL;
  outputGrid[rowY][anchor.x + 1] = STAIR_SYMBOL;

  const normalizedWallHeight = normalizeWallHeightTiles(wallHeightTiles);
  const triggerTiles = buildTriggerTiles(
    anchor.x,
    rowY,
    normalizedWallHeight,
    outputGrid[0].length,
    outputGrid.length
  );

  return {
    symbolGrid: outputGrid,
    downStair: {
      anchorTileX: anchor.x,
      anchorTileY: rowY,
      widthTiles: STAIR_WIDTH_TILES,
      heightTiles: normalizedWallHeight,
      triggerTiles,
      isEnabled: true,
    },
  };
}

/**
 * @param {{tileX:number,tileY:number}|null} feetTile
 * @param {{triggerTiles?:{tileX:number,tileY:number}[]}|null} stairMeta
 * @param {number} [maxDistance]
 */
export function isPlayerNearDownStair(feetTile, stairMeta, maxDistance = 1) {
  if (!feetTile || !Number.isFinite(feetTile.tileX) || !Number.isFinite(feetTile.tileY)) {
    return false;
  }

  const triggerTiles = Array.isArray(stairMeta?.triggerTiles) ? stairMeta.triggerTiles : [];
  if (triggerTiles.length <= 0) {
    return false;
  }

  const distanceThreshold = normalizeDistance(maxDistance, 1);
  const feetX = Math.floor(feetTile.tileX);
  const feetY = Math.floor(feetTile.tileY);

  for (const tile of triggerTiles) {
    if (!Number.isFinite(tile?.tileX) || !Number.isFinite(tile?.tileY)) {
      continue;
    }

    const triggerX = Math.floor(tile.tileX);
    const triggerY = Math.floor(tile.tileY);
    const manhattan = Math.abs(feetX - triggerX) + Math.abs(feetY - triggerY);
    if (manhattan <= distanceThreshold) {
      return true;
    }
  }

  return false;
}

/**
 * @param {{tileX:number,tileY:number}|null} feetTile
 * @param {{triggerTiles?:{tileX:number,tileY:number}[]}|null} stairMeta
 */
export function isPlayerTouchingDownStair(feetTile, stairMeta) {
  if (!feetTile || !Number.isFinite(feetTile.tileX) || !Number.isFinite(feetTile.tileY)) {
    return false;
  }

  const triggerTiles = Array.isArray(stairMeta?.triggerTiles) ? stairMeta.triggerTiles : [];
  if (triggerTiles.length <= 0) {
    return false;
  }

  const feetX = normalizeTile(feetTile.tileX, 0);
  const feetY = normalizeTile(feetTile.tileY, 0);
  for (const tile of triggerTiles) {
    if (!Number.isFinite(tile?.tileX) || !Number.isFinite(tile?.tileY)) {
      continue;
    }
    const triggerX = normalizeTile(tile.tileX, 0);
    const triggerY = normalizeTile(tile.tileY, 0);
    if (feetX === triggerX && feetY === triggerY) {
      return true;
    }
  }

  return false;
}
