const SKILL_DB_FALLBACK_FILE_NAMES = [
  "skill_id_projectile_01.json",
  "skill_id_poison_01.json",
  "skill_id_explosion_01.json",
  "skill_id_bite_01.json",
];

const REQUIRED_KEYS = [
  "id",
  "name_key",
  "description_key",
  "skill_type",
  "rarity",
  "max_plus",
  "unique_per_weapon",
  "tags",
  "ui",
  "params",
];

const SKILL_TYPES = new Set(["passive", "modifier", "attack", "orbit", "replicate", "reaction_boost"]);
const ATTACK_KINDS = new Set(["projectile", "aoe"]);
const START_SPAWN_TIMINGS = new Set(["start", "hit"]);
const PROJECTILE_MOVE_DIRECTIONS = new Set(["to_target", "guided", "random"]);

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toNonNegativeInt(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function toNonNegativeNumber(value, fallback) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function normalizeStringArray(raw, fallback = []) {
  if (!Array.isArray(raw)) {
    return fallback.slice();
  }

  return raw
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
}

function assertHasRequiredKeys(rawSkill, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawSkill)) {
      throw new Error(`Skill DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function assertBaseShape(rawSkill, fileName) {
  if (typeof rawSkill.id !== "string" || rawSkill.id.trim().length === 0) {
    throw new Error(`Skill DB ${fileName} has invalid id: ${rawSkill.id}`);
  }

  if (typeof rawSkill.name_key !== "string" || rawSkill.name_key.trim().length === 0) {
    throw new Error(`Skill DB ${fileName} has invalid name_key: ${rawSkill.name_key}`);
  }

  if (typeof rawSkill.description_key !== "string" || rawSkill.description_key.trim().length === 0) {
    throw new Error(`Skill DB ${fileName} has invalid description_key: ${rawSkill.description_key}`);
  }

  if (typeof rawSkill.skill_type !== "string" || !SKILL_TYPES.has(rawSkill.skill_type)) {
    throw new Error(`Skill DB ${fileName} has invalid skill_type: ${rawSkill.skill_type}`);
  }

  if (typeof rawSkill.rarity !== "string" || rawSkill.rarity.trim().length === 0) {
    throw new Error(`Skill DB ${fileName} has invalid rarity: ${rawSkill.rarity}`);
  }

  if (!Number.isFinite(rawSkill.max_plus) || rawSkill.max_plus < 0) {
    throw new Error(`Skill DB ${fileName} has invalid max_plus: ${rawSkill.max_plus}`);
  }

  if (typeof rawSkill.unique_per_weapon !== "boolean") {
    throw new Error(`Skill DB ${fileName} has invalid unique_per_weapon: ${rawSkill.unique_per_weapon}`);
  }

  if (!Array.isArray(rawSkill.tags)) {
    throw new Error(`Skill DB ${fileName} has invalid tags: must be an array`);
  }

  if (!rawSkill.ui || typeof rawSkill.ui !== "object") {
    throw new Error(`Skill DB ${fileName} has invalid ui: must be an object`);
  }

  if (typeof rawSkill.ui.icon_file_name !== "string" || rawSkill.ui.icon_file_name.trim().length === 0) {
    throw new Error(`Skill DB ${fileName} has invalid ui.icon_file_name: ${rawSkill.ui.icon_file_name}`);
  }

  if (!Number.isFinite(rawSkill.ui.sort_order)) {
    throw new Error(`Skill DB ${fileName} has invalid ui.sort_order: ${rawSkill.ui.sort_order}`);
  }

  if (!rawSkill.params || typeof rawSkill.params !== "object") {
    throw new Error(`Skill DB ${fileName} has invalid params: must be an object`);
  }
}

function normalizeModifierParams(rawSkill, fileName) {
  const params = rawSkill.params ?? {};

  const applyAilments = Array.isArray(params.apply_ailments)
    ? params.apply_ailments.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          throw new Error(`Skill DB ${fileName} has invalid params.apply_ailments[${index}]`);
        }

        const ailmentId = typeof entry.ailment_id === "string" ? entry.ailment_id.trim() : "";
        if (ailmentId.length <= 0) {
          throw new Error(`Skill DB ${fileName} has invalid params.apply_ailments[${index}].ailment_id`);
        }

        if (!Number.isFinite(entry.apply_base) || entry.apply_base < 0) {
          throw new Error(`Skill DB ${fileName} has invalid params.apply_ailments[${index}].apply_base`);
        }

        return {
          ailmentId,
          applyBase: Number(entry.apply_base),
        };
      })
    : [];

  return {
    addTags: normalizeStringArray(params.add_tags),
    applyAilments,
    addAttackDamagePct: toFiniteNumber(params.add_attack_damage_pct, 0),
  };
}

function normalizeAttackParams(rawSkill, fileName) {
  const params = rawSkill.params ?? {};

  if (typeof params.attack_kind !== "string" || !ATTACK_KINDS.has(params.attack_kind)) {
    throw new Error(`Skill DB ${fileName} has invalid params.attack_kind: ${params.attack_kind}`);
  }

  if (!Number.isFinite(params.base_damage) || params.base_damage < 0) {
    throw new Error(`Skill DB ${fileName} has invalid params.base_damage: ${params.base_damage}`);
  }

  const startSpawnTiming =
    typeof params.start_spawn_timing === "string" && START_SPAWN_TIMINGS.has(params.start_spawn_timing)
      ? params.start_spawn_timing
      : "start";

  const chainTrigger =
    typeof params.chain_trigger === "string" && params.chain_trigger.trim().length > 0
      ? params.chain_trigger.trim()
      : "on_hit";

  let projectile = null;
  if (params.attack_kind === "projectile") {
    const rawProjectile = params.projectile;
    if (!rawProjectile || typeof rawProjectile !== "object") {
      throw new Error(`Skill DB ${fileName} has invalid params.projectile: must be an object`);
    }

    const spriteEffectId =
      typeof rawProjectile.sprite_effect_id === "string" ? rawProjectile.sprite_effect_id.trim() : "";
    if (spriteEffectId.length <= 0) {
      throw new Error(`Skill DB ${fileName} has invalid params.projectile.sprite_effect_id`);
    }

    if (!Number.isFinite(rawProjectile.speed_tile_per_sec) || rawProjectile.speed_tile_per_sec <= 0) {
      throw new Error(`Skill DB ${fileName} has invalid params.projectile.speed_tile_per_sec`);
    }

    if (!Number.isFinite(rawProjectile.life_sec) || rawProjectile.life_sec <= 0) {
      throw new Error(`Skill DB ${fileName} has invalid params.projectile.life_sec`);
    }

    const moveDirection =
      typeof rawProjectile.move_direction === "string" && PROJECTILE_MOVE_DIRECTIONS.has(rawProjectile.move_direction)
        ? rawProjectile.move_direction
        : "to_target";

    projectile = {
      speedTilePerSec: Number(rawProjectile.speed_tile_per_sec),
      lifeSec: Number(rawProjectile.life_sec),
      moveDirection,
      spriteEffectId,
      disappearHitWall: rawProjectile.disappear_hit_wall !== false,
    };
  }

  let aoe = null;
  if (params.attack_kind === "aoe") {
    const rawAoe = params.aoe;
    if (!rawAoe || typeof rawAoe !== "object") {
      throw new Error(`Skill DB ${fileName} has invalid params.aoe: must be an object`);
    }

    const spriteEffectId = typeof rawAoe.sprite_effect_id === "string" ? rawAoe.sprite_effect_id.trim() : "";
    if (spriteEffectId.length <= 0) {
      throw new Error(`Skill DB ${fileName} has invalid params.aoe.sprite_effect_id`);
    }

    const hitIntervalSec = toNonNegativeNumber(rawAoe.hit_interval_sec, 0);

    aoe = {
      spriteEffectId,
      hitIntervalSec,
    };
  }

  const rawHit = params.hit && typeof params.hit === "object" ? params.hit : {};

  return {
    attackKind: params.attack_kind,
    baseDamage: Number(params.base_damage),
    damageElement: typeof params.damage_element === "string" ? params.damage_element.trim() : "",
    startSpawnTiming,
    chainTrigger,
    hit: {
      hitNum: Math.max(1, toNonNegativeInt(rawHit.hit_num, 1)),
      pierceCount: toNonNegativeInt(rawHit.pierce_count, 0),
    },
    projectile,
    aoe,
  };
}

function normalizeSkillRecord(rawSkill, fileName) {
  assertHasRequiredKeys(rawSkill, fileName);
  assertBaseShape(rawSkill, fileName);

  const fileBaseName = fileName.replace(/\.json$/, "");
  if (rawSkill.id !== fileBaseName) {
    console.warn(
      `Skill DB ${fileName} id mismatch: file name id=${fileBaseName}, json id=${rawSkill.id}. Using JSON id.`
    );
  }

  let normalizedParams = {};
  if (rawSkill.skill_type === "modifier") {
    normalizedParams = normalizeModifierParams(rawSkill, fileName);
  } else if (rawSkill.skill_type === "attack") {
    normalizedParams = normalizeAttackParams(rawSkill, fileName);
  }

  return {
    id: rawSkill.id,
    nameKey: rawSkill.name_key,
    descriptionKey: rawSkill.description_key,
    skillType: rawSkill.skill_type,
    rarity: rawSkill.rarity,
    maxPlus: toNonNegativeInt(rawSkill.max_plus, 0),
    uniquePerWeapon: rawSkill.unique_per_weapon === true,
    tags: normalizeStringArray(rawSkill.tags),
    ui: {
      iconFileName: rawSkill.ui.icon_file_name.trim(),
      sortOrder: Math.floor(Number(rawSkill.ui.sort_order) || 0),
    },
    params: normalizedParams,
    seKeyFire: typeof rawSkill.se_key_fire === "string" ? rawSkill.se_key_fire.trim() : "",
    seKeyHit: typeof rawSkill.se_key_hit === "string" ? rawSkill.se_key_hit.trim() : "",
    effectIdFire: typeof rawSkill.effect_id_fire === "string" ? rawSkill.effect_id_fire.trim() : "",
    effectIdHit: typeof rawSkill.effect_id_hit === "string" ? rawSkill.effect_id_hit.trim() : "",
  };
}

async function loadSkillFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/skill_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load skill DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawSkill = await response.json();
  return normalizeSkillRecord(rawSkill, fileName);
}

function extractSkillJsonFileNamesFromDirectoryHtml(html) {
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

async function discoverSkillDbFileNames(cacheBustKey) {
  const directoryUrl = new URL("../../db/skill_db/", import.meta.url);
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
    const fileNames = extractSkillJsonFileNamesFromDirectoryHtml(html);
    if (!fileNames.length) {
      throw new Error("No JSON files found in directory listing");
    }

    return fileNames;
  } catch (error) {
    console.warn(`Skill DB discovery fallback: ${error instanceof Error ? error.message : String(error)}`);
    return SKILL_DB_FALLBACK_FILE_NAMES;
  }
}

export async function loadSkillDefinitions() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverSkillDbFileNames(cacheBustKey);
  const definitions = await Promise.all(fileNames.map((fileName) => loadSkillFile(fileName, cacheBustKey)));
  const seenIds = new Set();

  for (const definition of definitions) {
    if (seenIds.has(definition.id)) {
      throw new Error(`Skill DB has duplicate id: ${definition.id}`);
    }
    seenIds.add(definition.id);
  }

  return definitions;
}
