export const PLAYER_STATE_SCHEMA_VERSION = "player_state_v3";
export const PLAYER_STATE_STORAGE_KEY = "rogue_like_game.player_state_v3";
export const PLAYER_STATE_LEGACY_STORAGE_KEYS = [
  "rogue_like_game.player_state_v1",
  "rogue_like_game.player_state_v2",
];

const DEFAULT_STARTER_WEAPON_DEF_ID = "weapon_sword_01";
const DEFAULT_INVENTORY_SLOT_MAX = 10;
const DEFAULT_STASH_CAPACITY = 30;
const QUICK_SLOT_COUNT = 8;
const MAX_EQUIPPED_ACCESSORY_SLOTS = 3;
const LEGACY_WEAPON_DEF_KEYS = [
  "name_key",
  "description_key",
  "weapon_file_name",
  "width",
  "height",
  "base_damage",
  "attack_cooldown_sec",
  "hit_num",
  "pierce_count",
  "chip_slot_count",
];
const STAT_KEYS = ["vit", "for", "agi", "pow", "tec", "arc"];

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toNonNegativeInt(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function normalizeQuickSlotIndex(value) {
  if (!Number.isInteger(value)) {
    return null;
  }

  if (value < 0 || value >= QUICK_SLOT_COUNT) {
    return null;
  }

  return value;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createEmptyQuickslots() {
  return Array.from({ length: QUICK_SLOT_COUNT }, () => null);
}

function getDefaultBaseStats() {
  return {
    vit: 1,
    for: 1,
    agi: 1,
    pow: 1,
    tec: 1,
    arc: 1,
  };
}

function getDefaultRunStats() {
  return {
    vit: 0,
    for: 0,
    agi: 0,
    pow: 0,
    tec: 0,
    arc: 0,
  };
}

function getFallbackWeaponDef() {
  return {
    id: DEFAULT_STARTER_WEAPON_DEF_ID,
    nameKey: "name_weapon_sword_01",
    descriptionKey: "description_weapon_sword_01",
    weaponFileName: "weapon_sword_01.png",
    width: 32,
    height: 64,
    rarity: "rare",
    weaponPlus: 0,
    baseDamage: 12,
    attackCooldownSec: 2,
    hitNum: 1,
    pierceCount: 10,
    chipSlotCount: 3,
    formationId: "formation_id_circle01",
    skills: [
      { id: "skill_id_fire01", plus: 0 },
      { id: "skill_id_poison01", plus: 3 },
    ],
  };
}

function sanitizeStats(rawStats, fallbackStats) {
  const source = isPlainObject(rawStats) ? rawStats : {};
  const base = isPlainObject(fallbackStats) ? fallbackStats : {};
  const result = {};

  for (const key of STAT_KEYS) {
    result[key] = toNonNegativeInt(source[key], toNonNegativeInt(base[key], 0));
  }

  return result;
}

function sanitizeSkills(rawSkills, fallbackSkills) {
  const source = Array.isArray(rawSkills) ? rawSkills : [];
  const fallback = Array.isArray(fallbackSkills) ? fallbackSkills : [];
  const result = source
    .filter((skill) => isPlainObject(skill) && typeof skill.id === "string" && skill.id.length > 0)
    .map((skill) => ({
      id: skill.id,
      plus: toNonNegativeInt(skill.plus, 0),
    }));

  if (result.length > 0) {
    return result;
  }

  return fallback
    .filter((skill) => isPlainObject(skill) && typeof skill.id === "string" && skill.id.length > 0)
    .map((skill) => ({
      id: skill.id,
      plus: toNonNegativeInt(skill.plus, 0),
    }));
}

function resolveStarterWeaponDefId(weaponDefinitionsById, preferredId = DEFAULT_STARTER_WEAPON_DEF_ID) {
  if (preferredId && weaponDefinitionsById?.[preferredId]) {
    return preferredId;
  }

  const ids = weaponDefinitionsById ? Object.keys(weaponDefinitionsById) : [];
  if (ids.length > 0) {
    return ids[0];
  }

  return DEFAULT_STARTER_WEAPON_DEF_ID;
}

function getWeaponDefById(weaponDefinitionsById, weaponDefId, starterWeaponDefId) {
  if (weaponDefinitionsById?.[weaponDefId]) {
    return weaponDefinitionsById[weaponDefId];
  }

  if (weaponDefinitionsById?.[starterWeaponDefId]) {
    return weaponDefinitionsById[starterWeaponDefId];
  }

  return getFallbackWeaponDef();
}

function getDefaultWeaponInstance(starterWeaponDef) {
  const weaponDef = starterWeaponDef ?? getFallbackWeaponDef();
  const fallbackSkills = sanitizeSkills(weaponDef.skills, []);

  return {
    weapon_def_id: weaponDef.id,
    rarity: typeof weaponDef.rarity === "string" ? weaponDef.rarity : "rare",
    weapon_plus: toNonNegativeInt(weaponDef.weaponPlus, 0),
    chip_slot_count: Math.max(
      0,
      toNonNegativeInt(weaponDef.chipSlotCount, Math.max(0, fallbackSkills.length))
    ),
    formation_id:
      typeof weaponDef.formationId === "string" && weaponDef.formationId.length > 0
        ? weaponDef.formationId
        : "formation_id_circle01",
    skills: fallbackSkills,
    identified: true,
  };
}

function hasLegacyWeaponDefKeys(rawWeaponInstance) {
  if (!isPlainObject(rawWeaponInstance)) {
    return false;
  }

  return LEGACY_WEAPON_DEF_KEYS.some((key) => key in rawWeaponInstance);
}

function isValidWeaponInstanceShape(rawWeaponInstance, weaponDefinitionsById) {
  if (!isPlainObject(rawWeaponInstance)) {
    return false;
  }

  if (hasLegacyWeaponDefKeys(rawWeaponInstance)) {
    return false;
  }

  if (typeof rawWeaponInstance.weapon_def_id !== "string" || rawWeaponInstance.weapon_def_id.length === 0) {
    return false;
  }

  if (!weaponDefinitionsById?.[rawWeaponInstance.weapon_def_id]) {
    return false;
  }

  if ("skills" in rawWeaponInstance && !Array.isArray(rawWeaponInstance.skills)) {
    return false;
  }

  if ("formation_id" in rawWeaponInstance && typeof rawWeaponInstance.formation_id !== "string") {
    return false;
  }

  if ("weapon_plus" in rawWeaponInstance && !Number.isFinite(rawWeaponInstance.weapon_plus)) {
    return false;
  }

  if ("chip_slot_count" in rawWeaponInstance && !Number.isFinite(rawWeaponInstance.chip_slot_count)) {
    return false;
  }

  if ("rarity" in rawWeaponInstance && typeof rawWeaponInstance.rarity !== "string") {
    return false;
  }

  if ("identified" in rawWeaponInstance && typeof rawWeaponInstance.identified !== "boolean") {
    return false;
  }

  if ("stat_overrides" in rawWeaponInstance && !isPlainObject(rawWeaponInstance.stat_overrides)) {
    return false;
  }

  return true;
}

function isLegacyOrInvalidPlayerState(rawPlayerState, weaponDefinitionsById) {
  if (!isPlainObject(rawPlayerState)) {
    return true;
  }

  if (rawPlayerState.schema_version !== PLAYER_STATE_SCHEMA_VERSION) {
    return true;
  }

  if (!isPlainObject(rawPlayerState.run)) {
    return true;
  }

  const isInRun = rawPlayerState.in_run !== false;
  const equipped = rawPlayerState.run.equipped_weapons;

  if (isInRun && (!Array.isArray(equipped) || equipped.length === 0)) {
    return true;
  }

  if (Array.isArray(equipped)) {
    for (const entry of equipped) {
      if (!isPlainObject(entry)) {
        return true;
      }

      if (!isPlainObject(entry.weapon)) {
        return true;
      }

      if (hasLegacyWeaponDefKeys(entry.weapon)) {
        return true;
      }

      if (!isValidWeaponInstanceShape(entry.weapon, weaponDefinitionsById)) {
        return true;
      }
    }
  }

  return false;
}

function sanitizeWeaponInstance(rawWeaponInstance, weaponDefinitionsById, starterWeaponDefId, options = {}) {
  const source = isPlainObject(rawWeaponInstance) ? rawWeaponInstance : {};
  const allowUnknownWeaponDef = options.allowUnknownWeaponDef === true;

  const requestedWeaponDefId =
    typeof source.weapon_def_id === "string" && source.weapon_def_id.length > 0
      ? source.weapon_def_id
      : starterWeaponDefId;

  const weaponDef = getWeaponDefById(weaponDefinitionsById, requestedWeaponDefId, starterWeaponDefId);
  const hasRequestedWeaponDef = Boolean(weaponDefinitionsById?.[requestedWeaponDefId]);
  const resolvedWeaponDefId = hasRequestedWeaponDef || !allowUnknownWeaponDef ? weaponDef.id : requestedWeaponDefId;

  const fallbackSkills = hasRequestedWeaponDef ? weaponDef.skills : [];
  const skills = sanitizeSkills(source.skills, fallbackSkills);
  const fallbackRarity = hasRequestedWeaponDef ? weaponDef.rarity : "rare";
  const fallbackWeaponPlus = hasRequestedWeaponDef ? weaponDef.weaponPlus : 0;
  const fallbackChipSlotCount = hasRequestedWeaponDef
    ? toNonNegativeInt(weaponDef.chipSlotCount, Math.max(0, skills.length))
    : Math.max(0, skills.length);
  const fallbackFormationId = hasRequestedWeaponDef
    ? weaponDef.formationId
    : "formation_id_circle01";

  const instance = {
    weapon_def_id: resolvedWeaponDefId,
    rarity: typeof source.rarity === "string" ? source.rarity : typeof fallbackRarity === "string" ? fallbackRarity : "rare",
    weapon_plus: toNonNegativeInt(source.weapon_plus, toNonNegativeInt(fallbackWeaponPlus, 0)),
    chip_slot_count: Math.max(0, toNonNegativeInt(source.chip_slot_count, fallbackChipSlotCount)),
    formation_id:
      typeof source.formation_id === "string" && source.formation_id.length > 0
        ? source.formation_id
        : typeof fallbackFormationId === "string" && fallbackFormationId.length > 0
          ? fallbackFormationId
          : "formation_id_circle01",
    skills,
    identified: source.identified !== false,
  };

  if (isPlainObject(source.stat_overrides)) {
    instance.stat_overrides = deepClone(source.stat_overrides);
  }

  return instance;
}

function sanitizeStoredItemEntry(rawEntry) {
  if (!isPlainObject(rawEntry)) {
    return null;
  }

  const itemDefId =
    typeof rawEntry.item_def_id === "string" && rawEntry.item_def_id.length > 0
      ? rawEntry.item_def_id
      : "";
  const count = toNonNegativeInt(rawEntry.count, 0);

  if (itemDefId.length <= 0 || count <= 0) {
    return null;
  }

  return {
    type: "item",
    item_def_id: itemDefId,
    count,
  };
}

function sanitizeStoredArmorEntry(rawEntry) {
  if (!isPlainObject(rawEntry)) {
    return null;
  }

  const armorDefId =
    typeof rawEntry.armor_def_id === "string" && rawEntry.armor_def_id.length > 0
      ? rawEntry.armor_def_id
      : "";

  if (armorDefId.length <= 0) {
    return null;
  }

  return {
    armor_def_id: armorDefId,
    rarity: typeof rawEntry.rarity === "string" ? rawEntry.rarity : "common",
    plus: Math.max(0, toNonNegativeInt(rawEntry.plus, 0)),
    durability: Math.max(0, toFiniteNumber(rawEntry.durability, 100)),
    identified: rawEntry.identified !== false,
  };
}

function sanitizeStoredAccessoryEntry(rawEntry) {
  if (!isPlainObject(rawEntry)) {
    return null;
  }

  const accessoryDefId =
    typeof rawEntry.accessory_def_id === "string" && rawEntry.accessory_def_id.length > 0
      ? rawEntry.accessory_def_id
      : "";

  if (accessoryDefId.length <= 0) {
    return null;
  }

  return {
    accessory_def_id: accessoryDefId,
    rarity: typeof rawEntry.rarity === "string" ? rawEntry.rarity : "common",
    plus: Math.max(0, toNonNegativeInt(rawEntry.plus, 0)),
    identified: rawEntry.identified !== false,
  };
}

function sanitizeStoredWeaponEntry(rawEntry, weaponDefinitionsById, starterWeaponDefId, options = {}) {
  if (!isPlainObject(rawEntry)) {
    return null;
  }

  const weapon = sanitizeWeaponInstance(rawEntry, weaponDefinitionsById, starterWeaponDefId, options);
  return {
    type: "weapon",
    ...weapon,
  };
}

function sanitizeStoredInventoryEntry(rawEntry, weaponDefinitionsById, starterWeaponDefId, options = {}) {
  if (!isPlainObject(rawEntry) || typeof rawEntry.type !== "string") {
    return null;
  }

  if (rawEntry.type === "item") {
    return sanitizeStoredItemEntry(rawEntry);
  }

  if (rawEntry.type === "weapon") {
    return sanitizeStoredWeaponEntry(rawEntry, weaponDefinitionsById, starterWeaponDefId, options);
  }

  if (rawEntry.type === "armor") {
    const armor = sanitizeStoredArmorEntry(rawEntry);
    return armor ? { type: "armor", ...armor } : null;
  }

  if (rawEntry.type === "accessory") {
    const accessory = sanitizeStoredAccessoryEntry(rawEntry);
    return accessory ? { type: "accessory", ...accessory } : null;
  }

  return null;
}

function sanitizeStoredInventoryEntries(rawEntries, weaponDefinitionsById, starterWeaponDefId, options = {}) {
  if (!Array.isArray(rawEntries)) {
    return [];
  }

  const result = [];
  for (const rawEntry of rawEntries) {
    const entry = sanitizeStoredInventoryEntry(rawEntry, weaponDefinitionsById, starterWeaponDefId, options);
    if (!entry) {
      continue;
    }
    result.push(entry);
  }

  return result;
}

function collectInventoryItemCounts(inventoryEntries) {
  const counts = new Map();
  const entries = Array.isArray(inventoryEntries) ? inventoryEntries : [];

  for (const entry of entries) {
    if (!isPlainObject(entry) || entry.type !== "item") {
      continue;
    }

    if (typeof entry.item_def_id !== "string" || entry.item_def_id.length <= 0) {
      continue;
    }

    const count = toNonNegativeInt(entry.count, 0);
    if (count <= 0) {
      continue;
    }

    counts.set(entry.item_def_id, (counts.get(entry.item_def_id) ?? 0) + count);
  }

  return counts;
}

function sanitizeQuickslots(rawQuickslots, inventoryEntries) {
  const source = Array.isArray(rawQuickslots) ? rawQuickslots : [];
  const available = collectInventoryItemCounts(inventoryEntries);
  const result = createEmptyQuickslots();

  for (let index = 0; index < QUICK_SLOT_COUNT; index += 1) {
    const value = source[index];
    if (typeof value !== "string" || value.length <= 0) {
      continue;
    }

    if ((available.get(value) ?? 0) <= 0) {
      continue;
    }

    result[index] = value;
  }

  return result;
}

function sanitizeEquippedWeapons(rawEquippedWeapons, weaponDefinitionsById, starterWeaponDefId, options = {}) {
  const source = Array.isArray(rawEquippedWeapons) ? rawEquippedWeapons : [];
  const fallbackToStarter = options.fallbackToStarter !== false;
  const entries = source
    .map((entry, index) => {
      const slot = Math.max(0, toNonNegativeInt(entry?.slot, index));
      const weapon = sanitizeWeaponInstance(entry?.weapon, weaponDefinitionsById, starterWeaponDefId, options);

      return {
        slot,
        weapon,
        runtime: {
          attack_seq: Math.max(0, toNonNegativeInt(entry?.runtime?.attack_seq, 0)),
          cooldown_remaining_sec: Math.max(0, toFiniteNumber(entry?.runtime?.cooldown_remaining_sec, 0)),
        },
      };
    })
    .sort((a, b) => a.slot - b.slot);

  if (entries.length > 0) {
    return entries;
  }

  if (!fallbackToStarter) {
    return [];
  }

  const starterWeaponDef = getWeaponDefById(weaponDefinitionsById, starterWeaponDefId, starterWeaponDefId);

  return [
    {
      slot: 0,
      weapon: getDefaultWeaponInstance(starterWeaponDef),
      runtime: {
        attack_seq: 0,
        cooldown_remaining_sec: 0,
      },
    },
  ];
}

function sanitizeBaseSection(rawBase, weaponDefinitionsById, starterWeaponDefId) {
  const base = isPlainObject(rawBase) ? rawBase : {};
  return {
    base_stats: sanitizeStats(base.base_stats, getDefaultBaseStats()),
    wallet: {
      gold: Math.max(0, toFiniteNumber(base.wallet?.gold, 0)),
    },
    reputation: {
      goodness: toFiniteNumber(base.reputation?.goodness, 0),
      notoriety: toFiniteNumber(base.reputation?.notoriety, 0),
    },
    unlocks: {
      weapon_slot_max: Math.max(1, toNonNegativeInt(base.unlocks?.weapon_slot_max, 1)),
      inventory_slot_max: Math.max(1, toNonNegativeInt(base.unlocks?.inventory_slot_max, DEFAULT_INVENTORY_SLOT_MAX)),
    },
    stash: {
      capacity: Math.max(0, toNonNegativeInt(base.stash?.capacity, DEFAULT_STASH_CAPACITY)),
      items: sanitizeStoredInventoryEntries(base.stash?.items, weaponDefinitionsById, starterWeaponDefId, {
        allowUnknownWeaponDef: true,
      }),
    },
  };
}

function sanitizeRunSection(rawRun, weaponDefinitionsById, starterWeaponDefId, inRun) {
  const run = isPlainObject(rawRun) ? rawRun : {};
  const inventory = sanitizeStoredInventoryEntries(run.inventory, weaponDefinitionsById, starterWeaponDefId, {
    allowUnknownWeaponDef: true,
  });

  return {
    floor: Math.max(1, toNonNegativeInt(run.floor, 1)),
    run_level: Math.max(1, toNonNegativeInt(run.run_level, 1)),
    xp: Math.max(0, toNonNegativeInt(run.xp, 0)),
    stat_run: sanitizeStats(run.stat_run, getDefaultRunStats()),
    hp: Math.max(0, toFiniteNumber(run.hp, 100)),
    pos: {
      x: toFiniteNumber(run.pos?.x, 0),
      y: toFiniteNumber(run.pos?.y, 0),
    },
    equipped_weapons: sanitizeEquippedWeapons(run.equipped_weapons, weaponDefinitionsById, starterWeaponDefId, {
      fallbackToStarter: inRun,
    }),
    equipped_armor: sanitizeStoredArmorEntry(run.equipped_armor),
    equipped_accessories: Array.isArray(run.equipped_accessories)
      ? run.equipped_accessories
          .map((entry) => sanitizeStoredAccessoryEntry(entry))
          .filter((entry) => entry !== null)
          .slice(0, MAX_EQUIPPED_ACCESSORY_SLOTS)
      : [],
    inventory,
    quickslots: sanitizeQuickslots(run.quickslots, inventory),
  };
}

function getDefaultRunSection(weaponDefinitionsById, starterWeaponDefId, options = {}) {
  const includeStarterWeapon = options.includeStarterWeapon !== false;

  return {
    floor: 1,
    run_level: 1,
    xp: 0,
    stat_run: getDefaultRunStats(),
    hp: 100,
    pos: {
      x: 0,
      y: 0,
    },
    equipped_weapons: sanitizeEquippedWeapons([], weaponDefinitionsById, starterWeaponDefId, {
      fallbackToStarter: includeStarterWeapon,
    }),
    equipped_armor: null,
    equipped_accessories: [],
    inventory: [],
    quickslots: createEmptyQuickslots(),
  };
}

function sanitizePlayerState(rawPlayerState, weaponDefinitionsById, starterWeaponDefId, nowUnixSec) {
  const source = isPlainObject(rawPlayerState) ? rawPlayerState : {};
  const inRun = source.in_run !== false;

  return {
    schema_version: PLAYER_STATE_SCHEMA_VERSION,
    saved_at: toNonNegativeInt(source.saved_at, toNonNegativeInt(nowUnixSec, 0)),
    base: sanitizeBaseSection(source.base, weaponDefinitionsById, starterWeaponDefId),
    in_run: inRun,
    run: sanitizeRunSection(source.run, weaponDefinitionsById, starterWeaponDefId, inRun),
  };
}

function mergeWeaponDefinitionWithInstance(weaponDef, weaponInstance) {
  return {
    ...weaponDef,
    id: weaponDef.id,
    rarity: typeof weaponInstance.rarity === "string" ? weaponInstance.rarity : weaponDef.rarity,
    weaponPlus: toNonNegativeInt(weaponInstance.weapon_plus, toNonNegativeInt(weaponDef.weaponPlus, 0)),
    chipSlotCount: Math.max(
      0,
      toNonNegativeInt(weaponInstance.chip_slot_count, toNonNegativeInt(weaponDef.chipSlotCount, 0))
    ),
    formationId:
      typeof weaponInstance.formation_id === "string" && weaponInstance.formation_id.length > 0
        ? weaponInstance.formation_id
        : weaponDef.formationId,
    skills: sanitizeSkills(weaponInstance.skills, weaponDef.skills),
  };
}

function sanitizeRuntimeUiInventoryItem(rawItem) {
  if (!isPlainObject(rawItem)) {
    return null;
  }

  const itemDefId = typeof rawItem.id === "string" ? rawItem.id.trim() : "";
  if (itemDefId.length <= 0) {
    return null;
  }

  const count = toNonNegativeInt(rawItem.count, 0);
  if (count <= 0) {
    return null;
  }

  return {
    type: "item",
    item_def_id: itemDefId,
    count,
  };
}

function buildInventoryAndQuickslotsFromRuntimeSystemUi(runtimeSystemUi) {
  const runtimeItems = Array.isArray(runtimeSystemUi?.inventory?.items) ? runtimeSystemUi.inventory.items : [];
  const inventory = [];
  const quickslots = createEmptyQuickslots();

  for (const rawItem of runtimeItems) {
    const itemEntry = sanitizeRuntimeUiInventoryItem(rawItem);
    if (!itemEntry) {
      continue;
    }

    inventory.push(itemEntry);

    const slot = normalizeQuickSlotIndex(rawItem?.quickSlot);
    if (slot === null || quickslots[slot] !== null) {
      continue;
    }

    quickslots[slot] = itemEntry.item_def_id;
  }

  return {
    inventory,
    quickslots: sanitizeQuickslots(quickslots, inventory),
  };
}

export function createDefaultPlayerState(starterWeaponDef, nowUnixSec) {
  const starterDef = starterWeaponDef && typeof starterWeaponDef === "object" ? starterWeaponDef : getFallbackWeaponDef();
  const starterWeaponDefId = resolveStarterWeaponDefId({ [starterDef.id]: starterDef }, starterDef.id);
  return sanitizePlayerState(null, { [starterDef.id]: starterDef }, starterWeaponDefId, nowUnixSec);
}

export function loadPlayerStateFromStorage(
  storage,
  key,
  weaponDefinitionsById,
  starterWeaponDefId,
  nowUnixSec
) {
  const resolvedStarterWeaponDefId = resolveStarterWeaponDefId(weaponDefinitionsById, starterWeaponDefId);
  const starterWeaponDef = getWeaponDefById(
    weaponDefinitionsById,
    resolvedStarterWeaponDefId,
    resolvedStarterWeaponDefId
  );

  if (!storage || typeof storage.getItem !== "function") {
    return createDefaultPlayerState(starterWeaponDef, nowUnixSec);
  }

  const storageKey = typeof key === "string" && key.length > 0 ? key : PLAYER_STATE_STORAGE_KEY;

  try {
    const rawText = storage.getItem(storageKey);
    if (!rawText) {
      return createDefaultPlayerState(starterWeaponDef, nowUnixSec);
    }

    const parsed = JSON.parse(rawText);
    if (isLegacyOrInvalidPlayerState(parsed, weaponDefinitionsById)) {
      return createDefaultPlayerState(starterWeaponDef, nowUnixSec);
    }

    return sanitizePlayerState(parsed, weaponDefinitionsById, resolvedStarterWeaponDefId, nowUnixSec);
  } catch {
    return createDefaultPlayerState(starterWeaponDef, nowUnixSec);
  }
}

export function savePlayerStateToStorage(storage, key, playerState) {
  if (!storage || typeof storage.setItem !== "function") {
    return false;
  }

  const storageKey = typeof key === "string" && key.length > 0 ? key : PLAYER_STATE_STORAGE_KEY;

  try {
    storage.setItem(storageKey, JSON.stringify(playerState));
    return true;
  } catch {
    return false;
  }
}

export function syncPlayerStateFromRuntime(playerState, runtimePlayer, runtimeWeapons, runtimeSystemUi, nowUnixSec) {
  if (!isPlainObject(playerState)) {
    return;
  }

  playerState.schema_version = PLAYER_STATE_SCHEMA_VERSION;
  playerState.saved_at = toNonNegativeInt(nowUnixSec, toNonNegativeInt(playerState.saved_at, 0));
  playerState.in_run = playerState.in_run !== false;

  playerState.base = sanitizeBaseSection(playerState.base, null, DEFAULT_STARTER_WEAPON_DEF_ID);

  if (!isPlainObject(playerState.run)) {
    playerState.run = getDefaultRunSection(null, DEFAULT_STARTER_WEAPON_DEF_ID, {
      includeStarterWeapon: playerState.in_run,
    });
  }

  playerState.run.floor = Math.max(1, toNonNegativeInt(playerState.run.floor, 1));
  playerState.run.run_level = Math.max(1, toNonNegativeInt(playerState.run.run_level, 1));
  playerState.run.xp = Math.max(0, toNonNegativeInt(playerState.run.xp, 0));
  playerState.run.stat_run = sanitizeStats(playerState.run.stat_run, getDefaultRunStats());
  playerState.run.hp = Math.max(0, toFiniteNumber(playerState.run.hp, 100));

  if (!isPlainObject(playerState.run.pos)) {
    playerState.run.pos = { x: 0, y: 0 };
  }

  if (runtimePlayer && Number.isFinite(runtimePlayer.x) && Number.isFinite(runtimePlayer.y)) {
    playerState.run.pos.x = runtimePlayer.x;
    playerState.run.pos.y = runtimePlayer.y;
  }

  if (runtimePlayer && Number.isFinite(runtimePlayer.hp)) {
    playerState.run.hp = Math.max(0, Number(runtimePlayer.hp));
  }

  playerState.run.equipped_armor = sanitizeStoredArmorEntry(playerState.run.equipped_armor);
  playerState.run.equipped_accessories = Array.isArray(playerState.run.equipped_accessories)
    ? playerState.run.equipped_accessories
        .map((entry) => sanitizeStoredAccessoryEntry(entry))
        .filter((entry) => entry !== null)
        .slice(0, MAX_EQUIPPED_ACCESSORY_SLOTS)
    : [];

  let equippedWeapons = Array.isArray(playerState.run.equipped_weapons)
    ? playerState.run.equipped_weapons
        .map((entry, index) => {
          const slot = Math.max(0, toNonNegativeInt(entry?.slot, index));
          return {
            slot,
            weapon: sanitizeWeaponInstance(entry?.weapon, null, DEFAULT_STARTER_WEAPON_DEF_ID, {
              allowUnknownWeaponDef: true,
            }),
            runtime: {
              attack_seq: Math.max(0, toNonNegativeInt(entry?.runtime?.attack_seq, 0)),
              cooldown_remaining_sec: Math.max(0, toFiniteNumber(entry?.runtime?.cooldown_remaining_sec, 0)),
            },
          };
        })
        .sort((a, b) => a.slot - b.slot)
    : [];

  if (Array.isArray(runtimeWeapons)) {
    for (let index = 0; index < runtimeWeapons.length; index += 1) {
      const runtimeWeapon = runtimeWeapons[index];
      let slotEntry = equippedWeapons[index];

      if (!slotEntry) {
        const runtimeWeaponDefId =
          typeof runtimeWeapon?.weaponDefId === "string" && runtimeWeapon.weaponDefId.length > 0
            ? runtimeWeapon.weaponDefId
            : DEFAULT_STARTER_WEAPON_DEF_ID;
        slotEntry = {
          slot: index,
          weapon: sanitizeWeaponInstance(
            {
              weapon_def_id: runtimeWeaponDefId,
              rarity: "rare",
              weapon_plus: 0,
              chip_slot_count: 0,
              formation_id:
                typeof runtimeWeapon?.formationId === "string" ? runtimeWeapon.formationId : "formation_id_circle01",
              skills: [],
              identified: true,
            },
            null,
            DEFAULT_STARTER_WEAPON_DEF_ID,
            {
              allowUnknownWeaponDef: true,
            }
          ),
          runtime: {
            attack_seq: 0,
            cooldown_remaining_sec: 0,
          },
        };
        equippedWeapons.push(slotEntry);
      }

      slotEntry.slot = Math.max(0, toNonNegativeInt(slotEntry.slot, index));
      if (!isPlainObject(slotEntry.runtime)) {
        slotEntry.runtime = {};
      }

      slotEntry.runtime.attack_seq = Math.max(0, toNonNegativeInt(runtimeWeapon?.attackSeq, 0));
      slotEntry.runtime.cooldown_remaining_sec = Math.max(0, toFiniteNumber(runtimeWeapon?.cooldownRemainingSec, 0));
    }
  }

  if (equippedWeapons.length <= 0 && playerState.in_run) {
    equippedWeapons = [
      {
        slot: 0,
        weapon: getDefaultWeaponInstance(getFallbackWeaponDef()),
        runtime: {
          attack_seq: 0,
          cooldown_remaining_sec: 0,
        },
      },
    ];
  }

  playerState.run.equipped_weapons = equippedWeapons.sort((a, b) => a.slot - b.slot);

  const currentInventory = sanitizeStoredInventoryEntries(
    playerState.run.inventory,
    null,
    DEFAULT_STARTER_WEAPON_DEF_ID,
    { allowUnknownWeaponDef: true }
  );

  if (runtimeSystemUi && typeof runtimeSystemUi === "object") {
    const preservedNonItemEntries = currentInventory.filter((entry) => entry.type !== "item");
    const runtimeInventory = buildInventoryAndQuickslotsFromRuntimeSystemUi(runtimeSystemUi);

    playerState.run.inventory = [...preservedNonItemEntries, ...runtimeInventory.inventory];
    playerState.run.quickslots = runtimeInventory.quickslots;
  } else {
    playerState.run.inventory = currentInventory;
    playerState.run.quickslots = sanitizeQuickslots(playerState.run.quickslots, playerState.run.inventory);
  }
}

export function beginNewRun(playerState, weaponDefinitionsById, starterWeaponDefId, nowUnixSec) {
  if (!isPlainObject(playerState)) {
    return;
  }

  const resolvedStarterWeaponDefId = resolveStarterWeaponDefId(weaponDefinitionsById, starterWeaponDefId);
  const normalized = sanitizePlayerState(
    playerState,
    weaponDefinitionsById,
    resolvedStarterWeaponDefId,
    nowUnixSec
  );

  playerState.schema_version = PLAYER_STATE_SCHEMA_VERSION;
  playerState.saved_at = toNonNegativeInt(nowUnixSec, toNonNegativeInt(normalized.saved_at, 0));
  playerState.base = normalized.base;
  playerState.in_run = true;
  playerState.run = getDefaultRunSection(weaponDefinitionsById, resolvedStarterWeaponDefId, {
    includeStarterWeapon: true,
  });
}

export function markRunLostByDeath(playerState, nowUnixSec) {
  if (!isPlainObject(playerState)) {
    return;
  }

  playerState.schema_version = PLAYER_STATE_SCHEMA_VERSION;
  playerState.saved_at = toNonNegativeInt(nowUnixSec, toNonNegativeInt(playerState.saved_at, 0));
  playerState.base = sanitizeBaseSection(playerState.base, null, DEFAULT_STARTER_WEAPON_DEF_ID);
  playerState.in_run = false;
  playerState.run = getDefaultRunSection(null, DEFAULT_STARTER_WEAPON_DEF_ID, {
    includeStarterWeapon: false,
  });
  playerState.run.hp = 0;
}

export function buildWeaponDefinitionsFromPlayerState(playerState, weaponDefinitionsById, starterWeaponDefId) {
  const resolvedStarterWeaponDefId = resolveStarterWeaponDefId(weaponDefinitionsById, starterWeaponDefId);
  const normalized = sanitizePlayerState(playerState, weaponDefinitionsById, resolvedStarterWeaponDefId, 0);

  return normalized.run.equipped_weapons
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => {
      const weaponDef = getWeaponDefById(weaponDefinitionsById, entry.weapon.weapon_def_id, resolvedStarterWeaponDefId);
      return mergeWeaponDefinitionWithInstance(weaponDef, entry.weapon);
    });
}

export function applySavedWeaponRuntime(playerState, runtimeWeapons) {
  if (!Array.isArray(runtimeWeapons) || runtimeWeapons.length === 0) {
    return;
  }

  const equippedWeapons = Array.isArray(playerState?.run?.equipped_weapons)
    ? [...playerState.run.equipped_weapons].sort((a, b) => toNonNegativeInt(a?.slot, 0) - toNonNegativeInt(b?.slot, 0))
    : [];

  for (let index = 0; index < runtimeWeapons.length; index += 1) {
    const runtimeWeapon = runtimeWeapons[index];
    const savedRuntime = equippedWeapons[index]?.runtime;
    if (!isPlainObject(savedRuntime)) {
      continue;
    }

    runtimeWeapon.attackSeq = Math.max(0, toNonNegativeInt(savedRuntime.attack_seq, runtimeWeapon.attackSeq ?? 0));
    runtimeWeapon.cooldownRemainingSec = Math.max(
      0,
      toFiniteNumber(savedRuntime.cooldown_remaining_sec, runtimeWeapon.cooldownRemainingSec ?? 0)
    );
    if (runtimeWeapon.hitSet instanceof Set) {
      runtimeWeapon.hitSet.clear();
    } else {
      runtimeWeapon.hitSet = new Set();
    }
  }
}
