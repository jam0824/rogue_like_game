const ENEMY_AI_PROFILE_DB_FALLBACK_FILE_NAMES = ["ai_profile_chaser_v1.json"];

const REQUIRED_KEYS = [
  "id",
  "role",
  "attack_windup_sec",
  "recover_sec",
  "weapon_aim_mode",
  "weapon_visibility_mode",
];

const ALLOWED_WEAPON_AIM_MODES = new Set(["to_target", "move_dir", "none"]);
const ALLOWED_WEAPON_VISIBILITY_MODES = new Set(["burst", "always"]);

function assertHasRequiredKeys(rawProfile, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawProfile)) {
      throw new Error(`Enemy AI profile DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function assertEnemyAiProfileShape(rawProfile, fileName) {
  if (typeof rawProfile.id !== "string" || rawProfile.id.length === 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid id: ${rawProfile.id}`);
  }

  if (typeof rawProfile.role !== "string" || rawProfile.role.length === 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid role: ${rawProfile.role}`);
  }

  if (!Number.isFinite(rawProfile.attack_windup_sec) || rawProfile.attack_windup_sec < 0) {
    throw new Error(
      `Enemy AI profile DB ${fileName} has invalid attack_windup_sec: ${rawProfile.attack_windup_sec}`
    );
  }

  if (!Number.isFinite(rawProfile.recover_sec) || rawProfile.recover_sec < 0) {
    throw new Error(`Enemy AI profile DB ${fileName} has invalid recover_sec: ${rawProfile.recover_sec}`);
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

function normalizeEnemyAiProfileRecord(rawProfile, fileName) {
  assertHasRequiredKeys(rawProfile, fileName);
  assertEnemyAiProfileShape(rawProfile, fileName);

  return {
    id: rawProfile.id,
    role: rawProfile.role,
    preferredRangeTiles: Number.isFinite(rawProfile.preferred_range_tiles) ? rawProfile.preferred_range_tiles : 0,
    engageRangeTiles: Number.isFinite(rawProfile.engage_range_tiles) ? rawProfile.engage_range_tiles : 0,
    retreatRangeTiles: Number.isFinite(rawProfile.retreat_range_tiles) ? rawProfile.retreat_range_tiles : 0,
    strafeChance: Number.isFinite(rawProfile.strafe_chance) ? rawProfile.strafe_chance : 0,
    repathIntervalSec: Number.isFinite(rawProfile.repath_interval_sec) ? rawProfile.repath_interval_sec : 0,
    attackWindupSec: rawProfile.attack_windup_sec,
    recoverSec: rawProfile.recover_sec,
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
