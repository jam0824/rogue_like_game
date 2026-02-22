import { TILE_SIZE } from "../config/constants.js";
import { rollHitDamage } from "../combat/damageRoll.js";
import { getEnemyCombatHitbox } from "../enemy/enemySystem.js";

const MIN_ATTACK_COOLDOWN_SEC = 0.05;
const BIAS_LERP_BASE = 6;
const VECTOR_EPSILON = 0.0001;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  formationDefinition
) {
  const fromOrbitDx = weaponCenterX - orbitCenterX;
  const fromOrbitDy = weaponCenterY - orbitCenterY;
  const hasRotationVector = Math.hypot(fromOrbitDx, fromOrbitDy) > VECTOR_EPSILON;
  const rotationDeg = hasRotationVector ? toRotationDegrees(fromOrbitDx, fromOrbitDy) : toFiniteNumber(weapon.rotationDeg, 0);

  weapon.x = weaponCenterX - weapon.width / 2;
  weapon.y = weaponCenterY - weapon.height / 2;
  weapon.rotationDeg = rotationDeg;
  weapon.rotationRad = rotationDeg * Math.PI / 180;
  weapon.weaponDefId = weaponDefinition.id;
  weapon.formationId = formationDefinition.id;
}

function resolveRuntimeLaneSign(runtimeId) {
  if (typeof runtimeId !== "string") {
    return 0;
  }
  const match = runtimeId.match(/(\d+)$/);
  if (!match) {
    return 0;
  }
  const slotIndex = Number(match[1]);
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

function resolveFormationAngularSpeed(formation) {
  const angularSpeedBase = toFiniteNumber(
    formation?.angularSpeedBase,
    toFiniteNumber(formation?.angular_speed_base, 1)
  );
  const clampConfig = formation?.clamp ?? {};
  const minSpeed = toFiniteNumber(clampConfig.speedMin, toFiniteNumber(clampConfig.speed_min, 0));
  const maxSpeed = toFiniteNumber(
    clampConfig.speedMax,
    toFiniteNumber(clampConfig.speed_max, Number.POSITIVE_INFINITY)
  );
  return clamp(angularSpeedBase, minSpeed, maxSpeed);
}

function resolveBiasOffsetPx(radiusPx, formation) {
  const biasStrength = toFiniteNumber(
    formation?.biasStrengthMul,
    toFiniteNumber(formation?.bias_strength_mul, 0)
  );
  const clampConfig = formation?.clamp ?? {};
  const maxRatio = toFiniteNumber(
    clampConfig.biasOffsetRatioMax,
    toFiniteNumber(clampConfig.bias_offset_ratio_max, Number.POSITIVE_INFINITY)
  );
  const rawOffset = Math.max(0, radiusPx * biasStrength);
  const maxOffset = Math.max(0, radiusPx * maxRatio);
  return Math.min(rawOffset, maxOffset);
}

function resolveBiasResponse(formation) {
  return Math.max(0, toFiniteNumber(formation?.biasResponseMul, toFiniteNumber(formation?.bias_response_mul, 0)));
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

function updateAttackSequence(weapon, weaponDefinition, dt) {
  const cooldownSec = Math.max(
    MIN_ATTACK_COOLDOWN_SEC,
    toFiniteNumber(weaponDefinition.attackCooldownSec, toFiniteNumber(weaponDefinition.attack_cooldown_sec, 0))
  );

  weapon.cooldownRemainingSec = toFiniteNumber(weapon.cooldownRemainingSec, 0) - dt;

  while (weapon.cooldownRemainingSec <= 0) {
    weapon.attackSeq = Math.max(0, Math.floor(toFiniteNumber(weapon.attackSeq, 0))) + 1;
    sanitizeHitSet(weapon).clear();
    weapon.cooldownRemainingSec += cooldownSec;
  }
}

function updateWeaponTransform(weapon, weaponDefinition, formationDefinition, player, dt) {
  const radiusPx = resolveFormationRadiusPx(formationDefinition);
  const angularSpeed = resolveFormationAngularSpeed(formationDefinition);
  const aimDir = getAimDirection(player);
  const response = resolveBiasResponse(formationDefinition);
  const lerpFactor = clamp(response * dt * BIAS_LERP_BASE, 0, 1);

  const baseBiasDir = normalizeVector(
    toFiniteNumber(weapon.biasDirX, aimDir.x),
    toFiniteNumber(weapon.biasDirY, aimDir.y),
    aimDir.x,
    aimDir.y
  );

  const nextBias = normalizeVector(
    baseBiasDir.x + (aimDir.x - baseBiasDir.x) * lerpFactor,
    baseBiasDir.y + (aimDir.y - baseBiasDir.y) * lerpFactor,
    aimDir.x,
    aimDir.y
  );

  weapon.biasDirX = nextBias.x;
  weapon.biasDirY = nextBias.y;

  const playerCenter = getPlayerCenter(player);
  const centerMode = getFormationCenterMode(formationDefinition);
  const biasOffsetPx = resolveBiasOffsetPx(radiusPx, formationDefinition);
  const formationType = resolveFormationParamString(formationDefinition, "type", "type", formationDefinition?.type ?? "circle");
  const phaseRad = toFiniteNumber(weapon.angleRad, 0) + angularSpeed * dt;
  weapon.angleRad = phaseRad;

  if (formationType === "stop") {
    applyWeaponPose(
      weapon,
      playerCenter.x,
      playerCenter.y,
      playerCenter.x,
      playerCenter.y,
      weaponDefinition,
      formationDefinition
    );
    return;
  }

  if (formationType === "arc") {
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
    const orbitCenter = resolveOrbitCenter(playerCenter, centerMode, nextBias, biasOffsetPx, centerOffsetEnable);
    const arcCenterDir = {
      x: nextBias.x * (isBack ? -1 : 1),
      y: nextBias.y * (isBack ? -1 : 1),
    };
    const oscillation = Math.sin(phaseRad) * arcHalfRad;
    const rotatedArc = rotateVector(arcCenterDir, oscillation);
    const arcLocalDir = normalizeVector(
      rotatedArc.x,
      rotatedArc.y,
      arcCenterDir.x,
      arcCenterDir.y
    );
    const weaponCenterX = orbitCenter.x + arcLocalDir.x * radiusPx;
    const weaponCenterY = orbitCenter.y + arcLocalDir.y * radiusPx;
    applyWeaponPose(
      weapon,
      weaponCenterX,
      weaponCenterY,
      orbitCenter.x,
      orbitCenter.y,
      weaponDefinition,
      formationDefinition
    );
    return;
  }

  if (formationType === "line") {
    const lineLenTiles = Math.max(0, resolveFormationParamNumber(formationDefinition, "lineLen", "line_len", 3));
    const lineLenPx = lineLenTiles * TILE_SIZE;
    const motion = resolveFormationParamString(formationDefinition, "motion", "motion", "pingpong").toLowerCase();
    const sideSpacingTiles = Math.max(
      0,
      resolveFormationParamNumber(formationDefinition, "sideSpacing", "side_spacing", 0)
    );
    const sideSpacingPx = sideSpacingTiles * TILE_SIZE;
    const laneSign = toFiniteNumber(weapon.laneSign, 0);
    const progress = motion === "pingpong"
      ? 0.5 - 0.5 * Math.cos(phaseRad)
      : (phaseRad / (Math.PI * 2) + 1) % 1;
    const forwardDistancePx = lineLenPx * clamp(progress, 0, 1);
    const perpendicular = getPerpendicular(nextBias);
    const weaponCenterX = playerCenter.x + nextBias.x * forwardDistancePx + perpendicular.x * sideSpacingPx * laneSign;
    const weaponCenterY = playerCenter.y + nextBias.y * forwardDistancePx + perpendicular.y * sideSpacingPx * laneSign;
    applyWeaponPose(
      weapon,
      weaponCenterX,
      weaponCenterY,
      playerCenter.x,
      playerCenter.y,
      weaponDefinition,
      formationDefinition
    );
    return;
  }

  if (formationType === "figure8") {
    const orbitCenter = resolveOrbitCenter(playerCenter, centerMode, nextBias, biasOffsetPx);
    const a = resolveFormationParamNumber(formationDefinition, "a", "a", 1);
    const b = resolveFormationParamNumber(formationDefinition, "b", "b", 0.5);
    const omegaMul = Math.max(0.01, resolveFormationParamNumber(formationDefinition, "omegaMul", "omega_mul", 1));
    const t = phaseRad * omegaMul;
    const localForward = Math.sin(t) * radiusPx * a;
    const localSide = Math.sin(t * 2) * radiusPx * b;
    const perpendicular = getPerpendicular(nextBias);
    const weaponCenterX = orbitCenter.x + nextBias.x * localForward + perpendicular.x * localSide;
    const weaponCenterY = orbitCenter.y + nextBias.y * localForward + perpendicular.y * localSide;
    applyWeaponPose(
      weapon,
      weaponCenterX,
      weaponCenterY,
      orbitCenter.x,
      orbitCenter.y,
      weaponDefinition,
      formationDefinition
    );
    return;
  }

  if (formationType === "spiral") {
    const orbitCenter = resolveOrbitCenter(playerCenter, centerMode, nextBias, biasOffsetPx);
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
    const radialT = (Math.sin(phaseRad * radialOmega) + 1) / 2;
    const radialDistancePx = rMinPx + (rMaxPx - rMinPx) * radialT;
    const perpendicular = getPerpendicular(nextBias);
    const orbitDir = normalizeVector(
      nextBias.x * Math.cos(phaseRad) + perpendicular.x * Math.sin(phaseRad),
      nextBias.y * Math.cos(phaseRad) + perpendicular.y * Math.sin(phaseRad),
      nextBias.x,
      nextBias.y
    );
    const weaponCenterX = orbitCenter.x + orbitDir.x * radialDistancePx;
    const weaponCenterY = orbitCenter.y + orbitDir.y * radialDistancePx;
    applyWeaponPose(
      weapon,
      weaponCenterX,
      weaponCenterY,
      orbitCenter.x,
      orbitCenter.y,
      weaponDefinition,
      formationDefinition
    );
    return;
  }

  const orbitCenter = resolveOrbitCenter(playerCenter, centerMode, nextBias, biasOffsetPx);
  const weaponCenterX = orbitCenter.x + Math.cos(phaseRad) * radiusPx;
  const weaponCenterY = orbitCenter.y + Math.sin(phaseRad) * radiusPx;
  applyWeaponPose(
    weapon,
    weaponCenterX,
    weaponCenterY,
    orbitCenter.x,
    orbitCenter.y,
    weaponDefinition,
    formationDefinition
  );
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

  return {
    id: runtimeId ?? `weapon-${weaponDefinition.id}`,
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
    laneSign: resolveRuntimeLaneSign(runtimeId ?? `weapon-${weaponDefinition.id}`),
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

    updateAttackSequence(weapon, weaponDefinition, dt);
    updateWeaponTransform(weapon, weaponDefinition, formationDefinition, player, dt);
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
