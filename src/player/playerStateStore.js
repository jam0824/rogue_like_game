export const PLAYER_STATE_SCHEMA_VERSION = "player_state_v1";
export const PLAYER_STATE_STORAGE_KEY = "rogue_like_game.player_state_v1";

const STAT_KEYS = ["vit", "for", "agi", "pow", "tec", "arc"];
const WEAPON_REQUIRED_KEYS = [
  "name_key",
  "description_key",
  "weapon_file_name",
  "width",
  "height",
  "rarity",
  "weapon_plus",
  "base_damage",
  "attack_cooldown_sec",
  "hit_num",
  "pierce_count",
  "chip_slot_count",
  "formation_id",
  "skills",
];

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

function getDefaultWeapon() {
  return {
    name_key: "name_wepon_sword_01",
    description_key: "description_wepon_sword_01",
    weapon_file_name: "wepon_sword_01.png",
    width: 32,
    height: 64,
    rarity: "rare",
    weapon_plus: 0,
    base_damage: 12,
    attack_cooldown_sec: 2,
    hit_num: 1,
    pierce_count: 10,
    chip_slot_count: 3,
    formation_id: "formation_id_circle01",
    skills: [
      { id: "skill_id_fire01", plus: 0 },
      { id: "skill_id_poison01", plus: 3 },
    ],
  };
}

function hasWeaponRequiredKeys(rawWeapon) {
  if (!rawWeapon || typeof rawWeapon !== "object") {
    return false;
  }

  for (const key of WEAPON_REQUIRED_KEYS) {
    if (!(key in rawWeapon)) {
      return false;
    }
  }
  return true;
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

  return fallback.map((skill) => ({
    id: skill.id,
    plus: toNonNegativeInt(skill.plus, 0),
  }));
}

function sanitizeWeaponRaw(rawWeapon, starterWeaponRaw) {
  const fallbackWeapon = hasWeaponRequiredKeys(starterWeaponRaw) ? starterWeaponRaw : getDefaultWeapon();
  const sourceWeapon = hasWeaponRequiredKeys(rawWeapon) ? rawWeapon : fallbackWeapon;

  return {
    name_key: typeof sourceWeapon.name_key === "string" ? sourceWeapon.name_key : fallbackWeapon.name_key,
    description_key:
      typeof sourceWeapon.description_key === "string"
        ? sourceWeapon.description_key
        : fallbackWeapon.description_key,
    weapon_file_name:
      typeof sourceWeapon.weapon_file_name === "string" && sourceWeapon.weapon_file_name.length > 0
        ? sourceWeapon.weapon_file_name
        : fallbackWeapon.weapon_file_name,
    width: Math.max(1, toFiniteNumber(sourceWeapon.width, toFiniteNumber(fallbackWeapon.width, 1))),
    height: Math.max(1, toFiniteNumber(sourceWeapon.height, toFiniteNumber(fallbackWeapon.height, 1))),
    rarity: typeof sourceWeapon.rarity === "string" ? sourceWeapon.rarity : fallbackWeapon.rarity,
    weapon_plus: toNonNegativeInt(sourceWeapon.weapon_plus, toNonNegativeInt(fallbackWeapon.weapon_plus, 0)),
    base_damage: Math.max(0, toFiniteNumber(sourceWeapon.base_damage, toFiniteNumber(fallbackWeapon.base_damage, 0))),
    attack_cooldown_sec: Math.max(
      0.001,
      toFiniteNumber(sourceWeapon.attack_cooldown_sec, toFiniteNumber(fallbackWeapon.attack_cooldown_sec, 1))
    ),
    hit_num: Math.max(1, toNonNegativeInt(sourceWeapon.hit_num, toNonNegativeInt(fallbackWeapon.hit_num, 1))),
    pierce_count: Math.max(
      0,
      toNonNegativeInt(sourceWeapon.pierce_count, toNonNegativeInt(fallbackWeapon.pierce_count, 0))
    ),
    chip_slot_count: Math.max(
      0,
      toNonNegativeInt(sourceWeapon.chip_slot_count, toNonNegativeInt(fallbackWeapon.chip_slot_count, 0))
    ),
    formation_id:
      typeof sourceWeapon.formation_id === "string" && sourceWeapon.formation_id.length > 0
        ? sourceWeapon.formation_id
        : fallbackWeapon.formation_id,
    skills: sanitizeSkills(sourceWeapon.skills, fallbackWeapon.skills),
  };
}

function sanitizeEquippedWeapons(rawEquippedWeapons, starterWeaponRaw) {
  const source = Array.isArray(rawEquippedWeapons) ? rawEquippedWeapons : [];
  const entries = source
    .map((entry, index) => {
      const slot = Math.max(0, toNonNegativeInt(entry?.slot, index));
      const weapon = sanitizeWeaponRaw(entry?.weapon, starterWeaponRaw);

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

  return [
    {
      slot: 0,
      weapon: sanitizeWeaponRaw(starterWeaponRaw, starterWeaponRaw),
      runtime: {
        attack_seq: 0,
        cooldown_remaining_sec: 0,
      },
    },
  ];
}

function sanitizePlayerState(rawPlayerState, starterWeaponRaw, nowUnixSec) {
  const source = rawPlayerState && typeof rawPlayerState === "object" ? rawPlayerState : {};
  const base = source.base && typeof source.base === "object" ? source.base : {};
  const run = source.run && typeof source.run === "object" ? source.run : {};

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
      equipped_weapons: sanitizeEquippedWeapons(run.equipped_weapons, starterWeaponRaw),
    },
  };
}

function toWeaponDefinition(rawWeapon, index) {
  const weaponFileName =
    typeof rawWeapon.weapon_file_name === "string" && rawWeapon.weapon_file_name.length > 0
      ? rawWeapon.weapon_file_name
      : `saved_weapon_${index}.png`;
  const id = weaponFileName.replace(/\.[^/.]+$/, "") || `saved_weapon_${index}`;

  return {
    id,
    nameKey: rawWeapon.name_key,
    descriptionKey: rawWeapon.description_key,
    weaponFileName,
    width: Math.max(1, toFiniteNumber(rawWeapon.width, 1)),
    height: Math.max(1, toFiniteNumber(rawWeapon.height, 1)),
    rarity: rawWeapon.rarity,
    weaponPlus: Math.max(0, toNonNegativeInt(rawWeapon.weapon_plus, 0)),
    baseDamage: Math.max(0, toFiniteNumber(rawWeapon.base_damage, 0)),
    attackCooldownSec: Math.max(0.001, toFiniteNumber(rawWeapon.attack_cooldown_sec, 1)),
    hitNum: Math.max(1, toNonNegativeInt(rawWeapon.hit_num, 1)),
    pierceCount: Math.max(0, toNonNegativeInt(rawWeapon.pierce_count, 0)),
    chipSlotCount: Math.max(0, toNonNegativeInt(rawWeapon.chip_slot_count, 0)),
    formationId: rawWeapon.formation_id,
    skills: sanitizeSkills(rawWeapon.skills, []),
  };
}

export function createDefaultPlayerState(starterWeaponRaw, nowUnixSec) {
  return sanitizePlayerState(null, starterWeaponRaw, nowUnixSec);
}

export function loadPlayerStateFromStorage(storage, key, starterWeaponRaw, nowUnixSec) {
  if (!storage || typeof storage.getItem !== "function") {
    return createDefaultPlayerState(starterWeaponRaw, nowUnixSec);
  }

  const storageKey = typeof key === "string" && key.length > 0 ? key : PLAYER_STATE_STORAGE_KEY;

  try {
    const rawText = storage.getItem(storageKey);
    if (!rawText) {
      return createDefaultPlayerState(starterWeaponRaw, nowUnixSec);
    }

    const parsed = JSON.parse(rawText);
    return sanitizePlayerState(parsed, starterWeaponRaw, nowUnixSec);
  } catch {
    return createDefaultPlayerState(starterWeaponRaw, nowUnixSec);
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
  if (!playerState || typeof playerState !== "object") {
    return;
  }

  playerState.schema_version = PLAYER_STATE_SCHEMA_VERSION;
  playerState.saved_at = toNonNegativeInt(nowUnixSec, toNonNegativeInt(playerState.saved_at, 0));
  playerState.in_run = playerState.in_run !== false;

  if (!playerState.run || typeof playerState.run !== "object") {
    playerState.run = {};
  }

  playerState.run.floor = Math.max(1, toNonNegativeInt(playerState.run.floor, 1));
  playerState.run.run_level = Math.max(1, toNonNegativeInt(playerState.run.run_level, 1));
  playerState.run.xp = Math.max(0, toNonNegativeInt(playerState.run.xp, 0));
  playerState.run.stat_run = sanitizeStats(playerState.run.stat_run, getDefaultRunStats());
  playerState.run.hp = Math.max(0, toFiniteNumber(playerState.run.hp, 100));

  if (!playerState.run.pos || typeof playerState.run.pos !== "object") {
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
          weapon: {},
          runtime: {},
        };
        equippedWeapons.push(slotEntry);
      }

      slotEntry.slot = Math.max(0, toNonNegativeInt(slotEntry.slot, index));
      if (!slotEntry.weapon || typeof slotEntry.weapon !== "object") {
        slotEntry.weapon = {};
      }
      if (!slotEntry.runtime || typeof slotEntry.runtime !== "object") {
        slotEntry.runtime = {};
      }

      slotEntry.runtime.attack_seq = Math.max(0, toNonNegativeInt(runtimeWeapon?.attackSeq, 0));
      slotEntry.runtime.cooldown_remaining_sec = Math.max(0, toFiniteNumber(runtimeWeapon?.cooldownRemainingSec, 0));
    }
  }

  playerState.run.equipped_weapons = equippedWeapons.sort((a, b) => a.slot - b.slot);
}

export function buildWeaponDefinitionsFromPlayerState(playerState, starterWeaponRaw) {
  const normalized = sanitizePlayerState(playerState, starterWeaponRaw, 0);
  return normalized.run.equipped_weapons
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((entry, index) => toWeaponDefinition(entry.weapon, index));
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
    if (!savedRuntime || typeof savedRuntime !== "object") {
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
