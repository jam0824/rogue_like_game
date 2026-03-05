import {
  ENEMY_ANIM_FPS,
  ENEMY_ANIM_SEQUENCE,
  ENEMY_CHASE_SPEED_MULTIPLIER,
  ENEMY_DIRECTION_MAX_SECONDS,
  ENEMY_DIRECTION_MIN_SECONDS,
  ENEMY_WALK_SPEED_PX_PER_SEC,
  TILE_SIZE,
} from "../config/constants.js";
import { rollHitDamage } from "../combat/damageRoll.js";
import { createRng, deriveSeed } from "../core/rng.js";
import { deriveEnemyCombatStats } from "../status/derivedStats.js";

const MOVE_EPSILON = 0.001;
const MAX_SUBSTEP_PIXELS = 4;
const TALL_ENEMY_COLLISION_SIZE = 32;
const ENEMY_ATTACK_BASE = 8;
const ENEMY_ATTACK_PER_POW = 1.8;
const ENEMY_HIT_FLASH_DURATION_SEC = 0.12;
const ENEMY_HIT_FLASH_COLOR_DEFAULT = "#ffffff";
const ENEMY_ATTACK_TELEGRAPH_BLINK_HZ = 6;
const VECTOR_EPSILON = 0.0001;
const BIAS_LERP_BASE = 6;
const MIN_ATTACK_COOLDOWN_SEC = 0.05;
const DEFAULT_SPRITE_FACING = "right";
const BOSS_CHARGE_STOP_EPSILON = 0.001;

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

const BOSS_ACTION_STATE = {
  IDLE: "idle",
  WINDUP: "windup",
  EXECUTE: "execute",
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

function toNonNegativeInt(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, Math.floor(Number(value)));
}

function resolveImageMagnification(rawMagnification, fallback = 1) {
  const fallbackValue = Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
  const value = Number(rawMagnification);
  if (!Number.isFinite(value) || value <= 0) {
    return fallbackValue;
  }
  return value;
}

function getScaledBodyHitboxAt(x, y, width, height, imageMagnification) {
  const baseWidth = Math.max(1, toFiniteNumber(width, 1));
  const baseHeight = Math.max(1, toFiniteNumber(height, 1));
  const magnification = resolveImageMagnification(imageMagnification, 1);
  const scaledWidth = baseWidth * magnification;
  const scaledHeight = baseHeight * magnification;

  return {
    x: x + (baseWidth - scaledWidth) / 2,
    y: y + (baseHeight - scaledHeight),
    width: scaledWidth,
    height: scaledHeight,
  };
}

function normalizeSpriteFacing(rawFacing, fallbackFacing = DEFAULT_SPRITE_FACING) {
  if (typeof rawFacing === "string") {
    const normalized = rawFacing.trim().toLowerCase();
    if (normalized.includes("left")) {
      return "left";
    }
    if (normalized.includes("right")) {
      return "right";
    }
  }

  if (fallbackFacing === "left") {
    return "left";
  }

  return "right";
}

function resolveAnimationFps(enemy, enemyAsset) {
  const assetFps = Number(enemyAsset?.fps);
  if (Number.isFinite(assetFps) && assetFps > 0) {
    return assetFps;
  }

  const enemyFps = Number(enemy?.animFps);
  if (Number.isFinite(enemyFps) && enemyFps > 0) {
    return enemyFps;
  }

  return ENEMY_ANIM_FPS;
}

function resolveAnimationFrameCount(enemyAsset, animation) {
  const frameCount = Number(enemyAsset?.[animation]?.frameCount);
  if (!Number.isFinite(frameCount) || frameCount <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(frameCount));
}

function getLoopFrameIndex(animTime, fps, frameCount) {
  if (frameCount <= 1) {
    return 0;
  }

  return Math.floor(Math.max(0, Number(animTime) || 0) * fps) % frameCount;
}

function getOneShotFrameIndex(animTime, fps, frameCount) {
  return Math.min(frameCount - 1, Math.floor(Math.max(0, Number(animTime) || 0) * fps));
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

function buildCollisionProfileForWalk(width, height, imageMagnification = 1) {
  const magnification = resolveImageMagnification(imageMagnification, 1);
  const useTallCollision = height >= 64;
  const baseWidth = useTallCollision ? TALL_ENEMY_COLLISION_SIZE : width;
  const baseHeight = useTallCollision ? TALL_ENEMY_COLLISION_SIZE : height;
  const collisionWidth = baseWidth * magnification;
  const collisionHeight = baseHeight * magnification;

  return {
    offsetX: (width - collisionWidth) / 2,
    offsetY: height - collisionHeight,
    width: collisionWidth,
    height: collisionHeight,
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

function updateSpriteFacing(enemy, dx) {
  if (Math.abs(dx) <= MOVE_EPSILON) {
    return;
  }

  enemy.spriteFacing = dx >= 0 ? "right" : "left";
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

function normalizeWeaponSkills(rawSkills) {
  if (!Array.isArray(rawSkills)) {
    return [];
  }

  return rawSkills
    .filter((skill) => skill && typeof skill.id === "string" && skill.id.length > 0)
    .map((skill) => ({
      id: skill.id,
      plus: Number.isFinite(skill.plus) ? Math.max(0, Math.floor(Number(skill.plus))) : 0,
    }));
}

function buildEnemyAttackWeapons(profileWeapons, enemyId, spawnX, spawnY, enemyWidth, enemyHeight, visibilityMode) {
  const source = Array.isArray(profileWeapons) ? profileWeapons : [];
  const weaponCount = Math.max(1, source.length);

  return source.map((weapon, index) => {
    const supported = weapon?.supported !== false;
    const forceHidden = weapon?.forceHidden === true;
    const width = Math.max(1, toFiniteNumber(weapon?.width, 32));
    const height = Math.max(1, toFiniteNumber(weapon?.height, 32));
    const angleOffset = (index / weaponCount) * Math.PI * 2;
    const enemyCenterX = spawnX + enemyWidth / 2;
    const enemyCenterY = spawnY + enemyHeight / 2;

    return {
      id: `${enemyId}-weapon-${index}`,
      weaponDefId: weapon?.weaponDefId ?? null,
      formationId: weapon?.formationId ?? null,
      actionKey: typeof weapon?.actionKey === "string" ? weapon.actionKey : null,
      skillInstances: normalizeWeaponSkills(weapon?.skills),
      skillParams: weapon?.skillParams ?? null,
      baseDamage: toFiniteNumber(weapon?.baseDamage, Number.NaN),
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
      visible: forceHidden ? false : visibilityMode === "always",
      hitApplied: false,
      supported,
      forceHidden,
    };
  });
}

function createDisabledEnemyAttackRuntime() {
  return {
    enabled: false,
    isBoss: false,
    phase: ENEMY_ATTACK_PHASE.COOLDOWN,
    phaseTimerSec: 0,
    telegraphAlpha: 0,
    telegraphs: [],
    windupSec: 0,
    recoverSec: 0,
    executeSec: 0,
    cooldownAfterRecoverSec: 0,
    weaponAimMode: "none",
    weaponVisibilityMode: "burst",
    attackCycle: 0,
    engageRangePx: 0,
    attackRangePx: Number.POSITIVE_INFINITY,
    losRequired: false,
    attackLinked: true,
    lockedAimDirX: 0,
    lockedAimDirY: 0,
    lockedTargetX: Number.NaN,
    lockedTargetY: Number.NaN,
    weapons: [],
  };
}

function createDefaultEnemyAttackRuntime(profile, enemyId, spawnX, spawnY, enemyWidth, enemyHeight) {
  const rangeConfig = resolveEnemyRangeConfig(profile);
  const visibilityMode = profile?.weaponVisibilityMode === "always" ? "always" : "burst";
  const weapons = buildEnemyAttackWeapons(profile?.weapons, enemyId, spawnX, spawnY, enemyWidth, enemyHeight, visibilityMode);

  if (weapons.length === 0) {
    return createDisabledEnemyAttackRuntime();
  }

  return {
    enabled: true,
    isBoss: false,
    phase: ENEMY_ATTACK_PHASE.COOLDOWN,
    phaseTimerSec: 0,
    telegraphAlpha: 0,
    telegraphs: [],
    windupSec: Math.max(0, toFiniteNumber(profile?.windupSec, 0)),
    recoverSec: Math.max(0, toFiniteNumber(profile?.recoverSec, 0)),
    executeSec: Math.max(0, toFiniteNumber(profile?.executeSec, 0)),
    cooldownAfterRecoverSec: Math.max(0, toFiniteNumber(profile?.cooldownAfterRecoverSec, 0)),
    weaponAimMode: profile?.weaponAimMode === "move_dir" || profile?.weaponAimMode === "none" ? profile.weaponAimMode : "to_target",
    weaponVisibilityMode: visibilityMode,
    attackCycle: 0,
    engageRangePx: rangeConfig.engageRangePx,
    attackRangePx: Math.max(0, toFiniteNumber(profile?.attackRangePx, Number.POSITIVE_INFINITY)),
    losRequired: profile?.losRequired === true,
    attackLinked: profile?.attackLinked !== false,
    lockedAimDirX: 0,
    lockedAimDirY: 0,
    lockedTargetX: Number.NaN,
    lockedTargetY: Number.NaN,
    weapons,
  };
}

function resolveBossActionKeyToWeaponIdMap(weapons, actions = {}) {
  const map = {};
  for (const [actionKey, action] of Object.entries(actions)) {
    const byIndex =
      Number.isFinite(action?.weaponIndex) && weapons[Math.max(0, Math.floor(action.weaponIndex))]
        ? weapons[Math.max(0, Math.floor(action.weaponIndex))]
        : null;
    const byActionKey = weapons.find((weapon) => weapon.actionKey === actionKey) ?? null;
    map[actionKey] = (byIndex ?? byActionKey)?.id ?? null;
  }
  return map;
}

function createBossEnemyAttackRuntime(profile, enemyId, spawnX, spawnY, enemyWidth, enemyHeight) {
  const rangeConfig = resolveEnemyRangeConfig(profile);
  const visibilityMode = profile?.weaponVisibilityMode === "always" ? "always" : "burst";
  const weapons = buildEnemyAttackWeapons(profile?.weapons, enemyId, spawnX, spawnY, enemyWidth, enemyHeight, visibilityMode);
  if (weapons.length === 0) {
    return createDisabledEnemyAttackRuntime();
  }

  const actions = profile?.actions && typeof profile.actions === "object" ? profile.actions : {};
  const actionCooldowns = {};
  for (const actionKey of Object.keys(actions)) {
    actionCooldowns[actionKey] = 0;
  }

  return {
    enabled: true,
    isBoss: true,
    phase: ENEMY_ATTACK_PHASE.COOLDOWN,
    phaseTimerSec: 0,
    telegraphAlpha: 0,
    telegraphs: [],
    windupSec: 0,
    recoverSec: 0,
    executeSec: 0,
    cooldownAfterRecoverSec: 0,
    weaponAimMode: profile?.weaponAimMode === "move_dir" || profile?.weaponAimMode === "none" ? profile.weaponAimMode : "to_target",
    weaponVisibilityMode: visibilityMode,
    attackCycle: 0,
    engageRangePx: rangeConfig.engageRangePx,
    attackRangePx: Math.max(0, toFiniteNumber(profile?.attackRangePx, Number.POSITIVE_INFINITY)),
    losRequired: profile?.losRequired === true,
    attackLinked: profile?.attackLinked !== false,
    lockedAimDirX: 0,
    lockedAimDirY: 0,
    lockedTargetX: Number.NaN,
    lockedTargetY: Number.NaN,
    weapons,
    phases: Array.isArray(profile?.phases) ? profile.phases : [],
    actionPriority: Array.isArray(profile?.actionPriority) ? profile.actionPriority : [],
    actions,
    summonRules: profile?.summonRules ?? null,
    actionCooldowns,
    actionState: BOSS_ACTION_STATE.IDLE,
    actionTimerSec: 0,
    activeActionKey: "chase",
    activeActionWeaponId: null,
    activePhase: null,
    chargeRuntime: null,
    pressRuntime: null,
    summonRuntime: null,
    actionKeyToWeaponId: resolveBossActionKeyToWeaponIdMap(weapons, actions),
  };
}

function createEnemyAttackRuntime(attackProfile, enemyId, spawnX, spawnY, enemyWidth, enemyHeight) {
  const profile = attackProfile && typeof attackProfile === "object" ? attackProfile : null;
  if (!profile) {
    return createDisabledEnemyAttackRuntime();
  }

  if (profile.role === "boss") {
    return createBossEnemyAttackRuntime(profile, enemyId, spawnX, spawnY, enemyWidth, enemyHeight);
  }

  return createDefaultEnemyAttackRuntime(profile, enemyId, spawnX, spawnY, enemyWidth, enemyHeight);
}

function createEnemyState(
  definition,
  x,
  y,
  collision,
  rng,
  enemyId,
  attackProfile = null,
  dungeonFloor = 1,
  spawnMeta = null
) {
  const noticeRadiusPx = Math.max(0, definition.noticeDistance * TILE_SIZE);
  const giveupDistanceTiles = Math.max(definition.giveupDistance, definition.noticeDistance);
  const giveupRadiusPx = Math.max(0, giveupDistanceTiles * TILE_SIZE);
  const rangeConfig = resolveEnemyRangeConfig(attackProfile);
  const vit = toFiniteNumber(definition.vit, 10);
  const pow = toFiniteNumber(definition.pow, 10);
  const derived = deriveEnemyCombatStats(definition, dungeonFloor, ENEMY_WALK_SPEED_PX_PER_SEC);
  const maxHp = Math.max(1, toFiniteNumber(derived.maxHp, 1));
  const attackDamage = Math.max(1, Math.round(ENEMY_ATTACK_BASE + pow * ENEMY_ATTACK_PER_POW));
  const moveSpeed = Math.max(0, toFiniteNumber(derived.moveSpeedPxPerSec, ENEMY_WALK_SPEED_PX_PER_SEC));
  const defaultSpriteFacing = normalizeSpriteFacing(definition.pngFacingDirection, DEFAULT_SPRITE_FACING);
  const animFps = Math.max(1, toFiniteNumber(definition.fps, ENEMY_ANIM_FPS));
  const imageMagnification = resolveImageMagnification(definition.imageMagnification, 1);

  return {
    id: enemyId,
    dbId: definition.id,
    type: definition.type,
    rank: derived.rank,
    role: definition.role ?? "chaser",
    tags: derived.tags,
    floor: derived.floor,
    statTotals: derived.statTotals,
    x,
    y,
    width: definition.width,
    height: definition.height,
    facing: "down",
    spriteFacing: defaultSpriteFacing,
    defaultSpriteFacing,
    isMoving: false,
    animTime: 0,
    attackAnimActive: false,
    attackAnimTime: 0,
    deathAnimTime: 0,
    animFps,
    imageMagnification,
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
    hitFlashColor: ENEMY_HIT_FLASH_COLOR_DEFAULT,
    attackDamage,
    damageMult: derived.damageMult,
    attackScale: derived.attackScale,
    critChance: derived.critChance,
    critMult: derived.critMult,
    ailmentTakenMult: derived.ailmentTakenMult,
    durationMult: derived.durationMult,
    ccDurationMult: derived.ccDurationMult,
    damageSeed: deriveSeed(rng.seed, "damage"),
    moveSpeed,
    baseSpeedPxPerSec: moveSpeed,
    chaseSpeedPxPerSec: Math.max(0, toFiniteNumber(derived.chaseSpeedPxPerSec, moveSpeed * ENEMY_CHASE_SPEED_MULTIPLIER)),
    lastMoveDx: 0,
    lastMoveDy: 1,
    spawnedByEnemyId:
      typeof spawnMeta?.spawnedByEnemyId === "string" && spawnMeta.spawnedByEnemyId.length > 0
        ? spawnMeta.spawnedByEnemyId
        : null,
    isSummoned: spawnMeta?.isSummoned === true || derived.tags.includes("summoned"),
    roomId: typeof spawnMeta?.roomId === "string" && spawnMeta.roomId.length > 0 ? spawnMeta.roomId : null,
    attack: createEnemyAttackRuntime(attackProfile, enemyId, x, y, definition.width, definition.height),
  };
}

function findSpawnForRoom(room, definition, dungeon, spawnRng, blockedTileKeys = null) {
  const collision = definition.type === "walk"
    ? buildCollisionProfileForWalk(definition.width, definition.height, definition.imageMagnification)
    : null;
  const roomTiles = [];

  for (let tileY = room.y; tileY < room.y + room.h; tileY += 1) {
    for (let tileX = room.x; tileX < room.x + room.w; tileX += 1) {
      roomTiles.push({ tileX, tileY });
    }
  }

  const shuffledTiles = spawnRng.shuffle(roomTiles);
  for (const tile of shuffledTiles) {
    if (blockedTileKeys?.has(`${tile.tileX}:${tile.tileY}`)) {
      continue;
    }

    const centerX = tile.tileX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = tile.tileY * TILE_SIZE + TILE_SIZE / 2;
    const x = centerX - definition.width / 2;
    const y = centerY - definition.height / 2;
    const candidate = { type: definition.type, width: definition.width, height: definition.height, collision };

    if (isEnemyPositionPassable(candidate, x, y, dungeon)) {
      return {
        x,
        y,
        collision,
        tileX: tile.tileX,
        tileY: tile.tileY,
      };
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

function normalizeBlockedTileSet(blockedTiles) {
  if (blockedTiles instanceof Set) {
    return new Set(blockedTiles);
  }

  if (!Array.isArray(blockedTiles)) {
    return new Set();
  }

  return new Set(
    blockedTiles
      .map((tile) => {
        if (!tile) {
          return null;
        }

        if (typeof tile === "string") {
          return tile;
        }

        if (Number.isFinite(tile.tileX) && Number.isFinite(tile.tileY)) {
          return `${Math.floor(tile.tileX)}:${Math.floor(tile.tileY)}`;
        }

        return null;
      })
      .filter((value) => typeof value === "string")
  );
}

function resolveSpawnCount(definition, spawnRng) {
  const min = Math.max(1, Math.floor(toFiniteNumber(definition?.spawn?.min, 1)));
  const max = Math.max(min, Math.floor(toFiniteNumber(definition?.spawn?.max, min)));
  return spawnRng.int(min, max);
}

function normalizeCreateEnemiesOptions(blockedTilesOrOptions) {
  const looksLikeOptions =
    blockedTilesOrOptions &&
    typeof blockedTilesOrOptions === "object" &&
    !Array.isArray(blockedTilesOrOptions) &&
    !(blockedTilesOrOptions instanceof Set) &&
    ("blockedTiles" in blockedTilesOrOptions ||
      "fixedSpawns" in blockedTilesOrOptions ||
      "useFixedSpawnsOnly" in blockedTilesOrOptions);

  if (!looksLikeOptions) {
    return {
      blockedTiles: blockedTilesOrOptions,
      fixedSpawns: [],
      useFixedSpawnsOnly: false,
    };
  }

  return {
    blockedTiles: blockedTilesOrOptions.blockedTiles ?? null,
    fixedSpawns: Array.isArray(blockedTilesOrOptions.fixedSpawns) ? blockedTilesOrOptions.fixedSpawns : [],
    useFixedSpawnsOnly: blockedTilesOrOptions.useFixedSpawnsOnly === true,
  };
}

function resolveFixedSpawnCollision(definition) {
  return definition.type === "walk"
    ? buildCollisionProfileForWalk(definition.width, definition.height, definition.imageMagnification)
    : null;
}

function createEnemyFromFixedSpawn({
  fixedSpawn,
  definition,
  dungeon,
  seed,
  dungeonFloor,
  enemyAttackProfilesByDbId,
  blockedTileKeys,
  index,
}) {
  if (!Number.isFinite(fixedSpawn?.tileX) || !Number.isFinite(fixedSpawn?.tileY)) {
    throw new Error(`Fixed enemy spawn at index ${index} has invalid tile coordinates`);
  }

  const tileX = Math.floor(fixedSpawn.tileX);
  const tileY = Math.floor(fixedSpawn.tileY);
  const tileKey = `${tileX}:${tileY}`;
  if (blockedTileKeys.has(tileKey)) {
    throw new Error(`Fixed enemy spawn at index ${index} is blocked: ${tileKey}`);
  }

  const collision = resolveFixedSpawnCollision(definition);
  const centerX = tileX * TILE_SIZE + TILE_SIZE / 2;
  const centerY = tileY * TILE_SIZE + TILE_SIZE / 2;
  const x = centerX - definition.width / 2;
  const y = centerY - definition.height / 2;
  const passableProbe = { type: definition.type, width: definition.width, height: definition.height, collision };

  if (!isEnemyPositionPassable(passableProbe, x, y, dungeon)) {
    throw new Error(`Fixed enemy spawn at index ${index} is not passable: ${tileKey}`);
  }

  blockedTileKeys.add(tileKey);
  const enemyId =
    typeof fixedSpawn?.enemyId === "string" && fixedSpawn.enemyId.length > 0
      ? fixedSpawn.enemyId
      : `enemy-fixed-${definition.id}-${index}`;
  const enemyRng = createRng(deriveSeed(seed ?? dungeon.seed, `enemy-fixed-${definition.id}-${index}`));
  const attackProfile = enemyAttackProfilesByDbId?.[definition.id] ?? null;

  return createEnemyState(
    definition,
    x,
    y,
    collision,
    enemyRng,
    enemyId,
    attackProfile,
    dungeonFloor,
    {
      spawnedByEnemyId:
        typeof fixedSpawn?.spawnedByEnemyId === "string" && fixedSpawn.spawnedByEnemyId.length > 0
          ? fixedSpawn.spawnedByEnemyId
          : null,
      isSummoned: fixedSpawn?.isSummoned === true,
    }
  );
}

export function createEnemies(
  dungeon,
  enemyDefinitions,
  seed,
  enemyAttackProfilesByDbId = null,
  blockedTilesOrOptions = null
) {
  if (!Array.isArray(enemyDefinitions) || enemyDefinitions.length === 0) {
    return [];
  }

  const createOptions = normalizeCreateEnemiesOptions(blockedTilesOrOptions);
  const spawnRng = createRng(deriveSeed(seed ?? dungeon.seed, "enemy-spawn"));
  const spawnRooms = dungeon.rooms.filter((room) => room.id !== dungeon.startRoomId);
  const dungeonFloor = Math.max(1, Math.floor(toFiniteNumber(dungeon?.floor, 1)));
  const guaranteedOrder = spawnRng.shuffle(enemyDefinitions);
  const enemies = [];
  const blockedTileKeys = normalizeBlockedTileSet(createOptions.blockedTiles);
  const enemyDefinitionsById = Object.fromEntries(enemyDefinitions.map((definition) => [definition.id, definition]));

  for (let fixedIndex = 0; fixedIndex < createOptions.fixedSpawns.length; fixedIndex += 1) {
    const fixedSpawn = createOptions.fixedSpawns[fixedIndex];
    const fixedEnemyId =
      typeof fixedSpawn?.enemyDbId === "string" && fixedSpawn.enemyDbId.length > 0 ? fixedSpawn.enemyDbId : null;
    const definition = fixedEnemyId ? enemyDefinitionsById[fixedEnemyId] : null;
    if (!definition) {
      throw new Error(`Fixed enemy spawn at index ${fixedIndex} references unknown enemy_db_id: ${fixedEnemyId}`);
    }

    enemies.push(
      createEnemyFromFixedSpawn({
        fixedSpawn,
        definition,
        dungeon,
        seed,
        dungeonFloor,
        enemyAttackProfilesByDbId,
        blockedTileKeys,
        index: fixedIndex,
      })
    );
  }

  if (createOptions.useFixedSpawnsOnly) {
    return enemies;
  }

  for (let roomIndex = 0; roomIndex < spawnRooms.length; roomIndex += 1) {
    const room = spawnRooms[roomIndex];
    const definition = chooseDefinitionForRoom(roomIndex, enemyDefinitions, spawnRng, guaranteedOrder);
    const attackProfile = enemyAttackProfilesByDbId?.[definition.id] ?? null;
    const requestedSpawnCount = resolveSpawnCount(definition, spawnRng);
    let spawnedInRoom = 0;

    for (let spawnIndex = 0; spawnIndex < requestedSpawnCount; spawnIndex += 1) {
      const spawn = findSpawnForRoom(room, definition, dungeon, spawnRng, blockedTileKeys);
      if (!spawn) {
        break;
      }

      const tileKey = `${spawn.tileX}:${spawn.tileY}`;
      blockedTileKeys.add(tileKey);
      const enemyRng = createRng(
        deriveSeed(seed ?? dungeon.seed, `enemy-${room.id}-${roomIndex}-${spawnIndex}`)
      );
      enemies.push(
        createEnemyState(
          definition,
          spawn.x,
          spawn.y,
          spawn.collision,
          enemyRng,
          `enemy-${room.id}-${roomIndex}-${spawnIndex}`,
          attackProfile,
          dungeonFloor,
          { roomId: room.id }
        )
      );
      spawnedInRoom += 1;
    }

    if (spawnedInRoom <= 0) {
      throw new Error(`Failed to spawn enemy in room ${room.id} (type=${definition.type})`);
    }
  }

  return enemies;
}

export function createWalkEnemies(
  dungeon,
  walkEnemyDefinitions,
  seed,
  enemyAttackProfilesByDbId = null,
  blockedTiles = null
) {
  const onlyWalkDefinitions = (walkEnemyDefinitions ?? []).filter((definition) => definition.type === "walk");
  return createEnemies(dungeon, onlyWalkDefinitions, seed, enemyAttackProfilesByDbId, blockedTiles);
}

function updateDeadEnemy(enemy, dt) {
  enemy.hitFlashTimerSec = Math.max(0, toFiniteNumber(enemy.hitFlashTimerSec, 0) - dt);
  enemy.isMoving = false;
  enemy.deathAnimTime = Math.max(0, toFiniteNumber(enemy.deathAnimTime, 0) + dt);
}

function updateEnemy(enemy, dungeon, dt, player) {
  enemy.hitFlashTimerSec = Math.max(0, toFiniteNumber(enemy.hitFlashTimerSec, 0) - dt);
  if (enemy.attackAnimActive === true) {
    enemy.attackAnimTime = Math.max(0, toFiniteNumber(enemy.attackAnimTime, 0) + dt);
  }
  updateBehaviorMode(enemy, dungeon, player);

  const isBossActionLock =
    enemy.attack?.isBoss === true &&
    enemy.attack.activeActionKey !== "chase" &&
    enemy.attack.actionState !== BOSS_ACTION_STATE.IDLE;
  if (isBossActionLock) {
    enemy.isMoving = false;
    enemy.animTime += dt;
    return;
  }

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
  updateSpriteFacing(enemy, movedX);
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
      updateDeadEnemy(enemy, dt);
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
    weapon.visible = weapon.forceHidden === true ? false : alwaysVisible ? true : visible;
  }
}

function clearEnemyLockedTargetPosition(attack) {
  if (!attack) {
    return;
  }
  attack.lockedTargetX = Number.NaN;
  attack.lockedTargetY = Number.NaN;
}

function lockEnemyTargetPosition(attack, player) {
  if (!attack || !player) {
    clearEnemyLockedTargetPosition(attack);
    return;
  }

  const targetCenter = getPlayerFeetCenter(player);
  attack.lockedTargetX = targetCenter.x;
  attack.lockedTargetY = targetCenter.y;
}

function setEnemyAttackPhase(enemy, phase, timerSec) {
  const attack = enemy.attack;
  attack.phase = phase;
  attack.phaseTimerSec = Math.max(0, toFiniteNumber(timerSec, 0));
  attack.telegraphs = [];

  if (phase === ENEMY_ATTACK_PHASE.WINDUP) {
    attack.telegraphAlpha = 1;
    setEnemyWeaponVisibility(attack, false);
    return;
  }

  if (phase === ENEMY_ATTACK_PHASE.ATTACK) {
    attack.attackCycle = Math.max(0, Math.floor(toFiniteNumber(attack.attackCycle, 0))) + 1;
    attack.telegraphAlpha = 0;
    enemy.attackAnimActive = true;
    enemy.attackAnimTime = 0;
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
  if (phase === ENEMY_ATTACK_PHASE.COOLDOWN) {
    clearEnemyLockedTargetPosition(attack);
    setEnemyWeaponVisibility(attack, false);
    return;
  }

  if (phase === ENEMY_ATTACK_PHASE.RECOVER) {
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

    const canUseDerivedRoll =
      Number.isFinite(weapon.baseDamage) &&
      weapon.baseDamage > 0 &&
      typeof enemy.damageSeed === "string" &&
      Number.isFinite(enemy.damageMult) &&
      Number.isFinite(enemy.attackScale) &&
      Number.isFinite(enemy.critChance) &&
      Number.isFinite(enemy.critMult);
    const damageRoll = canUseDerivedRoll
      ? rollHitDamage({
          baseDamage: weapon.baseDamage,
          damageMult: enemy.damageMult,
          attackScale: enemy.attackScale,
          critChance: enemy.critChance,
          critMult: enemy.critMult,
          seedKey: `${enemy.damageSeed}::${attack.attackCycle}::${weapon.id}::player`,
        })
      : {
          damage: Math.max(1, Math.round(toFiniteNumber(enemy.attackDamage, 1))),
          isCritical: false,
        };
    const damageValue = damageRoll.damage;

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
      weaponId: weapon.id,
      weaponDefId: weapon.weaponDefId,
      damage: damageValue,
      isCritical: damageRoll.isCritical === true,
      worldX,
      worldY,
    });

    weapon.hitApplied = true;
  }
}

function buildBossTelegraphLine(enemy, dashDistanceTiles, telegraphWidthTiles = 1) {
  const attack = enemy.attack;
  const enemyCenter = getEnemyCenter(enemy);
  const distancePx = Math.max(0, toFiniteNumber(dashDistanceTiles, 0) * TILE_SIZE);
  const toX = enemyCenter.x + attack.lockedAimDirX * distancePx;
  const toY = enemyCenter.y + attack.lockedAimDirY * distancePx;
  return {
    kind: "line",
    style: "line_red_translucent",
    fromX: enemyCenter.x,
    fromY: enemyCenter.y,
    toX,
    toY,
    widthPx: Math.max(2, toFiniteNumber(telegraphWidthTiles, 1) * TILE_SIZE),
    alpha: attack.telegraphAlpha,
  };
}

function buildBossTelegraphCircle(centerX, centerY, radiusTiles, style = "circle_red_translucent", alpha = 1) {
  return {
    kind: "circle",
    style,
    centerX,
    centerY,
    radiusPx: Math.max(2, toFiniteNumber(radiusTiles, 0) * TILE_SIZE),
    alpha: clamp(toFiniteNumber(alpha, 1), 0, 1),
  };
}

function resolveBossPhase(attack, enemy) {
  const maxHp = Math.max(1, toFiniteNumber(enemy.maxHp, 1));
  const hpRatio = clamp(toFiniteNumber(enemy.hp, maxHp) / maxHp, 0, 1.01);
  for (const phase of attack.phases) {
    if (hpRatio >= phase.hpRatioMin && hpRatio < phase.hpRatioMax) {
      return phase;
    }
  }
  return attack.phases[0] ?? null;
}

function countAliveSummonsOf(enemy, allEnemies) {
  if (!Array.isArray(allEnemies)) {
    return 0;
  }

  let count = 0;
  for (const candidate of allEnemies) {
    if (!candidate || candidate.isDead === true) {
      continue;
    }
    if (candidate.spawnedByEnemyId === enemy.id) {
      count += 1;
    }
  }
  return count;
}

function evaluateBossWhenClause(when, context) {
  const tokens = String(when ?? "")
    .split("&&")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length <= 0) {
    return false;
  }

  for (const token of tokens) {
    if (token === "always") {
      continue;
    }

    if (token === "cooldown_ready" && context.cooldownReady !== true) {
      return false;
    }
    if (token === "minion_count_lt" && context.minionCountLt !== true) {
      return false;
    }
    if (token === "target_distance_gte" && context.targetDistanceGte !== true) {
      return false;
    }
    if (token === "target_distance_lte" && context.targetDistanceLte !== true) {
      return false;
    }
  }

  return true;
}

function resolveBossAction(enemy, player, dungeon, allEnemies) {
  const attack = enemy.attack;
  const distanceTiles = getDistanceToPlayer(enemy, player) / TILE_SIZE;
  const minionCount = countAliveSummonsOf(enemy, allEnemies);

  for (const priority of attack.actionPriority) {
    const actionKey = priority.action;
    const actionConfig = attack.actions?.[actionKey] ?? null;
    if (!actionConfig) {
      continue;
    }

    const actionCooldownSec = Math.max(0, toFiniteNumber(attack.actionCooldowns?.[actionKey], 0));
    const context = {
      cooldownReady: actionCooldownSec <= 0.0001,
      minionCountLt: minionCount < Math.max(0, toNonNegativeInt(actionConfig.minionCountLt, 0)),
      targetDistanceGte: distanceTiles >= Math.max(0, toFiniteNumber(actionConfig.targetDistanceGte, 0)),
      targetDistanceLte: distanceTiles <= Math.max(0, toFiniteNumber(actionConfig.targetDistanceLte, Number.POSITIVE_INFINITY)),
    };
    if (evaluateBossWhenClause(priority.when, context)) {
      if (actionKey === "chase") {
        if (attack.losRequired === true && !hasLineOfSightToPlayer(enemy, player, dungeon)) {
          continue;
        }
      }
      return actionKey;
    }
  }

  return "chase";
}

function getBossActionWeapon(attack, actionKey) {
  const weaponId = attack.actionKeyToWeaponId?.[actionKey] ?? null;
  if (!weaponId) {
    return null;
  }
  return attack.weapons.find((weapon) => weapon.id === weaponId) ?? null;
}

function setBossActiveWeaponVisibility(attack, activeWeaponId, visible) {
  for (const weapon of attack.weapons) {
    if (weapon.forceHidden === true) {
      weapon.visible = false;
      continue;
    }
    if (attack.weaponVisibilityMode === "always") {
      weapon.visible = true;
      continue;
    }
    weapon.visible = visible === true && weapon.id === activeWeaponId;
  }
}

function applyBossDamageToPlayer(enemy, weapon, attack, player, events, options = {}) {
  if (!weapon || !player) {
    return;
  }

  const playerHitbox = getPlayerCombatHitbox(player);
  if (!playerHitbox) {
    return;
  }

  const canUseDerivedRoll =
    Number.isFinite(weapon.baseDamage) &&
    weapon.baseDamage > 0 &&
    typeof enemy.damageSeed === "string" &&
    Number.isFinite(enemy.damageMult) &&
    Number.isFinite(enemy.attackScale) &&
    Number.isFinite(enemy.critChance) &&
    Number.isFinite(enemy.critMult);
  const damageRoll = canUseDerivedRoll
    ? rollHitDamage({
        baseDamage: weapon.baseDamage,
        damageMult: enemy.damageMult,
        attackScale: enemy.attackScale,
        critChance: enemy.critChance,
        critMult: enemy.critMult,
        seedKey: `${enemy.damageSeed}::${attack.attackCycle}::${weapon.id}::player`,
      })
    : {
        damage: Math.max(1, Math.round(toFiniteNumber(enemy.attackDamage, 1))),
        isCritical: false,
      };
  const damageValue = damageRoll.damage;
  const applyPlayerHpDamage = options.applyPlayerHpDamage !== false;

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
    weaponId: weapon.id,
    weaponDefId: weapon.weaponDefId,
    damage: damageValue,
    isCritical: damageRoll.isCritical === true,
    worldX,
    worldY,
  });
}

function isTileWalkable(grid, tileX, tileY) {
  if (!Array.isArray(grid) || grid.length <= 0 || !Array.isArray(grid[0])) {
    return false;
  }
  if (tileY < 0 || tileY >= grid.length || tileX < 0 || tileX >= grid[0].length) {
    return false;
  }
  return grid[tileY][tileX] === true;
}

function buildOccupiedTileSet(enemies) {
  const occupied = new Set();
  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }
    const center = getEnemyCenter(enemy);
    const tile = toTileCoordinate(center);
    occupied.add(`${tile.x}:${tile.y}`);
  }
  return occupied;
}

function iterateRingTileCandidates(centerTileX, centerTileY, radius) {
  const candidates = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    const dxAbs = radius - Math.abs(dy);
    if (dxAbs === 0) {
      candidates.push({ tileX: centerTileX, tileY: centerTileY + dy });
      continue;
    }
    candidates.push({ tileX: centerTileX - dxAbs, tileY: centerTileY + dy });
    candidates.push({ tileX: centerTileX + dxAbs, tileY: centerTileY + dy });
  }
  return candidates;
}

function resolveBossSummonSpawnTiles(enemy, dungeon, allEnemies, requestedCount) {
  const walkableGrid = getWalkableGrid(dungeon);
  if (!Array.isArray(walkableGrid) || walkableGrid.length <= 0 || !Array.isArray(walkableGrid[0])) {
    return [];
  }
  const occupied = buildOccupiedTileSet(allEnemies);
  const center = toTileCoordinate(getEnemyCenter(enemy));
  const resolved = [];

  for (let radius = 3; radius <= 8; radius += 1) {
    for (const candidate of iterateRingTileCandidates(center.x, center.y, radius)) {
      if (!isTileWalkable(walkableGrid, candidate.tileX, candidate.tileY)) {
        continue;
      }
      const key = `${candidate.tileX}:${candidate.tileY}`;
      if (occupied.has(key)) {
        continue;
      }
      occupied.add(key);
      resolved.push(candidate);
      if (resolved.length >= requestedCount) {
        return resolved;
      }
    }
  }

  if (resolved.length >= requestedCount) {
    return resolved;
  }

  for (let y = 0; y < walkableGrid.length; y += 1) {
    for (let x = 0; x < walkableGrid[y].length; x += 1) {
      if (!isTileWalkable(walkableGrid, x, y)) {
        continue;
      }
      const key = `${x}:${y}`;
      if (occupied.has(key)) {
        continue;
      }
      occupied.add(key);
      resolved.push({ tileX: x, tileY: y });
      if (resolved.length >= requestedCount) {
        return resolved;
      }
    }
  }

  return resolved;
}

function enterBossActionWindup(enemy, player, dungeon, allEnemies) {
  const attack = enemy.attack;
  const actionKey = attack.activeActionKey;
  const actionConfig = attack.actions?.[actionKey] ?? {};
  const actionWeapon = getBossActionWeapon(attack, actionKey);
  const skillParams = actionWeapon?.skillParams ?? null;

  const lockedAim = getEnemyAimDirection(enemy, player, false);
  attack.lockedAimDirX = lockedAim.x;
  attack.lockedAimDirY = lockedAim.y;
  lockEnemyTargetPosition(attack, player);
  attack.actionState = BOSS_ACTION_STATE.WINDUP;
  attack.phase = ENEMY_ATTACK_PHASE.WINDUP;
  attack.actionTimerSec = Math.max(0, toFiniteNumber(actionConfig.windupSec, 0));
  attack.telegraphAlpha = 1;
  attack.telegraphs = [];
  attack.activeActionWeaponId = actionWeapon?.id ?? null;
  setBossActiveWeaponVisibility(attack, attack.activeActionWeaponId, false);

  if (actionKey === "charge" && skillParams?.charge) {
    attack.chargeRuntime = {
      distancePx: Math.max(0, toFiniteNumber(skillParams.charge.dashDistanceTiles, 0) * TILE_SIZE),
      remainingPx: Math.max(0, toFiniteNumber(skillParams.charge.dashDistanceTiles, 0) * TILE_SIZE),
      speedPxPerSec: Math.max(0, toFiniteNumber(skillParams.charge.speedTilePerSec, 0) * TILE_SIZE),
      stopOnPlayerHit: skillParams.charge.stopOnPlayerHit !== false,
      wallHitRecoverSec: Math.max(
        toFiniteNumber(actionConfig.recoverOnWallHitSec, 0),
        toFiniteNumber(skillParams.charge.wallHitRecoverSec, 0)
      ),
      knockbackPx: Math.max(0, toFiniteNumber(skillParams.charge.knockbackTiles, 0) * TILE_SIZE),
    };
    attack.telegraphs.push(
      buildBossTelegraphLine(
        enemy,
        toFiniteNumber(skillParams.charge.dashDistanceTiles, 0),
        toFiniteNumber(skillParams.charge.telegraphWidthTiles, 1)
      )
    );
  } else if (actionKey === "press" && skillParams?.aoe) {
    const fallbackCenter = getPlayerFeetCenter(player);
    const targetCenter = {
      x: Number.isFinite(attack.lockedTargetX) ? attack.lockedTargetX : fallbackCenter.x,
      y: Number.isFinite(attack.lockedTargetY) ? attack.lockedTargetY : fallbackCenter.y,
    };
    attack.pressRuntime = {
      centerX: targetCenter.x,
      centerY: targetCenter.y,
      remainingHits: Math.max(1, toNonNegativeInt(attack.activePhase?.pressChainCount, 1)),
      hitIntervalSec: 0.2,
      hitTimerSec: 0,
      radiusTiles: Math.max(0, toFiniteNumber(skillParams.aoe.telegraphRadiusTiles, 0)),
    };
    attack.telegraphs.push(
      buildBossTelegraphCircle(
        targetCenter.x,
        targetCenter.y,
        toFiniteNumber(skillParams.aoe.telegraphRadiusTiles, 0),
        skillParams.aoe.telegraphStyle || "circle_red_translucent",
        1
      )
    );
  } else if (actionKey === "summon" && skillParams?.summon) {
    const phaseCount = attack.activePhase?.summonCount;
    const countRange = phaseCount
      ? {
          min: Math.max(0, toNonNegativeInt(phaseCount.min, 0)),
          max: Math.max(0, toNonNegativeInt(phaseCount.max, 0)),
        }
      : {
          min: Math.max(0, toNonNegativeInt(skillParams.summon?.count?.min, 0)),
          max: Math.max(0, toNonNegativeInt(skillParams.summon?.count?.max, 0)),
        };
    const summonCount =
      countRange.max > countRange.min ? enemy.rng.int(countRange.min, countRange.max) : countRange.max;
    const roomMax = Math.max(
      0,
      toNonNegativeInt(attack.summonRules?.maxAliveInRoom, 0),
      toNonNegativeInt(skillParams.summon.maxAliveInRoom, 0)
    );
    const perSummonerMax = Math.max(
      0,
      toNonNegativeInt(attack.summonRules?.maxAlivePerSummoner, 0),
      toNonNegativeInt(skillParams.summon.maxAlivePerSummoner, 0)
    );
    const aliveMinions = countAliveSummonsOf(enemy, allEnemies);
    const availableBySummoner = perSummonerMax > 0 ? Math.max(0, perSummonerMax - aliveMinions) : summonCount;
    const availableByRoom = roomMax > 0 ? Math.max(0, roomMax - aliveMinions) : summonCount;
    const resolvedCount = Math.max(0, Math.min(summonCount, availableBySummoner, availableByRoom));
    const spawnTiles = resolveBossSummonSpawnTiles(enemy, dungeon, allEnemies, resolvedCount);
    attack.summonRuntime = {
      enemyDbId: skillParams.summon.enemyId,
      spawnTiles,
      spawned: false,
      spawnTelegraphRadiusTiles: Math.max(0, toFiniteNumber(skillParams.summon.spawnTelegraphRadiusTiles, 0.5)),
      spawnTelegraphStyle: skillParams.summon.spawnTelegraphStyle || "circle_red_translucent",
      castEffectId: skillParams.summon.castEffectId || "",
    };
    attack.telegraphs.push(
      ...spawnTiles.map((tile) =>
        buildBossTelegraphCircle(
          tile.tileX * TILE_SIZE + TILE_SIZE / 2,
          tile.tileY * TILE_SIZE + TILE_SIZE / 2,
          attack.summonRuntime.spawnTelegraphRadiusTiles,
          attack.summonRuntime.spawnTelegraphStyle,
          1
        )
      )
    );
  }
}

function beginBossActionExecute(enemy) {
  const attack = enemy.attack;
  const actionKey = attack.activeActionKey;
  const actionConfig = attack.actions?.[actionKey] ?? {};
  const actionWeapon = getBossActionWeapon(attack, actionKey);
  const skillParams = actionWeapon?.skillParams ?? null;

  let executeSec = Math.max(0.05, toFiniteNumber(actionConfig.executeSec, toFiniteNumber(actionWeapon?.executeDurationSec, 0.05)));
  if (actionKey === "charge" && attack.chargeRuntime) {
    const speedPxPerSec = Math.max(1, attack.chargeRuntime.speedPxPerSec);
    executeSec = Math.max(0.05, attack.chargeRuntime.distancePx / speedPxPerSec);
  }
  if (actionKey === "press" && attack.pressRuntime) {
    const chainCount = Math.max(1, toNonNegativeInt(attack.pressRuntime.remainingHits, 1));
    executeSec = Math.max(0.05, chainCount * attack.pressRuntime.hitIntervalSec);
  }
  if (actionKey === "summon") {
    executeSec = Math.max(0.05, toFiniteNumber(actionConfig.executeSec, 0.1));
  }

  attack.actionState = BOSS_ACTION_STATE.EXECUTE;
  attack.phase = ENEMY_ATTACK_PHASE.ATTACK;
  attack.actionTimerSec = executeSec;
  attack.attackCycle = Math.max(0, toNonNegativeInt(attack.attackCycle, 0)) + 1;
  attack.telegraphAlpha = 0;
  attack.telegraphs = [];
  enemy.attackAnimActive = true;
  enemy.attackAnimTime = 0;
  setBossActiveWeaponVisibility(attack, attack.activeActionWeaponId, true);

  if (actionKey === "press" && attack.pressRuntime && skillParams?.aoe) {
    attack.pressRuntime.radiusTiles = Math.max(0, toFiniteNumber(skillParams.aoe.telegraphRadiusTiles, 0));
  }
}

function transitionBossToRecover(enemy, wallHit = false) {
  const attack = enemy.attack;
  const actionKey = attack.activeActionKey;
  const actionConfig = attack.actions?.[actionKey] ?? {};
  let recoverSec = Math.max(0, toFiniteNumber(actionConfig.recoverSec, 0));
  if (wallHit && attack.chargeRuntime) {
    recoverSec = Math.max(recoverSec, toFiniteNumber(attack.chargeRuntime.wallHitRecoverSec, recoverSec));
  }

  attack.actionState = BOSS_ACTION_STATE.RECOVER;
  attack.phase = ENEMY_ATTACK_PHASE.RECOVER;
  attack.actionTimerSec = recoverSec;
  attack.telegraphAlpha = 0;
  attack.telegraphs = [];
  setBossActiveWeaponVisibility(attack, attack.activeActionWeaponId, false);
}

function completeBossAction(enemy) {
  const attack = enemy.attack;
  const actionKey = attack.activeActionKey;
  const actionConfig = attack.actions?.[actionKey] ?? {};
  const cooldownSec = Math.max(0, toFiniteNumber(actionConfig.cooldownSec, 0));
  attack.actionCooldowns[actionKey] = cooldownSec;
  attack.actionState = BOSS_ACTION_STATE.IDLE;
  attack.phase = ENEMY_ATTACK_PHASE.COOLDOWN;
  attack.actionTimerSec = 0;
  attack.activeActionKey = "chase";
  attack.activeActionWeaponId = null;
  attack.chargeRuntime = null;
  attack.pressRuntime = null;
  attack.summonRuntime = null;
  attack.telegraphAlpha = 0;
  attack.telegraphs = [];
  clearEnemyLockedTargetPosition(attack);
  setBossActiveWeaponVisibility(attack, null, false);
}

function stepBossCharge(enemy, player, dungeon, dt, events, options = {}) {
  const attack = enemy.attack;
  const runtime = attack.chargeRuntime;
  if (!runtime) {
    return { finished: true, wallHit: false };
  }

  const speedPxPerSec = Math.max(0, runtime.speedPxPerSec);
  const travelDistance = Math.min(runtime.remainingPx, speedPxPerSec * dt);
  const substeps = Math.max(1, Math.ceil(travelDistance / MAX_SUBSTEP_PIXELS));
  const stepDistance = travelDistance / substeps;
  let wallHit = false;
  let didHitPlayer = false;

  for (let stepIndex = 0; stepIndex < substeps; stepIndex += 1) {
    if (stepDistance <= BOSS_CHARGE_STOP_EPSILON) {
      break;
    }

    const nextX = enemy.x + attack.lockedAimDirX * stepDistance;
    const nextY = enemy.y + attack.lockedAimDirY * stepDistance;
    if (!isEnemyPositionPassable(enemy, nextX, nextY, dungeon)) {
      wallHit = true;
      break;
    }

    enemy.x = nextX;
    enemy.y = nextY;
    runtime.remainingPx = Math.max(0, runtime.remainingPx - stepDistance);
    updateFacing(enemy, attack.lockedAimDirX, attack.lockedAimDirY);
    updateSpriteFacing(enemy, attack.lockedAimDirX);

    if (!player || didHitPlayer) {
      continue;
    }

    const enemyHitbox = getEnemyCombatHitbox(enemy);
    const playerHitbox = getPlayerCombatHitbox(player);
    if (!enemyHitbox || !playerHitbox) {
      continue;
    }
    if (!intersectsAabb(enemyHitbox, playerHitbox)) {
      continue;
    }

    const actionWeapon = getBossActionWeapon(attack, attack.activeActionKey);
    applyBossDamageToPlayer(enemy, actionWeapon, attack, player, events, options);
    didHitPlayer = true;
    if (runtime.stopOnPlayerHit) {
      break;
    }
  }

  const finished = wallHit || didHitPlayer || runtime.remainingPx <= BOSS_CHARGE_STOP_EPSILON;
  return { finished, wallHit };
}

function stepBossPress(enemy, player, events, options = {}) {
  const attack = enemy.attack;
  const runtime = attack.pressRuntime;
  if (!runtime || runtime.remainingHits <= 0) {
    return;
  }

  runtime.hitTimerSec -= options.dt ?? 0;
  if (runtime.hitTimerSec > 0) {
    return;
  }

  runtime.hitTimerSec = runtime.hitIntervalSec;
  runtime.remainingHits -= 1;
  const actionWeapon = getBossActionWeapon(attack, attack.activeActionKey);
  const playerCenter = getPlayerFeetCenter(player);
  const radiusPx = Math.max(0, runtime.radiusTiles * TILE_SIZE);
  const distance = Math.hypot(playerCenter.x - runtime.centerX, playerCenter.y - runtime.centerY);
  if (distance > radiusPx) {
    return;
  }

  applyBossDamageToPlayer(enemy, actionWeapon, attack, player, events, options);
}

function stepBossSummon(enemy, events) {
  const attack = enemy.attack;
  const runtime = attack.summonRuntime;
  if (!runtime || runtime.spawned === true) {
    return;
  }

  runtime.spawned = true;
  const summonCastSeq = Math.max(0, toNonNegativeInt(attack.attackCycle, 0));
  for (let summonSpawnIndex = 0; summonSpawnIndex < runtime.spawnTiles.length; summonSpawnIndex += 1) {
    const tile = runtime.spawnTiles[summonSpawnIndex];
    events.push({
      kind: "summon_request",
      summonerEnemyId: enemy.id,
      enemyDbId: runtime.enemyDbId,
      tileX: tile.tileX,
      tileY: tile.tileY,
      isSummoned: true,
      summonCastSeq,
      summonSpawnIndex,
    });
  }

  if (runtime.castEffectId) {
    const center = getEnemyCenter(enemy);
    events.push({
      kind: "effect_spawn",
      effectId: runtime.castEffectId,
      worldX: center.x,
      worldY: center.y,
    });
  }
}

function updateBossEnemyAttack(enemy, player, dungeon, dt, events, options = {}) {
  const attack = enemy.attack;
  if (!attack || attack.enabled !== true || !attack.isBoss) {
    return;
  }

  attack.activePhase = resolveBossPhase(attack, enemy);
  attack.telegraphs = Array.isArray(attack.telegraphs) ? attack.telegraphs : [];

  for (const actionKey of Object.keys(attack.actionCooldowns ?? {})) {
    attack.actionCooldowns[actionKey] = Math.max(0, toFiniteNumber(attack.actionCooldowns[actionKey], 0) - dt);
  }

  if (!player || (Number.isFinite(player.hp) && player.hp <= 0)) {
    attack.telegraphAlpha = 0;
    attack.telegraphs = [];
    clearEnemyLockedTargetPosition(attack);
    setBossActiveWeaponVisibility(attack, attack.activeActionWeaponId, false);
    updateEnemyWeaponVisuals(enemy, player, dt);
    return;
  }

  if (attack.actionState === BOSS_ACTION_STATE.IDLE) {
    const resolvedAction = resolveBossAction(enemy, player, dungeon, options.allEnemies);
    attack.activeActionKey = resolvedAction;

    if (resolvedAction !== "chase") {
      enterBossActionWindup(enemy, player, dungeon, options.allEnemies);
    } else {
      attack.phase = ENEMY_ATTACK_PHASE.COOLDOWN;
      attack.telegraphAlpha = 0;
      attack.telegraphs = [];
      clearEnemyLockedTargetPosition(attack);
      setBossActiveWeaponVisibility(attack, null, false);
    }
  }

  if (attack.actionState === BOSS_ACTION_STATE.WINDUP) {
    const windupSec = Math.max(0.0001, toFiniteNumber(attack.actionTimerSec, 0.0001));
    const normalized = clamp((Math.sin(performance.now() / 1000 * Math.PI * ENEMY_ATTACK_TELEGRAPH_BLINK_HZ) + 1) * 0.5, 0, 1);
    attack.telegraphAlpha = clamp(0.2 + normalized * 0.8, 0, 1);
    for (const telegraph of attack.telegraphs) {
      telegraph.alpha = attack.telegraphAlpha;
    }
    attack.actionTimerSec = Math.max(0, attack.actionTimerSec - dt);
    if (attack.actionTimerSec <= 0 || windupSec <= 0) {
      beginBossActionExecute(enemy);
    }
  }

  if (attack.actionState === BOSS_ACTION_STATE.EXECUTE) {
    const actionKey = attack.activeActionKey;
    let shouldRecover = false;
    let wallHit = false;

    if (actionKey === "charge") {
      const result = stepBossCharge(enemy, player, dungeon, dt, events, options);
      shouldRecover = result.finished;
      wallHit = result.wallHit;
    } else if (actionKey === "press") {
      stepBossPress(enemy, player, events, { ...options, dt });
      shouldRecover = attack.pressRuntime?.remainingHits <= 0;
    } else if (actionKey === "summon") {
      stepBossSummon(enemy, events);
      shouldRecover = true;
    }

    attack.actionTimerSec = Math.max(0, attack.actionTimerSec - dt);
    if (shouldRecover || attack.actionTimerSec <= 0) {
      transitionBossToRecover(enemy, wallHit);
    }
  }

  if (attack.actionState === BOSS_ACTION_STATE.RECOVER) {
    attack.actionTimerSec = Math.max(0, attack.actionTimerSec - dt);
    if (attack.actionTimerSec <= 0) {
      completeBossAction(enemy);
    }
  }

  updateEnemyWeaponVisuals(enemy, player, dt);
}

function updateEnemyAttack(enemy, player, dungeon, dt, events, options = {}) {
  const attack = enemy.attack;
  if (!attack || attack.enabled !== true) {
    return;
  }

  if (attack.isBoss === true) {
    updateBossEnemyAttack(enemy, player, dungeon, dt, events, options);
    return;
  }

  if (!player || (Number.isFinite(player.hp) && player.hp <= 0)) {
    attack.telegraphAlpha = 0;
    attack.telegraphs = [];
    clearEnemyLockedTargetPosition(attack);
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
      lockEnemyTargetPosition(attack, player);
      setEnemyAttackPhase(enemy, ENEMY_ATTACK_PHASE.WINDUP, attack.windupSec);
    }
  }

  updateEnemyWeaponVisuals(enemy, player, dt);
  updateEnemyAttackTelegraph(enemy);
  attack.telegraphs = [];

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
      updateEnemyWeaponVisuals(enemy, player, 0);
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

    updateEnemyAttack(enemy, player, dungeon, dt, events, {
      ...options,
      allEnemies: enemies,
    });
  }

  return events;
}

function resolveEnemyAnimation(enemy) {
  if (enemy?.isDead === true) {
    return {
      animation: "death",
      oneShot: true,
      animTime: Math.max(0, toFiniteNumber(enemy.deathAnimTime, 0)),
    };
  }

  if (enemy?.attackAnimActive === true) {
    let attackAnimKey = "attack";
    if (enemy?.attack?.isBoss === true) {
      const actionKey = enemy.attack.activeActionKey;
      if (typeof actionKey === "string" && actionKey.length > 0 && actionKey !== "chase") {
        attackAnimKey = `attack_${actionKey}`;
      }
    }
    return {
      animation: attackAnimKey,
      oneShot: true,
      animTime: Math.max(0, toFiniteNumber(enemy.attackAnimTime, 0)),
    };
  }

  return {
    animation: enemy?.isMoving === true ? "walk" : "idle",
    oneShot: false,
    animTime: Math.max(0, toFiniteNumber(enemy?.animTime, 0)),
  };
}

export function getEnemyFrame(enemy, enemyAsset = null) {
  if (!enemy) {
    return {
      row: 0,
      col: 0,
      animation: "idle",
      flipX: false,
    };
  }

  const resolved = resolveEnemyAnimation(enemy);
  const defaultAnimation = resolved.animation;
  const fps = resolveAnimationFps(enemy, enemyAsset);
  let animation = defaultAnimation;
  let oneShot = resolved.oneShot;
  let animTime = resolved.animTime;

  const isAttackAnim = defaultAnimation === "attack" || defaultAnimation.startsWith("attack_");
  if (isAttackAnim) {
    let effectiveAttackAnim = null;
    if (defaultAnimation !== "attack" && Number.isFinite(enemyAsset?.[defaultAnimation]?.frameCount)) {
      effectiveAttackAnim = defaultAnimation;
    } else if (Number.isFinite(enemyAsset?.attack?.frameCount)) {
      effectiveAttackAnim = "attack";
    }

    const hasAttackSheet = effectiveAttackAnim !== null;
    const attackFrameCount = hasAttackSheet
      ? resolveAnimationFrameCount(enemyAsset, effectiveAttackAnim)
      : resolveAnimationFrameCount(enemyAsset, "idle");
    const elapsedAttackFrames = Math.floor(animTime * fps);

    if (elapsedAttackFrames >= attackFrameCount) {
      animation = enemy?.isMoving === true ? "walk" : "idle";
      oneShot = false;
      animTime = Math.max(0, toFiniteNumber(enemy?.animTime, 0));
    } else if (!hasAttackSheet) {
      animation = "idle";
    } else {
      animation = effectiveAttackAnim;
    }
  }

  const frameCount = resolveAnimationFrameCount(enemyAsset, animation);
  const usesAssetFrameCount = Number.isFinite(enemyAsset?.[animation]?.frameCount);

  let col = 0;
  if (oneShot) {
    col = getOneShotFrameIndex(animTime, fps, frameCount);
  } else if (usesAssetFrameCount) {
    col = getLoopFrameIndex(animTime, fps, frameCount);
  } else {
    const sequenceIndex = Math.floor(animTime * fps) % ENEMY_ANIM_SEQUENCE.length;
    col = ENEMY_ANIM_SEQUENCE[sequenceIndex];
  }

  const defaultFacing = normalizeSpriteFacing(
    enemyAsset?.defaultFacing,
    normalizeSpriteFacing(enemy.defaultSpriteFacing, DEFAULT_SPRITE_FACING)
  );
  const spriteFacing = normalizeSpriteFacing(enemy.spriteFacing, defaultFacing);

  return {
    row: 0,
    col,
    animation,
    flipX: spriteFacing !== defaultFacing,
  };
}

export function isEnemyDeathAnimationFinished(enemy, enemyAsset = null) {
  if (!enemy || enemy.isDead !== true) {
    return false;
  }

  const fps = resolveAnimationFps(enemy, enemyAsset);
  const frameCount = resolveAnimationFrameCount(enemyAsset, "death");
  const elapsedFrames = Math.max(0, toFiniteNumber(enemy.deathAnimTime, 0)) * fps;
  return elapsedFrames >= frameCount;
}

export function getEnemyCombatHitbox(enemy) {
  if (!enemy) {
    return null;
  }

  return getScaledBodyHitboxAt(enemy.x, enemy.y, enemy.width, enemy.height, enemy.imageMagnification);
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

export function getEnemyTelegraphPrimitives(enemy) {
  if (!enemy?.attack || !Array.isArray(enemy.attack.telegraphs)) {
    return [];
  }

  return enemy.attack.telegraphs
    .filter((telegraph) => telegraph && typeof telegraph.kind === "string")
    .map((telegraph) => ({ ...telegraph }));
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
