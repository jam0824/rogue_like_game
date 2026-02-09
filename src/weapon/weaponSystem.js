import { TILE_SIZE } from "../config/constants.js";
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

  weapon.angleRad = toFiniteNumber(weapon.angleRad, 0) + angularSpeed * dt;

  const playerCenter = getPlayerCenter(player);
  const centerMode = getFormationCenterMode(formationDefinition);
  const biasOffsetPx = resolveBiasOffsetPx(radiusPx, formationDefinition);
  const orbitCenterX =
    centerMode === "biased_center" ? playerCenter.x + nextBias.x * biasOffsetPx : playerCenter.x;
  const orbitCenterY =
    centerMode === "biased_center" ? playerCenter.y + nextBias.y * biasOffsetPx : playerCenter.y;

  const weaponCenterX = orbitCenterX + Math.cos(weapon.angleRad) * radiusPx;
  const weaponCenterY = orbitCenterY + Math.sin(weapon.angleRad) * radiusPx;
  const fromOrbitDx = weaponCenterX - orbitCenterX;
  const fromOrbitDy = weaponCenterY - orbitCenterY;
  const rotationDeg = toRotationDegrees(fromOrbitDx, fromOrbitDy);

  weapon.x = weaponCenterX - weapon.width / 2;
  weapon.y = weaponCenterY - weapon.height / 2;
  weapon.rotationDeg = rotationDeg;
  weapon.rotationRad = rotationDeg * Math.PI / 180;
  weapon.weaponDefId = weaponDefinition.id;
  weapon.formationId = formationDefinition.id;
}

function applyWeaponHits(weapon, weaponDefinition, enemies, events) {
  if (!Array.isArray(enemies) || enemies.length === 0) {
    return;
  }

  const hitSet = sanitizeHitSet(weapon);
  const maxTargets = Math.max(1, 1 + Math.floor(toFiniteNumber(weaponDefinition.pierceCount, 0)));
  const hitNum = Math.max(1, Math.floor(toFiniteNumber(weaponDefinition.hitNum, 1)));
  const damagePerHit = Math.max(1, Math.round(toFiniteNumber(weaponDefinition.baseDamage, 1)));
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

    const totalDamage = damagePerHit * hitNum;
    enemy.hp = toFiniteNumber(enemy.hp, 0) - totalDamage;
    enemy.hitFlashTimerSec = toFiniteNumber(enemy.hitFlashDurationSec, 0.12);
    hitSet.add(enemy.id);
    events.push({
      kind: "damage",
      enemyId: enemy.id,
      damage: totalDamage,
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
    if (!formationDefinition || formationDefinition.type !== "circle") {
      continue;
    }

    updateAttackSequence(weapon, weaponDefinition, dt);
    updateWeaponTransform(weapon, weaponDefinition, formationDefinition, player, dt);
    applyWeaponHits(weapon, weaponDefinition, enemies, events);
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
