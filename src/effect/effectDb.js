const EFFECT_DB_FALLBACK_FILE_NAMES = ["effect_id_sword_slash_01.json"];

const REQUIRED_KEYS = [
  "id",
  "effect_file_name",
  "width",
  "height",
  "animation_fps",
  "animation_direction",
  "scale",
  "blend_mode",
  "loop",
];

const ANIMATION_DIRECTIONS = new Set(["horizontal", "vertical"]);
const BLEND_MODES = new Set(["normal", "add"]);

function assertHasRequiredKeys(rawEffect, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawEffect)) {
      throw new Error(`Effect DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function assertEffectShape(rawEffect, fileName) {
  if (typeof rawEffect.id !== "string" || rawEffect.id.trim().length === 0) {
    throw new Error(`Effect DB ${fileName} has invalid id: ${rawEffect.id}`);
  }

  if (typeof rawEffect.effect_file_name !== "string" || rawEffect.effect_file_name.trim().length === 0) {
    throw new Error(`Effect DB ${fileName} has invalid effect_file_name: ${rawEffect.effect_file_name}`);
  }

  if (!Number.isFinite(rawEffect.width) || rawEffect.width <= 0) {
    throw new Error(`Effect DB ${fileName} has invalid width: ${rawEffect.width}`);
  }

  if (!Number.isFinite(rawEffect.height) || rawEffect.height <= 0) {
    throw new Error(`Effect DB ${fileName} has invalid height: ${rawEffect.height}`);
  }

  if (!Number.isFinite(rawEffect.animation_fps) || rawEffect.animation_fps <= 0) {
    throw new Error(`Effect DB ${fileName} has invalid animation_fps: ${rawEffect.animation_fps}`);
  }

  if (
    typeof rawEffect.animation_direction !== "string" ||
    !ANIMATION_DIRECTIONS.has(rawEffect.animation_direction)
  ) {
    throw new Error(
      `Effect DB ${fileName} has invalid animation_direction: ${rawEffect.animation_direction}`
    );
  }

  if (!Number.isFinite(rawEffect.scale) || rawEffect.scale <= 0) {
    throw new Error(`Effect DB ${fileName} has invalid scale: ${rawEffect.scale}`);
  }

  if (typeof rawEffect.blend_mode !== "string" || !BLEND_MODES.has(rawEffect.blend_mode)) {
    throw new Error(`Effect DB ${fileName} has invalid blend_mode: ${rawEffect.blend_mode}`);
  }

  if (typeof rawEffect.loop !== "boolean") {
    throw new Error(`Effect DB ${fileName} has invalid loop: ${rawEffect.loop}`);
  }
}

function normalizeEffectRecord(rawEffect, fileName) {
  assertHasRequiredKeys(rawEffect, fileName);
  assertEffectShape(rawEffect, fileName);

  const fileBaseName = fileName.replace(/\.json$/, "");
  if (rawEffect.id !== fileBaseName) {
    console.warn(
      `Effect DB ${fileName} id mismatch: file name id=${fileBaseName}, json id=${rawEffect.id}. Using JSON id.`
    );
  }

  return {
    id: rawEffect.id,
    effectFileName: rawEffect.effect_file_name.trim(),
    width: rawEffect.width,
    height: rawEffect.height,
    animationFps: rawEffect.animation_fps,
    animationDirection: rawEffect.animation_direction,
    scale: rawEffect.scale,
    blendMode: rawEffect.blend_mode,
    loop: rawEffect.loop,
  };
}

async function loadEffectFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/effect_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load effect DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawEffect = await response.json();
  return normalizeEffectRecord(rawEffect, fileName);
}

function extractEffectJsonFileNamesFromDirectoryHtml(html) {
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

async function discoverEffectDbFileNames(cacheBustKey) {
  const directoryUrl = new URL("../../db/effect_db/", import.meta.url);
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
    const fileNames = extractEffectJsonFileNamesFromDirectoryHtml(html);
    if (!fileNames.length) {
      throw new Error("No JSON files found in directory listing");
    }

    return fileNames;
  } catch (error) {
    console.warn(`Effect DB discovery fallback: ${error instanceof Error ? error.message : String(error)}`);
    return EFFECT_DB_FALLBACK_FILE_NAMES;
  }
}

export async function loadEffectDefinitions() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverEffectDbFileNames(cacheBustKey);
  const definitions = await Promise.all(fileNames.map((fileName) => loadEffectFile(fileName, cacheBustKey)));
  const seenIds = new Set();

  for (const definition of definitions) {
    if (seenIds.has(definition.id)) {
      throw new Error(`Effect DB has duplicate id: ${definition.id}`);
    }
    seenIds.add(definition.id);
  }

  return definitions;
}
