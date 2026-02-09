const FORMATION_DB_FALLBACK_FILE_NAMES = ["formation_circle_01.json"];

const REQUIRED_KEYS = [
  "id",
  "type",
  "name_key",
  "description_key",
  "radius_base",
  "angular_speed_base",
  "phase_style",
  "bias_strength_mul",
  "bias_response_mul",
  "params",
];

function assertHasRequiredKeys(rawFormation, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawFormation)) {
      throw new Error(`Formation DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function assertFormationShape(rawFormation, fileName) {
  if (typeof rawFormation.id !== "string" || rawFormation.id.length === 0) {
    throw new Error(`Formation DB ${fileName} has invalid id: ${rawFormation.id}`);
  }

  if (typeof rawFormation.type !== "string" || rawFormation.type.length === 0) {
    throw new Error(`Formation DB ${fileName} has invalid type: ${rawFormation.type}`);
  }

  if (!Number.isFinite(rawFormation.radius_base) || rawFormation.radius_base <= 0) {
    throw new Error(`Formation DB ${fileName} has invalid radius_base: ${rawFormation.radius_base}`);
  }

  if (!Number.isFinite(rawFormation.angular_speed_base) || rawFormation.angular_speed_base <= 0) {
    throw new Error(
      `Formation DB ${fileName} has invalid angular_speed_base: ${rawFormation.angular_speed_base}`
    );
  }

  if (!Number.isFinite(rawFormation.bias_strength_mul) || rawFormation.bias_strength_mul < 0) {
    throw new Error(
      `Formation DB ${fileName} has invalid bias_strength_mul: ${rawFormation.bias_strength_mul}`
    );
  }

  if (!Number.isFinite(rawFormation.bias_response_mul) || rawFormation.bias_response_mul < 0) {
    throw new Error(
      `Formation DB ${fileName} has invalid bias_response_mul: ${rawFormation.bias_response_mul}`
    );
  }

  if (!rawFormation.params || typeof rawFormation.params !== "object") {
    throw new Error(`Formation DB ${fileName} has invalid params`);
  }
}

function normalizeClamp(rawClamp = {}) {
  return {
    radiusMin: Number.isFinite(rawClamp.radius_min) ? rawClamp.radius_min : 0,
    radiusMax: Number.isFinite(rawClamp.radius_max) ? rawClamp.radius_max : Number.POSITIVE_INFINITY,
    speedMin: Number.isFinite(rawClamp.speed_min) ? rawClamp.speed_min : 0,
    speedMax: Number.isFinite(rawClamp.speed_max) ? rawClamp.speed_max : Number.POSITIVE_INFINITY,
    biasOffsetRatioMax: Number.isFinite(rawClamp.bias_offset_ratio_max)
      ? rawClamp.bias_offset_ratio_max
      : Number.POSITIVE_INFINITY,
  };
}

function normalizeFormationRecord(rawFormation, fileName) {
  assertHasRequiredKeys(rawFormation, fileName);
  assertFormationShape(rawFormation, fileName);

  return {
    id: rawFormation.id,
    type: rawFormation.type,
    nameKey: rawFormation.name_key,
    descriptionKey: rawFormation.description_key,
    tags: Array.isArray(rawFormation.tags) ? rawFormation.tags.filter((tag) => typeof tag === "string") : [],
    radiusBase: rawFormation.radius_base,
    angularSpeedBase: rawFormation.angular_speed_base,
    phaseStyle: rawFormation.phase_style,
    biasStrengthMul: rawFormation.bias_strength_mul,
    biasResponseMul: rawFormation.bias_response_mul,
    clamp: normalizeClamp(rawFormation.clamp),
    params: rawFormation.params,
    ui: rawFormation.ui ?? null,
  };
}

async function loadFormationFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/formation_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load formation DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawFormation = await response.json();
  return normalizeFormationRecord(rawFormation, fileName);
}

function extractFormationJsonFileNamesFromDirectoryHtml(html) {
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

async function discoverFormationDbFileNames(cacheBustKey) {
  const directoryUrl = new URL("../../db/formation_db/", import.meta.url);
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
    const fileNames = extractFormationJsonFileNamesFromDirectoryHtml(html);
    if (!fileNames.length) {
      throw new Error("No JSON files found in directory listing");
    }
    return fileNames;
  } catch (error) {
    console.warn(`Formation DB discovery fallback: ${error instanceof Error ? error.message : String(error)}`);
    return FORMATION_DB_FALLBACK_FILE_NAMES;
  }
}

export async function loadFormationDefinitions() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverFormationDbFileNames(cacheBustKey);
  return Promise.all(fileNames.map((fileName) => loadFormationFile(fileName, cacheBustKey)));
}
