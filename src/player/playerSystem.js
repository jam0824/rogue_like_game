import {
  PLAYER_ANIM_FPS,
  PLAYER_ANIM_SEQUENCE,
  PLAYER_FOOT_HITBOX_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_IDLE_FRAME_COL,
  PLAYER_SPEED_PX_PER_SEC,
  PLAYER_WIDTH,
  TILE_SIZE,
} from "../config/constants.js";

const MAX_SUBSTEP_PIXELS = 4;
const MOVE_EPSILON = 0.001;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function getWalkableGrid(dungeon) {
  return dungeon.walkableGrid ?? dungeon.floorGrid;
}

function getPlayerBoundsPx(dungeon) {
  const widthPx = dungeon.gridWidth * TILE_SIZE;
  const heightPx = dungeon.gridHeight * TILE_SIZE;

  return {
    minX: 0,
    maxX: widthPx - PLAYER_WIDTH,
    minY: -PLAYER_FOOT_HITBOX_HEIGHT,
    maxY: heightPx - PLAYER_HEIGHT,
    maxTargetX: Math.max(0, widthPx - 1),
    maxTargetY: Math.max(0, heightPx - 1),
  };
}

function getFeetRect(x, y) {
  return {
    x,
    y: y + PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT,
    width: PLAYER_WIDTH,
    height: PLAYER_FOOT_HITBOX_HEIGHT,
  };
}

function isFeetRectWalkable(walkableGrid, rect) {
  const maxY = walkableGrid.length - 1;
  const maxX = walkableGrid[0].length - 1;

  const minTileX = Math.floor(rect.x / TILE_SIZE);
  const maxTileX = Math.floor((rect.x + rect.width - 1) / TILE_SIZE);
  const minTileY = Math.floor(rect.y / TILE_SIZE);
  const maxTileY = Math.floor((rect.y + rect.height - 1) / TILE_SIZE);

  if (minTileX < 0 || minTileY < 0 || maxTileX > maxX || maxTileY > maxY) {
    return false;
  }

  for (let y = minTileY; y <= maxTileY; y += 1) {
    for (let x = minTileX; x <= maxTileX; x += 1) {
      if (!walkableGrid[y][x]) {
        return false;
      }
    }
  }

  return true;
}

function getFeetCenter(player) {
  return {
    x: player.x + PLAYER_WIDTH / 2,
    y: player.y + PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2,
  };
}

function updateFacing(player, dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    player.facing = dx >= 0 ? "right" : "left";
    return;
  }

  player.facing = dy >= 0 ? "down" : "up";
}

function clampPlayerToBounds(x, y, dungeon) {
  const bounds = getPlayerBoundsPx(dungeon);

  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    y: clamp(y, bounds.minY, bounds.maxY),
  };
}

function clampTarget(target, dungeon) {
  const bounds = getPlayerBoundsPx(dungeon);

  return {
    x: clamp(target.x, 0, bounds.maxTargetX),
    y: clamp(target.y, 0, bounds.maxTargetY),
  };
}

function findStartRoom(dungeon) {
  return dungeon.rooms.find((room) => room.id === dungeon.startRoomId) ?? null;
}

function findFallbackSpawnFeetCenter(dungeon, startRoom, preferredFeetCenter, walkableGrid) {
  let best = null;

  for (let tileY = startRoom.y; tileY < startRoom.y + startRoom.h; tileY += 1) {
    for (let tileX = startRoom.x; tileX < startRoom.x + startRoom.w; tileX += 1) {
      const feetCenterX = tileX * TILE_SIZE + TILE_SIZE / 2;
      const feetCenterY = tileY * TILE_SIZE + TILE_SIZE / 2;
      const rawX = feetCenterX - PLAYER_WIDTH / 2;
      const rawY = feetCenterY - (PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2);
      const candidate = clampPlayerToBounds(rawX, rawY, dungeon);
      const feetRect = getFeetRect(candidate.x, candidate.y);

      if (!isFeetRectWalkable(walkableGrid, feetRect)) {
        continue;
      }

      const distance =
        Math.abs(feetCenterX - preferredFeetCenter.x) + Math.abs(feetCenterY - preferredFeetCenter.y);

      if (
        !best ||
        distance < best.distance ||
        (distance === best.distance && tileY > best.tileY)
      ) {
        best = {
          distance,
          tileY,
          x: feetCenterX,
          y: feetCenterY,
        };
      }
    }
  }

  if (!best) {
    return preferredFeetCenter;
  }

  return {
    x: best.x,
    y: best.y,
  };
}

export function createPlayerState(dungeon) {
  const startRoom = findStartRoom(dungeon);
  if (!startRoom) {
    throw new Error("Failed to spawn player: start room is missing.");
  }

  const walkableGrid = getWalkableGrid(dungeon);
  const preferredFeetCenter = {
    x: startRoom.centerX * TILE_SIZE + TILE_SIZE / 2,
    y: startRoom.centerY * TILE_SIZE + TILE_SIZE / 2,
  };

  const preferredPlayerPos = clampPlayerToBounds(
    preferredFeetCenter.x - PLAYER_WIDTH / 2,
    preferredFeetCenter.y - (PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2),
    dungeon
  );

  const preferredFeetRect = getFeetRect(preferredPlayerPos.x, preferredPlayerPos.y);
  const spawnFeetCenter = isFeetRectWalkable(walkableGrid, preferredFeetRect)
    ? preferredFeetCenter
    : findFallbackSpawnFeetCenter(dungeon, startRoom, preferredFeetCenter, walkableGrid);

  const spawnPlayerPos = clampPlayerToBounds(
    spawnFeetCenter.x - PLAYER_WIDTH / 2,
    spawnFeetCenter.y - (PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2),
    dungeon
  );

  return {
    x: spawnPlayerPos.x,
    y: spawnPlayerPos.y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    footHitboxHeight: PLAYER_FOOT_HITBOX_HEIGHT,
    facing: "down",
    pointerActive: false,
    target: null,
    isMoving: false,
    animTime: 0,
  };
}

export function setPointerTarget(player, active, worldX, worldY) {
  if (!active) {
    player.pointerActive = false;
    player.target = null;
    return;
  }

  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    return;
  }

  player.pointerActive = true;
  player.target = {
    x: worldX,
    y: worldY,
  };
}

export function updatePlayer(player, dungeon, dt) {
  if (!Number.isFinite(dt) || dt <= 0) {
    return;
  }

  if (!player.pointerActive || !player.target) {
    player.isMoving = false;
    player.animTime = 0;
    return;
  }

  player.target = clampTarget(player.target, dungeon);

  const feetCenter = getFeetCenter(player);
  const toTargetX = player.target.x - feetCenter.x;
  const toTargetY = player.target.y - feetCenter.y;
  const distance = Math.hypot(toTargetX, toTargetY);

  if (distance <= MOVE_EPSILON) {
    player.isMoving = false;
    player.animTime = 0;
    return;
  }

  const travelDistance = Math.min(distance, PLAYER_SPEED_PX_PER_SEC * dt);
  const moveX = (toTargetX / distance) * travelDistance;
  const moveY = (toTargetY / distance) * travelDistance;
  const substeps = Math.max(1, Math.ceil(Math.hypot(moveX, moveY) / MAX_SUBSTEP_PIXELS));
  const stepX = moveX / substeps;
  const stepY = moveY / substeps;
  const wasMoving = player.isMoving;
  const walkableGrid = getWalkableGrid(dungeon);

  let movedX = 0;
  let movedY = 0;

  for (let index = 0; index < substeps; index += 1) {
    const prevX = player.x;
    const prevY = player.y;
    const candidate = clampPlayerToBounds(player.x + stepX, player.y + stepY, dungeon);
    const feetRect = getFeetRect(candidate.x, candidate.y);

    if (!isFeetRectWalkable(walkableGrid, feetRect)) {
      break;
    }

    player.x = candidate.x;
    player.y = candidate.y;

    const deltaX = player.x - prevX;
    const deltaY = player.y - prevY;
    movedX += deltaX;
    movedY += deltaY;

    if (Math.abs(deltaX) <= MOVE_EPSILON && Math.abs(deltaY) <= MOVE_EPSILON) {
      break;
    }
  }

  const movedDistance = Math.hypot(movedX, movedY);
  if (movedDistance <= MOVE_EPSILON) {
    player.isMoving = false;
    player.animTime = 0;
    return;
  }

  player.isMoving = true;
  updateFacing(player, movedX, movedY);

  if (!wasMoving) {
    player.animTime = 0;
  }

  player.animTime += dt;
}

export function getPlayerFrame(player) {
  const rowByFacing = {
    down: 0,
    left: 1,
    right: 2,
    up: 3,
  };

  const row = rowByFacing[player.facing] ?? 0;
  if (!player.isMoving) {
    return { row, col: PLAYER_IDLE_FRAME_COL };
  }

  const sequenceIndex = Math.floor(player.animTime * PLAYER_ANIM_FPS) % PLAYER_ANIM_SEQUENCE.length;
  return {
    row,
    col: PLAYER_ANIM_SEQUENCE[sequenceIndex],
  };
}

export function getPlayerFeetHitbox(player) {
  const rect = getFeetRect(player.x, player.y);

  return {
    x: round2(rect.x),
    y: round2(rect.y),
    width: rect.width,
    height: rect.height,
  };
}
