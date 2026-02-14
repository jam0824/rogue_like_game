const WEAPON_DB_FALLBACK_FILE_NAMES = ["weapon_sword_01.json"];

const REQUIRED_KEYS = [
  "id",
  "name_key",
  "description_key",
  "weapon_file_name",
  "width",
  "height",
  "rarity",
  "weapon_plus",
  "base_damage",
  "attack_cooldown_sec",
  "hit_num",
  "pierce_count",
  "chip_slot_count",
  "formation_id",
  "skills",
];

function assertHasRequiredKeys(rawWeapon, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawWeapon)) {
      throw new Error(`Weapon DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function assertWeaponShape(rawWeapon, fileName) {
  if (typeof rawWeapon.id !== "string" || rawWeapon.id.trim().length === 0) {
    throw new Error(`Weapon DB ${fileName} has invalid id: ${rawWeapon.id}`);
  }

  if (!Number.isFinite(rawWeapon.width) || rawWeapon.width <= 0) {
    throw new Error(`Weapon DB ${fileName} has invalid width: ${rawWeapon.width}`);
  }

  if (!Number.isFinite(rawWeapon.height) || rawWeapon.height <= 0) {
    throw new Error(`Weapon DB ${fileName} has invalid height: ${rawWeapon.height}`);
  }

  if (!Number.isFinite(rawWeapon.base_damage) || rawWeapon.base_damage < 0) {
    throw new Error(`Weapon DB ${fileName} has invalid base_damage: ${rawWeapon.base_damage}`);
  }

  if (!Number.isFinite(rawWeapon.attack_cooldown_sec) || rawWeapon.attack_cooldown_sec <= 0) {
    throw new Error(
      `Weapon DB ${fileName} has invalid attack_cooldown_sec: ${rawWeapon.attack_cooldown_sec}`
    );
  }

  if (!Number.isFinite(rawWeapon.hit_num) || rawWeapon.hit_num <= 0) {
    throw new Error(`Weapon DB ${fileName} has invalid hit_num: ${rawWeapon.hit_num}`);
  }

  if (!Number.isFinite(rawWeapon.pierce_count) || rawWeapon.pierce_count < 0) {
    throw new Error(`Weapon DB ${fileName} has invalid pierce_count: ${rawWeapon.pierce_count}`);
  }

  if (!Array.isArray(rawWeapon.skills)) {
    throw new Error(`Weapon DB ${fileName} has invalid skills: must be an array`);
  }

  if (typeof rawWeapon.weapon_file_name !== "string" || rawWeapon.weapon_file_name.length === 0) {
    throw new Error(`Weapon DB ${fileName} has invalid weapon_file_name: ${rawWeapon.weapon_file_name}`);
  }

  if (typeof rawWeapon.formation_id !== "string" || rawWeapon.formation_id.length === 0) {
    throw new Error(`Weapon DB ${fileName} has invalid formation_id: ${rawWeapon.formation_id}`);
  }
}

function normalizeSeKey(rawValue) {
  if (typeof rawValue !== "string") {
    return "";
  }
  return rawValue.trim();
}

function normalizeEffectId(rawValue) {
  if (typeof rawValue !== "string") {
    return "";
  }
  return rawValue.trim();
}

function resolveWeaponSeKey(rawWeapon, seKeyName, legacyKeyName) {
  const seKey = normalizeSeKey(rawWeapon?.[seKeyName]);
  if (seKey) {
    return seKey;
  }

  return normalizeSeKey(rawWeapon?.[legacyKeyName]);
}

function normalizeWeaponRecord(rawWeapon, fileName) {
  assertHasRequiredKeys(rawWeapon, fileName);
  assertWeaponShape(rawWeapon, fileName);
  const fileBaseName = fileName.replace(/\.json$/, "");

  if (rawWeapon.id !== fileBaseName) {
    console.warn(
      `Weapon DB ${fileName} id mismatch: file name id=${fileBaseName}, json id=${rawWeapon.id}. Using JSON id.`
    );
  }

  return {
    id: rawWeapon.id,
    nameKey: rawWeapon.name_key,
    descriptionKey: rawWeapon.description_key,
    weaponFileName: rawWeapon.weapon_file_name,
    width: rawWeapon.width,
    height: rawWeapon.height,
    seKeyStartAttack: resolveWeaponSeKey(rawWeapon, "se_key_start_attack", "sound_key_start_attack"),
    seKeyHitAttack: resolveWeaponSeKey(rawWeapon, "se_key_hit_attack", "sound_key_hit_attack"),
    effectIdStartAttack: normalizeEffectId(rawWeapon.effect_id_start_attack),
    effectIdHitAttack: normalizeEffectId(rawWeapon.effect_id_hit_attack),
    rarity: rawWeapon.rarity,
    weaponPlus: rawWeapon.weapon_plus,
    baseDamage: rawWeapon.base_damage,
    attackCooldownSec: rawWeapon.attack_cooldown_sec,
    hitNum: rawWeapon.hit_num,
    pierceCount: rawWeapon.pierce_count,
    chipSlotCount: rawWeapon.chip_slot_count,
    formationId: rawWeapon.formation_id,
    skills: rawWeapon.skills.map((skill) => ({
      id: skill.id,
      plus: Number.isFinite(skill.plus) ? skill.plus : 0,
    })),
  };
}

async function loadWeaponFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/weapon_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load weapon DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawWeapon = await response.json();
  return normalizeWeaponRecord(rawWeapon, fileName);
}

function extractWeaponJsonFileNamesFromDirectoryHtml(html) {
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

async function discoverWeaponDbFileNames(cacheBustKey) {
  const directoryUrl = new URL("../../db/weapon_db/", import.meta.url);
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
    const fileNames = extractWeaponJsonFileNamesFromDirectoryHtml(html);
    if (!fileNames.length) {
      throw new Error("No JSON files found in directory listing");
    }
    return fileNames;
  } catch (error) {
    console.warn(`Weapon DB discovery fallback: ${error instanceof Error ? error.message : String(error)}`);
    return WEAPON_DB_FALLBACK_FILE_NAMES;
  }
}

export async function loadWeaponDefinitions() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverWeaponDbFileNames(cacheBustKey);
  const definitions = await Promise.all(fileNames.map((fileName) => loadWeaponFile(fileName, cacheBustKey)));
  const seenIds = new Set();

  for (const definition of definitions) {
    if (seenIds.has(definition.id)) {
      throw new Error(`Weapon DB has duplicate id: ${definition.id}`);
    }
    seenIds.add(definition.id);
  }

  return definitions;
}
