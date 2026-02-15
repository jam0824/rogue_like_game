export const DEFAULT_HIT_FLASH_COLOR = "#ffffff";
export const POISON_HIT_FLASH_COLOR = "#63ff63";

function resolveHexColor(value, fallback) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : fallback;
}

function isDamageEvent(event) {
  return event?.kind === "damage";
}

function isPoisonDamageEvent(event) {
  return isDamageEvent(event) && event?.ailmentId === "poison";
}

function applyEnemyHitFlashColor(enemyById, enemyId, color) {
  if (typeof enemyId !== "string" || enemyId.length <= 0) {
    return;
  }

  const enemy = enemyById.get(enemyId);
  if (!enemy) {
    return;
  }

  enemy.hitFlashColor = color;
}

export function normalizeHitFlashColor(color) {
  return resolveHexColor(color, DEFAULT_HIT_FLASH_COLOR);
}

export function applyHitFlashColorsFromDamageEvents({ events, player, enemies }) {
  if (!Array.isArray(events) || events.length <= 0) {
    return;
  }

  const enemyById = new Map();
  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || typeof enemy.id !== "string") {
      continue;
    }
    enemyById.set(enemy.id, enemy);
  }

  let playerHasDamage = false;
  let playerHasPoisonDamage = false;
  const enemyDamagedIds = new Set();
  const enemyPoisonDamagedIds = new Set();

  for (const event of events) {
    if (!isDamageEvent(event)) {
      continue;
    }

    if (event.targetType === "player") {
      playerHasDamage = true;
      if (isPoisonDamageEvent(event)) {
        playerHasPoisonDamage = true;
      }
      continue;
    }

    if (event.targetType !== "enemy") {
      continue;
    }

    if (typeof event.enemyId !== "string" || event.enemyId.length <= 0) {
      continue;
    }

    enemyDamagedIds.add(event.enemyId);
    if (isPoisonDamageEvent(event)) {
      enemyPoisonDamagedIds.add(event.enemyId);
    }
  }

  for (const enemyId of enemyDamagedIds) {
    const color = enemyPoisonDamagedIds.has(enemyId) ? POISON_HIT_FLASH_COLOR : DEFAULT_HIT_FLASH_COLOR;
    applyEnemyHitFlashColor(enemyById, enemyId, color);
  }

  if (!player || !playerHasDamage) {
    return;
  }

  player.hitFlashColor = playerHasPoisonDamage ? POISON_HIT_FLASH_COLOR : DEFAULT_HIT_FLASH_COLOR;
}
