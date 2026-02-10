import {
  ENEMY_ANIM_FPS,
  ENEMY_ANIM_SEQUENCE,
  ENEMY_CHASE_SPEED_MULTIPLIER,
  ENEMY_DIRECTION_MAX_SECONDS,
  ENEMY_DIRECTION_MIN_SECONDS,
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
const ENEMY_ATTACK_TELEGRAPH_BLINK_HZ = 6;
const VECTOR_EPSILON = 0.0001;
const BIAS_LERP_BASE = 6;
const MIN_ATTACK_COOLDOWN_SEC = 0.05;

const BEHAVIOR_MODE = {
  RANDOM_WALK: "random_walk",
  CHASE: "chase",
};

const ENEMY_ATTACK_PHASE = {
  COOLDOWN: "cooldown",
  WINDUP: "windup",
  ATTACK: "attack",
  RECOVER: "recover",
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

function resolveEnemyRangeConfig(attackProfile) {
  const preferredRawPx = Math.max(0, toFiniteNumber(attackProfile?.preferredRangePx, 0));
  const retreatRangePx = Math.max(0, toFiniteNumber(attackProfile?.retreatRangePx, 0));
  const engageRawPx = Math.max(0, toFiniteNumber(attackProfile?.engageRangePx, 0));
  const engageRangePx = Math.max(retreatRangePx, engageRawPx);
  const preferredRangePx = preferredRawPx;
  const rangeMoveTargetPx = engageRangePx > 0 ? engageRangePx : preferredRangePx;

  return {
    preferredRangePx,
    engageRangePx,
    retreatRangePx,
    rangeMoveTargetPx,
  };
}

function normalizeVector(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  if (length <= VECTOR_EPSILON) {
    return { x: fallbackX, y: fallbackY };
  }

  return {
    x: x / length,
    y: y / length,
  };
}

function normalizeVectorOrZero(x, y) {
  const length = Math.hypot(x, y);
  if (length <= VECTOR_EPSILON) {
    return { x: 0, y: 0 };
  }

  return {
    x: x / length,
    y: y / length,
  };
}

function getFacingVector(facing) {
  if (facing === "left") {
    return { x: -1, y: 0 };
  }

  if (facing === "up") {
    return { x: 0, y: -1 };
  }

  if (facing === "down") {
    return { x: 0, y: 1 };
  }

  return { x: 1, y: 0 };
}

function toRotationDegrees(dx, dy) {
  return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
}

function intersectsAabb(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
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

function getPlayerCombatHitbox(player) {
  if (!player) {
    return null;
  }

  return {
    x: player.x,
    y: player.y,
    width: Number.isFinite(player.width) ? player.width : 32,
    height: Number.isFinite(player.height) ? player.height : 64,
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

function hasLineOfSightToPlayer(enemy, player, dungeon) {
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

  return hasLineOfSightToPlayer(enemy, player, dungeon);
}

function switchBehaviorMode(enemy, nextMode) {
  if (enemy.behaviorMode === nextMode) {
    enemy.isChasing = nextMode === BEHAVIOR_MODE.CHASE;
    if (nextMode !== BEHAVIOR_MODE.CHASE) {
      enemy.rangeIntent = "hold";
    }
    return;
  }

  enemy.behaviorMode = nextMode;
  enemy.isChasing = nextMode === BEHAVIOR_MODE.CHASE;
  if (nextMode !== BEHAVIOR_MODE.CHASE) {
    enemy.rangeIntent = "hold";
  }
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
  const toPlayerX = playerFeetCenter.x - enemyCenter.x;
  const toPlayerY = playerFeetCenter.y - enemyCenter.y;
  const distance = Math.hypot(toPlayerX, toPlayerY);
  const retreatRangePx = Math.max(0, toFiniteNumber(enemy.retreatRangePx, 0));
  const rangeMoveTargetPx = Math.max(0, toFiniteNumber(enemy.rangeMoveTargetPx, 0));

  if (distance <= MOVE_EPSILON) {
    enemy.rangeIntent = "hold";
    return { dx: 0, dy: 0, moved: false };
  }

  let moveDirX = 0;
  let moveDirY = 0;

  if (rangeMoveTargetPx <= 0 && retreatRangePx <= 0) {
    enemy.rangeIntent = "legacy_chase";
    moveDirX = toPlayerX / distance;
    moveDirY = toPlayerY / distance;
  } else if (distance < retreatRangePx) {
    enemy.rangeIntent = "retreat";
    moveDirX = -toPlayerX / distance;
    moveDirY = -toPlayerY / distance;
  } else if (distance > rangeMoveTargetPx) {
    enemy.rangeIntent = "approach";
    moveDirX = toPlayerX / distance;
    moveDirY = toPlayerY / distance;
  } else {
    enemy.rangeIntent = "hold";
    return { dx: 0, dy: 0, moved: false };
  }

  const desiredDx = moveDirX * stepDistance;
  const desiredDy = moveDirY * stepDistance;

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

function resolveBiasOffsetPx(radiusPx, weaponRuntime) {
  const biasStrengthMul = Math.max(0, toFiniteNumber(weaponRuntime.biasStrengthMul, 0));
  const maxRatio = Math.max(0, toFiniteNumber(weaponRuntime.biasOffsetRatioMax, Number.POSITIVE_INFINITY));
  const rawOffset = Math.max(0, radiusPx * biasStrengthMul);
  const maxOffset = Math.max(0, radiusPx * maxRatio);
  return Math.min(rawOffset, maxOffset);
}

function snapEnemyWeaponToEnemy(enemy, weaponRuntime) {
  const enemyCenter = getEnemyCenter(enemy);
  weaponRuntime.x = enemyCenter.x - weaponRuntime.width / 2;
  weaponRuntime.y = enemyCenter.y - weaponRuntime.height / 2;
}

function updateEnemyWeaponTransform(weaponRuntime, enemy, aimDir, dt) {
  if (weaponRuntime.supported !== true) {
    snapEnemyWeaponToEnemy(enemy, weaponRuntime);
    return;
  }

  const response = Math.max(0, toFiniteNumber(weaponRuntime.biasResponseMul, 0));
  const lerpFactor = clamp(response * dt * BIAS_LERP_BASE, 0, 1);
  const baseBias = normalizeVector(
    toFiniteNumber(weaponRuntime.biasDirX, aimDir.x),
    toFiniteNumber(weaponRuntime.biasDirY, aimDir.y),
    aimDir.x,
    aimDir.y
  );

  const nextBias = normalizeVector(
    baseBias.x + (aimDir.x - baseBias.x) * lerpFactor,
    baseBias.y + (aimDir.y - baseBias.y) * lerpFactor,
    aimDir.x,
    aimDir.y
  );

  weaponRuntime.biasDirX = nextBias.x;
  weaponRuntime.biasDirY = nextBias.y;

  const angularSpeed = toFiniteNumber(weaponRuntime.angularSpeed, 0);
  weaponRuntime.angleRad = toFiniteNumber(weaponRuntime.angleRad, 0) + angularSpeed * dt;

  const enemyCenter = getEnemyCenter(enemy);
  const radiusPx = Math.max(0, toFiniteNumber(weaponRuntime.radiusPx, 0));
  const biasOffsetPx = resolveBiasOffsetPx(radiusPx, weaponRuntime);
  const orbitCenterX =
    weaponRuntime.centerMode === "biased_center" ? enemyCenter.x + nextBias.x * biasOffsetPx : enemyCenter.x;
  const orbitCenterY =
    weaponRuntime.centerMode === "biased_center" ? enemyCenter.y + nextBias.y * biasOffsetPx : enemyCenter.y;

  const weaponCenterX = orbitCenterX + Math.cos(weaponRuntime.angleRad) * radiusPx;
  const weaponCenterY = orbitCenterY + Math.sin(weaponRuntime.angleRad) * radiusPx;
  const fromOrbitDx = weaponCenterX - orbitCenterX;
  const fromOrbitDy = weaponCenterY - orbitCenterY;
  const rotationDeg = toRotationDegrees(fromOrbitDx, fromOrbitDy);

  weaponRuntime.x = weaponCenterX - weaponRuntime.width / 2;
  weaponRuntime.y = weaponCenterY - weaponRuntime.height / 2;
  weaponRuntime.rotationDeg = rotationDeg;
  weaponRuntime.rotationRad = rotationDeg * Math.PI / 180;
}

function createEnemyAttackRuntime(attackProfile, enemyId, spawnX, spawnY, enemyWidth, enemyHeight) {
  const profile = attackProfile && typeof attackProfile === "object" ? attackProfile : null;
  const rangeConfig = resolveEnemyRangeConfig(profile);
  const profileWeapons = Array.isArray(profile?.weapons) ? profile.weapons : [];
  const weaponCount = Math.max(1, profileWeapons.length);
  const visibilityMode = profile?.weaponVisibilityMode === "always" ? "always" : "burst";

  const weapons = profileWeapons.map((weapon, index) => {
    const supported = weapon?.supported !== false;
    const width = Math.max(1, toFiniteNumber(weapon?.width, 32));
    const height = Math.max(1, toFiniteNumber(weapon?.height, 32));
    const angleOffset = (index / weaponCount) * Math.PI * 2;
    const enemyCenterX = spawnX + enemyWidth / 2;
    const enemyCenterY = spawnY + enemyHeight / 2;

    return {
      id: `${enemyId}-weapon-${index}`,
      weaponDefId: weapon?.weaponDefId ?? null,
      formationId: weapon?.formationId ?? null,
      x: enemyCenterX - width / 2,
      y: enemyCenterY - height / 2,
      width,
      height,
      angleRad: angleOffset,
      baseAngleRad: angleOffset,
      rotationDeg: 0,
      rotationRad: 0,
      biasDirX: 0,
      biasDirY: 1,
      radiusPx: Math.max(0, toFiniteNumber(weapon?.radiusPx, 0)),
      angularSpeed: toFiniteNumber(weapon?.angularSpeed, 0),
      centerMode: weapon?.centerMode === "biased_center" ? "biased_center" : "player",
      biasStrengthMul: Math.max(0, toFiniteNumber(weapon?.biasStrengthMul, 0)),
      biasResponseMul: Math.max(0, toFiniteNumber(weapon?.biasResponseMul, 0)),
      biasOffsetRatioMax: Math.max(0, toFiniteNumber(weapon?.biasOffsetRatioMax, Number.POSITIVE_INFINITY)),
      executeDurationSec: Math.max(0, toFiniteNumber(weapon?.executeDurationSec, 0)),
      visible: visibilityMode === "always",
      hitApplied: false,
      supported,
    };
  });

  if (weapons.length === 0) {
    return {
      enabled: false,
      phase: ENEMY_ATTACK_PHASE.COOLDOWN,
      phaseTimerSec: 0,
      telegraphAlpha: 0,
      windupSec: 0,
      recoverSec: 0,
      executeSec: 0,
      cooldownAfterRecoverSec: 0,
      weaponAimMode: "none",
      weaponVisibilityMode: "burst",
      engageRangePx: 0,
      attackRangePx: Number.POSITIVE_INFINITY,
      losRequired: false,
      attackLinked: true,
      lockedAimDirX: 0,
      lockedAimDirY: 0,
      weapons: [],
    };
  }

  return {
    enabled: true,
    phase: ENEMY_ATTACK_PHASE.COOLDOWN,
    phaseTimerSec: 0,
    telegraphAlpha: 0,
    windupSec: Math.max(0, toFiniteNumber(profile?.windupSec, 0)),
    recoverSec: Math.max(0, toFiniteNumber(profile?.recoverSec, 0)),
    executeSec: Math.max(0, toFiniteNumber(profile?.executeSec, 0)),
    cooldownAfterRecoverSec: Math.max(0, toFiniteNumber(profile?.cooldownAfterRecoverSec, 0)),
    weaponAimMode: profile?.weaponAimMode === "move_dir" || profile?.weaponAimMode === "none" ? profile.weaponAimMode : "to_target",
    weaponVisibilityMode: visibilityMode,
    engageRangePx: rangeConfig.engageRangePx,
    attackRangePx: Math.max(0, toFiniteNumber(profile?.attackRangePx, Number.POSITIVE_INFINITY)),
    losRequired: profile?.losRequired === true,
    attackLinked: profile?.attackLinked !== false,
    lockedAimDirX: 0,
    lockedAimDirY: 0,
    weapons,
  };
}

function createEnemyState(definition, x, y, collision, rng, enemyId, attackProfile = null) {
  const noticeRadiusPx = Math.max(0, definition.noticeDistance * TILE_SIZE);
  const giveupDistanceTiles = Math.max(definition.giveupDistance, definition.noticeDistance);
  const giveupRadiusPx = Math.max(0, giveupDistanceTiles * TILE_SIZE);
  const rangeConfig = resolveEnemyRangeConfig(attackProfile);
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
    preferredRangePx: rangeConfig.preferredRangePx,
    engageRangePx: rangeConfig.engageRangePx,
    retreatRangePx: rangeConfig.retreatRangePx,
    rangeMoveTargetPx: rangeConfig.rangeMoveTargetPx,
    rangeIntent: "legacy_chase",
    maxHp,
    hp: maxHp,
    isDead: false,
    hitFlashTimerSec: 0,
    hitFlashDurationSec: ENEMY_HIT_FLASH_DURATION_SEC,
    attackDamage,
    moveSpeed,
    baseSpeedPxPerSec: moveSpeed,
    chaseSpeedPxPerSec: moveSpeed * ENEMY_CHASE_SPEED_MULTIPLIER,
    lastMoveDx: 0,
    lastMoveDy: 1,
    attack: createEnemyAttackRuntime(attackProfile, enemyId, x, y, definition.width, definition.height),
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

export function createEnemies(dungeon, enemyDefinitions, seed, enemyAttackProfilesByDbId = null) {
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
    const attackProfile = enemyAttackProfilesByDbId?.[definition.id] ?? null;
    enemies.push(
      createEnemyState(
        definition,
        spawn.x,
        spawn.y,
        spawn.collision,
        enemyRng,
        `enemy-${room.id}-${index}`,
        attackProfile
      )
    );
  }

  return enemies;
}

export function createWalkEnemies(dungeon, walkEnemyDefinitions, seed, enemyAttackProfilesByDbId = null) {
  const onlyWalkDefinitions = (walkEnemyDefinitions ?? []).filter((definition) => definition.type === "walk");
  return createEnemies(dungeon, onlyWalkDefinitions, seed, enemyAttackProfilesByDbId);
}

function updateEnemy(enemy, dungeon, dt, player) {
  enemy.hitFlashTimerSec = Math.max(0, toFiniteNumber(enemy.hitFlashTimerSec, 0) - dt);
  updateBehaviorMode(enemy, dungeon, player);

  const speedPxPerSec = enemy.behaviorMode === BEHAVIOR_MODE.CHASE ? enemy.chaseSpeedPxPerSec : enemy.baseSpeedPxPerSec;
  const travelDistance = speedPxPerSec * dt;
  const substeps = Math.max(1, Math.ceil(travelDistance / MAX_SUBSTEP_PIXELS));
  const stepDistance = travelDistance / substeps;
  const stepDuration = dt / substeps;

  let movedX = 0;
  let movedY = 0;

  for (let index = 0; index < substeps; index += 1) {
    let stepResult;

    if (enemy.behaviorMode === BEHAVIOR_MODE.CHASE && player) {
      stepResult = moveChaseStep(enemy, dungeon, player, stepDistance);
    } else {
      enemy.rangeIntent = "hold";
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
    enemy.animTime += dt;
    return;
  }

  enemy.isMoving = true;
  enemy.lastMoveDx = movedX;
  enemy.lastMoveDy = movedY;
  updateFacing(enemy, movedX, movedY);
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

function shouldStartEnemyAttack(enemy, player, dungeon) {
  const attack = enemy.attack;
  if (!attack || attack.enabled !== true) {
    return false;
  }

  if (enemy.behaviorMode !== BEHAVIOR_MODE.CHASE) {
    return false;
  }

  if (!player) {
    return false;
  }

  if (Number.isFinite(player.hp) && player.hp <= 0) {
    return false;
  }

  const distanceToPlayerPx = getDistanceToPlayer(enemy, player);
  if (attack.engageRangePx > 0 && distanceToPlayerPx > attack.engageRangePx) {
    return false;
  }

  if (Number.isFinite(attack.attackRangePx) && distanceToPlayerPx > attack.attackRangePx) {
    return false;
  }

  if (attack.losRequired === true && !hasLineOfSightToPlayer(enemy, player, dungeon)) {
    return false;
  }

  return true;
}

function getEnemyAimDirection(enemy, player, useLockedAim = false) {
  const attack = enemy.attack;
  if (!attack) {
    return getFacingVector(enemy.facing);
  }

  if (useLockedAim) {
    return normalizeVectorOrZero(attack.lockedAimDirX, attack.lockedAimDirY);
  }

  if (attack.weaponAimMode === "none") {
    return { x: 0, y: 0 };
  }

  if (attack.weaponAimMode === "move_dir") {
    const moveDir = normalizeVectorOrZero(enemy.lastMoveDx ?? 0, enemy.lastMoveDy ?? 0);
    if (Math.hypot(moveDir.x, moveDir.y) > VECTOR_EPSILON) {
      return moveDir;
    }

    return getFacingVector(enemy.facing);
  }

  if (!player) {
    return getFacingVector(enemy.facing);
  }

  const enemyCenter = getEnemyCenter(enemy);
  const playerFeetCenter = getPlayerFeetCenter(player);
  return normalizeVector(
    playerFeetCenter.x - enemyCenter.x,
    playerFeetCenter.y - enemyCenter.y,
    getFacingVector(enemy.facing).x,
    getFacingVector(enemy.facing).y
  );
}

function resetEnemyAttackWeaponHits(attack) {
  for (const weapon of attack.weapons) {
    weapon.hitApplied = false;
  }
}

function setEnemyWeaponVisibility(attack, visible) {
  const alwaysVisible = attack.weaponVisibilityMode === "always";

  for (const weapon of attack.weapons) {
    weapon.visible = alwaysVisible ? true : visible;
  }
}

function setEnemyAttackPhase(enemy, phase, timerSec) {
  const attack = enemy.attack;
  attack.phase = phase;
  attack.phaseTimerSec = Math.max(0, toFiniteNumber(timerSec, 0));

  if (phase === ENEMY_ATTACK_PHASE.WINDUP) {
    attack.telegraphAlpha = 1;
    setEnemyWeaponVisibility(attack, false);
    return;
  }

  if (phase === ENEMY_ATTACK_PHASE.ATTACK) {
    attack.telegraphAlpha = 0;
    resetEnemyAttackWeaponHits(attack);
    setEnemyWeaponVisibility(attack, true);
    for (const weapon of attack.weapons) {
      if (attack.weaponVisibilityMode !== "always") {
        weapon.angleRad = weapon.baseAngleRad;
      }
    }
    return;
  }

  attack.telegraphAlpha = 0;
  if (phase === ENEMY_ATTACK_PHASE.RECOVER || phase === ENEMY_ATTACK_PHASE.COOLDOWN) {
    setEnemyWeaponVisibility(attack, false);
  }
}

function updateEnemyAttackTelegraph(enemy) {
  const attack = enemy.attack;
  if (!attack || attack.phase !== ENEMY_ATTACK_PHASE.WINDUP) {
    if (attack) {
      attack.telegraphAlpha = 0;
    }
    return;
  }

  const windupSec = Math.max(0.0001, toFiniteNumber(attack.windupSec, 0.0001));
  const elapsed = clamp(windupSec - attack.phaseTimerSec, 0, windupSec);
  const normalized = clamp(elapsed / windupSec, 0, 1);
  const pulse = (Math.sin(normalized * Math.PI * 2 * ENEMY_ATTACK_TELEGRAPH_BLINK_HZ) + 1) * 0.5;
  attack.telegraphAlpha = clamp(0.2 + pulse * 0.8, 0, 1);
}

function updateEnemyWeaponVisuals(enemy, player, dt) {
  const attack = enemy.attack;
  if (!attack || attack.enabled !== true || !Array.isArray(attack.weapons)) {
    return;
  }

  const inAttackCycle = attack.phase === ENEMY_ATTACK_PHASE.WINDUP || attack.phase === ENEMY_ATTACK_PHASE.ATTACK;
  const useLockedAim = inAttackCycle;
  const liveAim = getEnemyAimDirection(enemy, player, useLockedAim);
  const aimDir = normalizeVectorOrZero(liveAim.x, liveAim.y);

  const shouldAnimateWeapon = attack.phase === ENEMY_ATTACK_PHASE.ATTACK || attack.weaponVisibilityMode === "always";

  for (const weapon of attack.weapons) {
    if (!shouldAnimateWeapon) {
      snapEnemyWeaponToEnemy(enemy, weapon);
      continue;
    }

    const fallbackFacing = getFacingVector(enemy.facing);
    const resolvedAim =
      attack.weaponAimMode === "none"
        ? { x: 0, y: 0 }
        : Math.hypot(aimDir.x, aimDir.y) <= VECTOR_EPSILON
          ? { x: fallbackFacing.x, y: fallbackFacing.y }
          : aimDir;

    updateEnemyWeaponTransform(weapon, enemy, resolvedAim, dt);
  }
}

function applyEnemyWeaponHits(enemy, player, events, options = {}) {
  const attack = enemy.attack;
  if (!attack || attack.phase !== ENEMY_ATTACK_PHASE.ATTACK) {
    return;
  }

  const playerHitbox = getPlayerCombatHitbox(player);
  if (!playerHitbox) {
    return;
  }

  const damageValue = Math.max(1, Math.round(toFiniteNumber(enemy.attackDamage, 1)));
  const applyPlayerHpDamage = options.applyPlayerHpDamage !== false;

  for (const weapon of attack.weapons) {
    if (weapon.supported !== true || weapon.visible !== true || weapon.hitApplied === true) {
      continue;
    }

    const weaponHitbox = {
      x: weapon.x,
      y: weapon.y,
      width: weapon.width,
      height: weapon.height,
    };

    if (!intersectsAabb(weaponHitbox, playerHitbox)) {
      continue;
    }

    if (applyPlayerHpDamage) {
      player.hp = Math.max(0, toFiniteNumber(player.hp, toFiniteNumber(player.maxHp, 100)) - damageValue);
      if (Number.isFinite(player.maxHp)) {
        player.hp = Math.min(player.hp, player.maxHp);
      }
    }

    const flashDurationSec = Math.max(0.0001, toFiniteNumber(player.hitFlashDurationSec, 0.12));
    player.hitFlashTimerSec = flashDurationSec;

    const worldX = playerHitbox.x + playerHitbox.width / 2;
    const worldY = playerHitbox.y + playerHitbox.height / 2;
    events.push({
      kind: "damage",
      targetType: "player",
      enemyId: enemy.id,
      damage: damageValue,
      worldX,
      worldY,
    });

    weapon.hitApplied = true;
  }
}

function updateEnemyAttack(enemy, player, dungeon, dt, events, options = {}) {
  const attack = enemy.attack;
  if (!attack || attack.enabled !== true) {
    return;
  }

  if (!player || (Number.isFinite(player.hp) && player.hp <= 0)) {
    attack.telegraphAlpha = 0;
    if (attack.weaponVisibilityMode !== "always") {
      setEnemyWeaponVisibility(attack, false);
    }
    updateEnemyWeaponVisuals(enemy, player, dt);
    return;
  }

  if (attack.phase === ENEMY_ATTACK_PHASE.COOLDOWN) {
    attack.phaseTimerSec = Math.max(0, attack.phaseTimerSec - dt);

    if (attack.phaseTimerSec <= 0 && shouldStartEnemyAttack(enemy, player, dungeon)) {
      const lockedAim = getEnemyAimDirection(enemy, player, false);
      attack.lockedAimDirX = lockedAim.x;
      attack.lockedAimDirY = lockedAim.y;
      setEnemyAttackPhase(enemy, ENEMY_ATTACK_PHASE.WINDUP, attack.windupSec);
    }
  }

  updateEnemyWeaponVisuals(enemy, player, dt);
  updateEnemyAttackTelegraph(enemy);

  if (attack.phase === ENEMY_ATTACK_PHASE.ATTACK) {
    applyEnemyWeaponHits(enemy, player, events, options);
  }

  if (
    attack.phase === ENEMY_ATTACK_PHASE.WINDUP ||
    attack.phase === ENEMY_ATTACK_PHASE.ATTACK ||
    attack.phase === ENEMY_ATTACK_PHASE.RECOVER
  ) {
    attack.phaseTimerSec = Math.max(0, attack.phaseTimerSec - dt);

    if (attack.phase === ENEMY_ATTACK_PHASE.WINDUP && attack.phaseTimerSec <= 0) {
      setEnemyAttackPhase(enemy, ENEMY_ATTACK_PHASE.ATTACK, attack.executeSec);
      return;
    }

    if (attack.phase === ENEMY_ATTACK_PHASE.ATTACK && attack.phaseTimerSec <= 0) {
      setEnemyAttackPhase(enemy, ENEMY_ATTACK_PHASE.RECOVER, attack.recoverSec);
      return;
    }

    if (attack.phase === ENEMY_ATTACK_PHASE.RECOVER && attack.phaseTimerSec <= 0) {
      const cooldown = Math.max(MIN_ATTACK_COOLDOWN_SEC, toFiniteNumber(attack.cooldownAfterRecoverSec, 0));
      setEnemyAttackPhase(enemy, ENEMY_ATTACK_PHASE.COOLDOWN, cooldown);
    }
  }
}

export function updateEnemyAttacks(enemies, player, dungeon, dt, options = {}) {
  if (!Array.isArray(enemies) || enemies.length === 0) {
    return [];
  }

  if (!player || !dungeon || !Number.isFinite(dt) || dt <= 0) {
    return [];
  }

  const events = [];

  for (const enemy of enemies) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }

    updateEnemyAttack(enemy, player, dungeon, dt, events, options);
  }

  return events;
}

export function getEnemyFrame(enemy) {
  const rowByFacing = {
    down: 0,
    left: 1,
    right: 2,
    up: 3,
  };

  const row = rowByFacing[enemy.facing] ?? 0;
  const animTime = Math.max(0, toFiniteNumber(enemy.animTime, 0));
  const sequenceIndex = Math.floor(animTime * ENEMY_ANIM_FPS) % ENEMY_ANIM_SEQUENCE.length;
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

export function getEnemyTelegraphAlpha(enemy) {
  if (!enemy || !enemy.attack) {
    return 0;
  }

  return clamp(toFiniteNumber(enemy.attack.telegraphAlpha, 0), 0, 1);
}

export function getEnemyWeaponRuntimes(enemy) {
  if (!enemy || !enemy.attack || !Array.isArray(enemy.attack.weapons)) {
    return [];
  }

  return enemy.attack.weapons;
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

export { BEHAVIOR_MODE, ENEMY_ATTACK_PHASE };
