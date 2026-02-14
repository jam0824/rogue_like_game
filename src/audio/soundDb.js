function toNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

const SOUND_DB_CANDIDATE_PATHS = [
  "../../db/sound_db/sound_db.json",
  "../../db/dungeon_db/sound_db/sound_db.json",
];

function flattenSoundEntry(target, key, value) {
  const normalizedKey = toNonEmptyString(key);
  if (!normalizedKey) {
    return;
  }

  const normalizedSrc = toNonEmptyString(value);
  if (!normalizedSrc) {
    return;
  }

  target[normalizedKey] = normalizedSrc;
}

function normalizeSoundEffectMap(rawSoundDb) {
  if (!rawSoundDb || typeof rawSoundDb !== "object" || Array.isArray(rawSoundDb)) {
    throw new Error("Sound DB has invalid root: expected object.");
  }

  const soundMap = {};
  const nestedSections = ["weapon", "skill"];

  for (const [key, value] of Object.entries(rawSoundDb)) {
    if (nestedSections.includes(key)) {
      continue;
    }
    flattenSoundEntry(soundMap, key, value);
  }

  for (const sectionKey of nestedSections) {
    const section = rawSoundDb[sectionKey];
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      continue;
    }

    for (const [key, value] of Object.entries(section)) {
      flattenSoundEntry(soundMap, key, value);
    }
  }

  return soundMap;
}

export async function loadSoundEffectMap() {
  const cacheBustKey = String(Date.now());
  const errors = [];

  for (const relativePath of SOUND_DB_CANDIDATE_PATHS) {
    const url = new URL(relativePath, import.meta.url);
    url.searchParams.set("cb", cacheBustKey);

    try {
      const response = await fetch(url.href, { cache: "no-store" });
      if (!response.ok) {
        errors.push(`${relativePath}: HTTP ${response.status}`);
        continue;
      }

      const rawSoundDb = await response.json();
      return normalizeSoundEffectMap(rawSoundDb);
    } catch (error) {
      errors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Failed to load sound DB (${errors.join(" | ")})`);
}

export { normalizeSoundEffectMap };
