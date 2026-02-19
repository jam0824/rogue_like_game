const DEFAULT_PLAYER_DB_FILE_NAME = "player_01.json";

const REQUIRED_KEYS = [
  "id",
  "name_key",
  "description_key",
  "width",
  "height",
  "fps",
  "player_png_facing_direction",
  "walk_png_file_path",
  "idle_png_file_path",
  "death_png_file_path",
];

function assertHasRequiredKeys(rawPlayer, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawPlayer)) {
      throw new Error(`Player DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function normalizeFacingDirection(rawFacingDirection, fileName) {
  if (typeof rawFacingDirection !== "string" || rawFacingDirection.trim().length <= 0) {
    throw new Error(
      `Player DB ${fileName} has invalid player_png_facing_direction: ${rawFacingDirection}`
    );
  }

  const normalized = rawFacingDirection.trim().toLowerCase();
  if (normalized.includes("left")) {
    return "left";
  }
  if (normalized.includes("right")) {
    return "right";
  }

  throw new Error(`Player DB ${fileName} has invalid player_png_facing_direction: ${rawFacingDirection}`);
}

function assertPlayerShape(rawPlayer, fileName) {
  if (typeof rawPlayer.id !== "string" || rawPlayer.id.trim().length <= 0) {
    throw new Error(`Player DB ${fileName} has invalid id: ${rawPlayer.id}`);
  }

  if (!Number.isFinite(rawPlayer.width) || rawPlayer.width <= 0) {
    throw new Error(`Player DB ${fileName} has invalid width: ${rawPlayer.width}`);
  }

  if (!Number.isFinite(rawPlayer.height) || rawPlayer.height <= 0) {
    throw new Error(`Player DB ${fileName} has invalid height: ${rawPlayer.height}`);
  }

  if (!Number.isFinite(rawPlayer.fps) || rawPlayer.fps <= 0) {
    throw new Error(`Player DB ${fileName} has invalid fps: ${rawPlayer.fps}`);
  }

  if (typeof rawPlayer.walk_png_file_path !== "string" || rawPlayer.walk_png_file_path.trim().length <= 0) {
    throw new Error(
      `Player DB ${fileName} has invalid walk_png_file_path: ${rawPlayer.walk_png_file_path}`
    );
  }

  if (typeof rawPlayer.idle_png_file_path !== "string" || rawPlayer.idle_png_file_path.trim().length <= 0) {
    throw new Error(
      `Player DB ${fileName} has invalid idle_png_file_path: ${rawPlayer.idle_png_file_path}`
    );
  }

  if (typeof rawPlayer.death_png_file_path !== "string" || rawPlayer.death_png_file_path.trim().length <= 0) {
    throw new Error(
      `Player DB ${fileName} has invalid death_png_file_path: ${rawPlayer.death_png_file_path}`
    );
  }
}

function normalizePlayerRecord(rawPlayer, fileName) {
  assertHasRequiredKeys(rawPlayer, fileName);
  assertPlayerShape(rawPlayer, fileName);

  return {
    id: rawPlayer.id.trim(),
    nameKey: rawPlayer.name_key,
    descriptionKey: rawPlayer.description_key,
    width: rawPlayer.width,
    height: rawPlayer.height,
    fps: rawPlayer.fps,
    playerPngFacingDirection: normalizeFacingDirection(rawPlayer.player_png_facing_direction, fileName),
    walkPngFilePath: rawPlayer.walk_png_file_path.trim(),
    idlePngFilePath: rawPlayer.idle_png_file_path.trim(),
    deathPngFilePath: rawPlayer.death_png_file_path.trim(),
  };
}

async function loadPlayerFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/player_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load player DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawPlayer = await response.json();
  return normalizePlayerRecord(rawPlayer, fileName);
}

export async function loadDefaultPlayerDefinition() {
  const cacheBustKey = Date.now();
  return loadPlayerFile(DEFAULT_PLAYER_DB_FILE_NAME, cacheBustKey);
}
