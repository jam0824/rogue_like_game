import {
  PLAYER_FOOT_HITBOX_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE_SIZE,
} from "../config/constants.js";
import { createRng, deriveSeed } from "../core/rng.js";

const TREASURE_CHEST_FRAME_SIZE = 32;
const COMMON_DROP_ITEM_ID = "item_herb_01";

const TREASURE_CHEST_SRC_BY_TIER = {
  common: new URL("../../map_tip/treasure_box/common_treasure_box.png", import.meta.url).href,
  rare: new URL("../../map_tip/treasure_box/rare_treasure_box.png", import.meta.url).href,
  legendary: new URL("../../map_tip/treasure_box/legendary_treasure_box.png", import.meta.url).href,
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function toTilePoint(worldX, worldY) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    return null;
  }

  return {
    tileX: Math.floor(worldX / TILE_SIZE),
    tileY: Math.floor(worldY / TILE_SIZE),
  };
}

function getPlayerFeetTile(player) {
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)) {
    return null;
  }

  const feetX = player.x + PLAYER_WIDTH / 2;
  const feetY = player.y + PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2;
  return {
    tileX: Math.floor(feetX / TILE_SIZE),
    tileY: Math.floor(feetY / TILE_SIZE),
  };
}

function normalizeFeetTile(tile) {
  if (!tile || !Number.isFinite(tile.tileX) || !Number.isFinite(tile.tileY)) {
    return null;
  }

  return {
    tileX: Math.floor(tile.tileX),
    tileY: Math.floor(tile.tileY),
  };
}

function resolveFeetTile(player, options = {}) {
  const overrideTile = normalizeFeetTile(options.playerFeetTileOverride);
  if (overrideTile) {
    return overrideTile;
  }

  return getPlayerFeetTile(player);
}

function isNearChest(player, chest, interactRangeTiles, options = {}) {
  const feetTile = resolveFeetTile(player, options);
  if (!feetTile || !chest) {
    return false;
  }

  const dx = Math.abs(feetTile.tileX - chest.tileX);
  const dy = Math.abs(feetTile.tileY - chest.tileY);
  return dx + dy <= interactRangeTiles;
}

function getWalkableGrid(dungeon) {
  if (Array.isArray(dungeon?.walkableGrid) && dungeon.walkableGrid.length > 0 && Array.isArray(dungeon.walkableGrid[0])) {
    return dungeon.walkableGrid;
  }
  if (Array.isArray(dungeon?.floorGrid) && dungeon.floorGrid.length > 0 && Array.isArray(dungeon.floorGrid[0])) {
    return dungeon.floorGrid;
  }
  return null;
}

function isTileWalkable(walkableGrid, tileX, tileY) {
  if (!Array.isArray(walkableGrid) || walkableGrid.length <= 0 || !Array.isArray(walkableGrid[0])) {
    return false;
  }
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
    return false;
  }

  const normalizedTileX = Math.floor(tileX);
  const normalizedTileY = Math.floor(tileY);
  if (
    normalizedTileY < 0 ||
    normalizedTileY >= walkableGrid.length ||
    normalizedTileX < 0 ||
    normalizedTileX >= walkableGrid[0].length
  ) {
    return false;
  }

  return walkableGrid[normalizedTileY][normalizedTileX] === true;
}

function hasRoomRect(room) {
  return (
    Number.isFinite(room?.x) &&
    Number.isFinite(room?.y) &&
    Number.isFinite(room?.w) &&
    Number.isFinite(room?.h) &&
    room.w > 0 &&
    room.h > 0
  );
}

function buildRoomTileCandidates(room) {
  if (!room) {
    return [];
  }

  const candidates = [];
  if (hasRoomRect(room)) {
    const startX = Math.floor(room.x);
    const startY = Math.floor(room.y);
    const width = Math.max(0, Math.floor(room.w));
    const height = Math.max(0, Math.floor(room.h));

    for (let tileY = startY; tileY < startY + height; tileY += 1) {
      for (let tileX = startX; tileX < startX + width; tileX += 1) {
        candidates.push({ tileX, tileY });
      }
    }
    return candidates;
  }

  if (Number.isFinite(room.centerX) && Number.isFinite(room.centerY)) {
    return [{ tileX: Math.floor(room.centerX), tileY: Math.floor(room.centerY) }];
  }

  return candidates;
}

function getRoomCenterTile(room, fallbackTile = null) {
  if (Number.isFinite(room?.centerX) && Number.isFinite(room?.centerY)) {
    return {
      tileX: Math.floor(room.centerX),
      tileY: Math.floor(room.centerY),
    };
  }

  if (hasRoomRect(room)) {
    return {
      tileX: Math.floor(room.x + room.w / 2),
      tileY: Math.floor(room.y + room.h / 2),
    };
  }

  if (fallbackTile) {
    return {
      tileX: Math.floor(fallbackTile.tileX),
      tileY: Math.floor(fallbackTile.tileY),
    };
  }

  return { tileX: 0, tileY: 0 };
}

function findNearestWalkableTileInRoom(room, dungeon) {
  const walkableGrid = getWalkableGrid(dungeon);
  if (!walkableGrid) {
    return null;
  }

  const candidates = buildRoomTileCandidates(room).filter((tile) => isTileWalkable(walkableGrid, tile.tileX, tile.tileY));
  if (candidates.length <= 0) {
    return null;
  }

  const center = getRoomCenterTile(room, candidates[0]);
  candidates.sort((a, b) => {
    const distanceA = Math.abs(a.tileX - center.tileX) + Math.abs(a.tileY - center.tileY);
    const distanceB = Math.abs(b.tileX - center.tileX) + Math.abs(b.tileY - center.tileY);
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }
    if (a.tileY !== b.tileY) {
      return a.tileY - b.tileY;
    }
    return a.tileX - b.tileX;
  });

  return candidates[0];
}

function buildOccupiedGroundTileSet(groundItems) {
  const occupied = new Set();
  if (!Array.isArray(groundItems)) {
    return occupied;
  }

  for (const item of groundItems) {
    if (!Number.isFinite(item?.tileX) || !Number.isFinite(item?.tileY)) {
      continue;
    }
    occupied.add(`${Math.floor(item.tileX)}:${Math.floor(item.tileY)}`);
  }

  return occupied;
}

function iterateRingCandidates(centerX, centerY, radius) {
  const candidates = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    const dxAbs = radius - Math.abs(dy);
    if (dxAbs === 0) {
      candidates.push({ tileX: centerX, tileY: centerY + dy });
      continue;
    }
    candidates.push({ tileX: centerX - dxAbs, tileY: centerY + dy });
    candidates.push({ tileX: centerX + dxAbs, tileY: centerY + dy });
  }
  return candidates;
}

function findNearestWalkableDropTileAroundChest(chest, groundItems, dungeon) {
  if (!chest || !Number.isFinite(chest.tileX) || !Number.isFinite(chest.tileY)) {
    return null;
  }

  const walkableGrid = getWalkableGrid(dungeon);
  if (!walkableGrid || walkableGrid.length <= 0 || !Array.isArray(walkableGrid[0]) || walkableGrid[0].length <= 0) {
    return null;
  }

  const height = walkableGrid.length;
  const width = walkableGrid[0].length;
  const occupiedTiles = buildOccupiedGroundTileSet(groundItems);
  const centerTileX = Math.floor(chest.tileX);
  const centerTileY = Math.floor(chest.tileY);
  const maxRadius = width + height;

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    const candidates = iterateRingCandidates(centerTileX, centerTileY, radius);
    for (const candidate of candidates) {
      if (!isTileWalkable(walkableGrid, candidate.tileX, candidate.tileY)) {
        continue;
      }
      const key = `${candidate.tileX}:${candidate.tileY}`;
      if (occupiedTiles.has(key)) {
        continue;
      }
      return candidate;
    }
  }

  return null;
}

function createChestFromRoom(room, tileX, tileY) {
  const normalizedTileX = Math.floor(tileX);
  const normalizedTileY = Math.floor(tileY);
  return {
    id: `chest_common_room_${room.id}`,
    tier: "common",
    roomId: room.id,
    tileX: normalizedTileX,
    tileY: normalizedTileY,
    xPx: normalizedTileX * TILE_SIZE,
    yPx: normalizedTileY * TILE_SIZE,
    isOpened: false,
  };
}

export async function loadTreasureChestAssets() {
  const entries = await Promise.all(
    Object.entries(TREASURE_CHEST_SRC_BY_TIER).map(async ([tier, src]) => {
      const image = await loadImage(src);
      return [
        tier,
        {
          image,
          src,
          frameWidth: TREASURE_CHEST_FRAME_SIZE,
          frameHeight: TREASURE_CHEST_FRAME_SIZE,
        },
      ];
    })
  );

  return Object.fromEntries(entries);
}

export function createCommonTreasureChest(dungeon, seed) {
  if (!dungeon || !Array.isArray(dungeon.rooms) || dungeon.rooms.length <= 0) {
    return null;
  }

  const candidateRooms = dungeon.rooms.filter(
    (room) => room.id !== dungeon.startRoomId && room.id !== dungeon.stairsRoomId
  );

  if (candidateRooms.length <= 0) {
    return null;
  }

  const rng = createRng(deriveSeed(seed ?? dungeon.seed, "common-treasure-chest"));
  const orderedRooms = rng.shuffle(candidateRooms);
  for (const room of orderedRooms) {
    const chestTile = findNearestWalkableTileInRoom(room, dungeon);
    if (!chestTile) {
      continue;
    }
    return createChestFromRoom(room, chestTile.tileX, chestTile.tileY);
  }

  return null;
}

export function buildBlockedTileSetFromChests(treasureChests) {
  const blocked = new Set();
  if (!Array.isArray(treasureChests)) {
    return blocked;
  }

  for (const chest of treasureChests) {
    if (!Number.isFinite(chest?.tileX) || !Number.isFinite(chest?.tileY)) {
      continue;
    }
    blocked.add(`${Math.floor(chest.tileX)}:${Math.floor(chest.tileY)}`);
  }

  return blocked;
}

export function applyChestBlockingToWalkableGrid(walkableGrid, treasureChests) {
  if (!Array.isArray(walkableGrid) || walkableGrid.length <= 0 || !Array.isArray(walkableGrid[0])) {
    return walkableGrid;
  }

  const nextWalkableGrid = walkableGrid.map((row) => (Array.isArray(row) ? row.slice() : []));
  if (!Array.isArray(treasureChests) || treasureChests.length <= 0) {
    return nextWalkableGrid;
  }

  const height = nextWalkableGrid.length;
  const width = nextWalkableGrid[0].length;
  for (const chest of treasureChests) {
    if (!Number.isFinite(chest?.tileX) || !Number.isFinite(chest?.tileY)) {
      continue;
    }
    const tileX = Math.floor(chest.tileX);
    const tileY = Math.floor(chest.tileY);
    if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) {
      continue;
    }
    nextWalkableGrid[tileY][tileX] = false;
  }

  return nextWalkableGrid;
}

export function tryOpenChestByClick(
  treasureChests,
  groundItems,
  player,
  worldX,
  worldY,
  options = {}
) {
  const chests = Array.isArray(treasureChests) ? treasureChests : [];
  const currentGroundItems = Array.isArray(groundItems) ? groundItems : [];
  const clickTile = toTilePoint(worldX, worldY);
  const interactRangeTiles = Number.isFinite(options.interactRangeTiles)
    ? Math.max(0, Math.floor(options.interactRangeTiles))
    : 1;

  if (!clickTile) {
    return {
      opened: false,
      treasureChests: chests,
      groundItems: currentGroundItems,
      chestId: null,
    };
  }

  const chestIndex = chests.findIndex((chest) => {
    if (!chest || chest.isOpened === true) {
      return false;
    }
    return chest.tileX === clickTile.tileX && chest.tileY === clickTile.tileY;
  });

  if (chestIndex < 0) {
    return {
      opened: false,
      treasureChests: chests,
      groundItems: currentGroundItems,
      chestId: null,
    };
  }

  const chest = chests[chestIndex];
  if (!isNearChest(player, chest, interactRangeTiles, options)) {
    return {
      opened: false,
      treasureChests: chests,
      groundItems: currentGroundItems,
      chestId: null,
    };
  }

  const dropTile = findNearestWalkableDropTileAroundChest(chest, currentGroundItems, options.dungeon);
  if (!dropTile) {
    return {
      opened: false,
      treasureChests: chests,
      groundItems: currentGroundItems,
      chestId: null,
    };
  }

  const nextChests = chests.map((entry, index) => {
    if (index !== chestIndex) {
      return entry;
    }

    return {
      ...entry,
      isOpened: true,
    };
  });

  const dropItemId = typeof options.dropItemId === "string" && options.dropItemId.length > 0
    ? options.dropItemId
    : COMMON_DROP_ITEM_ID;
  const nextGroundItems = [
    ...currentGroundItems,
    {
      id: `ground_${chest.id}`,
      sourceChestId: chest.id,
      itemId: dropItemId,
      count: 1,
      tileX: Math.floor(dropTile.tileX),
      tileY: Math.floor(dropTile.tileY),
      xPx: Math.floor(dropTile.tileX) * TILE_SIZE + TILE_SIZE / 2,
      yPx: Math.floor(dropTile.tileY) * TILE_SIZE + TILE_SIZE / 2,
    },
  ];

  return {
    opened: true,
    treasureChests: nextChests,
    groundItems: nextGroundItems,
    chestId: chest.id,
  };
}

export const TREASURE_CHEST_RENDER_FRAME_SIZE = TREASURE_CHEST_FRAME_SIZE;
