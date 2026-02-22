import { TILE_SIZE } from "../config/constants.js";
import { rollHitDamage } from "../combat/damageRoll.js";
import { getEnemyCombatHitbox } from "../enemy/enemySystem.js";

const MIN_ATTACK_COOLDOWN_SEC = 0.05;
const BIAS_LERP_BASE = 6;
const VECTOR_EPSILON = 0.0001;

const ATTACK_MOTION_PHASE = Object.freeze({
  APPROACH: "approach",
  BURST: "burst",
  RETURN: "return",
  IDLE: "idle",
});

const ATTACK_APPROACH_DURATION_MUL = 0.12;
const ATTACK_APPROACH_DURATION_MIN_SEC = 0.06;
const ATTACK_APPROACH_DURATION_MAX_SEC = 0.18;
const ATTACK_BURST_DURATION_MUL = 0.22;
const ATTACK_BURST_DURATION_MIN_SEC = 0.1;
const ATTACK_BURST_DURATION_MAX_SEC = 0.22;
const ATTACK_RETURN_DURATION_MUL = 0.18;
const ATTACK_RETURN_DURATION_MIN_SEC = 0.08;
const ATTACK_RETURN_DURATION_MAX_SEC = 0.16;
const ATTACK_IDLE_MIN_SEC = 0.08;
const ATTACK_IDLE_FRONT_DISTANCE_MUL = 0.9;
const ATTACK_IDLE_FRONT_DISTANCE_MIN_PX = 18;
const ATTACK_IDLE_FRONT_DISTANCE_MAX_PX = 44;
const ATTACK_IDLE_FAN_SPACING_PX = 14;
const ATTACK_IDLE_BOB_SPEED_RAD = 5.2;
const ATTACK_IDLE_BOB_AMPLITUDE_PX = 4;
const ATTACK_IDLE_REAR_GAP_PX = 4;
const ATTACK_IDLE_AIM_BLEND = 0.25;
const BIAS_PER_TEC = 0.01;
const RESPONSE_PER_TEC = 0.01;
const BIAS_STRENGTH_SCALE_CAP = 3.0;
const BIAS_RESPONSE_SCALE_CAP = 3.0;
const BURST_DURATION_SLOW_MUL_BY_TYPE = Object.freeze({
  circle: 1.45,
  figure8: 2.2,
  spiral: 1.55,
});
const CIRCLE_BURST_SWEEP_RAD = 80 * Math.PI / 180;
const CIRCLE_BURST_TURN_START_RAD = -Math.PI;
const CIRCLE_BURST_TURN_END_RAD = Math.PI;
const SPIRAL_BURST_TURN_COUNT = 1.25;
const IDLE_VERTICAL_UP_DIR = Object.freeze({ x: 0, y: -1 });

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function lerpAngleRad(startRad, endRad, t) {
  const ratio = clamp(t, 0, 1);
  const fullTurn = Math.PI * 2;
  let delta = (endRad - startRad + Math.PI) % fullTurn;
  if (delta < 0) {
    delta += fullTurn;
  }
  delta -= Math.PI;
  return startRad + delta * ratio;
}

function easeOutCubic(value) {
  const x = clamp(value, 0, 1);
  return 1 - (1 - x) ** 3;
}

function easeInOutQuad(value) {
  const x = clamp(value, 0, 1);
  if (x < 0.5) {
    return 2 * x * x;
  }
  return 1 - ((-2 * x + 2) ** 2) / 2;
}

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
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

function rotateVector(vector, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function getPerpendicular(vector) {
  return {
    x: -vector.y,
    y: vector.x,
  };
}

function resolveFormationParamNumber(formation, camelKey, snakeKey, fallback) {
  const params = formation?.params;
  const camel = params?.[camelKey];
  if (Number.isFinite(camel)) {
    return Number(camel);
  }
  const snake = params?.[snakeKey];
  if (Number.isFinite(snake)) {
    return Number(snake);
  }
  return fallback;
}

function resolveFormationParamString(formation, camelKey, snakeKey, fallback) {
  const params = formation?.params;
  const camel = params?.[camelKey];
  if (typeof camel === "string" && camel.trim().length > 0) {
    return camel.trim();
  }
  const snake = params?.[snakeKey];
  if (typeof snake === "string" && snake.trim().length > 0) {
    return snake.trim();
  }
  return fallback;
}

function resolveFormationParamBoolean(formation, camelKey, snakeKey, fallback = false) {
  const params = formation?.params;
  if (typeof params?.[camelKey] === "boolean") {
    return params[camelKey];
  }
  if (typeof params?.[snakeKey] === "boolean") {
    return params[snakeKey];
  }
  return fallback;
}

function resolveOrbitCenter(playerCenter, centerMode, biasDir, biasOffsetPx, forceCenterOffset = false) {
  const useBiasCenter = centerMode === "biased_center" || forceCenterOffset;
  if (!useBiasCenter) {
    return {
      x: playerCenter.x,
      y: playerCenter.y,
    };
  }

  return {
    x: playerCenter.x + biasDir.x * biasOffsetPx,
    y: playerCenter.y + biasDir.y * biasOffsetPx,
  };
}

function applyWeaponPose(
  weapon,
  weaponCenterX,
  weaponCenterY,
  orbitCenterX,
  orbitCenterY,
  weaponDefinition,
  formationDefinition,
  rotationOverrideDir = null
) {
  const fromOrbitDx = weaponCenterX - orbitCenterX;
  const fromOrbitDy = weaponCenterY - orbitCenterY;
  const hasRotationVector = Math.hypot(fromOrbitDx, fromOrbitDy) > VECTOR_EPSILON;
  const overrideDx = toFiniteNumber(rotationOverrideDir?.x, 0);
  const overrideDy = toFiniteNumber(rotationOverrideDir?.y, 0);
  const hasOverrideVector = Math.hypot(overrideDx, overrideDy) > VECTOR_EPSILON;
  const rotationDeg = hasOverrideVector
    ? toRotationDegrees(overrideDx, overrideDy)
    : hasRotationVector
      ? toRotationDegrees(fromOrbitDx, fromOrbitDy)
      : toFiniteNumber(weapon.rotationDeg, 0);

  weapon.x = weaponCenterX - weapon.width / 2;
  weapon.y = weaponCenterY - weapon.height / 2;
  weapon.rotationDeg = rotationDeg;
  weapon.rotationRad = rotationDeg * Math.PI / 180;
  weapon.weaponDefId = weaponDefinition.id;
  weapon.formationId = formationDefinition.id;
}

function resolveRuntimeSlotIndex(runtimeId) {
  if (typeof runtimeId !== "string") {
    return null;
  }
  const match = runtimeId.match(/(\d+)$/);
  if (!match) {
    return null;
  }
  const slotIndex = Number(match[1]);
  if (!Number.isFinite(slotIndex)) {
    return null;
  }
  return Math.max(0, Math.floor(slotIndex));
}

function resolveRuntimeLaneSign(runtimeId) {
  const slotIndex = resolveRuntimeSlotIndex(runtimeId);
  if (!Number.isFinite(slotIndex)) {
    return 0;
  }
  const lane = slotIndex % 3;
  if (lane === 1) {
    return 1;
  }
  if (lane === 2) {
    return -1;
  }
  return 0;
}

function resolveIdleLaneIndex(runtimeId) {
  const slotIndex = resolveRuntimeSlotIndex(runtimeId);
  if (!Number.isFinite(slotIndex) || slotIndex <= 0) {
    return 0;
  }

  const fanStep = Math.ceil(slotIndex / 2);
  return slotIndex % 2 === 1 ? -fanStep : fanStep;
}

function hashStringToUint32(value) {
  const source = typeof value === "string" ? value : "weapon";
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveIdleBobPhaseRad(runtimeId) {
  const hash = hashStringToUint32(runtimeId);
  const normalized = hash / 0x100000000;
  return normalized * Math.PI * 2;
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

function getPlayerSize(player) {
  const width = toFiniteNumber(player?.width, 32);
  const height = toFiniteNumber(player?.height, 64);
  return { width, height };
}

function getPlayerCenter(player) {
  const { width, height } = getPlayerSize(player);

  return {
    x: toFiniteNumber(player?.x, 0) + width / 2,
    y: toFiniteNumber(player?.y, 0) + height / 2,
  };
}

function resolveHalfExtentAlongDirPx(width, height, dir) {
  const halfWidth = Math.max(0, toFiniteNumber(width, 0)) / 2;
  const halfHeight = Math.max(0, toFiniteNumber(height, 0)) / 2;
  const dirX = Math.abs(toFiniteNumber(dir?.x, 0));
  const dirY = Math.abs(toFiniteNumber(dir?.y, 0));
  return dirX * halfWidth + dirY * halfHeight;
}

function resolveIdleRearMinDistancePx(playerSize, weapon, biasDir) {
  const safeBiasDir = normalizeVector(
    toFiniteNumber(biasDir?.x, 1),
    toFiniteNumber(biasDir?.y, 0),
    1,
    0
  );
  const playerHalfExtent = resolveHalfExtentAlongDirPx(playerSize?.width, playerSize?.height, safeBiasDir);
  const weaponHalfExtent = resolveHalfExtentAlongDirPx(weapon?.width, weapon?.height, safeBiasDir);
  return Math.max(0, playerHalfExtent + weaponHalfExtent + ATTACK_IDLE_REAR_GAP_PX);
}

function getAimDirection(player) {
  const playerCenter = getPlayerCenter(player);
  const facingDir = getFacingVector(player?.facing);

  if (
    player?.pointerActive === true &&
    player.target &&
    Number.isFinite(player.target.x) &&
    Number.isFinite(player.target.y)
  ) {
    return normalizeVector(
      player.target.x - playerCenter.x,
      player.target.y - playerCenter.y,
      facingDir.x,
      facingDir.y
    );
  }

  return facingDir;
}

function getFormationCenterMode(formation) {
  const mode = formation?.params?.centerMode ?? formation?.params?.center_mode;
  return typeof mode === "string" ? mode : "player";
}

function resolveFormationRadiusPx(formation) {
  const radiusBase = toFiniteNumber(formation?.radiusBase, toFiniteNumber(formation?.radius_base, 1));
  const clampConfig = formation?.clamp ?? {};
  const minTiles = toFiniteNumber(clampConfig.radiusMin, toFiniteNumber(clampConfig.radius_min, 0));
  const maxTiles = toFiniteNumber(
    clampConfig.radiusMax,
    toFiniteNumber(clampConfig.radius_max, Number.POSITIVE_INFINITY)
  );
  const clampedTiles = clamp(radiusBase, minTiles, maxTiles);
  return clampedTiles * TILE_SIZE;
}

function resolveBiasOffsetPx(radiusPx, formation, strengthScale = 1) {
  const biasStrengthBase = toFiniteNumber(
    formation?.biasStrengthMul,
    toFiniteNumber(formation?.bias_strength_mul, 0)
  );
  const safeStrengthScale = Math.max(0, toFiniteNumber(strengthScale, 1));
  const biasStrength = biasStrengthBase * safeStrengthScale;
  const clampConfig = formation?.clamp ?? {};
  const maxRatio = toFiniteNumber(
    clampConfig.biasOffsetRatioMax,
    toFiniteNumber(clampConfig.bias_offset_ratio_max, Number.POSITIVE_INFINITY)
  );
  const rawOffset = Math.max(0, radiusPx * biasStrength);
  const maxOffset = Math.max(0, radiusPx * maxRatio);
  return Math.min(rawOffset, maxOffset);
}

function resolveBiasResponse(formation, responseScale = 1) {
  const responseBase = toFiniteNumber(formation?.biasResponseMul, toFiniteNumber(formation?.bias_response_mul, 0));
  const safeResponseScale = Math.max(0, toFiniteNumber(responseScale, 1));
  return Math.max(0, responseBase * safeResponseScale);
}

function resolveWeaponCooldownSec(weaponDefinition) {
  return Math.max(
    MIN_ATTACK_COOLDOWN_SEC,
    toFiniteNumber(weaponDefinition?.attackCooldownSec, toFiniteNumber(weaponDefinition?.attack_cooldown_sec, 0))
  );
}

function resolveBurstDurationTypeMultiplier(formationType) {
  if (typeof formationType !== "string" || formationType.length <= 0) {
    return 1;
  }
  return toFiniteNumber(BURST_DURATION_SLOW_MUL_BY_TYPE[formationType], 1);
}

function resolveAttackMotionDurations(cooldownSec, formationType) {
  let approachDurationSec = clamp(
    cooldownSec * ATTACK_APPROACH_DURATION_MUL,
    ATTACK_APPROACH_DURATION_MIN_SEC,
    ATTACK_APPROACH_DURATION_MAX_SEC
  );
  const burstTypeMul = resolveBurstDurationTypeMultiplier(formationType);
  const baseBurstDurationSec = clamp(
    cooldownSec * ATTACK_BURST_DURATION_MUL,
    ATTACK_BURST_DURATION_MIN_SEC,
    ATTACK_BURST_DURATION_MAX_SEC
  );
  let burstDurationSec = baseBurstDurationSec * burstTypeMul;
  let returnDurationSec = clamp(
    cooldownSec * ATTACK_RETURN_DURATION_MUL,
    ATTACK_RETURN_DURATION_MIN_SEC,
    ATTACK_RETURN_DURATION_MAX_SEC
  );

  const attackWindowLimitSec = Math.max(0.02, cooldownSec - ATTACK_IDLE_MIN_SEC);
  const totalAttackWindowSec = approachDurationSec + burstDurationSec + returnDurationSec;
  if (totalAttackWindowSec > attackWindowLimitSec && totalAttackWindowSec > VECTOR_EPSILON) {
    const scale = attackWindowLimitSec / totalAttackWindowSec;
    approachDurationSec *= scale;
    burstDurationSec *= scale;
    returnDurationSec *= scale;
  }

  return {
    approachDurationSec: Math.max(0, approachDurationSec),
    burstDurationSec: Math.max(0, burstDurationSec),
    returnDurationSec: Math.max(0, returnDurationSec),
  };
}

function toRotationDegrees(dx, dy) {
  return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
}

function intersectsAabb(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function sanitizeHitSet(weapon) {
  if (weapon.hitSet instanceof Set) {
    return weapon.hitSet;
  }

  if (Array.isArray(weapon.hitSet)) {
    weapon.hitSet = new Set(weapon.hitSet);
    return weapon.hitSet;
  }

  weapon.hitSet = new Set();
  return weapon.hitSet;
}

function ensureAttackMotionState(weapon, fallbackAimDir, playerCenter) {
  const safeFallback = normalizeVector(
    fallbackAimDir.x,
    fallbackAimDir.y,
    1,
    0
  );

  if (
    weapon.attackMotionPhase !== ATTACK_MOTION_PHASE.APPROACH &&
    weapon.attackMotionPhase !== ATTACK_MOTION_PHASE.BURST &&
    weapon.attackMotionPhase !== ATTACK_MOTION_PHASE.RETURN &&
    weapon.attackMotionPhase !== ATTACK_MOTION_PHASE.IDLE
  ) {
    weapon.attackMotionPhase = ATTACK_MOTION_PHASE.IDLE;
  }

  weapon.attackMotionTimerSec = Math.max(0, toFiniteNumber(weapon.attackMotionTimerSec, 0));
  weapon.attackMotionDurationSec = Math.max(0, toFiniteNumber(weapon.attackMotionDurationSec, 0));

  weapon.lockedAimDirX = toFiniteNumber(weapon.lockedAimDirX, safeFallback.x);
  weapon.lockedAimDirY = toFiniteNumber(weapon.lockedAimDirY, safeFallback.y);
  const normalizedLocked = normalizeVector(
    weapon.lockedAimDirX,
    weapon.lockedAimDirY,
    safeFallback.x,
    safeFallback.y
  );
  weapon.lockedAimDirX = normalizedLocked.x;
  weapon.lockedAimDirY = normalizedLocked.y;

  weapon.attackOriginX = toFiniteNumber(weapon.attackOriginX, playerCenter.x);
  weapon.attackOriginY = toFiniteNumber(weapon.attackOriginY, playerCenter.y);
  weapon.attackBurstEndX = toFiniteNumber(weapon.attackBurstEndX, playerCenter.x);
  weapon.attackBurstEndY = toFiniteNumber(weapon.attackBurstEndY, playerCenter.y);
  weapon.attackApproachStartX = toFiniteNumber(weapon.attackApproachStartX, playerCenter.x);
  weapon.attackApproachStartY = toFiniteNumber(weapon.attackApproachStartY, playerCenter.y);
  weapon.attackApproachEndX = toFiniteNumber(weapon.attackApproachEndX, playerCenter.x);
  weapon.attackApproachEndY = toFiniteNumber(weapon.attackApproachEndY, playerCenter.y);
  weapon.idleLaneIndex = Math.trunc(
    toFiniteNumber(weapon.idleLaneIndex, resolveIdleLaneIndex(weapon.id))
  );
  weapon.idleBobPhaseRad = toFiniteNumber(weapon.idleBobPhaseRad, resolveIdleBobPhaseRad(weapon.id));
}

function transitionAttackMotionPhase(weapon, motionDurations, nextPhase) {
  weapon.attackMotionPhase = nextPhase;
  weapon.attackMotionTimerSec = 0;

  if (nextPhase === ATTACK_MOTION_PHASE.APPROACH) {
    weapon.attackMotionDurationSec = Math.max(0, motionDurations.approachDurationSec);
    return;
  }

  if (nextPhase === ATTACK_MOTION_PHASE.BURST) {
    weapon.attackMotionDurationSec = Math.max(0, motionDurations.burstDurationSec);
    return;
  }

  if (nextPhase === ATTACK_MOTION_PHASE.RETURN) {
    weapon.attackMotionDurationSec = Math.max(0, motionDurations.returnDurationSec);
    return;
  }

  weapon.attackMotionDurationSec = 0;
}

function resolveMotionPhaseDurationSec(weapon, motionDurations, phase) {
  if (phase === ATTACK_MOTION_PHASE.APPROACH) {
    return Math.max(0, toFiniteNumber(weapon.attackMotionDurationSec, motionDurations.approachDurationSec));
  }

  if (phase === ATTACK_MOTION_PHASE.BURST) {
    return Math.max(0, toFiniteNumber(weapon.attackMotionDurationSec, motionDurations.burstDurationSec));
  }

  if (phase === ATTACK_MOTION_PHASE.RETURN) {
    return Math.max(0, toFiniteNumber(weapon.attackMotionDurationSec, motionDurations.returnDurationSec));
  }

  return 0;
}

function updateAttackMotionState({
  weapon,
  attackStarted,
  motionDurations,
  dt,
  liveAimDir,
  playerCenter,
}) {
  ensureAttackMotionState(weapon, liveAimDir, playerCenter);

  if (attackStarted) {
    const lockedAim = normalizeVector(liveAimDir.x, liveAimDir.y, 1, 0);
    weapon.lockedAimDirX = lockedAim.x;
    weapon.lockedAimDirY = lockedAim.y;
    weapon.attackOriginX = playerCenter.x;
    weapon.attackOriginY = playerCenter.y;
    weapon.attackBurstEndX = playerCenter.x;
    weapon.attackBurstEndY = playerCenter.y;
    transitionAttackMotionPhase(weapon, motionDurations, ATTACK_MOTION_PHASE.APPROACH);
  }

  const phaseForPose = weapon.attackMotionPhase;
  const durationForPose = resolveMotionPhaseDurationSec(weapon, motionDurations, phaseForPose);
  const progressForPose = durationForPose <= VECTOR_EPSILON
    ? 1
    : clamp(weapon.attackMotionTimerSec / durationForPose, 0, 1);

  const safeDt = Math.max(0, toFiniteNumber(dt, 0));
  let remaining = safeDt;
  let guard = 0;
  while (remaining > 0 && guard < 4) {
    guard += 1;
    const phase = weapon.attackMotionPhase;

    if (phase === ATTACK_MOTION_PHASE.IDLE) {
      weapon.attackMotionTimerSec += remaining;
      remaining = 0;
      break;
    }

    const phaseDuration = resolveMotionPhaseDurationSec(weapon, motionDurations, phase);
    if (phaseDuration <= VECTOR_EPSILON) {
      if (phase === ATTACK_MOTION_PHASE.APPROACH) {
        transitionAttackMotionPhase(weapon, motionDurations, ATTACK_MOTION_PHASE.BURST);
        continue;
      }
      if (phase === ATTACK_MOTION_PHASE.BURST) {
        transitionAttackMotionPhase(weapon, motionDurations, ATTACK_MOTION_PHASE.RETURN);
        continue;
      }
      transitionAttackMotionPhase(weapon, motionDurations, ATTACK_MOTION_PHASE.IDLE);
      continue;
    }

    const timeToBoundary = Math.max(0, phaseDuration - weapon.attackMotionTimerSec);
    if (remaining < timeToBoundary) {
      weapon.attackMotionTimerSec += remaining;
      remaining = 0;
      break;
    }

    weapon.attackMotionTimerSec += timeToBoundary;
    remaining -= timeToBoundary;

    if (phase === ATTACK_MOTION_PHASE.APPROACH) {
      transitionAttackMotionPhase(weapon, motionDurations, ATTACK_MOTION_PHASE.BURST);
      continue;
    }

    if (phase === ATTACK_MOTION_PHASE.BURST) {
      transitionAttackMotionPhase(weapon, motionDurations, ATTACK_MOTION_PHASE.RETURN);
      continue;
    }

    transitionAttackMotionPhase(weapon, motionDurations, ATTACK_MOTION_PHASE.IDLE);
  }

  const lockedAim = normalizeVector(
    toFiniteNumber(weapon.lockedAimDirX, liveAimDir.x),
    toFiniteNumber(weapon.lockedAimDirY, liveAimDir.y),
    liveAimDir.x,
    liveAimDir.y
  );
  weapon.lockedAimDirX = lockedAim.x;
  weapon.lockedAimDirY = lockedAim.y;

  return {
    phase: phaseForPose,
    progress: progressForPose,
    lockedAim,
  };
}

function resolveIdleHoverBaseAnchor(
  weapon,
  playerCenter,
  radiusPx,
  biasDir,
  biasOffsetPx = 0,
  idleRearMinDistancePx = 0
) {
  const idleFrontDistancePx = clamp(
    radiusPx * ATTACK_IDLE_FRONT_DISTANCE_MUL,
    ATTACK_IDLE_FRONT_DISTANCE_MIN_PX,
    ATTACK_IDLE_FRONT_DISTANCE_MAX_PX
  );
  const centerOffsetPx = Math.max(0, toFiniteNumber(biasOffsetPx, 0));
  const minRearDistancePx = Math.max(0, toFiniteNumber(idleRearMinDistancePx, 0));
  const baseRearDistancePx = idleFrontDistancePx - centerOffsetPx;
  const rearDistancePx = Math.max(minRearDistancePx, baseRearDistancePx);
  const backAnchor = {
    x: playerCenter.x - biasDir.x * rearDistancePx,
    y: playerCenter.y - biasDir.y * rearDistancePx,
  };
  const fanAxis = getPerpendicular(biasDir);
  const fanOffsetPx = toFiniteNumber(weapon.idleLaneIndex, 0) * ATTACK_IDLE_FAN_SPACING_PX;

  return {
    x: backAnchor.x + fanAxis.x * fanOffsetPx,
    y: backAnchor.y + fanAxis.y * fanOffsetPx,
  };
}

function resolveIdleHoverAnchor(
  weapon,
  playerCenter,
  radiusPx,
  biasDir,
  biasOffsetPx = 0,
  idleRearMinDistancePx = 0,
  idleTimerSec = weapon.attackMotionTimerSec
) {
  const baseIdle = resolveIdleHoverBaseAnchor(
    weapon,
    playerCenter,
    radiusPx,
    biasDir,
    biasOffsetPx,
    idleRearMinDistancePx
  );
  const bobPhase = toFiniteNumber(weapon.idleBobPhaseRad, 0);
  const bobY = Math.sin(idleTimerSec * ATTACK_IDLE_BOB_SPEED_RAD + bobPhase) * ATTACK_IDLE_BOB_AMPLITUDE_PX;

  return {
    x: baseIdle.x,
    y: baseIdle.y + bobY,
  };
}

function resolveIdleHoverPose(
  weapon,
  playerCenter,
  radiusPx,
  biasDir,
  biasOffsetPx = 0,
  idleRearMinDistancePx = 0
) {
  const anchor = resolveIdleHoverAnchor(
    weapon,
    playerCenter,
    radiusPx,
    biasDir,
    biasOffsetPx,
    idleRearMinDistancePx
  );

  return {
    weaponCenterX: anchor.x,
    weaponCenterY: anchor.y,
    orbitCenterX: playerCenter.x,
    orbitCenterY: playerCenter.y,
  };
}

function resolveApproachPose(weapon, playerCenter, progress) {
  const startX = toFiniteNumber(weapon.attackApproachStartX, playerCenter.x);
  const startY = toFiniteNumber(weapon.attackApproachStartY, playerCenter.y);
  const endX = toFiniteNumber(weapon.attackApproachEndX, playerCenter.x);
  const endY = toFiniteNumber(weapon.attackApproachEndY, playerCenter.y);
  const eased = easeInOutQuad(progress);

  return {
    weaponCenterX: lerp(startX, endX, eased),
    weaponCenterY: lerp(startY, endY, eased),
    orbitCenterX: startX,
    orbitCenterY: startY,
  };
}

function resolveReturnPose(weapon, playerCenter, idleAnchor, progress) {
  const startX = toFiniteNumber(weapon.attackBurstEndX, toFiniteNumber(weapon.attackOriginX, playerCenter.x));
  const startY = toFiniteNumber(weapon.attackBurstEndY, toFiniteNumber(weapon.attackOriginY, playerCenter.y));
  const eased = easeInOutQuad(progress);

  return {
    weaponCenterX: lerp(startX, idleAnchor.x, eased),
    weaponCenterY: lerp(startY, idleAnchor.y, eased),
    orbitCenterX: playerCenter.x,
    orbitCenterY: playerCenter.y,
  };
}

function resolveBurstPoseByFormation({
  weapon,
  formationDefinition,
  playerCenter,
  aimDir,
  radiusPx,
  centerMode,
  biasOffsetPx,
  progress,
}) {
  const type = resolveFormationParamString(formationDefinition, "type", "type", formationDefinition?.type ?? "circle");
  const eased = easeOutCubic(progress);
  const pathProgress = clamp(progress, 0, 1);
  const burstOriginX = toFiniteNumber(weapon.attackOriginX, playerCenter.x);
  const burstOriginY = toFiniteNumber(weapon.attackOriginY, playerCenter.y);
  const burstOrigin = { x: burstOriginX, y: burstOriginY };
  const safeBiasOffsetPx = Math.max(0, toFiniteNumber(biasOffsetPx, 0));
  const biasedBurstOrigin = {
    x: burstOrigin.x + aimDir.x * safeBiasOffsetPx,
    y: burstOrigin.y + aimDir.y * safeBiasOffsetPx,
  };

  if (type === "line") {
    const lineLenTiles = Math.max(0, resolveFormationParamNumber(formationDefinition, "lineLen", "line_len", 3));
    const sideSpacingTiles = Math.max(0, resolveFormationParamNumber(formationDefinition, "sideSpacing", "side_spacing", 0));
    const lineLenPx = lineLenTiles * TILE_SIZE;
    const sideSpacingPx = sideSpacingTiles * TILE_SIZE;
    const laneSign = toFiniteNumber(weapon.laneSign, 0);
    const perpendicular = getPerpendicular(aimDir);
    const forwardDistancePx = lineLenPx * eased;

    return {
      weaponCenterX: biasedBurstOrigin.x + aimDir.x * forwardDistancePx + perpendicular.x * sideSpacingPx * laneSign,
      weaponCenterY: biasedBurstOrigin.y + aimDir.y * forwardDistancePx + perpendicular.y * sideSpacingPx * laneSign,
      orbitCenterX: biasedBurstOrigin.x,
      orbitCenterY: biasedBurstOrigin.y,
    };
  }

  if (type === "arc") {
    const arcDeg = clamp(resolveFormationParamNumber(formationDefinition, "arcDeg", "arc_deg", 120), 1, 360);
    const arcHalfRad = (arcDeg * Math.PI) / 360;
    const arcDir = resolveFormationParamString(formationDefinition, "arcDir", "arc_dir", "front").toLowerCase();
    const isBack = arcDir === "back";
    const centerOffsetEnable = resolveFormationParamBoolean(
      formationDefinition,
      "centerOffsetEnable",
      "center_offset_enable",
      false
    );
    const arcCenterDir = {
      x: aimDir.x * (isBack ? -1 : 1),
      y: aimDir.y * (isBack ? -1 : 1),
    };
    const orbitCenter = resolveOrbitCenter(
      burstOrigin,
      centerMode,
      arcCenterDir,
      safeBiasOffsetPx,
      centerOffsetEnable || safeBiasOffsetPx > VECTOR_EPSILON
    );
    const sweepAngle = lerp(-arcHalfRad, arcHalfRad, eased);
    const swung = rotateVector(arcCenterDir, sweepAngle);
    const localDir = normalizeVector(swung.x, swung.y, arcCenterDir.x, arcCenterDir.y);

    return {
      weaponCenterX: orbitCenter.x + localDir.x * radiusPx,
      weaponCenterY: orbitCenter.y + localDir.y * radiusPx,
      orbitCenterX: orbitCenter.x,
      orbitCenterY: orbitCenter.y,
    };
  }

  if (type === "figure8") {
    const a = resolveFormationParamNumber(formationDefinition, "a", "a", 1);
    const b = resolveFormationParamNumber(formationDefinition, "b", "b", 0.5);
    const omegaMul = Math.max(0.01, resolveFormationParamNumber(formationDefinition, "omegaMul", "omega_mul", 1));
    const theta = pathProgress * Math.PI * 2 * omegaMul;
    const localForward = Math.sin(theta) * radiusPx * a;
    const localSide = Math.sin(theta * 2) * radiusPx * b;
    const perpendicular = getPerpendicular(aimDir);

    return {
      weaponCenterX: biasedBurstOrigin.x + aimDir.x * localForward + perpendicular.x * localSide,
      weaponCenterY: biasedBurstOrigin.y + aimDir.y * localForward + perpendicular.y * localSide,
      orbitCenterX: biasedBurstOrigin.x,
      orbitCenterY: biasedBurstOrigin.y,
    };
  }

  if (type === "spiral") {
    const rMinTiles = resolveFormationParamNumber(
      formationDefinition,
      "rMin",
      "r_min",
      Math.max(0.3, toFiniteNumber(formationDefinition?.radiusBase, 2) * 0.6)
    );
    const rMaxTiles = resolveFormationParamNumber(
      formationDefinition,
      "rMax",
      "r_max",
      Math.max(rMinTiles, toFiniteNumber(formationDefinition?.radiusBase, 2) * 1.5)
    );
    const radialOmega = Math.max(
      0.01,
      resolveFormationParamNumber(formationDefinition, "radialOmega", "radial_omega", 1)
    );
    const rMinPx = Math.max(0, Math.min(rMinTiles, rMaxTiles) * TILE_SIZE);
    const rMaxPx = Math.max(rMinPx, Math.max(rMinTiles, rMaxTiles) * TILE_SIZE);
    const radialPhase = (Math.sin(eased * Math.PI * 2 * radialOmega) + 1) / 2;
    const radialBlend = clamp(eased * 0.55 + radialPhase * 0.45, 0, 1);
    const radialDistancePx = lerp(rMinPx, rMaxPx, radialBlend);
    const perpendicular = getPerpendicular(aimDir);
    const spin = pathProgress * Math.PI * 2 * SPIRAL_BURST_TURN_COUNT;
    const orbitDir = normalizeVector(
      aimDir.x * Math.cos(spin) + perpendicular.x * Math.sin(spin),
      aimDir.y * Math.cos(spin) + perpendicular.y * Math.sin(spin),
      aimDir.x,
      aimDir.y
    );

    return {
      weaponCenterX: biasedBurstOrigin.x + orbitDir.x * radialDistancePx,
      weaponCenterY: biasedBurstOrigin.y + orbitDir.y * radialDistancePx,
      orbitCenterX: biasedBurstOrigin.x,
      orbitCenterY: biasedBurstOrigin.y,
    };
  }

  if (type === "circle") {
    const slashAngle = lerp(CIRCLE_BURST_TURN_START_RAD, CIRCLE_BURST_TURN_END_RAD, pathProgress);
    const slashDirRaw = rotateVector(aimDir, slashAngle);
    const slashDir = normalizeVector(slashDirRaw.x, slashDirRaw.y, aimDir.x, aimDir.y);
    const burstDistancePx = Math.max(8, radiusPx);

    return {
      weaponCenterX: biasedBurstOrigin.x + slashDir.x * burstDistancePx,
      weaponCenterY: biasedBurstOrigin.y + slashDir.y * burstDistancePx,
      orbitCenterX: biasedBurstOrigin.x,
      orbitCenterY: biasedBurstOrigin.y,
    };
  }

  if (type === "stop") {
    return {
      weaponCenterX: playerCenter.x,
      weaponCenterY: playerCenter.y,
      orbitCenterX: playerCenter.x,
      orbitCenterY: playerCenter.y,
    };
  }

  const slashAngle = lerp(-CIRCLE_BURST_SWEEP_RAD, CIRCLE_BURST_SWEEP_RAD, eased);
  const slashDirRaw = rotateVector(aimDir, slashAngle);
  const slashDir = normalizeVector(slashDirRaw.x, slashDirRaw.y, aimDir.x, aimDir.y);
  const burstDistancePx = Math.max(8, radiusPx);

  return {
    weaponCenterX: biasedBurstOrigin.x + slashDir.x * burstDistancePx,
    weaponCenterY: biasedBurstOrigin.y + slashDir.y * burstDistancePx,
    orbitCenterX: biasedBurstOrigin.x,
    orbitCenterY: biasedBurstOrigin.y,
  };
}

function updateAttackSequence(weapon, weaponDefinition, dt) {
  const cooldownSec = resolveWeaponCooldownSec(weaponDefinition);

  weapon.cooldownRemainingSec = toFiniteNumber(weapon.cooldownRemainingSec, 0) - dt;

  let attackAdvancedCount = 0;
  while (weapon.cooldownRemainingSec <= 0) {
    weapon.attackSeq = Math.max(0, Math.floor(toFiniteNumber(weapon.attackSeq, 0))) + 1;
    sanitizeHitSet(weapon).clear();
    weapon.cooldownRemainingSec += cooldownSec;
    attackAdvancedCount += 1;
  }

  return {
    cooldownSec,
    attackAdvancedCount,
  };
}

function updateWeaponTransform(
  weapon,
  weaponDefinition,
  formationDefinition,
  player,
  dt,
  attackAdvancedCount = 0,
  cooldownSec = resolveWeaponCooldownSec(weaponDefinition)
) {
  const radiusPx = resolveFormationRadiusPx(formationDefinition);
  const liveAimDir = getAimDirection(player);
  const facingDir = getFacingVector(player?.facing);
  const tec = Math.max(0, toFiniteNumber(player?.statTotals?.tec, 0));
  const effectiveBiasStrengthScale = clamp(1 + tec * BIAS_PER_TEC, 0, BIAS_STRENGTH_SCALE_CAP);
  const effectiveBiasResponseScale = clamp(1 + tec * RESPONSE_PER_TEC, 0, BIAS_RESPONSE_SCALE_CAP);
  const effectiveBiasOffsetPx = resolveBiasOffsetPx(radiusPx, formationDefinition, effectiveBiasStrengthScale);
  const response = resolveBiasResponse(formationDefinition, effectiveBiasResponseScale);
  const formationType = resolveFormationParamString(formationDefinition, "type", "type", formationDefinition?.type ?? "circle");
  const playerSize = getPlayerSize(player);
  const playerCenter = getPlayerCenter(player);

  if (formationType === "stop") {
    weapon.attackMotionPhase = ATTACK_MOTION_PHASE.IDLE;
    weapon.attackMotionTimerSec = 0;
    weapon.attackMotionDurationSec = 0;

    applyWeaponPose(
      weapon,
      playerCenter.x,
      playerCenter.y,
      playerCenter.x,
      playerCenter.y,
      weaponDefinition,
      formationDefinition
    );
    return { isBurstPose: false };
  }

  const attackStarted = attackAdvancedCount > 0;
  if (attackStarted) {
    const lockedAimForAttack = normalizeVector(liveAimDir.x, liveAimDir.y, 1, 0);
    weapon.lockedAimDirX = lockedAimForAttack.x;
    weapon.lockedAimDirY = lockedAimForAttack.y;
    weapon.attackOriginX = playerCenter.x;
    weapon.attackOriginY = playerCenter.y;

    const weaponWidth = Math.max(0, toFiniteNumber(weapon.width, 0));
    const weaponHeight = Math.max(0, toFiniteNumber(weapon.height, 0));
    const currentCenterX = toFiniteNumber(weapon.x, playerCenter.x - weaponWidth / 2) + weaponWidth / 2;
    const currentCenterY = toFiniteNumber(weapon.y, playerCenter.y - weaponHeight / 2) + weaponHeight / 2;
    weapon.attackApproachStartX = currentCenterX;
    weapon.attackApproachStartY = currentCenterY;

    const startCenterMode = getFormationCenterMode(formationDefinition);
    const startBiasOffsetPx = effectiveBiasOffsetPx;
    const approachEndPose = resolveBurstPoseByFormation({
      weapon,
      formationDefinition,
      playerCenter,
      aimDir: lockedAimForAttack,
      radiusPx,
      centerMode: startCenterMode,
      biasOffsetPx: startBiasOffsetPx,
      progress: 0,
    });
    weapon.attackApproachEndX = approachEndPose.weaponCenterX;
    weapon.attackApproachEndY = approachEndPose.weaponCenterY;
  }

  const motionDurations = resolveAttackMotionDurations(cooldownSec, formationType);
  const motionState = updateAttackMotionState({
    weapon,
    attackStarted,
    motionDurations,
    dt,
    liveAimDir,
    playerCenter,
  });

  const idleTargetDir = normalizeVector(
    lerp(facingDir.x, liveAimDir.x, ATTACK_IDLE_AIM_BLEND),
    lerp(facingDir.y, liveAimDir.y, ATTACK_IDLE_AIM_BLEND),
    facingDir.x,
    facingDir.y
  );
  const trackingAim = motionState.phase === ATTACK_MOTION_PHASE.IDLE ? idleTargetDir : motionState.lockedAim;
  const lerpFactor = clamp(response * dt * BIAS_LERP_BASE, 0, 1);
  const baseBiasDir = normalizeVector(
    toFiniteNumber(weapon.biasDirX, trackingAim.x),
    toFiniteNumber(weapon.biasDirY, trackingAim.y),
    trackingAim.x,
    trackingAim.y
  );
  let nextBias;
  if (motionState.phase === ATTACK_MOTION_PHASE.IDLE) {
    const baseAngleRad = Math.atan2(baseBiasDir.y, baseBiasDir.x);
    const targetAngleRad = Math.atan2(trackingAim.y, trackingAim.x);
    const nextAngleRad = lerpAngleRad(baseAngleRad, targetAngleRad, lerpFactor);
    nextBias = normalizeVector(Math.cos(nextAngleRad), Math.sin(nextAngleRad), trackingAim.x, trackingAim.y);
  } else {
    nextBias = normalizeVector(motionState.lockedAim.x, motionState.lockedAim.y, trackingAim.x, trackingAim.y);
  }

  weapon.biasDirX = nextBias.x;
  weapon.biasDirY = nextBias.y;
  const idleRearMinDistancePx = resolveIdleRearMinDistancePx(playerSize, weapon, nextBias);

  let pose;
  if (motionState.phase === ATTACK_MOTION_PHASE.APPROACH) {
    pose = resolveApproachPose(weapon, playerCenter, motionState.progress);
  } else if (motionState.phase === ATTACK_MOTION_PHASE.BURST) {
    const centerMode = getFormationCenterMode(formationDefinition);
    pose = resolveBurstPoseByFormation({
      weapon,
      formationDefinition,
      playerCenter,
      aimDir: motionState.lockedAim,
      radiusPx,
      centerMode,
      biasOffsetPx: effectiveBiasOffsetPx,
      progress: motionState.progress,
    });

    weapon.attackBurstEndX = pose.weaponCenterX;
    weapon.attackBurstEndY = pose.weaponCenterY;
  } else if (motionState.phase === ATTACK_MOTION_PHASE.RETURN) {
    const idleAnchor = resolveIdleHoverBaseAnchor(
      weapon,
      playerCenter,
      radiusPx,
      nextBias,
      effectiveBiasOffsetPx,
      idleRearMinDistancePx
    );
    pose = resolveReturnPose(weapon, playerCenter, idleAnchor, motionState.progress);
  } else {
    pose = resolveIdleHoverPose(
      weapon,
      playerCenter,
      radiusPx,
      nextBias,
      effectiveBiasOffsetPx,
      idleRearMinDistancePx
    );
  }

  const rotationOverrideDir = motionState.phase === ATTACK_MOTION_PHASE.IDLE ? IDLE_VERTICAL_UP_DIR : null;
  applyWeaponPose(
    weapon,
    pose.weaponCenterX,
    pose.weaponCenterY,
    pose.orbitCenterX,
    pose.orbitCenterY,
    weaponDefinition,
    formationDefinition,
    rotationOverrideDir
  );

  return {
    isBurstPose: motionState.phase === ATTACK_MOTION_PHASE.BURST,
  };
}

function applyWeaponHits(weapon, weaponDefinition, enemies, events, player) {
  if (!Array.isArray(enemies) || enemies.length === 0) {
    return;
  }

  const hitSet = sanitizeHitSet(weapon);
  const maxTargets = Math.max(1, 1 + Math.floor(toFiniteNumber(weaponDefinition.pierceCount, 0)));
  const hitNum = Math.max(1, Math.floor(toFiniteNumber(weaponDefinition.hitNum, 1)));
  const baseDamage = Math.max(0, toFiniteNumber(weaponDefinition.baseDamage, 0));
  const canUseDerivedRoll =
    typeof player?.damageSeed === "string" &&
    Number.isFinite(player?.damageMult) &&
    Number.isFinite(player?.critChance) &&
    Number.isFinite(player?.critMult);
  const weaponHitbox = getWeaponHitbox(weapon);

  for (const enemy of enemies) {
    if (enemy.isDead === true) {
      continue;
    }

    if (hitSet.has(enemy.id)) {
      continue;
    }

    if (hitSet.size >= maxTargets) {
      break;
    }

    const enemyHitbox = getEnemyCombatHitbox(enemy);
    if (!enemyHitbox || !intersectsAabb(weaponHitbox, enemyHitbox)) {
      continue;
    }

    const damageRoll = canUseDerivedRoll
      ? rollHitDamage({
          baseDamage,
          damageMult: player.damageMult,
          attackScale: 1,
          critChance: player.critChance,
          critMult: player.critMult,
          seedKey: `${player.damageSeed}::${weapon.id}::${weapon.attackSeq}::${enemy.id}`,
        })
      : {
          damage: Math.max(1, Math.round(baseDamage)),
          isCritical: false,
        };
    const damagePerHit = damageRoll.damage;
    const totalDamage = damagePerHit * hitNum;
    enemy.hp = toFiniteNumber(enemy.hp, 0) - totalDamage;
    enemy.hitFlashTimerSec = toFiniteNumber(enemy.hitFlashDurationSec, 0.12);
    hitSet.add(enemy.id);
    events.push({
      kind: "damage",
      targetType: "enemy",
      weaponId: weapon.id,
      weaponDefId: weapon.weaponDefId,
      enemyId: enemy.id,
      damage: totalDamage,
      isCritical: damageRoll.isCritical === true,
      worldX: enemy.x + enemy.width / 2,
      worldY: enemy.y + enemy.height / 2,
    });

    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.isDead = true;
    }
  }
}

export function createWeaponRuntime(weaponDefinition, formationDefinition, player, runtimeId = null) {
  if (!weaponDefinition) {
    throw new Error("Failed to create weapon runtime: weapon definition is missing.");
  }

  if (!formationDefinition) {
    throw new Error(
      `Failed to create weapon runtime: formation definition is missing (formationId=${weaponDefinition.formationId ?? "unknown"}).`
    );
  }

  const playerCenter = getPlayerCenter(player);
  const facingDir = getFacingVector(player?.facing);
  const resolvedRuntimeId = runtimeId ?? `weapon-${weaponDefinition.id}`;
  const laneSign = resolveRuntimeLaneSign(resolvedRuntimeId);
  const idleLaneIndex = resolveIdleLaneIndex(resolvedRuntimeId);
  const idleBobPhaseRad = resolveIdleBobPhaseRad(resolvedRuntimeId);

  return {
    id: resolvedRuntimeId,
    weaponDefId: weaponDefinition.id,
    formationId: formationDefinition.id,
    x: playerCenter.x - weaponDefinition.width / 2,
    y: playerCenter.y - weaponDefinition.height / 2,
    width: weaponDefinition.width,
    height: weaponDefinition.height,
    angleRad: 0,
    rotationDeg: 0,
    rotationRad: 0,
    attackSeq: 0,
    cooldownRemainingSec: 0,
    hitSet: new Set(),
    biasDirX: facingDir.x,
    biasDirY: facingDir.y,
    laneSign,
    attackMotionPhase: ATTACK_MOTION_PHASE.IDLE,
    attackMotionTimerSec: 0,
    attackMotionDurationSec: 0,
    lockedAimDirX: facingDir.x,
    lockedAimDirY: facingDir.y,
    attackOriginX: playerCenter.x,
    attackOriginY: playerCenter.y,
    attackBurstEndX: playerCenter.x,
    attackBurstEndY: playerCenter.y,
    attackApproachStartX: playerCenter.x,
    attackApproachStartY: playerCenter.y,
    attackApproachEndX: playerCenter.x,
    attackApproachEndY: playerCenter.y,
    idleLaneIndex,
    idleBobPhaseRad,
  };
}

export function createPlayerWeapons(weaponDefinitions, formationDefinitionsById, player) {
  if (!Array.isArray(weaponDefinitions) || weaponDefinitions.length === 0) {
    return [];
  }

  return weaponDefinitions.map((weaponDefinition, index) => {
    const formationDefinition = formationDefinitionsById?.[weaponDefinition.formationId];
    return createWeaponRuntime(weaponDefinition, formationDefinition, player, `weapon-${index}`);
  });
}

export function updateWeaponsAndCombat(
  weapons,
  player,
  enemies,
  weaponDefinitionsById,
  formationDefinitionsById,
  dt
) {
  const events = [];

  if (!Array.isArray(weapons) || weapons.length === 0) {
    return events;
  }

  if (!Number.isFinite(dt) || dt <= 0) {
    return events;
  }

  for (const weapon of weapons) {
    const weaponDefinition = weaponDefinitionsById?.[weapon.weaponDefId];
    if (!weaponDefinition) {
      continue;
    }

    const formationDefinition = formationDefinitionsById?.[weapon.formationId];
    if (!formationDefinition || typeof formationDefinition.type !== "string") {
      continue;
    }

    const attackUpdate = updateAttackSequence(weapon, weaponDefinition, dt);
    const transformResult = updateWeaponTransform(
      weapon,
      weaponDefinition,
      formationDefinition,
      player,
      dt,
      attackUpdate.attackAdvancedCount,
      attackUpdate.cooldownSec
    );
    if (transformResult?.isBurstPose !== true) {
      continue;
    }

    applyWeaponHits(weapon, weaponDefinition, enemies, events, player);
  }

  return events;
}

export function removeDefeatedEnemies(enemies) {
  if (!Array.isArray(enemies) || enemies.length === 0) {
    return [];
  }

  return enemies.filter((enemy) => enemy.isDead !== true);
}

export function getWeaponHitbox(weapon) {
  return {
    x: weapon.x,
    y: weapon.y,
    width: weapon.width,
    height: weapon.height,
  };
}
