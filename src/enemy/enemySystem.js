import {
  ENEMY_ANIM_FPS,
  ENEMY_ANIM_SEQUENCE,
  ENEMY_CHASE_SPEED_MULTIPLIER,
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
const ENEMY_HP_BASE = 30;
const ENEMY_HP_PER_VIT = 12;
const ENEMY_HP_PER_FOR = 0.015;
const ENEMY_ATTACK_BASE = 8;
const ENEMY_ATTACK_PER_POW = 1.8;
const ENEMY_MOVE_PER_AGI = 0.01;
const ENEMY_HIT_FLASH_DURATION_SEC = 0.12;

const BEHAVIOR_MODE = {
  RANDOM_WALK: "random_walk",
  CHASE: "chase",
};

const WALK_DIRECTIONS = [
  { dx: 0, dy: 1, facing: "down" },
  { dx: -1, dy: 0, facing: "left" },
  { dx: 1, dy: 0, facing: "right" },
  { dx: 0, dy: -1, facing: "up" },
];

function round2(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
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

function isRectPassable(grid, rect) {
  if (!rect) {
    return false;
  }

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

  if (enemy.type === "fly") {
    return isRectPassable(getFlyPassableGrid(dungeon), probeRect);
  }

  return isRectPassable(getWalkableGrid(dungeon), probeRect);
}

function getEnemyCenter(enemy) {
  return {
    x: enemy.x + enemy.width / 2,
    y: enemy.y + enemy.height / 2,
  };
}

function getPlayerFeetCenter(player) {
  const width = Number.isFinite(player.width) ? player.width : 32;
  const height = Number.isFinite(player.height) ? player.height : 64;
  const footHitboxHeight = Number.isFinite(player.footHitboxHeight) ? player.footHitboxHeight : 32;

  return {
    x: player.x + width / 2,
    y: player.y + height - footHitboxHeight / 2,
  };
}

function getDistanceToPlayer(enemy, player) {
  const enemyCenter = getEnemyCenter(enemy);
  const playerFeetCenter = getPlayerFeetCenter(player);
  return Math.hypot(playerFeetCenter.x - enemyCenter.x, playerFeetCenter.y - enemyCenter.y);
}

function toTileCoordinate(point) {
  return {
    x: Math.floor(point.x / TILE_SIZE),
    y: Math.floor(point.y / TILE_SIZE),
  };
}

function buildLineTiles(startX, startY, endX, endY) {
  const tiles = [];
  let x = startX;
  let y = startY;
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  const stepX = startX < endX ? 1 : -1;
  const stepY = startY < endY ? 1 : -1;
  let error = dx - dy;

  while (true) {
    tiles.push({ x, y });
    if (x === endX && y === endY) {
      break;
    }

    const error2 = 2 * error;
    if (error2 > -dy) {
      error -= dy;
      x += stepX;
    }
    if (error2 < dx) {
      error += dx;
      y += stepY;
    }
  }

  return tiles;
}

function hasWalkLineOfSight(enemy, player, dungeon) {
  const walkableGrid = getWalkableGrid(dungeon);
  const enemyTile = toTileCoordinate(getEnemyCenter(enemy));
  const playerTile = toTileCoordinate(getPlayerFeetCenter(player));
  const lineTiles = buildLineTiles(enemyTile.x, enemyTile.y, playerTile.x, playerTile.y);

  for (let index = 1; index < lineTiles.length - 1; index += 1) {
    const tile = lineTiles[index];
    if (
      tile.y < 0 ||
      tile.y >= walkableGrid.length ||
      tile.x < 0 ||
      tile.x >= walkableGrid[0].length ||
      walkableGrid[tile.y][tile.x] === false
    ) {
      return false;
    }
  }

  return true;
}

function canNoticePlayer(enemy, player, dungeon) {
  if (enemy.type !== "walk") {
    return true;
  }

  return hasWalkLineOfSight(enemy, player, dungeon);
}

function switchBehaviorMode(enemy, nextMode) {
  if (enemy.behaviorMode === nextMode) {
    enemy.isChasing = nextMode === BEHAVIOR_MODE.CHASE;
    return;
  }

  enemy.behaviorMode = nextMode;
  enemy.isChasing = nextMode === BEHAVIOR_MODE.CHASE;
  enemy.walkDirection = null;
  enemy.directionTimer = 0;
}

function updateBehaviorMode(enemy, dungeon, player) {
  if (!player) {
    switchBehaviorMode(enemy, BEHAVIOR_MODE.RANDOM_WALK);
    enemy.distanceToPlayerPx = null;
    return;
  }

  const distanceToPlayerPx = getDistanceToPlayer(enemy, player);
  enemy.distanceToPlayerPx = distanceToPlayerPx;

  if (enemy.behaviorMode === BEHAVIOR_MODE.CHASE) {
    if (distanceToPlayerPx > enemy.giveupRadiusPx) {
      switchBehaviorMode(enemy, BEHAVIOR_MODE.RANDOM_WALK);
    }
    return;
  }

  if (distanceToPlayerPx <= enemy.noticeRadiusPx && canNoticePlayer(enemy, player, dungeon)) {
    switchBehaviorMode(enemy, BEHAVIOR_MODE.CHASE);
  }
}

function sampleDirectionDuration(enemyRng) {
  return ENEMY_DIRECTION_MIN_SECONDS + enemyRng.float() * (ENEMY_DIRECTION_MAX_SECONDS - ENEMY_DIRECTION_MIN_SECONDS);
}

function pickRandomWalkDirection(enemy, dungeon) {
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
  enemy.walkDirection = pickRandomWalkDirection(enemy, dungeon);
  enemy.directionTimer = sampleDirectionDuration(enemy.rng);
  if (enemy.walkDirection) {
    enemy.facing = enemy.walkDirection.facing;
  }
}

function updateFacing(enemy, dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    enemy.facing = dx >= 0 ? "right" : "left";
    return;
  }

  enemy.facing = dy >= 0 ? "down" : "up";
}

function resolveWalkChaseStep(enemy, dungeon, desiredDx, desiredDy) {
  const fromX = enemy.x;
  const fromY = enemy.y;

  const combined = {
    x: fromX + desiredDx,
    y: fromY + desiredDy,
  };

  if (isEnemyPositionPassable(enemy, combined.x, combined.y, dungeon)) {
    return combined;
  }

  const xOnly = {
    x: fromX + desiredDx,
    y: fromY,
  };
  const yOnly = {
    x: fromX,
    y: fromY + desiredDy,
  };

  const canMoveX = isEnemyPositionPassable(enemy, xOnly.x, xOnly.y, dungeon);
  const canMoveY = isEnemyPositionPassable(enemy, yOnly.x, yOnly.y, dungeon);

  if (canMoveX && canMoveY) {
    return Math.abs(desiredDx) >= Math.abs(desiredDy) ? xOnly : yOnly;
  }

  if (canMoveX) {
    return xOnly;
  }

  if (canMoveY) {
    return yOnly;
  }

  return null;
}

function moveRandomWalkStep(enemy, dungeon, stepDistance, stepDuration) {
  if (!enemy.walkDirection || enemy.directionTimer <= 0) {
    refreshWalkIntent(enemy, dungeon);
  }

  if (!enemy.walkDirection) {
    return { dx: 0, dy: 0, moved: false };
  }

  const nextX = enemy.x + enemy.walkDirection.dx * stepDistance;
  const nextY = enemy.y + enemy.walkDirection.dy * stepDistance;

  if (!isEnemyPositionPassable(enemy, nextX, nextY, dungeon)) {
    enemy.walkDirection = null;
    enemy.directionTimer = 0;
    return { dx: 0, dy: 0, moved: false };
  }

  enemy.x = nextX;
  enemy.y = nextY;
  enemy.directionTimer -= stepDuration;

  return {
    dx: enemy.walkDirection.dx * stepDistance,
    dy: enemy.walkDirection.dy * stepDistance,
    moved: true,
  };
}

function moveChaseStep(enemy, dungeon, player, stepDistance) {
  const enemyCenter = getEnemyCenter(enemy);
  const playerFeetCenter = getPlayerFeetCenter(player);
  const toTargetX = playerFeetCenter.x - enemyCenter.x;
  const toTargetY = playerFeetCenter.y - enemyCenter.y;
  const distance = Math.hypot(toTargetX, toTargetY);

  if (distance <= MOVE_EPSILON) {
    return { dx: 0, dy: 0, moved: false };
  }

  const desiredDx = (toTargetX / distance) * stepDistance;
  const desiredDy = (toTargetY / distance) * stepDistance;

  if (enemy.type === "walk") {
    const candidate = resolveWalkChaseStep(enemy, dungeon, desiredDx, desiredDy);
    if (!candidate) {
      return { dx: 0, dy: 0, moved: false };
    }

    const movedDx = candidate.x - enemy.x;
    const movedDy = candidate.y - enemy.y;
    enemy.x = candidate.x;
    enemy.y = candidate.y;

    return {
      dx: movedDx,
      dy: movedDy,
      moved: Math.hypot(movedDx, movedDy) > MOVE_EPSILON,
    };
  }

  const nextX = enemy.x + desiredDx;
  const nextY = enemy.y + desiredDy;
  if (!isEnemyPositionPassable(enemy, nextX, nextY, dungeon)) {
    return { dx: 0, dy: 0, moved: false };
  }

  enemy.x = nextX;
  enemy.y = nextY;

  return {
    dx: desiredDx,
    dy: desiredDy,
    moved: true,
  };
}

function createEnemyState(definition, x, y, collision, rng, enemyId) {
  const noticeRadiusPx = Math.max(0, definition.noticeDistance * TILE_SIZE);
  const giveupDistanceTiles = Math.max(definition.giveupDistance, definition.noticeDistance);
  const giveupRadiusPx = Math.max(0, giveupDistanceTiles * TILE_SIZE);
  const vit = toFiniteNumber(definition.vit, 10);
  const fortitude = toFiniteNumber(definition.for, 10);
  const agi = toFiniteNumber(definition.agi, 10);
  const pow = toFiniteNumber(definition.pow, 10);
  const hpRaw = ENEMY_HP_BASE + vit * ENEMY_HP_PER_VIT;
  const toughMult = 1 + fortitude * ENEMY_HP_PER_FOR;
  const maxHp = Math.max(1, Math.round(hpRaw * toughMult));
  const attackDamage = Math.max(1, Math.round(ENEMY_ATTACK_BASE + pow * ENEMY_ATTACK_PER_POW));
  const moveSpeed = ENEMY_WALK_SPEED_PX_PER_SEC * (1 + agi * ENEMY_MOVE_PER_AGI);

  return {
    id: enemyId,
    dbId: definition.id,
    type: definition.type,
    rank: definition.rank ?? "normal",
    role: definition.role ?? "chaser",
    tags: Array.isArray(definition.tags) ? definition.tags.slice() : [],
    x,
    y,
    width: definition.width,
    height: definition.height,
    facing: "down",
    isMoving: false,
    animTime: 0,
    walkDirection: null,
    directionTimer: 0,
    collision,
    rng,
    behaviorMode: BEHAVIOR_MODE.RANDOM_WALK,
    isChasing: false,
    distanceToPlayerPx: null,
    noticeRadiusPx,
    giveupRadiusPx,
    maxHp,
    hp: maxHp,
    isDead: false,
    hitFlashTimerSec: 0,
    hitFlashDurationSec: ENEMY_HIT_FLASH_DURATION_SEC,
    attackDamage,
    moveSpeed,
    baseSpeedPxPerSec: moveSpeed,
    chaseSpeedPxPerSec: moveSpeed * ENEMY_CHASE_SPEED_MULTIPLIER,
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

function updateEnemy(enemy, dungeon, dt, player) {
  enemy.hitFlashTimerSec = Math.max(0, toFiniteNumber(enemy.hitFlashTimerSec, 0) - dt);
  updateBehaviorMode(enemy, dungeon, player);

  const speedPxPerSec = enemy.behaviorMode === BEHAVIOR_MODE.CHASE ? enemy.chaseSpeedPxPerSec : enemy.baseSpeedPxPerSec;
  const travelDistance = speedPxPerSec * dt;
  const substeps = Math.max(1, Math.ceil(travelDistance / MAX_SUBSTEP_PIXELS));
  const stepDistance = travelDistance / substeps;
  const stepDuration = dt / substeps;
  const wasMoving = enemy.isMoving;

  let movedX = 0;
  let movedY = 0;

  for (let index = 0; index < substeps; index += 1) {
    let stepResult;

    if (enemy.behaviorMode === BEHAVIOR_MODE.CHASE && player) {
      stepResult = moveChaseStep(enemy, dungeon, player, stepDistance);
    } else {
      stepResult = moveRandomWalkStep(enemy, dungeon, stepDistance, stepDuration);
    }

    if (!stepResult.moved) {
      continue;
    }

    movedX += stepResult.dx;
    movedY += stepResult.dy;
  }

  const movedDistance = Math.hypot(movedX, movedY);
  if (movedDistance <= MOVE_EPSILON) {
    enemy.isMoving = false;
    enemy.animTime = 0;
    return;
  }

  enemy.isMoving = true;
  updateFacing(enemy, movedX, movedY);

  if (!wasMoving) {
    enemy.animTime = 0;
  }
  enemy.animTime += dt;
}

export function updateEnemies(enemies, dungeon, dt, player = null) {
  if (!Array.isArray(enemies) || !enemies.length) {
    return;
  }

  if (!Number.isFinite(dt) || dt <= 0) {
    return;
  }

  for (const enemy of enemies) {
    if (enemy.isDead === true) {
      continue;
    }
    updateEnemy(enemy, dungeon, dt, player);
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

export function getEnemyCombatHitbox(enemy) {
  if (!enemy) {
    return null;
  }

  return {
    x: enemy.x,
    y: enemy.y,
    width: enemy.width,
    height: enemy.height,
  };
}

export function getEnemyHitFlashAlpha(enemy) {
  if (!enemy) {
    return 0;
  }

  const timer = toFiniteNumber(enemy.hitFlashTimerSec, 0);
  const duration = Math.max(0.0001, toFiniteNumber(enemy.hitFlashDurationSec, ENEMY_HIT_FLASH_DURATION_SEC));
  return clamp(timer / duration, 0, 1);
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
