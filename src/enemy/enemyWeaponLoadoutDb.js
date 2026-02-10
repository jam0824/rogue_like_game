const ENEMY_WEAPON_LOADOUT_DB_FALLBACK_FILE_NAMES = ["enemy_loadout_rabbit_claw01.json"];

const REQUIRED_KEYS = ["id", "weapons"];

function assertHasRequiredKeys(rawLoadout, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawLoadout)) {
      throw new Error(`Enemy weapon loadout DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function normalizeSkills(rawSkills) {
  if (!Array.isArray(rawSkills)) {
    return [];
  }

  return rawSkills
    .filter((skill) => skill && typeof skill.id === "string" && skill.id.length > 0)
    .map((skill) => ({
      id: skill.id,
      plus: Number.isFinite(skill.plus) ? skill.plus : 0,
    }));
}

function normalizeWeaponInstance(rawWeapon, fileName, index) {
  if (!rawWeapon || typeof rawWeapon !== "object") {
    throw new Error(`Enemy weapon loadout DB ${fileName} has invalid weapon entry at index ${index}`);
  }

  if (typeof rawWeapon.weapon_def_id !== "string" || rawWeapon.weapon_def_id.length === 0) {
    throw new Error(
      `Enemy weapon loadout DB ${fileName} has invalid weapon_def_id at index ${index}: ${rawWeapon.weapon_def_id}`
    );
  }

  if (
    rawWeapon.formation_id !== undefined &&
    (typeof rawWeapon.formation_id !== "string" || rawWeapon.formation_id.length === 0)
  ) {
    throw new Error(
      `Enemy weapon loadout DB ${fileName} has invalid formation_id at index ${index}: ${rawWeapon.formation_id}`
    );
  }

  if (rawWeapon.weapon_plus !== undefined && (!Number.isFinite(rawWeapon.weapon_plus) || rawWeapon.weapon_plus < 0)) {
    throw new Error(
      `Enemy weapon loadout DB ${fileName} has invalid weapon_plus at index ${index}: ${rawWeapon.weapon_plus}`
    );
  }

  if (rawWeapon.rarity !== undefined && typeof rawWeapon.rarity !== "string") {
    throw new Error(`Enemy weapon loadout DB ${fileName} has invalid rarity at index ${index}: ${rawWeapon.rarity}`);
  }

  if (rawWeapon.skills !== undefined && !Array.isArray(rawWeapon.skills)) {
    throw new Error(`Enemy weapon loadout DB ${fileName} has invalid skills at index ${index}: must be array`);
  }

  return {
    weaponDefId: rawWeapon.weapon_def_id,
    rarity: typeof rawWeapon.rarity === "string" ? rawWeapon.rarity : "common",
    weaponPlus: Number.isFinite(rawWeapon.weapon_plus) ? Math.max(0, Math.floor(rawWeapon.weapon_plus)) : 0,
    formationId: typeof rawWeapon.formation_id === "string" ? rawWeapon.formation_id : null,
    skills: normalizeSkills(rawWeapon.skills),
  };
}

function assertEnemyWeaponLoadoutShape(rawLoadout, fileName) {
  if (typeof rawLoadout.id !== "string" || rawLoadout.id.length === 0) {
    throw new Error(`Enemy weapon loadout DB ${fileName} has invalid id: ${rawLoadout.id}`);
  }

  if (!Array.isArray(rawLoadout.weapons)) {
    throw new Error(`Enemy weapon loadout DB ${fileName} has invalid weapons: must be an array`);
  }

  if (rawLoadout.attack_linked !== undefined && typeof rawLoadout.attack_linked !== "boolean") {
    throw new Error(
      `Enemy weapon loadout DB ${fileName} has invalid attack_linked: ${rawLoadout.attack_linked}`
    );
  }
}

function normalizeEnemyWeaponLoadoutRecord(rawLoadout, fileName) {
  assertHasRequiredKeys(rawLoadout, fileName);
  assertEnemyWeaponLoadoutShape(rawLoadout, fileName);

  return {
    id: rawLoadout.id,
    attackLinked: rawLoadout.attack_linked !== false,
    weapons: rawLoadout.weapons.map((weapon, index) => normalizeWeaponInstance(weapon, fileName, index)),
  };
}

async function loadEnemyWeaponLoadoutFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/enemy_weapon_loadout_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load enemy weapon loadout DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawLoadout = await response.json();
  return normalizeEnemyWeaponLoadoutRecord(rawLoadout, fileName);
}

function extractEnemyWeaponLoadoutJsonFileNamesFromDirectoryHtml(html) {
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

async function discoverEnemyWeaponLoadoutDbFileNames(cacheBustKey) {
  const directoryUrl = new URL("../../db/enemy_weapon_loadout_db/", import.meta.url);
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
    const fileNames = extractEnemyWeaponLoadoutJsonFileNamesFromDirectoryHtml(html);
    if (!fileNames.length) {
      throw new Error("No JSON files found in directory listing");
    }
    return fileNames;
  } catch (error) {
    console.warn(
      `Enemy weapon loadout DB discovery fallback: ${error instanceof Error ? error.message : String(error)}`
    );
    return ENEMY_WEAPON_LOADOUT_DB_FALLBACK_FILE_NAMES;
  }
}

export async function loadEnemyWeaponLoadouts() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverEnemyWeaponLoadoutDbFileNames(cacheBustKey);
  const loadouts = await Promise.all(
    fileNames.map((fileName) => loadEnemyWeaponLoadoutFile(fileName, cacheBustKey))
  );
  const seenIds = new Set();

  for (const loadout of loadouts) {
    if (seenIds.has(loadout.id)) {
      throw new Error(`Enemy weapon loadout DB has duplicate id: ${loadout.id}`);
    }
    seenIds.add(loadout.id);
  }

  return loadouts;
}
