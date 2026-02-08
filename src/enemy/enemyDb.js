const ENEMY_DB_FALLBACK_FILE_NAMES = ["bat01.json", "rabbit01_white.json", "skeleton01.json"];

const REQUIRED_KEYS = [
  "name_key",
  "type",
  "tip_file_name",
  "width",
  "height",
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

  if (typeof rawEnemy.tip_file_name !== "string" || rawEnemy.tip_file_name.length === 0) {
    throw new Error(`Enemy DB ${fileName} has invalid tip_file_name: ${rawEnemy.tip_file_name}`);
  }
}

function normalizeEnemyRecord(rawEnemy, fileName) {
  assertHasRequiredKeys(rawEnemy, fileName);
  assertEnemyShape(rawEnemy, fileName);

  return {
    id: fileName.replace(/\.json$/, ""),
    nameKey: rawEnemy.name_key,
    type: rawEnemy.type,
    tipFileName: rawEnemy.tip_file_name,
    width: rawEnemy.width,
    height: rawEnemy.height,
    noticeDistance: rawEnemy.notice_distance,
    giveupDistance: rawEnemy.giveup_distance,
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

  return Array.from(fileNames).sort();
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
