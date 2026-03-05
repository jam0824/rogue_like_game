const ENEMY_AI_PROFILE_DB_FALLBACK_FILE_NAMES = [
  "ai_profile_chaser_v1.json",
  "ai_profile_boss_ogre_v1.json",
  "ai_profile_swarm_v1.json",
];

const REQUIRED_KEYS = [
  "id",
  "role",
  "weapon_aim_mode",
  "weapon_visibility_mode",
];
const REQUIRED_KEYS_NON_BOSS = ["attack_windup_sec", "recover_sec"];
const REQUIRED_KEYS_BOSS = ["phases", "action_priority", "actions"];

const ALLOWED_WEAPON_AIM_MODES = new Set(["to_target", "move_dir", "none"]);
const ALLOWED_WEAPON_VISIBILITY_MODES = new Set(["burst", "always"]);
const ALLOWED_BOSS_WHEN_TOKENS = new Set([
  "cooldown_ready",
  "minion_count_lt",
  "target_distance_gte",
  "target_distance_lte",
  "always",
]);

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toNonNegativeNumber(value, fallback = 0) {
  return Math.max(0, toNumber(value, fallback));
}

function toNonNegativeInt(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return Math.max(0, Math.floor(fallback));
  }
  return Math.max(0, Math.floor(Number(value)));
}

function assertHasRequiredKeys(rawProfile, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawProfile)) {
      throw new Error(`Enemy AI profile DB ${fileName} is missing required key: ${key}`);
    }
  }

  const required = rawProfile.role === "boss" ? REQUIRED_KEYS_BOSS : REQUIRED_KEYS_NON_BOSS;
  for (const key of required) {
    if (!(key in rawProfile)) {
      throw new Error(`Enemy AI profile DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function assertCommonProfileShape(rawProfile, fileName) {
  if (typeof rawProfile.id !== "string" || rawProfile.id.length === 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid id: ${rawProfile.id}`);
  }

  if (typeof rawProfile.role !== "string" || rawProfile.role.length === 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid role: ${rawProfile.role}`);
  }

  if (
    typeof rawProfile.weapon_aim_mode !== "string" ||
    !ALLOWED_WEAPON_AIM_MODES.has(rawProfile.weapon_aim_mode)
  ) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid weapon_aim_mode: ${rawProfile.weapon_aim_mode}`
    );
  }

  if (
    typeof rawProfile.weapon_visibility_mode !== "string" ||
    !ALLOWED_WEAPON_VISIBILITY_MODES.has(rawProfile.weapon_visibility_mode)
  ) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid weapon_visibility_mode: ${rawProfile.weapon_visibility_mode}`
    );
  }

  if (
    rawProfile.weapon_attack_cycles !== undefined &&
    (!Number.isFinite(rawProfile.weapon_attack_cycles) || rawProfile.weapon_attack_cycles <= 0)
  ) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid weapon_attack_cycles: ${rawProfile.weapon_attack_cycles}`
    );
  }

  if (
    rawProfile.weapon_active_range_tiles !== undefined &&
    (!Number.isFinite(rawProfile.weapon_active_range_tiles) || rawProfile.weapon_active_range_tiles < 0)
  ) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid weapon_active_range_tiles: ${rawProfile.weapon_active_range_tiles}`
    );
  }

  if (
    rawProfile.weapon_cooldown_mul !== undefined &&
    (!Number.isFinite(rawProfile.weapon_cooldown_mul) || rawProfile.weapon_cooldown_mul <= 0)
  ) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid weapon_cooldown_mul: ${rawProfile.weapon_cooldown_mul}`
    );
  }

  if (rawProfile.los_required !== undefined && typeof rawProfile.los_required !== "boolean") {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid los_required: ${rawProfile.los_required}`);
  }
}

function assertNonBossProfileShape(rawProfile, fileName) {
  if (!Number.isFinite(rawProfile.attack_windup_sec) || rawProfile.attack_windup_sec < 0) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid attack_windup_sec: ${rawProfile.attack_windup_sec}`
    );
  }

  if (!Number.isFinite(rawProfile.recover_sec) || rawProfile.recover_sec < 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid recover_sec: ${rawProfile.recover_sec}`);
  }

  if (
    rawProfile.preferred_range_tiles !== undefined &&
    (!Number.isFinite(rawProfile.preferred_range_tiles) || rawProfile.preferred_range_tiles < 0)
  ) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid preferred_range_tiles: ${rawProfile.preferred_range_tiles}`
    );
  }

  if (
    rawProfile.engage_range_tiles !== undefined &&
    (!Number.isFinite(rawProfile.engage_range_tiles) || rawProfile.engage_range_tiles < 0)
  ) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid engage_range_tiles: ${rawProfile.engage_range_tiles}`
    );
  }

  if (
    rawProfile.retreat_range_tiles !== undefined &&
    (!Number.isFinite(rawProfile.retreat_range_tiles) || rawProfile.retreat_range_tiles < 0)
  ) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid retreat_range_tiles: ${rawProfile.retreat_range_tiles}`
    );
  }
}

function validateWhenCondition(when, fileName, action) {
  if (typeof when !== "string" || when.trim().length <= 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid when condition for action "${action}"`);
  }

  const tokens = when
    .split("&&")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length <= 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid when condition for action "${action}"`);
  }

  for (const token of tokens) {
    if (!ALLOWED_BOSS_WHEN_TOKENS.has(token)) {
      throw new Error(
        `Enemy AI profile DB ${fileName} has invalid when token "${token}" for action "${action}"`
      );
    }
  }

  if (tokens.includes("always") && tokens.length > 1) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid when condition for action "${action}"`);
  }
}

function normalizeBossPhases(rawPhases, fileName) {
  if (!Array.isArray(rawPhases) || rawPhases.length <= 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid phases: must be a non-empty array`);
  }

  return rawPhases.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Enemy AI profile DB ${fileName} has invalid phases[${index}]`);
    }

    if (!Number.isFinite(entry.phase) || entry.phase <= 0) {
      throw new Error(`Enemy AI profile DB ${fileName} has invalid phases[${index}].phase`);
    }

    if (!Number.isFinite(entry.hp_ratio_min) || entry.hp_ratio_min < 0 || entry.hp_ratio_min > 1.01) {
      throw new Error(`Enemy AI profile DB ${fileName} has invalid phases[${index}].hp_ratio_min`);
    }

    if (
      !Number.isFinite(entry.hp_ratio_max) ||
      entry.hp_ratio_max <= entry.hp_ratio_min ||
      entry.hp_ratio_max > 1.01
    ) {
      throw new Error(`Enemy AI profile DB ${fileName} has invalid phases[${index}].hp_ratio_max`);
    }

    if (
      entry.summon_count !== undefined &&
      (!entry.summon_count ||
        !Number.isFinite(entry.summon_count.min) ||
        !Number.isFinite(entry.summon_count.max) ||
        entry.summon_count.min < 0 ||
        entry.summon_count.max < entry.summon_count.min)
    ) {
      throw new Error(`Enemy AI profile DB ${fileName} has invalid phases[${index}].summon_count`);
    }

    return {
      phase: Math.max(1, Math.floor(Number(entry.phase))),
      hpRatioMin: Number(entry.hp_ratio_min),
      hpRatioMax: Number(entry.hp_ratio_max),
      summonCount: entry.summon_count
        ? {
            min: Math.max(0, Math.floor(Number(entry.summon_count.min))),
            max: Math.max(0, Math.floor(Number(entry.summon_count.max))),
          }
        : null,
      chargeMicroCorrectDeg: Number.isFinite(entry.charge_micro_correct_deg)
        ? Number(entry.charge_micro_correct_deg)
        : 0,
      pressChainCount: Math.max(1, toNonNegativeInt(entry.press_chain_count, 1)),
    };
  });
}

function normalizeBossActionPriority(rawActionPriority, rawActions, fileName) {
  if (!Array.isArray(rawActionPriority) || rawActionPriority.length <= 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid action_priority: must be a non-empty array`);
  }

  return rawActionPriority.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Enemy AI profile DB ${fileName} has invalid action_priority[${index}]`);
    }

    if (typeof entry.action !== "string" || entry.action.trim().length <= 0) {
      throw new Error(`Enemy AI profile DB ${fileName} has invalid action_priority[${index}].action`);
    }

    const action = entry.action.trim();
    if (!rawActions || !rawActions[action]) {
      throw new Error(
        `Enemy AI profile DB ${fileName} has action_priority[${index}] that references missing action "${action}"`
      );
    }

    validateWhenCondition(entry.when, fileName, action);

    return {
      action,
      when: entry.when.trim(),
    };
  });
}

function normalizeBossActions(rawActions, fileName) {
  if (!rawActions || typeof rawActions !== "object" || Array.isArray(rawActions)) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid actions: must be an object`);
  }

  const entries = Object.entries(rawActions);
  if (entries.length <= 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid actions: must not be empty`);
  }

  const normalized = {};
  for (const [actionKey, action] of entries) {
    if (typeof actionKey !== "string" || actionKey.trim().length <= 0) {
      throw new Error(`Enemy AI profile DB ${fileName} has invalid action key`);
    }

    if (!action || typeof action !== "object" || Array.isArray(action)) {
      throw new Error(`Enemy AI profile DB ${fileName} has invalid actions.${actionKey}`);
    }

    normalized[actionKey] = {
      weaponIndex: Number.isFinite(action.weapon_index) ? Math.max(0, Math.floor(Number(action.weapon_index))) : null,
      cooldownSec: toNonNegativeNumber(action.cooldown_sec, 0),
      windupSec: toNonNegativeNumber(action.windup_sec, 0),
      recoverSec: toNonNegativeNumber(action.recover_sec, 0),
      recoverOnWallHitSec: toNonNegativeNumber(action.recover_on_wall_hit_sec, 0),
      minionCountLt: toNonNegativeInt(action.minion_count_lt, 0),
      targetDistanceGte: toNonNegativeNumber(action.target_distance_gte, 0),
      targetDistanceLte: toNonNegativeNumber(action.target_distance_lte, 0),
      repathIntervalSec: toNonNegativeNumber(action.repath_interval_sec, 0),
    };
  }

  return normalized;
}

function normalizeSummonRules(rawSummonRules, fileName) {
  if (!rawSummonRules || typeof rawSummonRules !== "object" || Array.isArray(rawSummonRules)) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid summon_rules`);
  }

  if (
    !Number.isFinite(rawSummonRules.max_alive_in_room) ||
    rawSummonRules.max_alive_in_room < 0
  ) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid summon_rules.max_alive_in_room`);
  }

  if (
    !Number.isFinite(rawSummonRules.max_alive_per_summoner) ||
    rawSummonRules.max_alive_per_summoner < 0
  ) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid summon_rules.max_alive_per_summoner`);
  }

  if (
    rawSummonRules.vanish_on_summoner_death !== undefined &&
    typeof rawSummonRules.vanish_on_summoner_death !== "boolean"
  ) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid summon_rules.vanish_on_summoner_death`);
  }

  return {
    maxAliveInRoom: Math.max(0, Math.floor(Number(rawSummonRules.max_alive_in_room))),
    maxAlivePerSummoner: Math.max(0, Math.floor(Number(rawSummonRules.max_alive_per_summoner))),
    vanishOnSummonerDeath: rawSummonRules.vanish_on_summoner_death === true,
  };
}

function assertBossProfileShape(rawProfile, fileName) {
  const actions = normalizeBossActions(rawProfile.actions, fileName);
  normalizeBossActionPriority(rawProfile.action_priority, actions, fileName);
  normalizeBossPhases(rawProfile.phases, fileName);

  const hasSummonAction = Boolean(actions.summon);
  if (hasSummonAction && rawProfile.summon_rules === undefined) {
    throw new Error(`Enemy AI profile DB ${fileName} is missing required key: summon_rules`);
  }

  if (rawProfile.summon_rules !== undefined) {
    normalizeSummonRules(rawProfile.summon_rules, fileName);
  }
}

function assertEnemyAiProfileShape(rawProfile, fileName) {
  assertHasRequiredKeys(rawProfile, fileName);
  assertCommonProfileShape(rawProfile, fileName);

  if (rawProfile.role === "boss") {
    assertBossProfileShape(rawProfile, fileName);
    return;
  }

  assertNonBossProfileShape(rawProfile, fileName);
}

function normalizeBossProfile(rawProfile, fileName) {
  const actions = normalizeBossActions(rawProfile.actions, fileName);
  return {
    phases: normalizeBossPhases(rawProfile.phases, fileName),
    actionPriority: normalizeBossActionPriority(rawProfile.action_priority, actions, fileName),
    actions,
    summonRules: rawProfile.summon_rules ? normalizeSummonRules(rawProfile.summon_rules, fileName) : null,
  };
}

function normalizeEnemyAiProfileRecord(rawProfile, fileName) {
  assertEnemyAiProfileShape(rawProfile, fileName);

  const isBoss = rawProfile.role === "boss";
  const bossProfile = isBoss ? normalizeBossProfile(rawProfile, fileName) : null;

  return {
    id: rawProfile.id,
    role: rawProfile.role,
    preferredRangeTiles: Number.isFinite(rawProfile.preferred_range_tiles) ? rawProfile.preferred_range_tiles : 0,
    engageRangeTiles: Number.isFinite(rawProfile.engage_range_tiles) ? rawProfile.engage_range_tiles : 0,
    retreatRangeTiles: Number.isFinite(rawProfile.retreat_range_tiles) ? rawProfile.retreat_range_tiles : 0,
    strafeChance: Number.isFinite(rawProfile.strafe_chance) ? rawProfile.strafe_chance : 0,
    repathIntervalSec: Number.isFinite(rawProfile.repath_interval_sec) ? rawProfile.repath_interval_sec : 0,
    attackWindupSec: isBoss ? 0 : rawProfile.attack_windup_sec,
    recoverSec: isBoss ? 0 : rawProfile.recover_sec,
    maxActiveHazards: Number.isFinite(rawProfile.max_active_hazards) ? rawProfile.max_active_hazards : 0,
    allyPreferRadiusTiles: Number.isFinite(rawProfile.ally_prefer_radius_tiles)
      ? rawProfile.ally_prefer_radius_tiles
      : 0,
    weaponAimMode: rawProfile.weapon_aim_mode,
    weaponVisibilityMode: rawProfile.weapon_visibility_mode,
    weaponAttackCycles: Number.isFinite(rawProfile.weapon_attack_cycles) ? rawProfile.weapon_attack_cycles : 1,
    weaponActiveRangeTiles: Number.isFinite(rawProfile.weapon_active_range_tiles)
      ? rawProfile.weapon_active_range_tiles
      : Number.POSITIVE_INFINITY,
    weaponCooldownMul: Number.isFinite(rawProfile.weapon_cooldown_mul) ? rawProfile.weapon_cooldown_mul : 1,
    losRequired: rawProfile.los_required === true,
    phases: bossProfile?.phases ?? [],
    actionPriority: bossProfile?.actionPriority ?? [],
    actions: bossProfile?.actions ?? null,
    summonRules: bossProfile?.summonRules ?? null,
  };
}

async function loadEnemyAiProfileFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/enemy_ai_profile_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load enemy AI profile DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawProfile = await response.json();
  return normalizeEnemyAiProfileRecord(rawProfile, fileName);
}

function extractEnemyAiProfileJsonFileNamesFromDirectoryHtml(html) {
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  const fileNames = new Set();
  let match = hrefPattern.exec(html);

  while (match) {
    const href = match[1];
    const normalized = href.split("?")[0].split("#")[0];
    if (!normalized.endsWith(".json")) {
      match = hrefPattern.exec(html);
      continue;
    }

    const baseName = normalized.split("/").pop();
    if (baseName && !baseName.startsWith(".")) {
      fileNames.add(baseName);
    }
    match = hrefPattern.exec(html);
  }

  return Array.from(fileNames)
    .filter((fileName) => !fileName.includes("_template"))
    .sort();
}

async function discoverEnemyAiProfileDbFileNames(cacheBustKey) {
  const directoryUrl = new URL("../../db/enemy_ai_profile_db/", import.meta.url);
  if (cacheBustKey) {
    directoryUrl.searchParams.set("cb", String(cacheBustKey));
  }

  try {
    const response = await fetch(directoryUrl.href, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) {
      throw new Error(`Unsupported content type: ${contentType || "unknown"}`);
    }

    const html = await response.text();
    const fileNames = extractEnemyAiProfileJsonFileNamesFromDirectoryHtml(html);
    if (!fileNames.length) {
      throw new Error("No JSON files found in directory listing");
    }
    return fileNames;
  } catch (error) {
    console.warn(
      `Enemy AI profile DB discovery fallback: ${error instanceof Error ? error.message : String(error)}`
    );
    return ENEMY_AI_PROFILE_DB_FALLBACK_FILE_NAMES;
  }
}

export async function loadEnemyAiProfiles() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverEnemyAiProfileDbFileNames(cacheBustKey);
  const profiles = await Promise.all(
    fileNames.map((fileName) => loadEnemyAiProfileFile(fileName, cacheBustKey))
  );
  const seenIds = new Set();

  for (const profile of profiles) {
    if (seenIds.has(profile.id)) {
      throw new Error(`Enemy AI profile DB has duplicate id: ${profile.id}`);
    }
    seenIds.add(profile.id);
  }

  return profiles;
}
