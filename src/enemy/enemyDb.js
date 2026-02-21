const ENEMY_DB_FALLBACK_FILE_NAMES = ["Bee_01.json", "BrownMushroom_01.json"];

const REQUIRED_KEYS = [
  "name_key",
  "type",
  "walk_png_file_path",
  "idle_png_file_path",
  "death_png_file_path",
  "width",
  "height",
  "fps",
  "png_facing_direction",
  "image_magnification",
  "notice_distance",
  "giveup_distance",
];

function assertHasRequiredKeys(rawEnemy, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawEnemy)) {
      throw new Error(`Enemy DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function assertEnemyShape(rawEnemy, fileName) {
  if (!Number.isFinite(rawEnemy.width) || rawEnemy.width <= 0) {
    throw new Error(`Enemy DB ${fileName} has invalid width: ${rawEnemy.width}`);
  }

  if (!Number.isFinite(rawEnemy.height) || rawEnemy.height <= 0) {
    throw new Error(`Enemy DB ${fileName} has invalid height: ${rawEnemy.height}`);
  }

  if (!Number.isFinite(rawEnemy.notice_distance) || rawEnemy.notice_distance < 0) {
    throw new Error(`Enemy DB ${fileName} has invalid notice_distance: ${rawEnemy.notice_distance}`);
  }

  if (!Number.isFinite(rawEnemy.giveup_distance) || rawEnemy.giveup_distance < 0) {
    throw new Error(`Enemy DB ${fileName} has invalid giveup_distance: ${rawEnemy.giveup_distance}`);
  }

  if (typeof rawEnemy.type !== "string" || rawEnemy.type.length === 0) {
    throw new Error(`Enemy DB ${fileName} has invalid type: ${rawEnemy.type}`);
  }

  if (
    typeof rawEnemy.walk_png_file_path !== "string" ||
    rawEnemy.walk_png_file_path.trim().length === 0
  ) {
    throw new Error(
      `Enemy DB ${fileName} has invalid walk_png_file_path: ${rawEnemy.walk_png_file_path}`
    );
  }

  if (
    typeof rawEnemy.idle_png_file_path !== "string" ||
    rawEnemy.idle_png_file_path.trim().length === 0
  ) {
    throw new Error(
      `Enemy DB ${fileName} has invalid idle_png_file_path: ${rawEnemy.idle_png_file_path}`
    );
  }

  if (
    typeof rawEnemy.death_png_file_path !== "string" ||
    rawEnemy.death_png_file_path.trim().length === 0
  ) {
    throw new Error(
      `Enemy DB ${fileName} has invalid death_png_file_path: ${rawEnemy.death_png_file_path}`
    );
  }

  if (
    "attack_png_file_path" in rawEnemy &&
    (typeof rawEnemy.attack_png_file_path !== "string" || rawEnemy.attack_png_file_path.trim().length === 0)
  ) {
    throw new Error(
      `Enemy DB ${fileName} has invalid attack_png_file_path: ${rawEnemy.attack_png_file_path}`
    );
  }

  if (!Number.isFinite(rawEnemy.fps) || rawEnemy.fps <= 0) {
    throw new Error(`Enemy DB ${fileName} has invalid fps: ${rawEnemy.fps}`);
  }

  if (typeof rawEnemy.png_facing_direction !== "string" || rawEnemy.png_facing_direction.trim().length <= 0) {
    throw new Error(
      `Enemy DB ${fileName} has invalid png_facing_direction: ${rawEnemy.png_facing_direction}`
    );
  }

  const facingDirection = rawEnemy.png_facing_direction.trim().toLowerCase();
  if (!facingDirection.includes("left") && !facingDirection.includes("right")) {
    throw new Error(
      `Enemy DB ${fileName} has invalid png_facing_direction: ${rawEnemy.png_facing_direction}`
    );
  }

  if (!Number.isFinite(rawEnemy.image_magnification) || rawEnemy.image_magnification <= 0) {
    throw new Error(
      `Enemy DB ${fileName} has invalid image_magnification: ${rawEnemy.image_magnification}`
    );
  }
}

function normalizeEnemyRecord(rawEnemy, fileName) {
  assertHasRequiredKeys(rawEnemy, fileName);
  assertEnemyShape(rawEnemy, fileName);

  return {
    id: fileName.replace(/\.json$/, ""),
    nameKey: rawEnemy.name_key,
    descriptionKey: rawEnemy.description_key,
    type: rawEnemy.type,
    walkPngFilePath: rawEnemy.walk_png_file_path.trim(),
    idlePngFilePath: rawEnemy.idle_png_file_path.trim(),
    attackPngFilePath:
      typeof rawEnemy.attack_png_file_path === "string" && rawEnemy.attack_png_file_path.trim().length > 0
        ? rawEnemy.attack_png_file_path.trim()
        : null,
    deathPngFilePath: rawEnemy.death_png_file_path.trim(),
    width: rawEnemy.width,
    height: rawEnemy.height,
    fps: rawEnemy.fps,
    pngFacingDirection: rawEnemy.png_facing_direction.trim().toLowerCase().includes("left")
      ? "left"
      : "right",
    imageMagnification: rawEnemy.image_magnification,
    noticeDistance: rawEnemy.notice_distance,
    giveupDistance: rawEnemy.giveup_distance,
    vit: Number.isFinite(rawEnemy.vit) ? rawEnemy.vit : 10,
    for: Number.isFinite(rawEnemy.for) ? rawEnemy.for : 10,
    agi: Number.isFinite(rawEnemy.agi) ? rawEnemy.agi : 10,
    pow: Number.isFinite(rawEnemy.pow) ? rawEnemy.pow : 10,
    tec: Number.isFinite(rawEnemy.tec) ? rawEnemy.tec : 10,
    arc: Number.isFinite(rawEnemy.arc) ? rawEnemy.arc : 10,
    rank: typeof rawEnemy.rank === "string" && rawEnemy.rank.length > 0 ? rawEnemy.rank : "normal",
    role: typeof rawEnemy.role === "string" && rawEnemy.role.length > 0 ? rawEnemy.role : "chaser",
    tags: Array.isArray(rawEnemy.tags) ? rawEnemy.tags.filter((tag) => typeof tag === "string") : [],
    aiProfileId: typeof rawEnemy.ai_profile_id === "string" ? rawEnemy.ai_profile_id : null,
    weaponLoadoutId: typeof rawEnemy.weapon_loadout_id === "string" ? rawEnemy.weapon_loadout_id : null,
  };
}

async function loadEnemyFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/enemy_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load enemy DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawEnemy = await response.json();
  return normalizeEnemyRecord(rawEnemy, fileName);
}

function extractEnemyJsonFileNamesFromDirectoryHtml(html) {
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
    .filter((fileName) => !fileName.includes("template"))
    .sort();
}

async function discoverEnemyDbFileNames(cacheBustKey) {
  const directoryUrl = new URL("../../db/enemy_db/", import.meta.url);
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
    const fileNames = extractEnemyJsonFileNamesFromDirectoryHtml(html);
    if (!fileNames.length) {
      throw new Error("No JSON files found in directory listing");
    }
    return fileNames;
  } catch (error) {
    console.warn(`Enemy DB discovery fallback: ${error instanceof Error ? error.message : String(error)}`);
    return ENEMY_DB_FALLBACK_FILE_NAMES;
  }
}

export async function loadWalkEnemyDefinitions() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverEnemyDbFileNames(cacheBustKey);
  const allEnemies = await Promise.all(fileNames.map((fileName) => loadEnemyFile(fileName, cacheBustKey)));

  return allEnemies.filter((enemy) => enemy.type === "walk");
}

export async function loadEnemyDefinitions() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverEnemyDbFileNames(cacheBustKey);
  return Promise.all(fileNames.map((fileName) => loadEnemyFile(fileName, cacheBustKey)));
}
