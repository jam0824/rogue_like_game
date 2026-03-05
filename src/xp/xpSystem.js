/**
 * XP system utilities
 * Based on ステータス仕様_v1_4_3.md section 3.1.1
 */

const BASE_XP_BY_RANK = {
  normal: 5,
  elite: 18,
  boss: 220,
};

export function calcFloorMult(floor) {
  const f = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
  return 1 + 0.02 * (f - 1);
}

/**
 * Calculate XP gained from defeating an enemy.
 * Returns 0 for summoned enemies (tags includes "summoned").
 */
export function calcEnemyXp(rank, floor, tags) {
  if (Array.isArray(tags) && tags.includes("summoned")) {
    return 0;
  }
  const normalizedRank = typeof rank === "string" ? rank.toLowerCase() : "normal";
  const baseXp = BASE_XP_BY_RANK[normalizedRank] ?? BASE_XP_BY_RANK.normal;
  return Math.round(baseXp * calcFloorMult(floor));
}

/**
 * Calculate room clear bonus XP (20% of total enemy XP in room).
 * @param {number[]} enemyXpValues - Array of individual enemy XP values for the room
 */
export function calcRoomClearXp(enemyXpValues) {
  const total = Array.isArray(enemyXpValues)
    ? enemyXpValues.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0)
    : 0;
  return Math.round(total * 0.2);
}

/**
 * Calculate floor clear XP awarded when descending stairs.
 */
export function calcFloorClearXp(floor) {
  return Math.round(30 * calcFloorMult(floor));
}

/**
 * Calculate XP required to level up from level L to L+1.
 * XP_to_next(L) = round(20 + 5*L + 2*L^2)
 */
export function calcXpToNextLevel(level) {
  const L = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return Math.round(20 + 5 * L + 2 * L * L);
}

/**
 * Apply XP gain to playerState.run.
 * Increments run_level and reduces xp as needed.
 * Returns the number of levels gained.
 */
export function applyXpGain(playerRunState, xpGain) {
  if (!playerRunState || !Number.isFinite(xpGain) || xpGain <= 0) {
    return 0;
  }
  const gain = Math.floor(Math.max(0, xpGain));
  playerRunState.xp = Math.max(0, (Number.isFinite(playerRunState.xp) ? playerRunState.xp : 0)) + gain;

  let levelsGained = 0;
  for (;;) {
    const currentLevel = Math.max(1, Number.isFinite(playerRunState.run_level) ? playerRunState.run_level : 1);
    const xpNeeded = calcXpToNextLevel(currentLevel);
    if (playerRunState.xp < xpNeeded) {
      break;
    }
    playerRunState.xp -= xpNeeded;
    playerRunState.run_level = currentLevel + 1;
    levelsGained += 1;
  }
  return levelsGained;
}
