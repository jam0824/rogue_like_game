const DUNGEON_DB_FALLBACK_FILE_NAMES = ["dungeon_id_01.json", "dungeon_id_02.json"];

const REQUIRED_KEYS = [
  "id",
  "name_key",
  "description_key",
  "tip_set_root_path",
  "bgm",
  "wall_height",
  "tip_set",
];

const REQUIRED_TIP_SET_KEYS = ["tile", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

function assertHasRequiredKeys(rawDungeon, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawDungeon)) {
      throw new Error(`Dungeon DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function assertTipSetShape(rawTipSet, fileName) {
  if (!rawTipSet || typeof rawTipSet !== "object" || Array.isArray(rawTipSet)) {
    throw new Error(`Dungeon DB ${fileName} has invalid tip_set`);
  }

  for (const key of REQUIRED_TIP_SET_KEYS) {
    if (!Array.isArray(rawTipSet[key]) || rawTipSet[key].length <= 0) {
      throw new Error(`Dungeon DB ${fileName} has invalid tip_set.${key}: must be a non-empty array`);
    }

    rawTipSet[key].forEach((value, index) => {
      if (typeof value !== "string" || value.trim().length <= 0) {
        throw new Error(`Dungeon DB ${fileName} has invalid tip_set.${key}[${index}]: ${value}`);
      }
    });
  }
}

function assertDungeonShape(rawDungeon, fileName) {
  if (typeof rawDungeon.id !== "string" || rawDungeon.id.trim().length <= 0) {
    throw new Error(`Dungeon DB ${fileName} has invalid id: ${rawDungeon.id}`);
  }

  if (typeof rawDungeon.name_key !== "string" || rawDungeon.name_key.trim().length <= 0) {
    throw new Error(`Dungeon DB ${fileName} has invalid name_key: ${rawDungeon.name_key}`);
  }

  if (typeof rawDungeon.description_key !== "string" || rawDungeon.description_key.trim().length <= 0) {
    throw new Error(`Dungeon DB ${fileName} has invalid description_key: ${rawDungeon.description_key}`);
  }

  if (typeof rawDungeon.tip_set_root_path !== "string" || rawDungeon.tip_set_root_path.trim().length <= 0) {
    throw new Error(`Dungeon DB ${fileName} has invalid tip_set_root_path: ${rawDungeon.tip_set_root_path}`);
  }

  if (typeof rawDungeon.bgm !== "string" || rawDungeon.bgm.trim().length <= 0) {
    throw new Error(`Dungeon DB ${fileName} has invalid bgm: ${rawDungeon.bgm}`);
  }

  if (!Number.isFinite(rawDungeon.wall_height) || rawDungeon.wall_height <= 0) {
    throw new Error(`Dungeon DB ${fileName} has invalid wall_height: ${rawDungeon.wall_height}`);
  }

  assertTipSetShape(rawDungeon.tip_set, fileName);
  assertWalkableTileDecorationShape(rawDungeon.walkable_tile_decoration, fileName);
}

function assertWalkableTileDecorationShape(rawWalkableTileDecoration, fileName) {
  if (rawWalkableTileDecoration === undefined) {
    return;
  }

  if (!Array.isArray(rawWalkableTileDecoration)) {
    throw new Error(`Dungeon DB ${fileName} has invalid walkable_tile_decoration: must be an array`);
  }

  rawWalkableTileDecoration.forEach((value, index) => {
    if (typeof value !== "string" || value.trim().length <= 0) {
      throw new Error(`Dungeon DB ${fileName} has invalid walkable_tile_decoration[${index}]: ${value}`);
    }
  });
}

function normalizeTipSet(rawTipSet) {
  return Object.fromEntries(
    REQUIRED_TIP_SET_KEYS.map((key) => [
      key,
      rawTipSet[key].map((value) => value.trim()),
    ])
  );
}

function normalizeWalkableTileDecoration(rawWalkableTileDecoration) {
  if (!Array.isArray(rawWalkableTileDecoration)) {
    return [];
  }

  return rawWalkableTileDecoration.map((value) => value.trim());
}

function normalizeDungeonRecord(rawDungeon, fileName) {
  assertHasRequiredKeys(rawDungeon, fileName);
  assertDungeonShape(rawDungeon, fileName);

  return {
    id: rawDungeon.id,
    nameKey: rawDungeon.name_key,
    descriptionKey: rawDungeon.description_key,
    tipSetRootPath: rawDungeon.tip_set_root_path,
    bgmPath: rawDungeon.bgm.trim(),
    wallHeightTiles: Math.max(1, Math.floor(Number(rawDungeon.wall_height))),
    tipSet: normalizeTipSet(rawDungeon.tip_set),
    walkableTileDecoration: normalizeWalkableTileDecoration(rawDungeon.walkable_tile_decoration),
  };
}

async function loadDungeonFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/dungeon_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load dungeon DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawDungeon = await response.json();
  return normalizeDungeonRecord(rawDungeon, fileName);
}

function extractDungeonJsonFileNamesFromDirectoryHtml(html) {
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

async function discoverDungeonDbFileNames(cacheBustKey) {
  const directoryUrl = new URL("../../db/dungeon_db/", import.meta.url);
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
    const fileNames = extractDungeonJsonFileNamesFromDirectoryHtml(html);
    if (!fileNames.length) {
      throw new Error("No JSON files found in directory listing");
    }
    return fileNames;
  } catch (error) {
    console.warn(`Dungeon DB discovery fallback: ${error instanceof Error ? error.message : String(error)}`);
    return DUNGEON_DB_FALLBACK_FILE_NAMES;
  }
}

export async function loadDungeonDefinitions() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverDungeonDbFileNames(cacheBustKey);
  const definitions = await Promise.all(fileNames.map((fileName) => loadDungeonFile(fileName, cacheBustKey)));
  const seenIds = new Set();

  for (const definition of definitions) {
    if (seenIds.has(definition.id)) {
      throw new Error(`Dungeon DB has duplicate id: ${definition.id}`);
    }
    seenIds.add(definition.id);
  }

  return definitions;
}
