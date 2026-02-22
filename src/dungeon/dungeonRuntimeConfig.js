function toNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function resolveDungeonIdLabel(dungeonDefinition) {
  const dungeonId = toNonEmptyString(dungeonDefinition?.id);
  if (dungeonId) {
    return dungeonId;
  }
  return "(unknown)";
}

export function resolveDungeonBgmSourceOrThrow(dungeonDefinition, soundMap) {
  const dungeonId = resolveDungeonIdLabel(dungeonDefinition);
  const bgmKey = toNonEmptyString(dungeonDefinition?.bgmKey);
  if (!bgmKey) {
    throw new Error(`Dungeon ${dungeonId} has invalid bgmKey.`);
  }

  if (!soundMap || typeof soundMap !== "object" || Array.isArray(soundMap)) {
    throw new Error(`Dungeon ${dungeonId} cannot resolve BGM: sound map is invalid.`);
  }

  const bgmSource = toNonEmptyString(soundMap[bgmKey]);
  if (!bgmSource) {
    throw new Error(`Dungeon ${dungeonId} references unknown BGM key: ${bgmKey}`);
  }

  return bgmSource;
}

export function resolveDungeonEnemyDefinitionsOrThrow(dungeonDefinition, enemyDefinitionsById) {
  const dungeonId = resolveDungeonIdLabel(dungeonDefinition);
  const enemyDbIds = dungeonDefinition?.enemyDbIds;
  if (!Array.isArray(enemyDbIds)) {
    throw new Error(`Dungeon ${dungeonId} has invalid enemyDbIds.`);
  }

  if (!enemyDefinitionsById || typeof enemyDefinitionsById !== "object" || Array.isArray(enemyDefinitionsById)) {
    throw new Error(`Dungeon ${dungeonId} cannot resolve enemies: enemy definition map is invalid.`);
  }

  const resolvedDefinitions = [];
  for (let index = 0; index < enemyDbIds.length; index += 1) {
    const enemyDbId = toNonEmptyString(enemyDbIds[index]);
    if (!enemyDbId) {
      throw new Error(`Dungeon ${dungeonId} has invalid enemyDbIds[${index}].`);
    }

    const enemyDefinition = enemyDefinitionsById[enemyDbId];
    if (!enemyDefinition) {
      throw new Error(`Dungeon ${dungeonId} references unknown enemy DB id: ${enemyDbId}`);
    }

    resolvedDefinitions.push(enemyDefinition);
  }

  return resolvedDefinitions;
}
