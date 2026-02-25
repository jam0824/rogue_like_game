import { PLAYER_SPEED_PX_PER_SEC, TILE_SIZE } from "../config/constants.js";

const MAX_SUBSTEP_PIXELS = 4;
const MOVE_EPSILON = 0.001;
const PLAYER_MAX_HP_DEFAULT = 100;
const PLAYER_HIT_FLASH_DURATION_SEC = 0.12;
const PLAYER_HIT_FLASH_COLOR_DEFAULT = "#ffffff";
const PLAYER_DEFAULT_WIDTH = 24;
const PLAYER_DEFAULT_HEIGHT = 24;
const PLAYER_DEFAULT_ANIM_FPS = 10;
const PLAYER_DEFAULT_SPRITE_FACING = "left";
const PLAYER_SPRITE_SWITCH_MARGIN_DEFAULT = 6;
const PLAYER_DEATH_STOP_FRAME_INDEX = 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function toPositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Number(value) : fallback;
}

function normalizeSpriteFacing(value, fallback = PLAYER_DEFAULT_SPRITE_FACING) {
  if (typeof value !== "string" || value.trim().length <= 0) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.includes("right")) {
    return "right";
  }
  if (normalized.includes("left")) {
    return "left";
  }

  return fallback;
}

function resolvePlayerDefaults(playerDefinition) {
  const width = toPositiveNumber(playerDefinition?.width, PLAYER_DEFAULT_WIDTH);
  const height = toPositiveNumber(playerDefinition?.height, PLAYER_DEFAULT_HEIGHT);
  const animFps = toPositiveNumber(playerDefinition?.fps, PLAYER_DEFAULT_ANIM_FPS);
  const defaultSpriteFacing = normalizeSpriteFacing(
    playerDefinition?.playerPngFacingDirection,
    PLAYER_DEFAULT_SPRITE_FACING
  );

  return {
    width,
    height,
    footHitboxHeight: height,
    animFps,
    defaultSpriteFacing,
  };
}

function getPlayerDimensions(player) {
  const width = toPositiveNumber(player?.width, PLAYER_DEFAULT_WIDTH);
  const height = toPositiveNumber(player?.height, PLAYER_DEFAULT_HEIGHT);
  const requestedFootHitboxHeight = toPositiveNumber(player?.footHitboxHeight, height);
  const footHitboxHeight = clamp(requestedFootHitboxHeight, 1, height);

  return {
    width,
    height,
    footHitboxHeight,
  };
}

function getWalkableGrid(dungeon) {
  return dungeon.walkableGrid ?? dungeon.floorGrid;
}

function hasStepMovement(fromX, fromY, toX, toY) {
  return Math.hypot(toX - fromX, toY - fromY) > MOVE_EPSILON;
}

function getPlayerBoundsPx(dungeon, dimensions) {
  const widthPx = dungeon.gridWidth * TILE_SIZE;
  const heightPx = dungeon.gridHeight * TILE_SIZE;

  return {
    minX: 0,
    maxX: widthPx - dimensions.width,
    minY: -dimensions.footHitboxHeight,
    maxY: heightPx - dimensions.height,
    maxTargetX: Math.max(0, widthPx - 1),
    maxTargetY: Math.max(0, heightPx - 1),
  };
}

function getFeetRect(x, y, dimensions) {
  return {
    x,
    y: y + dimensions.height - dimensions.footHitboxHeight,
    width: dimensions.width,
    height: dimensions.footHitboxHeight,
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
  const dimensions = getPlayerDimensions(player);
  return {
    x: player.x + dimensions.width / 2,
    y: player.y + dimensions.height - dimensions.footHitboxHeight / 2,
  };
}

function updateFacing(player, dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    player.facing = dx >= 0 ? "right" : "left";
    return;
  }

  player.facing = dy >= 0 ? "down" : "up";
}

function updateSpriteFacing(player, horizontalIntentPx) {
  const margin = toPositiveNumber(player?.spriteFacingSwitchMarginPx, PLAYER_SPRITE_SWITCH_MARGIN_DEFAULT);
  if (Math.abs(horizontalIntentPx) <= margin) {
    return;
  }

  player.spriteFacing = horizontalIntentPx >= 0 ? "right" : "left";
}

function clampPlayerToBounds(x, y, dungeon, dimensions) {
  const bounds = getPlayerBoundsPx(dungeon, dimensions);

  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    y: clamp(y, bounds.minY, bounds.maxY),
  };
}

function clampTarget(target, dungeon, dimensions) {
  const bounds = getPlayerBoundsPx(dungeon, dimensions);

  return {
    x: clamp(target.x, 0, bounds.maxTargetX),
    y: clamp(target.y, 0, bounds.maxTargetY),
  };
}

function findStartRoom(dungeon) {
  return dungeon.rooms.find((room) => room.id === dungeon.startRoomId) ?? null;
}

function isWalkableStep(fromX, fromY, toX, toY, walkableGrid, dimensions) {
  if (!hasStepMovement(fromX, fromY, toX, toY)) {
    return false;
  }

  const feetRect = getFeetRect(toX, toY, dimensions);
  return isFeetRectWalkable(walkableGrid, feetRect);
}

function resolveMoveStep(player, dungeon, walkableGrid, desiredDx, desiredDy) {
  const dimensions = getPlayerDimensions(player);
  const fromX = player.x;
  const fromY = player.y;

  const combined = clampPlayerToBounds(fromX + desiredDx, fromY + desiredDy, dungeon, dimensions);
  if (isWalkableStep(fromX, fromY, combined.x, combined.y, walkableGrid, dimensions)) {
    return combined;
  }

  const xOnly = clampPlayerToBounds(fromX + desiredDx, fromY, dungeon, dimensions);
  const yOnly = clampPlayerToBounds(fromX, fromY + desiredDy, dungeon, dimensions);
  const canMoveX = isWalkableStep(fromX, fromY, xOnly.x, xOnly.y, walkableGrid, dimensions);
  const canMoveY = isWalkableStep(fromX, fromY, yOnly.x, yOnly.y, walkableGrid, dimensions);

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

function findFallbackSpawnFeetCenter(dungeon, startRoom, preferredFeetCenter, walkableGrid, dimensions) {
  let best = null;

  for (let tileY = startRoom.y; tileY < startRoom.y + startRoom.h; tileY += 1) {
    for (let tileX = startRoom.x; tileX < startRoom.x + startRoom.w; tileX += 1) {
      const feetCenterX = tileX * TILE_SIZE + TILE_SIZE / 2;
      const feetCenterY = tileY * TILE_SIZE + TILE_SIZE / 2;
      const rawX = feetCenterX - dimensions.width / 2;
      const rawY = feetCenterY - (dimensions.height - dimensions.footHitboxHeight / 2);
      const candidate = clampPlayerToBounds(rawX, rawY, dungeon, dimensions);
      const feetRect = getFeetRect(candidate.x, candidate.y, dimensions);

      if (!isFeetRectWalkable(walkableGrid, feetRect)) {
        continue;
      }

      const distance =
        Math.abs(feetCenterX - preferredFeetCenter.x) + Math.abs(feetCenterY - preferredFeetCenter.y);

      if (!best || distance < best.distance || (distance === best.distance && tileY > best.tileY)) {
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

function isPlayerDead(player) {
  return player?.isDead === true || (Number.isFinite(player?.hp) && player.hp <= 0);
}

function getAnimationFps(player, playerAssets) {
  return toPositiveNumber(playerAssets?.fps, toPositiveNumber(player?.animFps, PLAYER_DEFAULT_ANIM_FPS));
}

function getAnimationFrameCount(playerAssets, animation) {
  const frameCount = Number(playerAssets?.[animation]?.frameCount);
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

function getDeathStopFrameIndex(playerAssets) {
  const frameCount = getAnimationFrameCount(playerAssets, "death");
  return Math.min(frameCount - 1, PLAYER_DEATH_STOP_FRAME_INDEX);
}

function getDeathFrameIndex(player, playerAssets) {
  const fps = getAnimationFps(player, playerAssets);
  const deathStopFrameIndex = getDeathStopFrameIndex(playerAssets);
  return Math.min(deathStopFrameIndex, Math.floor(Math.max(0, Number(player?.deathAnimTime) || 0) * fps));
}

export function createPlayerState(dungeon, playerDefinition = null) {
  const startRoom = findStartRoom(dungeon);
  if (!startRoom) {
    throw new Error("Failed to spawn player: start room is missing.");
  }

  const defaults = resolvePlayerDefaults(playerDefinition);
  const walkableGrid = getWalkableGrid(dungeon);
  const preferredFeetCenter = {
    x: startRoom.centerX * TILE_SIZE + TILE_SIZE / 2,
    y: startRoom.centerY * TILE_SIZE + TILE_SIZE / 2,
  };

  const preferredPlayerPos = clampPlayerToBounds(
    preferredFeetCenter.x - defaults.width / 2,
    preferredFeetCenter.y - (defaults.height - defaults.footHitboxHeight / 2),
    dungeon,
    defaults
  );

  const preferredFeetRect = getFeetRect(preferredPlayerPos.x, preferredPlayerPos.y, defaults);
  const spawnFeetCenter = isFeetRectWalkable(walkableGrid, preferredFeetRect)
    ? preferredFeetCenter
    : findFallbackSpawnFeetCenter(dungeon, startRoom, preferredFeetCenter, walkableGrid, defaults);

  const spawnPlayerPos = clampPlayerToBounds(
    spawnFeetCenter.x - defaults.width / 2,
    spawnFeetCenter.y - (defaults.height - defaults.footHitboxHeight / 2),
    dungeon,
    defaults
  );

  return {
    x: spawnPlayerPos.x,
    y: spawnPlayerPos.y,
    width: defaults.width,
    height: defaults.height,
    footHitboxHeight: defaults.footHitboxHeight,
    facing: "down",
    spriteFacing: defaults.defaultSpriteFacing,
    defaultSpriteFacing: defaults.defaultSpriteFacing,
    spriteFacingSwitchMarginPx: PLAYER_SPRITE_SWITCH_MARGIN_DEFAULT,
    pointerActive: false,
    target: null,
    isMoving: false,
    isDead: false,
    animTime: 0,
    deathAnimTime: 0,
    animFps: defaults.animFps,
    hp: PLAYER_MAX_HP_DEFAULT,
    maxHp: PLAYER_MAX_HP_DEFAULT,
    moveSpeedPxPerSec: PLAYER_SPEED_PX_PER_SEC,
    statTotals: {
      vit: 0,
      for: 0,
      agi: 0,
      pow: 0,
      tec: 0,
      arc: 0,
    },
    damageMult: 1,
    critChance: 0.05,
    critMult: 1.5,
    damageSeed: "player-damage-default",
    hitFlashTimerSec: 0,
    hitFlashDurationSec: PLAYER_HIT_FLASH_DURATION_SEC,
    hitFlashColor: PLAYER_HIT_FLASH_COLOR_DEFAULT,
  };
}

export function tryRestorePlayerPosition(player, dungeon, savedPos) {
  if (!player || !dungeon || !savedPos) {
    return false;
  }

  if (!Number.isFinite(savedPos.x) || !Number.isFinite(savedPos.y)) {
    return false;
  }

  const dimensions = getPlayerDimensions(player);
  const walkableGrid = getWalkableGrid(dungeon);
  const clamped = clampPlayerToBounds(savedPos.x, savedPos.y, dungeon, dimensions);
  const feetRect = getFeetRect(clamped.x, clamped.y, dimensions);
  if (!isFeetRectWalkable(walkableGrid, feetRect)) {
    return false;
  }

  player.x = clamped.x;
  player.y = clamped.y;
  return true;
}

export function setPointerTarget(player, active, worldX, worldY) {
  if (!player) {
    return;
  }

  if (!active || isPlayerDead(player)) {
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

  player.hitFlashTimerSec = Math.max(0, (Number(player.hitFlashTimerSec) || 0) - dt);

  if (Number.isFinite(player.hp) && player.hp <= 0) {
    player.hp = 0;
    player.isDead = true;
    player.pointerActive = false;
    player.target = null;
    player.isMoving = false;
    player.deathAnimTime = Math.max(0, Number(player.deathAnimTime) || 0) + dt;
    return;
  }

  if (player.isDead === true) {
    player.isDead = false;
    player.deathAnimTime = 0;
  }

  if (!player.pointerActive || !player.target) {
    player.isMoving = false;
    player.animTime = Math.max(0, Number(player.animTime) || 0) + dt;
    return;
  }

  const dimensions = getPlayerDimensions(player);
  player.target = clampTarget(player.target, dungeon, dimensions);

  const feetCenter = getFeetCenter(player);
  const toTargetX = player.target.x - feetCenter.x;
  const toTargetY = player.target.y - feetCenter.y;
  const distance = Math.hypot(toTargetX, toTargetY);

  if (distance <= MOVE_EPSILON) {
    player.isMoving = false;
    player.animTime = Math.max(0, Number(player.animTime) || 0) + dt;
    return;
  }

  const speedPxPerSec = Number.isFinite(player.moveSpeedPxPerSec)
    ? Math.max(0, player.moveSpeedPxPerSec)
    : PLAYER_SPEED_PX_PER_SEC;
  const travelDistance = Math.min(distance, speedPxPerSec * dt);
  const moveX = (toTargetX / distance) * travelDistance;
  const moveY = (toTargetY / distance) * travelDistance;
  const substeps = Math.max(1, Math.ceil(Math.hypot(moveX, moveY) / MAX_SUBSTEP_PIXELS));
  const stepX = moveX / substeps;
  const stepY = moveY / substeps;
  const walkableGrid = getWalkableGrid(dungeon);

  let movedX = 0;
  let movedY = 0;

  for (let index = 0; index < substeps; index += 1) {
    const prevX = player.x;
    const prevY = player.y;
    const candidate = resolveMoveStep(player, dungeon, walkableGrid, stepX, stepY);
    if (!candidate) {
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
    player.animTime = Math.max(0, Number(player.animTime) || 0) + dt;
    return;
  }

  player.isMoving = true;
  updateFacing(player, movedX, movedY);
  updateSpriteFacing(player, toTargetX);
  player.animTime = Math.max(0, Number(player.animTime) || 0) + dt;
}

export function getPlayerFrame(player, playerAssets) {
  if (!player) {
    return {
      row: 0,
      col: 0,
      animation: "idle",
      flipX: false,
    };
  }

  const dead = isPlayerDead(player);
  const animation = dead ? "death" : player.isMoving ? "walk" : "idle";
  const frameCount = getAnimationFrameCount(playerAssets, animation);
  const fps = getAnimationFps(player, playerAssets);
  const col = dead
    ? getDeathFrameIndex(player, playerAssets)
    : getLoopFrameIndex(player.animTime, fps, frameCount);

  const defaultFacing = normalizeSpriteFacing(
    playerAssets?.defaultFacing,
    normalizeSpriteFacing(player.defaultSpriteFacing, PLAYER_DEFAULT_SPRITE_FACING)
  );
  const spriteFacing = normalizeSpriteFacing(player.spriteFacing, defaultFacing);

  return {
    row: 0,
    col,
    animation,
    flipX: spriteFacing !== defaultFacing,
  };
}

export function isPlayerDeathAnimationFinished(player, playerAssets) {
  if (!isPlayerDead(player)) {
    return false;
  }

  return getDeathFrameIndex(player, playerAssets) >= getDeathStopFrameIndex(playerAssets);
}

export function getPlayerFeetHitbox(player) {
  const dimensions = getPlayerDimensions(player);
  const rect = getFeetRect(player.x, player.y, dimensions);

  return {
    x: round2(rect.x),
    y: round2(rect.y),
    width: rect.width,
    height: rect.height,
  };
}

export function getPlayerCombatHitbox(player) {
  if (!player) {
    return null;
  }

  const dimensions = getPlayerDimensions(player);
  return {
    x: player.x,
    y: player.y,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function getPlayerHitFlashAlpha(player) {
  if (!player) {
    return 0;
  }

  const timer = Math.max(0, Number(player.hitFlashTimerSec) || 0);
  const duration = Math.max(0.0001, Number(player.hitFlashDurationSec) || PLAYER_HIT_FLASH_DURATION_SEC);
  return clamp(timer / duration, 0, 1);
}
