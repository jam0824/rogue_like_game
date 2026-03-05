import { TILE_SIZE } from "../config/constants.js";
import { getEnemyCombatHitbox } from "../enemy/enemySystem.js";
import { getPlayerCombatHitbox } from "../player/playerSystem.js";
import { rollHitDamage } from "./damageRoll.js";

export const MAX_CHAIN_SPAWN = 16;

const SKILL_CHAIN_RUNTIME_KEY = "skillChainRuntime";
const POISON_APPLY_PLUS_MAX = 3;
const POISON_APPLY_PLUS_HALF = 25;
const POISON_MAX_STACKS = 12;
const POISON_DURATION_SEC = 8;
const POISON_DOT_COEF = 0.05;
const MIN_DAMAGE = 1;

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toNonNegativeInt(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeVector(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  if (length <= 0.000001) {
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

function getWeaponCenter(weaponRuntime) {
  return {
    x: toFiniteNumber(weaponRuntime?.x, 0) + toFiniteNumber(weaponRuntime?.width, 0) / 2,
    y: toFiniteNumber(weaponRuntime?.y, 0) + toFiniteNumber(weaponRuntime?.height, 0) / 2,
  };
}

function getPlayerCenter(player) {
  const width = toFiniteNumber(player?.width, 32);
  const height = toFiniteNumber(player?.height, 64);

  return {
    x: toFiniteNumber(player?.x, 0) + width / 2,
    y: toFiniteNumber(player?.y, 0) + height / 2,
  };
}

function isPlayerDead(player) {
  return player?.isDead === true || (Number.isFinite(player?.hp) && player.hp <= 0);
}

function resolveHitEventTargetId(hitEvent) {
  const targetId = typeof hitEvent?.targetId === "string" ? hitEvent.targetId : "";
  if (targetId.length > 0) {
    return targetId;
  }

  const legacyEnemyId = typeof hitEvent?.enemyId === "string" ? hitEvent.enemyId : "";
  if (legacyEnemyId.length > 0) {
    return legacyEnemyId;
  }

  return "";
}

function resolveEnemyEntryAttackSpawnPoint({
  entryAttack,
  enemy,
  player,
  weaponRuntime,
  eventWorldX,
  eventWorldY,
}) {
  const weaponCenter = getWeaponCenter(weaponRuntime);
  const fallbackX = toFiniteNumber(eventWorldX, weaponCenter.x);
  const fallbackY = toFiniteNumber(eventWorldY, weaponCenter.y);
  const aoe = entryAttack?.attackKind === "aoe" ? entryAttack?.aoe : null;
  if (!aoe || aoe.targetPosition !== "target_locked") {
    return { x: fallbackX, y: fallbackY };
  }

  const playerHitbox = getPlayerCombatHitbox(player);
  const playerCenter = playerHitbox
    ? {
        x: playerHitbox.x + playerHitbox.width / 2,
        y: playerHitbox.y + playerHitbox.height / 2,
      }
    : player
      ? getPlayerCenter(player)
      : null;

  if (aoe.positionLockTiming === "on_windup_start") {
    if (Number.isFinite(enemy?.attack?.lockedTargetX) && Number.isFinite(enemy?.attack?.lockedTargetY)) {
      return {
        x: enemy.attack.lockedTargetX,
        y: enemy.attack.lockedTargetY,
      };
    }
    if (playerCenter) {
      return playerCenter;
    }
    return { x: fallbackX, y: fallbackY };
  }

  if (playerCenter) {
    return playerCenter;
  }
  return { x: fallbackX, y: fallbackY };
}

function buildAabbFromCenter(x, y, width, height) {
  const resolvedWidth = Math.max(1, toFiniteNumber(width, TILE_SIZE));
  const resolvedHeight = Math.max(1, toFiniteNumber(height, TILE_SIZE));

  return {
    x: x - resolvedWidth / 2,
    y: y - resolvedHeight / 2,
    width: resolvedWidth,
    height: resolvedHeight,
  };
}

function intersectsAabb(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function normalizeSkillInstances(rawSkills) {
  if (!Array.isArray(rawSkills)) {
    return [];
  }

  return rawSkills
    .filter((skill) => skill && typeof skill.id === "string" && skill.id.length > 0)
    .map((skill) => ({
      id: skill.id,
      plus: toNonNegativeInt(skill.plus, 0),
    }));
}

function resolveSkillSourceInstances(weaponRuntime, weaponDefinition, baseWeaponDefinition, skillDefinitionsById) {
  const runtimeSkills = normalizeSkillInstances(weaponRuntime?.skillInstances ?? weaponDefinition?.skills);
  const baseSkills = normalizeSkillInstances(baseWeaponDefinition?.skills);

  const resolvedRuntimeCount = runtimeSkills.reduce((count, instance) => {
    return skillDefinitionsById?.[instance.id] ? count + 1 : count;
  }, 0);

  if (resolvedRuntimeCount > 0) {
    return {
      skillInstances: runtimeSkills,
      fallbackApplied: false,
    };
  }

  if (baseSkills.length > 0) {
    return {
      skillInstances: baseSkills,
      fallbackApplied: runtimeSkills.length > 0,
    };
  }

  return {
    skillInstances: runtimeSkills,
    fallbackApplied: false,
  };
}

function resolveModifierPayload(entry) {
  const params = entry.definition?.params ?? {};
  const addTags = Array.isArray(params.addTags) ? params.addTags.filter((tag) => typeof tag === "string") : [];
  const addAttackDamagePct = toFiniteNumber(params.addAttackDamagePct, 0);

  const applyAilments = Array.isArray(params.applyAilments)
    ? params.applyAilments
        .filter((ailment) => ailment && typeof ailment.ailmentId === "string" && ailment.ailmentId.length > 0)
        .map((ailment) => ({
          ailmentId: ailment.ailmentId,
          applyBase: Math.max(0, toFiniteNumber(ailment.applyBase, 0)),
          plus: entry.instance.plus,
        }))
    : [];

  return {
    addTags,
    addAttackDamagePct,
    applyAilments,
  };
}

function resolveAttackStep(entry, modifiers) {
  const params = entry.definition?.params ?? {};
  const hit = params.hit ?? {};

  const mergedApplyAilments = [];
  const mergedTags = [];
  let addAttackDamagePct = 0;

  for (const modifier of modifiers) {
    if (Array.isArray(modifier.addTags) && modifier.addTags.length > 0) {
      mergedTags.push(...modifier.addTags);
    }

    addAttackDamagePct += toFiniteNumber(modifier.addAttackDamagePct, 0);

    if (Array.isArray(modifier.applyAilments) && modifier.applyAilments.length > 0) {
      mergedApplyAilments.push(...modifier.applyAilments);
    }
  }

  return {
    skillId: entry.instance.id,
    skillInstancePlus: entry.instance.plus,
    skillIndex: entry.skillIndex,
    attackKind: params.attackKind,
    baseDamage: Math.max(0, toFiniteNumber(params.baseDamage, 0)),
    damageElement: typeof params.damageElement === "string" ? params.damageElement : "",
    startSpawnTiming: params.startSpawnTiming === "hit" ? "hit" : "start",
    chainTrigger: params.chainTrigger === "on_hit" ? "on_hit" : "on_hit",
    hitNum: Math.max(1, toNonNegativeInt(hit.hitNum, 1)),
    pierceCount: Math.max(0, toNonNegativeInt(hit.pierceCount, 0)),
    attackScale: Math.max(0, 1 + addAttackDamagePct),
    applyAilments: mergedApplyAilments,
    tags: mergedTags,
    projectile:
      params.attackKind === "projectile"
        ? {
            speedTilePerSec: Math.max(0.0001, toFiniteNumber(params.projectile?.speedTilePerSec, 1)),
            lifeSec: Math.max(0.0001, toFiniteNumber(params.projectile?.lifeSec, 1)),
            moveDirection: params.projectile?.moveDirection === "to_target" ? "to_target" : "to_target",
            spriteEffectId:
              typeof params.projectile?.spriteEffectId === "string" ? params.projectile.spriteEffectId : "",
            hitBoxPer:
              Number.isFinite(params.projectile?.hitBoxPer) &&
              params.projectile.hitBoxPer > 0 &&
              params.projectile.hitBoxPer <= 1
                ? params.projectile.hitBoxPer
                : 1,
            isRotate: params.projectile?.isRotate !== false,
            disappearHitWall: params.projectile?.disappearHitWall !== false,
          }
        : null,
    aoe:
      params.attackKind === "aoe"
        ? {
            spriteEffectId: typeof params.aoe?.spriteEffectId === "string" ? params.aoe.spriteEffectId : "",
            hitBoxPer:
              Number.isFinite(params.aoe?.hitBoxPer) && params.aoe.hitBoxPer > 0 && params.aoe.hitBoxPer <= 1
                ? params.aoe.hitBoxPer
                : 1,
            hitIntervalSec: Math.max(0, toFiniteNumber(params.aoe?.hitIntervalSec, 0)),
            targetPosition:
              params.aoe?.targetPosition === "target_locked" || params.aoe?.targetPosition === "attacker"
                ? params.aoe.targetPosition
                : "hit",
            positionLockTiming: params.aoe?.positionLockTiming === "on_windup_start" ? "on_windup_start" : "on_fire",
          }
        : null,
  };
}

export function resolveWeaponSkillPlan({
  weaponRuntime,
  weaponDefinition,
  baseWeaponDefinition,
  skillDefinitionsById,
}) {
  const source = resolveSkillSourceInstances(
    weaponRuntime,
    weaponDefinition,
    baseWeaponDefinition,
    skillDefinitionsById
  );

  const resolvedEntries = source.skillInstances
    .map((instance, skillIndex) => {
      const definition = skillDefinitionsById?.[instance.id] ?? null;
      return {
        instance,
        definition,
        skillIndex,
      };
    })
    .filter((entry) => entry.definition);

  const attackEntries = [];

  for (let index = 0; index < resolvedEntries.length; index += 1) {
    const entry = resolvedEntries[index];
    if (entry.definition.skillType !== "attack") {
      continue;
    }

    const modifiers = resolvedEntries
      .slice(0, index)
      .filter((candidate) => candidate.definition.skillType === "modifier")
      .map((modifierEntry) => resolveModifierPayload(modifierEntry));

    attackEntries.push(resolveAttackStep(entry, modifiers));
  }

  return {
    fallbackApplied: source.fallbackApplied,
    attackSteps: attackEntries,
  };
}

function ensureWeaponSkillRuntime(weaponRuntime) {
  if (!weaponRuntime || typeof weaponRuntime !== "object") {
    return {
      projectileSeq: 0,
      projectiles: [],
      chainSpawnCountByAttackSeq: {},
    };
  }

  if (!weaponRuntime[SKILL_CHAIN_RUNTIME_KEY] || typeof weaponRuntime[SKILL_CHAIN_RUNTIME_KEY] !== "object") {
    weaponRuntime[SKILL_CHAIN_RUNTIME_KEY] = {
      projectileSeq: 0,
      projectiles: [],
      chainSpawnCountByAttackSeq: {},
    };
  }

  const runtime = weaponRuntime[SKILL_CHAIN_RUNTIME_KEY];

  runtime.projectileSeq = toNonNegativeInt(runtime.projectileSeq, 0);
  runtime.projectiles = Array.isArray(runtime.projectiles) ? runtime.projectiles : [];
  runtime.chainSpawnCountByAttackSeq =
    runtime.chainSpawnCountByAttackSeq && typeof runtime.chainSpawnCountByAttackSeq === "object"
      ? runtime.chainSpawnCountByAttackSeq
      : {};

  return runtime;
}

function pruneChainSpawnCounters(runtime, latestAttackSeq) {
  if (!runtime || !runtime.chainSpawnCountByAttackSeq) {
    return;
  }

  const latest = Math.max(0, toNonNegativeInt(latestAttackSeq, 0));
  const minimumKeptSeq = Math.max(0, latest - 4);

  for (const key of Object.keys(runtime.chainSpawnCountByAttackSeq)) {
    const attackSeq = Math.max(0, toNonNegativeInt(Number(key), 0));
    if (attackSeq < minimumKeptSeq) {
      delete runtime.chainSpawnCountByAttackSeq[key];
    }
  }
}

function ensurePoisonRuntime(enemy) {
  if (!enemy || typeof enemy !== "object") {
    return null;
  }

  if (!enemy.ailments || typeof enemy.ailments !== "object") {
    enemy.ailments = {};
  }

  if (!enemy.ailments.poison || typeof enemy.ailments.poison !== "object") {
    enemy.ailments.poison = {
      stacks: 0,
      applyRemainder: 0,
      decayTimerSec: 0,
      dotTimerSec: 0,
      dotPerStack: 0,
    };
  }

  const poison = enemy.ailments.poison;
  poison.stacks = Math.max(0, toNonNegativeInt(poison.stacks, 0));
  poison.applyRemainder = Math.max(0, toFiniteNumber(poison.applyRemainder, 0));
  poison.decayTimerSec = Math.max(0, toFiniteNumber(poison.decayTimerSec, 0));
  poison.dotTimerSec = Math.max(0, toFiniteNumber(poison.dotTimerSec, 0));
  poison.dotPerStack = Math.max(0, toFiniteNumber(poison.dotPerStack, 0));

  return poison;
}

function calcPoisonApplyMult(plus) {
  const safePlus = Math.max(0, toFiniteNumber(plus, 0));
  return 1 + POISON_APPLY_PLUS_MAX * safePlus / (safePlus + POISON_APPLY_PLUS_HALF);
}

function applyPoisonOnHit(enemy, ailment, player, baseHitNonCrit) {
  if (!enemy || ailment?.ailmentId !== "poison") {
    return;
  }

  const poison = ensurePoisonRuntime(enemy);
  if (!poison) {
    return;
  }

  const applyBase = Math.max(0, toFiniteNumber(ailment.applyBase, 0));
  const applyMult = calcPoisonApplyMult(ailment.plus);
  const ailmentTakenMult = Math.max(0, toFiniteNumber(enemy.ailmentTakenMult, 1));
  const apply = applyBase * applyMult * ailmentTakenMult;

  poison.applyRemainder += apply;
  const addStacksRaw = Math.floor(poison.applyRemainder);
  const addStacks = Math.max(0, addStacksRaw);
  poison.applyRemainder = Math.max(0, poison.applyRemainder - addStacks);

  if (addStacks <= 0) {
    return;
  }

  const previousStacks = poison.stacks;
  const nextStacks = clamp(previousStacks + addStacks, 0, POISON_MAX_STACKS);
  const addedStacks = Math.max(0, nextStacks - previousStacks);

  if (addedStacks <= 0) {
    return;
  }

  poison.stacks = nextStacks;
  poison.decayTimerSec = POISON_DURATION_SEC;

  const arc = Math.max(0, toFiniteNumber(player?.statTotals?.arc, 0));
  const addedDotPerStack = Math.max(0, baseHitNonCrit) * POISON_DOT_COEF * (1 + arc * 0);
  const weightedTotal = poison.dotPerStack * previousStacks + addedDotPerStack * addedStacks;
  poison.dotPerStack = weightedTotal / nextStacks;
}

function applyDamageToEnemy(enemy, damage) {
  if (!enemy || enemy.isDead === true) {
    return false;
  }

  const resolvedDamage = Math.max(0, Math.round(toFiniteNumber(damage, 0)));
  if (resolvedDamage <= 0) {
    return false;
  }

  enemy.hp = toFiniteNumber(enemy.hp, 0) - resolvedDamage;
  enemy.hitFlashTimerSec = toFiniteNumber(enemy.hitFlashDurationSec, 0.12);

  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.isDead = true;
  }

  return true;
}

function buildSkillDamageEvent({
  weaponRuntime,
  enemy,
  damage,
  isCritical,
  skillId,
}) {
  return {
    kind: "damage",
    targetType: "enemy",
    sourceType: "skill",
    skillId,
    weaponId: weaponRuntime?.id ?? "",
    weaponDefId: weaponRuntime?.weaponDefId ?? "",
    enemyId: enemy?.id ?? "",
    damage: Math.max(0, Math.round(toFiniteNumber(damage, 0))),
    isCritical: isCritical === true,
    worldX: toFiniteNumber(enemy?.x, 0) + toFiniteNumber(enemy?.width, 0) / 2,
    worldY: toFiniteNumber(enemy?.y, 0) + toFiniteNumber(enemy?.height, 0) / 2,
    suppressWeaponHitEffect: true,
  };
}

function buildPoisonDotEvent(enemy, damage) {
  return {
    kind: "damage",
    targetType: "enemy",
    sourceType: "ailment",
    ailmentId: "poison",
    weaponId: "",
    weaponDefId: "",
    enemyId: enemy?.id ?? "",
    damage: Math.max(0, Math.round(toFiniteNumber(damage, 0))),
    isCritical: false,
    worldX: toFiniteNumber(enemy?.x, 0) + toFiniteNumber(enemy?.width, 0) / 2,
    worldY: toFiniteNumber(enemy?.y, 0) + toFiniteNumber(enemy?.height, 0) / 2,
    suppressWeaponHitEffect: true,
  };
}

function resolveAttackRoll(attacker, weaponRuntime, attack, enemyId, attackSeq, hitSeedSuffix = "") {
  const canUseDerivedRoll =
    typeof attacker?.damageSeed === "string" &&
    Number.isFinite(attacker?.damageMult) &&
    Number.isFinite(attacker?.critChance) &&
    Number.isFinite(attacker?.critMult);

  const skillAttackScale = Math.max(0, toFiniteNumber(attack.attackScale, 1));
  const attackerAttackScale = Math.max(0, toFiniteNumber(attacker?.attackScale, 1));
  const totalAttackScale = skillAttackScale * attackerAttackScale;
  const damageMult = Math.max(0, toFiniteNumber(attacker?.damageMult, 1));

  if (!canUseDerivedRoll) {
    const fallbackDamage = Math.max(
      MIN_DAMAGE,
      Math.round(Math.max(0, attack.baseDamage) * damageMult * totalAttackScale)
    );
    return {
      damagePerHit: fallbackDamage,
      isCritical: false,
      baseHitNonCrit: fallbackDamage,
    };
  }

  const seedKey = `${attacker.damageSeed}::skill::${weaponRuntime?.id ?? "weapon"}::${attackSeq}::${attack.skillId}::${enemyId}::${hitSeedSuffix}`;
  const damageRoll = rollHitDamage({
    baseDamage: Math.max(0, attack.baseDamage),
    damageMult,
    attackScale: totalAttackScale,
    critChance: clamp(toFiniteNumber(attacker.critChance, 0), 0, 1),
    critMult: Math.max(1, toFiniteNumber(attacker.critMult, 1)),
    seedKey,
  });

  const baseHitNonCrit = Math.max(
    MIN_DAMAGE,
    Math.round(
      Math.max(0, attack.baseDamage) *
        damageMult *
        totalAttackScale
    )
  );

  return {
    damagePerHit: Math.max(MIN_DAMAGE, Math.round(toFiniteNumber(damageRoll.damage, MIN_DAMAGE))),
    isCritical: damageRoll.isCritical === true,
    baseHitNonCrit,
  };
}

function applyAttackHitToEnemy({
  enemy,
  attack,
  player,
  weaponRuntime,
  attackSeq,
  events,
  hitSeedSuffix,
}) {
  const roll = resolveAttackRoll(player, weaponRuntime, attack, enemy?.id ?? "enemy", attackSeq, hitSeedSuffix);
  const totalDamage = Math.max(MIN_DAMAGE, roll.damagePerHit * Math.max(1, toNonNegativeInt(attack.hitNum, 1)));

  if (!applyDamageToEnemy(enemy, totalDamage)) {
    return false;
  }

  events.push(
    buildSkillDamageEvent({
      weaponRuntime,
      enemy,
      damage: totalDamage,
      isCritical: roll.isCritical,
      skillId: attack.skillId,
    })
  );

  if (Array.isArray(attack.applyAilments) && attack.applyAilments.length > 0) {
    for (const ailment of attack.applyAilments) {
      applyPoisonOnHit(enemy, ailment, player, roll.baseHitNonCrit);
    }
  }

  return true;
}

function findEffectIndexById(effects, effectRuntimeId) {
  if (!Array.isArray(effects) || typeof effectRuntimeId !== "string" || effectRuntimeId.length <= 0) {
    return -1;
  }

  for (let index = 0; index < effects.length; index += 1) {
    if (effects[index]?.id === effectRuntimeId) {
      return index;
    }
  }

  return -1;
}

function hasEffectRuntime(effects, effectRuntimeId) {
  return findEffectIndexById(effects, effectRuntimeId) >= 0;
}

function calcRotationRadFromDirection(dirX, dirY) {
  return Math.atan2(toFiniteNumber(dirY, 0), toFiniteNumber(dirX, 0));
}

function syncEffectPosition(effects, effectRuntimeId, x, y, rotationRad = null) {
  const index = findEffectIndexById(effects, effectRuntimeId);
  if (index < 0) {
    return;
  }

  const effect = effects[index];
  effects[index] = {
    ...effect,
    x,
    y,
    rotationRad:
      Number.isFinite(rotationRad)
        ? rotationRad
        : Number.isFinite(effect?.rotationRad)
          ? effect.rotationRad
          : 0,
  };
}

function removeEffectsById(effects, effectIds) {
  if (!Array.isArray(effects) || !(effectIds instanceof Set) || effectIds.size <= 0) {
    return effects;
  }

  return effects.filter((effect) => {
    if (!effect || typeof effect.id !== "string") {
      return true;
    }
    return !effectIds.has(effect.id);
  });
}

function isPointWalkable(dungeon, x, y) {
  const walkableGrid = dungeon?.walkableGrid ?? dungeon?.floorGrid;
  if (!Array.isArray(walkableGrid) || walkableGrid.length <= 0 || !Array.isArray(walkableGrid[0])) {
    return true;
  }

  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);
  if (tileX < 0 || tileY < 0 || tileY >= walkableGrid.length || tileX >= walkableGrid[0].length) {
    return false;
  }

  return walkableGrid[tileY][tileX] === true;
}

function pickNearestEnemy(enemies, x, y) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }

    const centerX = toFiniteNumber(enemy.x, 0) + toFiniteNumber(enemy.width, 0) / 2;
    const centerY = toFiniteNumber(enemy.y, 0) + toFiniteNumber(enemy.height, 0) / 2;
    const distance = Math.hypot(centerX - x, centerY - y);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }

  return nearest;
}

function resolveProjectileDirection(projectileConfig, player, enemies, spawnX, spawnY) {
  if (projectileConfig.moveDirection === "to_target") {
    const nearestEnemy = pickNearestEnemy(enemies, spawnX, spawnY);
    if (nearestEnemy) {
      const enemyCenterX = toFiniteNumber(nearestEnemy.x, 0) + toFiniteNumber(nearestEnemy.width, 0) / 2;
      const enemyCenterY = toFiniteNumber(nearestEnemy.y, 0) + toFiniteNumber(nearestEnemy.height, 0) / 2;
      return normalizeVector(enemyCenterX - spawnX, enemyCenterY - spawnY, 1, 0);
    }
  }

  const playerCenter = getPlayerCenter(player);
  if (player?.pointerActive === true && player?.target && Number.isFinite(player.target.x) && Number.isFinite(player.target.y)) {
    return normalizeVector(player.target.x - playerCenter.x, player.target.y - playerCenter.y, 1, 0);
  }

  const facing = getFacingVector(player?.facing);
  return normalizeVector(facing.x, facing.y, 1, 0);
}

function tryConsumeChainSpawnBudget(runtime, attackSeq) {
  const key = String(Math.max(0, toNonNegativeInt(attackSeq, 0)));
  const current = Math.max(0, toNonNegativeInt(runtime.chainSpawnCountByAttackSeq?.[key], 0));
  if (current >= MAX_CHAIN_SPAWN) {
    return false;
  }

  runtime.chainSpawnCountByAttackSeq[key] = current + 1;
  return true;
}

function resolveHitboxSizeFromEffectRuntime(effectRuntime, fallbackSize = TILE_SIZE, hitBoxPer = 1) {
  const ratio = Number.isFinite(hitBoxPer) && hitBoxPer > 0 && hitBoxPer <= 1 ? hitBoxPer : 1;
  const scale = Math.max(0.0001, toFiniteNumber(effectRuntime?.scale, 1));
  const baseWidth = effectRuntime ? toFiniteNumber(effectRuntime.width, fallbackSize) * scale : fallbackSize;
  const baseHeight = effectRuntime ? toFiniteNumber(effectRuntime.height, fallbackSize) * scale : fallbackSize;

  return {
    width: Math.max(1, baseWidth * ratio),
    height: Math.max(1, baseHeight * ratio),
  };
}

function enqueueNextAttack({
  queue,
  runtime,
  attackSeq,
  nextAttackStepIndex,
  weaponRuntime,
  skillPlan,
  spawnX,
  spawnY,
  extraTaskProps = null,
}) {
  if (!Number.isFinite(nextAttackStepIndex) || nextAttackStepIndex < 0 || nextAttackStepIndex >= skillPlan.attackSteps.length) {
    return;
  }

  if (!tryConsumeChainSpawnBudget(runtime, attackSeq)) {
    return;
  }

  queue.push({
    type: "attack_spawn",
    attackSeq,
    attackStepIndex: nextAttackStepIndex,
    weaponRuntime,
    skillPlan,
    spawnX,
    spawnY,
    ...(extraTaskProps && typeof extraTaskProps === "object" ? extraTaskProps : {}),
  });
}

function spawnProjectile({
  runtime,
  weaponRuntime,
  skillPlan,
  attack,
  attackStepIndex,
  attackSeq,
  spawnX,
  spawnY,
  player,
  enemies,
  effects,
  buildEffectRuntime,
}) {
  const projectileConfig = attack.projectile;
  if (!projectileConfig) {
    return;
  }

  const direction = resolveProjectileDirection(projectileConfig, player, enemies, spawnX, spawnY);

  const projectileId = `${weaponRuntime.id}-skill-projectile-${runtime.projectileSeq}`;
  runtime.projectileSeq += 1;

  let projectileEffectRuntime = null;
  if (typeof projectileConfig.spriteEffectId === "string" && projectileConfig.spriteEffectId.length > 0) {
    const projectileRotationRad =
      projectileConfig.isRotate !== false ? calcRotationRadFromDirection(direction.x, direction.y) : null;
    projectileEffectRuntime = buildEffectRuntime?.(projectileConfig.spriteEffectId, spawnX, spawnY) ?? null;
    if (projectileEffectRuntime) {
      if (Number.isFinite(projectileRotationRad)) {
        projectileEffectRuntime.rotationRad = projectileRotationRad;
      }
      effects.push(projectileEffectRuntime);
    }
  }

  const hitbox = resolveHitboxSizeFromEffectRuntime(projectileEffectRuntime, TILE_SIZE, projectileConfig.hitBoxPer);

  runtime.projectiles.push({
    id: projectileId,
    attackSeq,
    attackStepIndex,
    weaponRuntime,
    skillPlan,
    x: spawnX,
    y: spawnY,
    dirX: direction.x,
    dirY: direction.y,
    speedPxPerSec: Math.max(0, toFiniteNumber(projectileConfig.speedTilePerSec, 0) * TILE_SIZE),
    remainingLifeSec: Math.max(0.0001, toFiniteNumber(projectileConfig.lifeSec, 0.0001)),
    disappearHitWall: projectileConfig.disappearHitWall !== false,
    isRotate: projectileConfig.isRotate !== false,
    maxTargets: Math.max(1, 1 + Math.max(0, toNonNegativeInt(attack.pierceCount, 0))),
    hitEnemyIds: new Set(),
    hitboxWidth: hitbox.width,
    hitboxHeight: hitbox.height,
    effectRuntimeId: projectileEffectRuntime?.id ?? "",
    despawnOnEffectEnd: projectileEffectRuntime ? projectileEffectRuntime.loop !== true : false,
  });
}

function resolveAoeHitbox(attack, spawnX, spawnY, effects, buildEffectRuntime) {
  const aoeConfig = attack.aoe;
  if (!aoeConfig) {
    return {
      aabb: buildAabbFromCenter(spawnX, spawnY, TILE_SIZE, TILE_SIZE),
    };
  }

  let effectRuntime = null;
  if (typeof aoeConfig.spriteEffectId === "string" && aoeConfig.spriteEffectId.length > 0) {
    effectRuntime = buildEffectRuntime?.(aoeConfig.spriteEffectId, spawnX, spawnY) ?? null;
    if (effectRuntime) {
      effects.push(effectRuntime);
    }
  }

  const hitbox = resolveHitboxSizeFromEffectRuntime(effectRuntime, TILE_SIZE, aoeConfig.hitBoxPer);

  return {
    aabb: buildAabbFromCenter(spawnX, spawnY, hitbox.width, hitbox.height),
  };
}

function processAoeAttack({
  queue,
  runtime,
  weaponRuntime,
  skillPlan,
  attack,
  attackSeq,
  spawnX,
  spawnY,
  player,
  enemies,
  events,
  effects,
  buildEffectRuntime,
}) {
  const { aabb } = resolveAoeHitbox(attack, spawnX, spawnY, effects, buildEffectRuntime);

  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }

    const enemyHitbox = getEnemyCombatHitbox(enemy);
    if (!enemyHitbox || !intersectsAabb(aabb, enemyHitbox)) {
      continue;
    }

    const hitApplied = applyAttackHitToEnemy({
      enemy,
      attack,
      player,
      weaponRuntime,
      attackSeq,
      events,
      hitSeedSuffix: `${attack.skillId}::aoe::${enemy.id}`,
    });

    if (!hitApplied || attack.chainTrigger !== "on_hit") {
      continue;
    }

    enqueueNextAttack({
      queue,
      runtime,
      attackSeq,
      nextAttackStepIndex: skillPlan.attackSteps.indexOf(attack) + 1,
      weaponRuntime,
      skillPlan,
      spawnX: toFiniteNumber(enemy.x, 0) + toFiniteNumber(enemy.width, 0) / 2,
      spawnY: toFiniteNumber(enemy.y, 0) + toFiniteNumber(enemy.height, 0) / 2,
    });
  }
}

function processAttackSpawnQueue({
  queue,
  player,
  enemies,
  events,
  effects,
  buildEffectRuntime,
}) {
  let guard = 0;

  while (queue.length > 0 && guard < 2048) {
    guard += 1;
    const task = queue.shift();
    if (!task || task.type !== "attack_spawn") {
      continue;
    }

    const attack = task.skillPlan.attackSteps[task.attackStepIndex];
    if (!attack) {
      continue;
    }

    const runtime = ensureWeaponSkillRuntime(task.weaponRuntime);

    if (attack.attackKind === "projectile") {
      spawnProjectile({
        runtime,
        weaponRuntime: task.weaponRuntime,
        skillPlan: task.skillPlan,
        attack,
        attackStepIndex: task.attackStepIndex,
        attackSeq: task.attackSeq,
        spawnX: task.spawnX,
        spawnY: task.spawnY,
        player,
        enemies,
        effects,
        buildEffectRuntime,
      });
      continue;
    }

    if (attack.attackKind === "aoe") {
      processAoeAttack({
        queue,
        runtime,
        weaponRuntime: task.weaponRuntime,
        skillPlan: task.skillPlan,
        attack,
        attackSeq: task.attackSeq,
        spawnX: task.spawnX,
        spawnY: task.spawnY,
        player,
        enemies,
        events,
        effects,
        buildEffectRuntime,
      });
    }
  }
}

function updateProjectiles({
  queue,
  dt,
  dungeon,
  player,
  enemies,
  events,
  effects,
  weaponRuntime,
}) {
  const runtime = ensureWeaponSkillRuntime(weaponRuntime);
  if (!Array.isArray(runtime.projectiles) || runtime.projectiles.length <= 0) {
    return effects;
  }

  const nextProjectiles = [];
  const effectIdsToRemove = new Set();

  for (const projectile of runtime.projectiles) {
    if (!projectile) {
      continue;
    }

    let shouldDespawn =
      projectile.despawnOnEffectEnd === true &&
      typeof projectile.effectRuntimeId === "string" &&
      projectile.effectRuntimeId.length > 0 &&
      !hasEffectRuntime(effects, projectile.effectRuntimeId);

    if (shouldDespawn) {
      if (projectile.effectRuntimeId) {
        effectIdsToRemove.add(projectile.effectRuntimeId);
      }
      continue;
    }

    const speed = Math.max(0, toFiniteNumber(projectile.speedPxPerSec, 0));
    const stepDt = Math.max(0, toFiniteNumber(dt, 0));
    projectile.remainingLifeSec = Math.max(0, toFiniteNumber(projectile.remainingLifeSec, 0) - stepDt);

    projectile.x += toFiniteNumber(projectile.dirX, 0) * speed * stepDt;
    projectile.y += toFiniteNumber(projectile.dirY, 0) * speed * stepDt;

    if (projectile.effectRuntimeId) {
      if (projectile.isRotate !== false) {
        const rotationRad = calcRotationRadFromDirection(projectile.dirX, projectile.dirY);
        syncEffectPosition(effects, projectile.effectRuntimeId, projectile.x, projectile.y, rotationRad);
      } else {
        syncEffectPosition(effects, projectile.effectRuntimeId, projectile.x, projectile.y);
      }
    }

    shouldDespawn = projectile.remainingLifeSec <= 0;

    if (!shouldDespawn && projectile.disappearHitWall === true && !isPointWalkable(dungeon, projectile.x, projectile.y)) {
      shouldDespawn = true;
    }

    if (!shouldDespawn) {
      const projectileAabb = buildAabbFromCenter(
        projectile.x,
        projectile.y,
        Math.max(1, toFiniteNumber(projectile.hitboxWidth, TILE_SIZE)),
        Math.max(1, toFiniteNumber(projectile.hitboxHeight, TILE_SIZE))
      );

      for (const enemy of Array.isArray(enemies) ? enemies : []) {
        if (!enemy || enemy.isDead === true || projectile.hitEnemyIds.has(enemy.id)) {
          continue;
        }

        const enemyHitbox = getEnemyCombatHitbox(enemy);
        if (!enemyHitbox || !intersectsAabb(projectileAabb, enemyHitbox)) {
          continue;
        }

        projectile.hitEnemyIds.add(enemy.id);

        const attack = projectile.skillPlan.attackSteps[projectile.attackStepIndex];
        if (!attack) {
          continue;
        }

        const hitApplied = applyAttackHitToEnemy({
          enemy,
          attack,
          player,
          weaponRuntime: projectile.weaponRuntime,
          attackSeq: projectile.attackSeq,
          events,
          hitSeedSuffix: `${projectile.id}::${enemy.id}`,
        });

        if (hitApplied && attack.chainTrigger === "on_hit") {
          enqueueNextAttack({
            queue,
            runtime,
            attackSeq: projectile.attackSeq,
            nextAttackStepIndex: projectile.attackStepIndex + 1,
            weaponRuntime: projectile.weaponRuntime,
            skillPlan: projectile.skillPlan,
            spawnX: toFiniteNumber(enemy.x, 0) + toFiniteNumber(enemy.width, 0) / 2,
            spawnY: toFiniteNumber(enemy.y, 0) + toFiniteNumber(enemy.height, 0) / 2,
          });
        }

        if (projectile.hitEnemyIds.size >= Math.max(1, toNonNegativeInt(projectile.maxTargets, 1))) {
          shouldDespawn = true;
          break;
        }
      }
    }

    if (shouldDespawn) {
      if (projectile.effectRuntimeId) {
        effectIdsToRemove.add(projectile.effectRuntimeId);
      }
      continue;
    }

    nextProjectiles.push(projectile);
  }

  runtime.projectiles = nextProjectiles;

  return removeEffectsById(effects, effectIdsToRemove);
}

function updatePoisonDots(enemies, dt, events) {
  if (!Array.isArray(enemies) || enemies.length <= 0 || !Number.isFinite(dt) || dt <= 0) {
    return;
  }

  for (const enemy of enemies) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }

    const poison = ensurePoisonRuntime(enemy);
    if (!poison || poison.stacks <= 0) {
      if (poison) {
        poison.decayTimerSec = 0;
        poison.dotTimerSec = 0;
      }
      continue;
    }

    poison.decayTimerSec -= dt;
    while (poison.decayTimerSec <= 0 && poison.stacks > 0) {
      poison.stacks -= 1;
      if (poison.stacks > 0) {
        poison.decayTimerSec += POISON_DURATION_SEC;
      } else {
        poison.stacks = 0;
        poison.decayTimerSec = 0;
        poison.dotTimerSec = 0;
        poison.dotPerStack = 0;
        break;
      }
    }

    if (poison.stacks <= 0 || enemy.isDead === true) {
      continue;
    }

    poison.dotTimerSec += dt;
    while (poison.dotTimerSec >= 1 && poison.stacks > 0 && enemy.isDead !== true) {
      poison.dotTimerSec -= 1;
      const dotDamage = Math.max(MIN_DAMAGE, Math.round(Math.max(0, poison.dotPerStack) * poison.stacks));
      if (!applyDamageToEnemy(enemy, dotDamage)) {
        continue;
      }
      events.push(buildPoisonDotEvent(enemy, dotDamage));
    }
  }
}

function ensureChainSpawnCounterInitialized(runtime, attackSeq) {
  const key = String(Math.max(0, toNonNegativeInt(attackSeq, 0)));
  if (!Number.isFinite(runtime?.chainSpawnCountByAttackSeq?.[key])) {
    runtime.chainSpawnCountByAttackSeq[key] = 0;
  }
}

export function updateSkillChainCombat({
  dt,
  dungeon,
  player,
  enemies,
  effects,
  weapons,
  weaponStartEvents,
  weaponHitEvents,
  weaponDefinitionsById,
  skillDefinitionsById,
  buildEffectRuntime,
}) {
  const events = [];
  let nextEffects = Array.isArray(effects) ? effects.slice() : [];

  const queue = [];
  const weaponRuntimeById = new Map();
  const weaponSkillPlanById = new Map();

  for (const weaponRuntime of Array.isArray(weapons) ? weapons : []) {
    if (!weaponRuntime || typeof weaponRuntime.id !== "string") {
      continue;
    }

    const weaponDefinition = weaponDefinitionsById?.[weaponRuntime.weaponDefId] ?? null;
    const skillPlan = resolveWeaponSkillPlan({
      weaponRuntime,
      weaponDefinition,
      baseWeaponDefinition: weaponDefinitionsById?.[weaponRuntime.weaponDefId] ?? null,
      skillDefinitionsById,
    });

    weaponRuntimeById.set(weaponRuntime.id, weaponRuntime);
    weaponSkillPlanById.set(weaponRuntime.id, skillPlan);

    const runtime = ensureWeaponSkillRuntime(weaponRuntime);
    pruneChainSpawnCounters(runtime, weaponRuntime.attackSeq);
  }

  for (const startEvent of Array.isArray(weaponStartEvents) ? weaponStartEvents : []) {
    const weaponId = typeof startEvent?.weaponId === "string" ? startEvent.weaponId : "";
    if (weaponId.length <= 0) {
      continue;
    }

    const weaponRuntime = weaponRuntimeById.get(weaponId);
    const skillPlan = weaponSkillPlanById.get(weaponId);
    if (!weaponRuntime || !skillPlan || !Array.isArray(skillPlan.attackSteps) || skillPlan.attackSteps.length <= 0) {
      continue;
    }

    const entryAttack = skillPlan.attackSteps[0];
    if (!entryAttack || entryAttack.startSpawnTiming !== "start") {
      continue;
    }

    const runtime = ensureWeaponSkillRuntime(weaponRuntime);
    const attackSeq = Math.max(0, toNonNegativeInt(startEvent.attackSeq, 0));
    ensureChainSpawnCounterInitialized(runtime, attackSeq);

    queue.push({
      type: "attack_spawn",
      attackSeq,
      attackStepIndex: 0,
      weaponRuntime,
      skillPlan,
      spawnX: toFiniteNumber(startEvent.worldX, getWeaponCenter(weaponRuntime).x),
      spawnY: toFiniteNumber(startEvent.worldY, getWeaponCenter(weaponRuntime).y),
    });
  }

  const hitEntrySpawnKeys = new Set();
  for (const hitEvent of Array.isArray(weaponHitEvents) ? weaponHitEvents : []) {
    const weaponId = typeof hitEvent?.weaponId === "string" ? hitEvent.weaponId : "";
    const targetId = resolveHitEventTargetId(hitEvent);
    if (weaponId.length <= 0 || targetId.length <= 0) {
      continue;
    }

    const weaponRuntime = weaponRuntimeById.get(weaponId);
    const skillPlan = weaponSkillPlanById.get(weaponId);
    if (!weaponRuntime || !skillPlan || !Array.isArray(skillPlan.attackSteps) || skillPlan.attackSteps.length <= 0) {
      continue;
    }

    const entryAttack = skillPlan.attackSteps[0];
    if (!entryAttack || entryAttack.startSpawnTiming !== "hit") {
      continue;
    }

    const fallbackAttackSeq = Math.max(0, toNonNegativeInt(weaponRuntime.attackSeq, 0));
    const attackSeq = Math.max(0, toNonNegativeInt(hitEvent.attackSeq, fallbackAttackSeq));
    const spawnKey = `${weaponId}:${attackSeq}:${targetId}`;
    if (hitEntrySpawnKeys.has(spawnKey)) {
      continue;
    }
    hitEntrySpawnKeys.add(spawnKey);

    const runtime = ensureWeaponSkillRuntime(weaponRuntime);
    ensureChainSpawnCounterInitialized(runtime, attackSeq);

    queue.push({
      type: "attack_spawn",
      attackSeq,
      attackStepIndex: 0,
      weaponRuntime,
      skillPlan,
      spawnX: toFiniteNumber(hitEvent.worldX, getWeaponCenter(weaponRuntime).x),
      spawnY: toFiniteNumber(hitEvent.worldY, getWeaponCenter(weaponRuntime).y),
    });
  }

  processAttackSpawnQueue({
    queue,
    player,
    enemies,
    events,
    effects: nextEffects,
    buildEffectRuntime,
  });

  for (const weaponRuntime of weaponRuntimeById.values()) {
    nextEffects = updateProjectiles({
      queue,
      dt: Math.max(0, toFiniteNumber(dt, 0)),
      dungeon,
      player,
      enemies,
      events,
      effects: nextEffects,
      weaponRuntime,
    });
  }

  processAttackSpawnQueue({
    queue,
    player,
    enemies,
    events,
    effects: nextEffects,
    buildEffectRuntime,
  });

  updatePoisonDots(enemies, Math.max(0, toFiniteNumber(dt, 0)), events);

  return {
    events,
    effects: nextEffects,
  };
}

function getPlayerSkillTargetId(player) {
  if (typeof player?.id === "string" && player.id.length > 0) {
    return player.id;
  }
  return "player";
}

function ensurePlayerPoisonRuntime(player) {
  if (!player || typeof player !== "object") {
    return null;
  }

  if (!player.ailments || typeof player.ailments !== "object") {
    player.ailments = {};
  }

  if (!player.ailments.poison || typeof player.ailments.poison !== "object") {
    player.ailments.poison = {
      stacks: 0,
      applyRemainder: 0,
      decayTimerSec: 0,
      dotTimerSec: 0,
      dotPerStack: 0,
    };
  }

  const poison = player.ailments.poison;
  poison.stacks = Math.max(0, toNonNegativeInt(poison.stacks, 0));
  poison.applyRemainder = Math.max(0, toFiniteNumber(poison.applyRemainder, 0));
  poison.decayTimerSec = Math.max(0, toFiniteNumber(poison.decayTimerSec, 0));
  poison.dotTimerSec = Math.max(0, toFiniteNumber(poison.dotTimerSec, 0));
  poison.dotPerStack = Math.max(0, toFiniteNumber(poison.dotPerStack, 0));

  return poison;
}

function applyPoisonOnHitToPlayer(player, ailment, attacker, baseHitNonCrit) {
  if (!player || ailment?.ailmentId !== "poison") {
    return;
  }

  const poison = ensurePlayerPoisonRuntime(player);
  if (!poison) {
    return;
  }

  const applyBase = Math.max(0, toFiniteNumber(ailment.applyBase, 0));
  const applyMult = calcPoisonApplyMult(ailment.plus);
  const ailmentTakenMult = Math.max(0, toFiniteNumber(player.ailmentTakenMult, 1));
  const apply = applyBase * applyMult * ailmentTakenMult;

  poison.applyRemainder += apply;
  const addStacksRaw = Math.floor(poison.applyRemainder);
  const addStacks = Math.max(0, addStacksRaw);
  poison.applyRemainder = Math.max(0, poison.applyRemainder - addStacks);

  if (addStacks <= 0) {
    return;
  }

  const previousStacks = poison.stacks;
  const nextStacks = clamp(previousStacks + addStacks, 0, POISON_MAX_STACKS);
  const addedStacks = Math.max(0, nextStacks - previousStacks);
  if (addedStacks <= 0) {
    return;
  }

  poison.stacks = nextStacks;
  poison.decayTimerSec = POISON_DURATION_SEC;

  const arc = Math.max(0, toFiniteNumber(attacker?.statTotals?.arc, 0));
  const addedDotPerStack = Math.max(0, baseHitNonCrit) * POISON_DOT_COEF * (1 + arc * 0);
  const weightedTotal = poison.dotPerStack * previousStacks + addedDotPerStack * addedStacks;
  poison.dotPerStack = weightedTotal / nextStacks;
}

function applyDamageToPlayer(player, damage, applyPlayerHpDamage = true) {
  if (!player || isPlayerDead(player)) {
    return false;
  }

  const resolvedDamage = Math.max(0, Math.round(toFiniteNumber(damage, 0)));
  if (resolvedDamage <= 0) {
    return false;
  }

  const flashDurationSec = Math.max(0.0001, toFiniteNumber(player.hitFlashDurationSec, 0.12));
  player.hitFlashTimerSec = flashDurationSec;

  if (applyPlayerHpDamage !== false) {
    player.hp = toFiniteNumber(player.hp, toFiniteNumber(player.maxHp, 100)) - resolvedDamage;
    if (Number.isFinite(player.maxHp)) {
      player.hp = clamp(player.hp, 0, player.maxHp);
    } else {
      player.hp = Math.max(0, player.hp);
    }
  }

  return true;
}

function buildSkillDamageEventToPlayer({
  weaponRuntime,
  player,
  damage,
  isCritical,
  skillId,
}) {
  const playerHitbox = getPlayerCombatHitbox(player);
  const centerX = playerHitbox ? playerHitbox.x + playerHitbox.width / 2 : toFiniteNumber(player?.x, 0);
  const centerY = playerHitbox ? playerHitbox.y + playerHitbox.height / 2 : toFiniteNumber(player?.y, 0);
  return {
    kind: "damage",
    targetType: "player",
    targetId: getPlayerSkillTargetId(player),
    sourceType: "skill",
    skillId,
    weaponId: weaponRuntime?.id ?? "",
    weaponDefId: weaponRuntime?.weaponDefId ?? "",
    damage: Math.max(0, Math.round(toFiniteNumber(damage, 0))),
    isCritical: isCritical === true,
    worldX: centerX,
    worldY: centerY,
    suppressWeaponHitEffect: true,
  };
}

function buildPoisonDotEventToPlayer(player, damage) {
  const playerHitbox = getPlayerCombatHitbox(player);
  const centerX = playerHitbox ? playerHitbox.x + playerHitbox.width / 2 : toFiniteNumber(player?.x, 0);
  const centerY = playerHitbox ? playerHitbox.y + playerHitbox.height / 2 : toFiniteNumber(player?.y, 0);
  return {
    kind: "damage",
    targetType: "player",
    targetId: getPlayerSkillTargetId(player),
    sourceType: "ailment",
    ailmentId: "poison",
    weaponId: "",
    weaponDefId: "",
    damage: Math.max(0, Math.round(toFiniteNumber(damage, 0))),
    isCritical: false,
    worldX: centerX,
    worldY: centerY,
    suppressWeaponHitEffect: true,
  };
}

function applyAttackHitToPlayer({
  player,
  attack,
  attackerEnemy,
  weaponRuntime,
  attackSeq,
  events,
  hitSeedSuffix,
  applyPlayerHpDamage = true,
}) {
  const playerTargetId = getPlayerSkillTargetId(player);
  const roll = resolveAttackRoll(
    attackerEnemy,
    weaponRuntime,
    attack,
    playerTargetId,
    attackSeq,
    hitSeedSuffix
  );
  const totalDamage = Math.max(MIN_DAMAGE, roll.damagePerHit * Math.max(1, toNonNegativeInt(attack.hitNum, 1)));

  if (!applyDamageToPlayer(player, totalDamage, applyPlayerHpDamage)) {
    return false;
  }

  events.push(
    buildSkillDamageEventToPlayer({
      weaponRuntime,
      player,
      damage: totalDamage,
      isCritical: roll.isCritical,
      skillId: attack.skillId,
    })
  );

  if (applyPlayerHpDamage !== false && Array.isArray(attack.applyAilments) && attack.applyAilments.length > 0) {
    for (const ailment of attack.applyAilments) {
      applyPoisonOnHitToPlayer(player, ailment, attackerEnemy, roll.baseHitNonCrit);
    }
  }

  return true;
}

function resolveProjectileDirectionToPlayer(projectileConfig, enemy, player, spawnX, spawnY) {
  if (projectileConfig.moveDirection === "to_target" && player && !isPlayerDead(player)) {
    const playerCenter = getPlayerCenter(player);
    return normalizeVector(playerCenter.x - spawnX, playerCenter.y - spawnY, 1, 0);
  }

  const facing = getFacingVector(enemy?.facing);
  return normalizeVector(facing.x, facing.y, 1, 0);
}

function spawnEnemySkillProjectile({
  runtime,
  weaponRuntime,
  skillPlan,
  attack,
  attackStepIndex,
  attackSeq,
  spawnX,
  spawnY,
  enemy,
  player,
  effects,
  buildEffectRuntime,
  applyPlayerHpDamage = true,
}) {
  const projectileConfig = attack.projectile;
  if (!projectileConfig) {
    return;
  }

  const direction = resolveProjectileDirectionToPlayer(projectileConfig, enemy, player, spawnX, spawnY);
  const projectileId = `${weaponRuntime.id}-skill-projectile-${runtime.projectileSeq}`;
  runtime.projectileSeq += 1;

  let projectileEffectRuntime = null;
  if (typeof projectileConfig.spriteEffectId === "string" && projectileConfig.spriteEffectId.length > 0) {
    const projectileRotationRad =
      projectileConfig.isRotate !== false ? calcRotationRadFromDirection(direction.x, direction.y) : null;
    projectileEffectRuntime = buildEffectRuntime?.(projectileConfig.spriteEffectId, spawnX, spawnY) ?? null;
    if (projectileEffectRuntime) {
      if (Number.isFinite(projectileRotationRad)) {
        projectileEffectRuntime.rotationRad = projectileRotationRad;
      }
      effects.push(projectileEffectRuntime);
    }
  }

  const hitbox = resolveHitboxSizeFromEffectRuntime(projectileEffectRuntime, TILE_SIZE, projectileConfig.hitBoxPer);
  runtime.projectiles.push({
    id: projectileId,
    attackSeq,
    attackStepIndex,
    weaponRuntime,
    skillPlan,
    enemy,
    player,
    x: spawnX,
    y: spawnY,
    dirX: direction.x,
    dirY: direction.y,
    speedPxPerSec: Math.max(0, toFiniteNumber(projectileConfig.speedTilePerSec, 0) * TILE_SIZE),
    remainingLifeSec: Math.max(0.0001, toFiniteNumber(projectileConfig.lifeSec, 0.0001)),
    disappearHitWall: projectileConfig.disappearHitWall !== false,
    isRotate: projectileConfig.isRotate !== false,
    maxTargets: Math.max(1, 1 + Math.max(0, toNonNegativeInt(attack.pierceCount, 0))),
    hitTargetCount: 0,
    hitPlayer: false,
    hitboxWidth: hitbox.width,
    hitboxHeight: hitbox.height,
    effectRuntimeId: projectileEffectRuntime?.id ?? "",
    despawnOnEffectEnd: projectileEffectRuntime ? projectileEffectRuntime.loop !== true : false,
    applyPlayerHpDamage: applyPlayerHpDamage !== false,
  });
}

function processEnemyAoeAttack({
  queue,
  runtime,
  weaponRuntime,
  skillPlan,
  attack,
  attackSeq,
  spawnX,
  spawnY,
  enemy,
  player,
  events,
  effects,
  buildEffectRuntime,
  applyPlayerHpDamage = true,
}) {
  const { aabb } = resolveAoeHitbox(attack, spawnX, spawnY, effects, buildEffectRuntime);
  const playerHitbox = getPlayerCombatHitbox(player);
  if (!playerHitbox || isPlayerDead(player) || !intersectsAabb(aabb, playerHitbox)) {
    return;
  }

  const hitApplied = applyAttackHitToPlayer({
    player,
    attack,
    attackerEnemy: enemy,
    weaponRuntime,
    attackSeq,
    events,
    hitSeedSuffix: `${attack.skillId}::aoe::${getPlayerSkillTargetId(player)}`,
    applyPlayerHpDamage,
  });

  if (!hitApplied || attack.chainTrigger !== "on_hit") {
    return;
  }

  enqueueNextAttack({
    queue,
    runtime,
    attackSeq,
    nextAttackStepIndex: skillPlan.attackSteps.indexOf(attack) + 1,
    weaponRuntime,
    skillPlan,
    spawnX: playerHitbox.x + playerHitbox.width / 2,
    spawnY: playerHitbox.y + playerHitbox.height / 2,
    extraTaskProps: {
      enemy,
      player,
      applyPlayerHpDamage,
    },
  });
}

function processEnemyAttackSpawnQueue({
  queue,
  events,
  effects,
  buildEffectRuntime,
}) {
  let guard = 0;

  while (queue.length > 0 && guard < 2048) {
    guard += 1;
    const task = queue.shift();
    if (!task || task.type !== "attack_spawn") {
      continue;
    }

    const attack = task.skillPlan.attackSteps[task.attackStepIndex];
    if (!attack) {
      continue;
    }

    const runtime = ensureWeaponSkillRuntime(task.weaponRuntime);
    if (attack.attackKind === "projectile") {
      spawnEnemySkillProjectile({
        runtime,
        weaponRuntime: task.weaponRuntime,
        skillPlan: task.skillPlan,
        attack,
        attackStepIndex: task.attackStepIndex,
        attackSeq: task.attackSeq,
        spawnX: task.spawnX,
        spawnY: task.spawnY,
        enemy: task.enemy,
        player: task.player,
        effects,
        buildEffectRuntime,
        applyPlayerHpDamage: task.applyPlayerHpDamage,
      });
      continue;
    }

    if (attack.attackKind === "aoe") {
      processEnemyAoeAttack({
        queue,
        runtime,
        weaponRuntime: task.weaponRuntime,
        skillPlan: task.skillPlan,
        attack,
        attackSeq: task.attackSeq,
        spawnX: task.spawnX,
        spawnY: task.spawnY,
        enemy: task.enemy,
        player: task.player,
        events,
        effects,
        buildEffectRuntime,
        applyPlayerHpDamage: task.applyPlayerHpDamage,
      });
    }
  }
}

function updateEnemySkillProjectiles({
  queue,
  dt,
  dungeon,
  player,
  events,
  effects,
  weaponRuntime,
  enemy,
  applyPlayerHpDamage = true,
}) {
  const runtime = ensureWeaponSkillRuntime(weaponRuntime);
  if (!Array.isArray(runtime.projectiles) || runtime.projectiles.length <= 0) {
    return effects;
  }

  const nextProjectiles = [];
  const effectIdsToRemove = new Set();

  for (const projectile of runtime.projectiles) {
    if (!projectile) {
      continue;
    }

    let shouldDespawn =
      projectile.despawnOnEffectEnd === true &&
      typeof projectile.effectRuntimeId === "string" &&
      projectile.effectRuntimeId.length > 0 &&
      !hasEffectRuntime(effects, projectile.effectRuntimeId);

    if (shouldDespawn) {
      if (projectile.effectRuntimeId) {
        effectIdsToRemove.add(projectile.effectRuntimeId);
      }
      continue;
    }

    const speed = Math.max(0, toFiniteNumber(projectile.speedPxPerSec, 0));
    const stepDt = Math.max(0, toFiniteNumber(dt, 0));
    projectile.remainingLifeSec = Math.max(0, toFiniteNumber(projectile.remainingLifeSec, 0) - stepDt);
    projectile.x += toFiniteNumber(projectile.dirX, 0) * speed * stepDt;
    projectile.y += toFiniteNumber(projectile.dirY, 0) * speed * stepDt;

    if (projectile.effectRuntimeId) {
      if (projectile.isRotate !== false) {
        const rotationRad = calcRotationRadFromDirection(projectile.dirX, projectile.dirY);
        syncEffectPosition(effects, projectile.effectRuntimeId, projectile.x, projectile.y, rotationRad);
      } else {
        syncEffectPosition(effects, projectile.effectRuntimeId, projectile.x, projectile.y);
      }
    }

    shouldDespawn = projectile.remainingLifeSec <= 0;
    if (!shouldDespawn && projectile.disappearHitWall === true && !isPointWalkable(dungeon, projectile.x, projectile.y)) {
      shouldDespawn = true;
    }

    if (!shouldDespawn && !projectile.hitPlayer && player && !isPlayerDead(player)) {
      const projectileAabb = buildAabbFromCenter(
        projectile.x,
        projectile.y,
        Math.max(1, toFiniteNumber(projectile.hitboxWidth, TILE_SIZE)),
        Math.max(1, toFiniteNumber(projectile.hitboxHeight, TILE_SIZE))
      );
      const playerHitbox = getPlayerCombatHitbox(player);
      if (playerHitbox && intersectsAabb(projectileAabb, playerHitbox)) {
        projectile.hitPlayer = true;
        projectile.hitTargetCount = Math.max(0, toNonNegativeInt(projectile.hitTargetCount, 0)) + 1;

        const attack = projectile.skillPlan.attackSteps[projectile.attackStepIndex];
        if (attack) {
          const hitApplied = applyAttackHitToPlayer({
            player,
            attack,
            attackerEnemy: projectile.enemy ?? enemy,
            weaponRuntime: projectile.weaponRuntime,
            attackSeq: projectile.attackSeq,
            events,
            hitSeedSuffix: `${projectile.id}::${getPlayerSkillTargetId(player)}`,
            applyPlayerHpDamage: projectile.applyPlayerHpDamage !== false && applyPlayerHpDamage !== false,
          });

          if (hitApplied && attack.chainTrigger === "on_hit") {
            enqueueNextAttack({
              queue,
              runtime,
              attackSeq: projectile.attackSeq,
              nextAttackStepIndex: projectile.attackStepIndex + 1,
              weaponRuntime: projectile.weaponRuntime,
              skillPlan: projectile.skillPlan,
              spawnX: playerHitbox.x + playerHitbox.width / 2,
              spawnY: playerHitbox.y + playerHitbox.height / 2,
              extraTaskProps: {
                enemy: projectile.enemy ?? enemy,
                player,
                applyPlayerHpDamage: projectile.applyPlayerHpDamage !== false && applyPlayerHpDamage !== false,
              },
            });
          }
        }

        if (projectile.hitTargetCount >= Math.max(1, toNonNegativeInt(projectile.maxTargets, 1))) {
          shouldDespawn = true;
        }
      }
    }

    if (shouldDespawn) {
      if (projectile.effectRuntimeId) {
        effectIdsToRemove.add(projectile.effectRuntimeId);
      }
      continue;
    }

    nextProjectiles.push(projectile);
  }

  runtime.projectiles = nextProjectiles;
  return removeEffectsById(effects, effectIdsToRemove);
}

function updatePoisonDotsOnPlayer(player, dt, events, applyPlayerHpDamage = true) {
  if (!player || !Number.isFinite(dt) || dt <= 0 || applyPlayerHpDamage === false) {
    return;
  }

  const poison = ensurePlayerPoisonRuntime(player);
  if (!poison || poison.stacks <= 0 || isPlayerDead(player)) {
    if (poison) {
      poison.decayTimerSec = 0;
      poison.dotTimerSec = 0;
    }
    return;
  }

  poison.decayTimerSec -= dt;
  while (poison.decayTimerSec <= 0 && poison.stacks > 0) {
    poison.stacks -= 1;
    if (poison.stacks > 0) {
      poison.decayTimerSec += POISON_DURATION_SEC;
    } else {
      poison.stacks = 0;
      poison.decayTimerSec = 0;
      poison.dotTimerSec = 0;
      poison.dotPerStack = 0;
      break;
    }
  }

  if (poison.stacks <= 0 || isPlayerDead(player)) {
    return;
  }

  poison.dotTimerSec += dt;
  while (poison.dotTimerSec >= 1 && poison.stacks > 0 && !isPlayerDead(player)) {
    poison.dotTimerSec -= 1;
    const dotDamage = Math.max(MIN_DAMAGE, Math.round(Math.max(0, poison.dotPerStack) * poison.stacks));
    if (!applyDamageToPlayer(player, dotDamage, true)) {
      continue;
    }
    events.push(buildPoisonDotEventToPlayer(player, dotDamage));
  }
}

function hasEnemySkillProjectiles(runtime) {
  return Array.isArray(runtime?.projectiles) && runtime.projectiles.length > 0;
}

function shouldCollectEnemyWeaponSkillContext(enemy, weaponRuntime, runtime) {
  if (enemy?.attack?.isBoss !== true) {
    return true;
  }

  const activeActionWeaponId =
    typeof enemy.attack.activeActionWeaponId === "string" ? enemy.attack.activeActionWeaponId : "";
  if (activeActionWeaponId.length > 0 && weaponRuntime?.id === activeActionWeaponId) {
    return true;
  }

  return hasEnemySkillProjectiles(runtime);
}

function collectEnemyWeaponSkillContexts(enemies, player, weaponDefinitionsById, skillDefinitionsById, applyPlayerHpDamage) {
  const contextsByWeaponId = new Map();

  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }

    const attackSeq = Math.max(0, toNonNegativeInt(enemy?.attack?.attackCycle, 0));
    for (const weaponRuntime of Array.isArray(enemy?.attack?.weapons) ? enemy.attack.weapons : []) {
      if (!weaponRuntime || typeof weaponRuntime.id !== "string") {
        continue;
      }

      const runtime = ensureWeaponSkillRuntime(weaponRuntime);
      if (!shouldCollectEnemyWeaponSkillContext(enemy, weaponRuntime, runtime)) {
        continue;
      }

      const weaponDefinition = weaponDefinitionsById?.[weaponRuntime.weaponDefId] ?? null;
      const skillPlan = resolveWeaponSkillPlan({
        weaponRuntime,
        weaponDefinition,
        baseWeaponDefinition: weaponDefinitionsById?.[weaponRuntime.weaponDefId] ?? null,
        skillDefinitionsById,
      });

      pruneChainSpawnCounters(runtime, attackSeq);

      contextsByWeaponId.set(weaponRuntime.id, {
        weaponRuntime,
        enemy,
        player,
        skillPlan,
        attackSeq,
        applyPlayerHpDamage: applyPlayerHpDamage !== false,
      });
    }
  }

  return contextsByWeaponId;
}

export function updateEnemySkillChainCombat({
  dt,
  dungeon,
  player,
  enemies,
  effects,
  weaponStartEvents,
  weaponHitEvents,
  weaponDefinitionsById,
  skillDefinitionsById,
  buildEffectRuntime,
  applyPlayerHpDamage = true,
}) {
  const events = [];
  let nextEffects = Array.isArray(effects) ? effects.slice() : [];
  const queue = [];

  const contextsByWeaponId = collectEnemyWeaponSkillContexts(
    enemies,
    player,
    weaponDefinitionsById,
    skillDefinitionsById,
    applyPlayerHpDamage
  );

  for (const startEvent of Array.isArray(weaponStartEvents) ? weaponStartEvents : []) {
    const weaponId = typeof startEvent?.weaponId === "string" ? startEvent.weaponId : "";
    if (weaponId.length <= 0) {
      continue;
    }

    const context = contextsByWeaponId.get(weaponId);
    if (!context || !Array.isArray(context.skillPlan.attackSteps) || context.skillPlan.attackSteps.length <= 0) {
      continue;
    }

    const entryAttack = context.skillPlan.attackSteps[0];
    if (!entryAttack || entryAttack.startSpawnTiming !== "start") {
      continue;
    }

    const runtime = ensureWeaponSkillRuntime(context.weaponRuntime);
    const fallbackAttackSeq = Math.max(0, toNonNegativeInt(context.attackSeq, 0));
    const attackSeq = Math.max(0, toNonNegativeInt(startEvent.attackSeq, fallbackAttackSeq));
    ensureChainSpawnCounterInitialized(runtime, attackSeq);
    const spawnPoint = resolveEnemyEntryAttackSpawnPoint({
      entryAttack,
      enemy: context.enemy,
      player: context.player,
      weaponRuntime: context.weaponRuntime,
      eventWorldX: startEvent.worldX,
      eventWorldY: startEvent.worldY,
    });

    queue.push({
      type: "attack_spawn",
      attackSeq,
      attackStepIndex: 0,
      weaponRuntime: context.weaponRuntime,
      skillPlan: context.skillPlan,
      enemy: context.enemy,
      player: context.player,
      applyPlayerHpDamage: context.applyPlayerHpDamage,
      spawnX: spawnPoint.x,
      spawnY: spawnPoint.y,
    });
  }

  const hitEntrySpawnKeys = new Set();
  for (const hitEvent of Array.isArray(weaponHitEvents) ? weaponHitEvents : []) {
    const weaponId = typeof hitEvent?.weaponId === "string" ? hitEvent.weaponId : "";
    const targetId = resolveHitEventTargetId(hitEvent);
    if (weaponId.length <= 0 || targetId.length <= 0) {
      continue;
    }

    const context = contextsByWeaponId.get(weaponId);
    if (!context || !Array.isArray(context.skillPlan.attackSteps) || context.skillPlan.attackSteps.length <= 0) {
      continue;
    }

    const entryAttack = context.skillPlan.attackSteps[0];
    if (!entryAttack || entryAttack.startSpawnTiming !== "hit") {
      continue;
    }

    const fallbackAttackSeq = Math.max(0, toNonNegativeInt(context.attackSeq, 0));
    const attackSeq = Math.max(0, toNonNegativeInt(hitEvent.attackSeq, fallbackAttackSeq));
    const spawnKey = `${weaponId}:${attackSeq}:${targetId}`;
    if (hitEntrySpawnKeys.has(spawnKey)) {
      continue;
    }
    hitEntrySpawnKeys.add(spawnKey);

    const runtime = ensureWeaponSkillRuntime(context.weaponRuntime);
    ensureChainSpawnCounterInitialized(runtime, attackSeq);
    const spawnPoint = resolveEnemyEntryAttackSpawnPoint({
      entryAttack,
      enemy: context.enemy,
      player: context.player,
      weaponRuntime: context.weaponRuntime,
      eventWorldX: hitEvent.worldX,
      eventWorldY: hitEvent.worldY,
    });

    queue.push({
      type: "attack_spawn",
      attackSeq,
      attackStepIndex: 0,
      weaponRuntime: context.weaponRuntime,
      skillPlan: context.skillPlan,
      enemy: context.enemy,
      player: context.player,
      applyPlayerHpDamage: context.applyPlayerHpDamage,
      spawnX: spawnPoint.x,
      spawnY: spawnPoint.y,
    });
  }

  processEnemyAttackSpawnQueue({
    queue,
    events,
    effects: nextEffects,
    buildEffectRuntime,
  });

  for (const context of contextsByWeaponId.values()) {
    nextEffects = updateEnemySkillProjectiles({
      queue,
      dt: Math.max(0, toFiniteNumber(dt, 0)),
      dungeon,
      player,
      events,
      effects: nextEffects,
      weaponRuntime: context.weaponRuntime,
      enemy: context.enemy,
      applyPlayerHpDamage: context.applyPlayerHpDamage,
    });
  }

  processEnemyAttackSpawnQueue({
    queue,
    events,
    effects: nextEffects,
    buildEffectRuntime,
  });

  updatePoisonDotsOnPlayer(
    player,
    Math.max(0, toFiniteNumber(dt, 0)),
    events,
    applyPlayerHpDamage
  );

  return {
    events,
    effects: nextEffects,
  };
}
