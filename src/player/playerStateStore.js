export const PLAYER_STATE_SCHEMA_VERSION = "player_state_v1";
export const PLAYER_STATE_STORAGE_KEY = "rogue_like_game.player_state_v1";

const DEFAULT_STARTER_WEAPON_DEF_ID = "wepon_sword_01";
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getDefaultBaseStats() {
  return {
    vit: 0,
    for: 0,
    agi: 0,
    pow: 0,
    tec: 0,
    arc: 0,
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
    nameKey: "name_wepon_sword_01",
    descriptionKey: "description_wepon_sword_01",
    weaponFileName: "wepon_sword_01.png",
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
  const source = rawStats && typeof rawStats === "object" ? rawStats : {};
  const base = fallbackStats && typeof fallbackStats === "object" ? fallbackStats : {};
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
    .filter((skill) => skill && typeof skill === "object" && typeof skill.id === "string" && skill.id.length > 0)
    .map((skill) => ({
      id: skill.id,
      plus: toNonNegativeInt(skill.plus, 0),
    }));

  if (result.length > 0) {
    return result;
  }

  return fallback
    .filter((skill) => skill && typeof skill.id === "string" && skill.id.length > 0)
    .map((skill) => ({
      id: skill.id,
      plus: toNonNegativeInt(skill.plus, 0),
    }));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

  return {
    weapon_def_id: weaponDef.id,
    rarity: typeof weaponDef.rarity === "string" ? weaponDef.rarity : "rare",
    weapon_plus: toNonNegativeInt(weaponDef.weaponPlus, 0),
    formation_id:
      typeof weaponDef.formationId === "string" && weaponDef.formationId.length > 0
        ? weaponDef.formationId
        : "formation_id_circle01",
    skills: sanitizeSkills(weaponDef.skills, []),
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

  if ("rarity" in rawWeaponInstance && typeof rawWeaponInstance.rarity !== "string") {
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

  const equipped = rawPlayerState.run.equipped_weapons;
  if (!Array.isArray(equipped) || equipped.length === 0) {
    return true;
  }

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

  return false;
}

function sanitizeWeaponInstance(rawWeaponInstance, weaponDefinitionsById, starterWeaponDefId) {
  const source = isPlainObject(rawWeaponInstance) ? rawWeaponInstance : {};
  const requestedWeaponDefId =
    typeof source.weapon_def_id === "string" && source.weapon_def_id.length > 0
      ? source.weapon_def_id
      : starterWeaponDefId;

  const weaponDef = getWeaponDefById(weaponDefinitionsById, requestedWeaponDefId, starterWeaponDefId);
  const resolvedWeaponDefId = weaponDef.id;

  const rarity = typeof source.rarity === "string" ? source.rarity : weaponDef.rarity;
  const weaponPlus = toNonNegativeInt(source.weapon_plus, toNonNegativeInt(weaponDef.weaponPlus, 0));
  const formationId =
    typeof source.formation_id === "string" && source.formation_id.length > 0
      ? source.formation_id
      : weaponDef.formationId;

  const instance = {
    weapon_def_id: resolvedWeaponDefId,
    rarity: typeof rarity === "string" ? rarity : "rare",
    weapon_plus: weaponPlus,
    formation_id:
      typeof formationId === "string" && formationId.length > 0 ? formationId : weaponDef.formationId,
    skills: sanitizeSkills(source.skills, weaponDef.skills),
  };

  if (isPlainObject(source.stat_overrides)) {
    instance.stat_overrides = deepClone(source.stat_overrides);
  }

  return instance;
}

function sanitizeEquippedWeapons(rawEquippedWeapons, weaponDefinitionsById, starterWeaponDefId) {
  const source = Array.isArray(rawEquippedWeapons) ? rawEquippedWeapons : [];
  const entries = source
    .map((entry, index) => {
      const slot = Math.max(0, toNonNegativeInt(entry?.slot, index));
      const weapon = sanitizeWeaponInstance(entry?.weapon, weaponDefinitionsById, starterWeaponDefId);

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

function sanitizePlayerState(rawPlayerState, weaponDefinitionsById, starterWeaponDefId, nowUnixSec) {
  const source = isPlainObject(rawPlayerState) ? rawPlayerState : {};
  const base = isPlainObject(source.base) ? source.base : {};
  const run = isPlainObject(source.run) ? source.run : {};

  return {
    schema_version: PLAYER_STATE_SCHEMA_VERSION,
    saved_at: toNonNegativeInt(source.saved_at, toNonNegativeInt(nowUnixSec, 0)),
    base: {
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
      },
      stash: {
        capacity: Math.max(0, toNonNegativeInt(base.stash?.capacity, 30)),
        items: Array.isArray(base.stash?.items) ? deepClone(base.stash.items) : [],
      },
    },
    in_run: source.in_run !== false,
    run: {
      floor: Math.max(1, toNonNegativeInt(run.floor, 1)),
      run_level: Math.max(1, toNonNegativeInt(run.run_level, 1)),
      xp: Math.max(0, toNonNegativeInt(run.xp, 0)),
      stat_run: sanitizeStats(run.stat_run, getDefaultRunStats()),
      hp: Math.max(0, toFiniteNumber(run.hp, 100)),
      pos: {
        x: toFiniteNumber(run.pos?.x, 0),
        y: toFiniteNumber(run.pos?.y, 0),
      },
      equipped_weapons: sanitizeEquippedWeapons(run.equipped_weapons, weaponDefinitionsById, starterWeaponDefId),
    },
  };
}

function mergeWeaponDefinitionWithInstance(weaponDef, weaponInstance) {
  return {
    ...weaponDef,
    id: weaponDef.id,
    rarity: typeof weaponInstance.rarity === "string" ? weaponInstance.rarity : weaponDef.rarity,
    weaponPlus: toNonNegativeInt(weaponInstance.weapon_plus, toNonNegativeInt(weaponDef.weaponPlus, 0)),
    formationId:
      typeof weaponInstance.formation_id === "string" && weaponInstance.formation_id.length > 0
        ? weaponInstance.formation_id
        : weaponDef.formationId,
    skills: sanitizeSkills(weaponInstance.skills, weaponDef.skills),
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

export function syncPlayerStateFromRuntime(playerState, runtimePlayer, runtimeWeapons, nowUnixSec) {
  if (!isPlainObject(playerState)) {
    return;
  }

  playerState.schema_version = PLAYER_STATE_SCHEMA_VERSION;
  playerState.saved_at = toNonNegativeInt(nowUnixSec, toNonNegativeInt(playerState.saved_at, 0));
  playerState.in_run = playerState.in_run !== false;

  if (!isPlainObject(playerState.run)) {
    playerState.run = {};
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

  const equippedWeapons = Array.isArray(playerState.run.equipped_weapons)
    ? [...playerState.run.equipped_weapons].sort((a, b) => toNonNegativeInt(a?.slot, 0) - toNonNegativeInt(b?.slot, 0))
    : [];

  if (Array.isArray(runtimeWeapons)) {
    for (let index = 0; index < runtimeWeapons.length; index += 1) {
      const runtimeWeapon = runtimeWeapons[index];
      let slotEntry = equippedWeapons[index];

      if (!slotEntry) {
        slotEntry = {
          slot: index,
          weapon: {
            weapon_def_id: DEFAULT_STARTER_WEAPON_DEF_ID,
            rarity: "rare",
            weapon_plus: 0,
            formation_id: typeof runtimeWeapon?.formationId === "string" ? runtimeWeapon.formationId : "formation_id_circle01",
            skills: [],
          },
          runtime: {},
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

  playerState.run.equipped_weapons = equippedWeapons.sort((a, b) => a.slot - b.slot);
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
