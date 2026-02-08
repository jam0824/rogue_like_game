import {
  ENEMY_ANIM_FPS,
  ENEMY_ANIM_SEQUENCE,
  ENEMY_DIRECTION_MAX_SECONDS,
  ENEMY_DIRECTION_MIN_SECONDS,
  ENEMY_IDLE_FRAME_COL,
  ENEMY_WALK_SPEED_PX_PER_SEC,
  TILE_SIZE,
} from "../config/constants.js";
import { createRng, deriveSeed } from "../core/rng.js";

const MOVE_EPSILON = 0.001;
const MAX_SUBSTEP_PIXELS = 4;
const TALL_ENEMY_COLLISION_SIZE = 32;
const WALK_DIRECTIONS = [
  { dx: 0, dy: 1, facing: "down" },
  { dx: -1, dy: 0, facing: "left" },
  { dx: 1, dy: 0, facing: "right" },
  { dx: 0, dy: -1, facing: "up" },
];

function round2(value) {
  return Math.round(value * 100) / 100;
}

function getWalkableGrid(dungeon) {
  return dungeon.walkableGrid ?? dungeon.floorGrid;
}

function getFlyPassableGrid(dungeon) {
  if (dungeon.flyPassableGrid) {
    return dungeon.flyPassableGrid;
  }

  const symbolGrid = dungeon.symbolGrid ?? dungeon.floorGrid.map((row) => row.map(() => null));
  dungeon.flyPassableGrid = dungeon.floorGrid.map((row, y) =>
    row.map((isFloor, x) => isFloor === true || symbolGrid[y][x] !== null)
  );

  return dungeon.flyPassableGrid;
}

function buildCollisionProfileForWalk(width, height) {
  if (height >= 64) {
    return {
      offsetX: (width - TALL_ENEMY_COLLISION_SIZE) / 2,
      offsetY: height - TALL_ENEMY_COLLISION_SIZE,
      width: TALL_ENEMY_COLLISION_SIZE,
      height: TALL_ENEMY_COLLISION_SIZE,
    };
  }

  return {
    offsetX: 0,
    offsetY: 0,
    width,
    height,
  };
}

function getWallHitboxAt(enemy, x, y) {
  if (!enemy.collision) {
    return null;
  }

  return {
    x: x + enemy.collision.offsetX,
    y: y + enemy.collision.offsetY,
    width: enemy.collision.width,
    height: enemy.collision.height,
  };
}

function getCollisionProbeRect(enemy, x, y) {
  if (enemy.type === "fly") {
    return {
      x: x + enemy.width / 2,
      y: y + enemy.height / 2,
      width: 1,
      height: 1,
    };
  }

  return getWallHitboxAt(enemy, x, y);
}

function isRectWalkable(grid, rect) {
  const maxY = grid.length - 1;
  const maxX = grid[0].length - 1;

  const minTileX = Math.floor(rect.x / TILE_SIZE);
  const maxTileX = Math.floor((rect.x + rect.width - 1) / TILE_SIZE);
  const minTileY = Math.floor(rect.y / TILE_SIZE);
  const maxTileY = Math.floor((rect.y + rect.height - 1) / TILE_SIZE);

  if (minTileX < 0 || minTileY < 0 || maxTileX > maxX || maxTileY > maxY) {
    return false;
  }

  for (let y = minTileY; y <= maxTileY; y += 1) {
    for (let x = minTileX; x <= maxTileX; x += 1) {
      if (!grid[y][x]) {
        return false;
      }
    }
  }

  return true;
}

function isEnemyPositionPassable(enemy, nextX, nextY, dungeon) {
  const probeRect = getCollisionProbeRect(enemy, nextX, nextY);
  if (!probeRect) {
    return false;
  }

  if (enemy.type === "fly") {
    return isRectWalkable(getFlyPassableGrid(dungeon), probeRect);
  }

  return isRectWalkable(getWalkableGrid(dungeon), probeRect);
}

function sampleDirectionDuration(enemyRng) {
  return ENEMY_DIRECTION_MIN_SECONDS + enemyRng.float() * (ENEMY_DIRECTION_MAX_SECONDS - ENEMY_DIRECTION_MIN_SECONDS);
}

function pickWalkDirection(enemy, dungeon) {
  const candidateDirections = enemy.rng.shuffle(WALK_DIRECTIONS);
  for (const direction of candidateDirections) {
    const probeX = enemy.x + direction.dx;
    const probeY = enemy.y + direction.dy;
    if (isEnemyPositionPassable(enemy, probeX, probeY, dungeon)) {
      return direction;
    }
  }
  return null;
}

function refreshWalkIntent(enemy, dungeon) {
  enemy.walkDirection = pickWalkDirection(enemy, dungeon);
  enemy.directionTimer = sampleDirectionDuration(enemy.rng);
  if (enemy.walkDirection) {
    enemy.facing = enemy.walkDirection.facing;
  }
}

function createEnemyState(definition, x, y, collision, rng, enemyId) {
  return {
    id: enemyId,
    dbId: definition.id,
    type: definition.type,
    x,
    y,
    width: definition.width,
    height: definition.height,
    facing: "down",
    isMoving: false,
    animTime: 0,
    walkDirection: null,
    directionTimer: 0,
    speedPxPerSec: ENEMY_WALK_SPEED_PX_PER_SEC,
    collision,
    rng,
  };
}

function findSpawnForRoom(room, definition, dungeon, spawnRng) {
  const collision = definition.type === "walk" ? buildCollisionProfileForWalk(definition.width, definition.height) : null;
  const roomTiles = [];

  for (let tileY = room.y; tileY < room.y + room.h; tileY += 1) {
    for (let tileX = room.x; tileX < room.x + room.w; tileX += 1) {
      roomTiles.push({ tileX, tileY });
    }
  }

  const shuffledTiles = spawnRng.shuffle(roomTiles);
  for (const tile of shuffledTiles) {
    const centerX = tile.tileX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = tile.tileY * TILE_SIZE + TILE_SIZE / 2;
    const x = centerX - definition.width / 2;
    const y = centerY - definition.height / 2;
    const candidate = { type: definition.type, width: definition.width, height: definition.height, collision };

    if (isEnemyPositionPassable(candidate, x, y, dungeon)) {
      return { x, y, collision };
    }
  }

  return null;
}

function chooseDefinitionForRoom(index, enemyDefinitions, spawnRng, guaranteedOrder) {
  if (index < guaranteedOrder.length) {
    return guaranteedOrder[index];
  }
  return spawnRng.pick(enemyDefinitions);
}

export function createEnemies(dungeon, enemyDefinitions, seed) {
  if (!Array.isArray(enemyDefinitions) || enemyDefinitions.length === 0) {
    return [];
  }

  const spawnRng = createRng(deriveSeed(seed ?? dungeon.seed, "enemy-spawn"));
  const spawnRooms = dungeon.rooms.filter((room) => room.id !== dungeon.startRoomId);
  const guaranteedOrder = spawnRng.shuffle(enemyDefinitions);
  const enemies = [];

  for (let index = 0; index < spawnRooms.length; index += 1) {
    const room = spawnRooms[index];
    const definition = chooseDefinitionForRoom(index, enemyDefinitions, spawnRng, guaranteedOrder);
    const spawn = findSpawnForRoom(room, definition, dungeon, spawnRng);

    if (!spawn) {
      throw new Error(`Failed to spawn enemy in room ${room.id} (type=${definition.type})`);
    }

    const enemyRng = createRng(deriveSeed(seed ?? dungeon.seed, `enemy-${room.id}-${index}`));
    enemies.push(
      createEnemyState(definition, spawn.x, spawn.y, spawn.collision, enemyRng, `enemy-${room.id}-${index}`)
    );
  }

  return enemies;
}

export function createWalkEnemies(dungeon, walkEnemyDefinitions, seed) {
  const onlyWalkDefinitions = (walkEnemyDefinitions ?? []).filter((definition) => definition.type === "walk");
  return createEnemies(dungeon, onlyWalkDefinitions, seed);
}

function updateEnemy(enemy, dungeon, dt) {
  const travelDistance = enemy.speedPxPerSec * dt;
  const substeps = Math.max(1, Math.ceil(travelDistance / MAX_SUBSTEP_PIXELS));
  const stepDistance = travelDistance / substeps;
  const stepDuration = dt / substeps;
  const wasMoving = enemy.isMoving;
  let movedDistance = 0;

  for (let index = 0; index < substeps; index += 1) {
    if (!enemy.walkDirection || enemy.directionTimer <= 0) {
      refreshWalkIntent(enemy, dungeon);
    }

    if (!enemy.walkDirection) {
      continue;
    }

    const nextX = enemy.x + enemy.walkDirection.dx * stepDistance;
    const nextY = enemy.y + enemy.walkDirection.dy * stepDistance;

    if (isEnemyPositionPassable(enemy, nextX, nextY, dungeon)) {
      enemy.x = nextX;
      enemy.y = nextY;
      movedDistance += stepDistance;
    } else {
      enemy.walkDirection = null;
      enemy.directionTimer = 0;
      continue;
    }

    enemy.directionTimer -= stepDuration;
  }

  if (movedDistance <= MOVE_EPSILON) {
    enemy.isMoving = false;
    enemy.animTime = 0;
    return;
  }

  enemy.isMoving = true;
  if (!wasMoving) {
    enemy.animTime = 0;
  }
  enemy.animTime += dt;
}

export function updateEnemies(enemies, dungeon, dt) {
  if (!Array.isArray(enemies) || !enemies.length) {
    return;
  }

  if (!Number.isFinite(dt) || dt <= 0) {
    return;
  }

  for (const enemy of enemies) {
    updateEnemy(enemy, dungeon, dt);
  }
}

export function getEnemyFrame(enemy) {
  const rowByFacing = {
    down: 0,
    left: 1,
    right: 2,
    up: 3,
  };

  const row = rowByFacing[enemy.facing] ?? 0;
  if (!enemy.isMoving) {
    return { row, col: ENEMY_IDLE_FRAME_COL };
  }

  const sequenceIndex = Math.floor(enemy.animTime * ENEMY_ANIM_FPS) % ENEMY_ANIM_SEQUENCE.length;
  return {
    row,
    col: ENEMY_ANIM_SEQUENCE[sequenceIndex],
  };
}

export function getEnemyWallHitbox(enemy) {
  const hitbox = getWallHitboxAt(enemy, enemy.x, enemy.y);
  if (!hitbox) {
    return null;
  }

  return {
    x: round2(hitbox.x),
    y: round2(hitbox.y),
    width: hitbox.width,
    height: hitbox.height,
  };
}
