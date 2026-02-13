import { ENEMY_CHASE_SPEED_MULTIPLIER } from "../config/constants.js";

export const STAT_KEYS = ["vit", "for", "agi", "pow", "tec", "arc"];

const PLAYER_HP_BASE = 100;
const PLAYER_HP_PER_VIT = 8;
const PLAYER_HP_FLAT = 0;
const PLAYER_HP_PCT = 0;
const PLAYER_MOVE_PER_AGI = 0.01;
const PLAYER_MOVE_BONUS_PCT = 0;
const PLAYER_MOVE_MULT_CAP = 1.5;
const PLAYER_DMG_PER_POW = 0.02;
const PLAYER_CRIT_BASE = 0.05;
const PLAYER_CRIT_PER_TEC = 0.003;
const PLAYER_CRIT_CAP = 0.4;
const PLAYER_CRIT_MULT_BASE = 1.5;
const PLAYER_CRIT_MULT_PER_TEC = 0.01;
const PLAYER_CRIT_MULT_CAP = 2.5;

const ENEMY_HP_BASE = 30;
const ENEMY_HP_PER_VIT = 12;
const ENEMY_HP_PER_FOR = 0.015;
const ENEMY_DMG_PER_POW = 0.02;
const ENEMY_MOVE_PER_AGI = 0.01;
const ENEMY_CRIT_BASE = 0;
const ENEMY_CRIT_PER_TEC = 0.001;
const ENEMY_CRIT_CAP = 0.2;
const ENEMY_CRIT_MULT_BASE = 1.5;
const ENEMY_CRIT_MULT_PER_TEC = 0.002;
const ENEMY_CRIT_MULT_CAP = 2.0;

const RES_PER_FOR = 1.0;
const RES_PER_ARC = 0.5;
const RES_FLAT = 0;
const K_RES = 100;
const AILMENT_MULT_MIN = 0.4;

const ENEMY_HP_GROW = 0.022;
const ENEMY_ATK_GROW = 0.018;
const ENEMY_MV_GROW = 0.002;

const RANK_MULTIPLIERS = {
  normal: { hp: 1.0, atk: 1.0, mv: 1.0, ail: 1.0, duration: 1.0, cc: 1.0 },
  elite: { hp: 3.0, atk: 1.6, mv: 1.1, ail: 0.85, duration: 0.9, cc: 0.8 },
  boss: { hp: 25.0, atk: 2.2, mv: 1.0, ail: 0.6, duration: 0.75, cc: 0.5 },
};

const TAG_MULTIPLIERS = {
  minion: { hp: 0.6, atk: 0.7, mv: 1.05, ail: 1.1, duration: 1.0, cc: 1.0 },
  ranged: { hp: 1.0, atk: 1.0, mv: 1.0, ail: 1.0, duration: 1.0, cc: 1.0 },
  heavy: { hp: 1.25, atk: 1.1, mv: 0.9, ail: 0.9, duration: 0.95, cc: 0.85 },
  undead: { hp: 1.0, atk: 1.0, mv: 1.0, ail: 1.0, duration: 1.0, cc: 1.0 },
  summoned: { hp: 1.0, atk: 1.0, mv: 1.0, ail: 1.0, duration: 1.0, cc: 1.0 },
  armored: { hp: 1.1, atk: 1.0, mv: 0.95, ail: 0.95, duration: 1.0, cc: 1.0 },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toStatValue(value) {
  return Math.max(0, toFiniteNumber(value, 0));
}

function sanitizeStatRecord(stats) {
  const source = stats && typeof stats === "object" ? stats : {};
  const next = {};

  for (const key of STAT_KEYS) {
    next[key] = toStatValue(source[key]);
  }

  return next;
}

function addStats(left, right) {
  const next = {};
  for (const key of STAT_KEYS) {
    next[key] = toStatValue(left?.[key]) + toStatValue(right?.[key]);
  }
  return next;
}

function collectEquipStatTotals(playerState) {
  const equipped = Array.isArray(playerState?.run?.equipped_weapons) ? playerState.run.equipped_weapons : [];
  const totals = sanitizeStatRecord(null);

  for (const entry of equipped) {
    const overrides =
      entry?.weapon?.stat_overrides && typeof entry.weapon.stat_overrides === "object"
        ? entry.weapon.stat_overrides
        : null;
    if (!overrides) {
      continue;
    }

    for (const key of STAT_KEYS) {
      totals[key] += toFiniteNumber(overrides[key], 0);
    }
  }

  return totals;
}

function calcAilmentBaseFromForArc(fortitude, arc) {
  const ailRes = fortitude * RES_PER_FOR + arc * RES_PER_ARC + RES_FLAT;
  return clamp(1 / (1 + ailRes / K_RES), AILMENT_MULT_MIN, 999);
}

function normalizeRank(rank) {
  const key = typeof rank === "string" ? rank.toLowerCase() : "normal";
  return RANK_MULTIPLIERS[key] ? key : "normal";
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const next = [];
  for (const rawTag of tags) {
    if (typeof rawTag !== "string") {
      continue;
    }
    const key = rawTag.toLowerCase();
    if (!TAG_MULTIPLIERS[key]) {
      continue;
    }
    next.push(key);
  }

  return next;
}

function multiplyTagScale(tags) {
  const scale = { hp: 1, atk: 1, mv: 1, ail: 1, duration: 1, cc: 1 };
  for (const tag of tags) {
    const mult = TAG_MULTIPLIERS[tag];
    scale.hp *= mult.hp;
    scale.atk *= mult.atk;
    scale.mv *= mult.mv;
    scale.ail *= mult.ail;
    scale.duration *= mult.duration;
    scale.cc *= mult.cc;
  }
  return scale;
}

export function derivePlayerCombatStats(playerState, baseMoveSpeedPxPerSec) {
  const baseStats = sanitizeStatRecord(playerState?.base?.base_stats);
  const runStats = sanitizeStatRecord(playerState?.run?.stat_run);
  const equipStats = collectEquipStatTotals(playerState);
  const statTotals = addStats(addStats(baseStats, runStats), equipStats);

  const vit = statTotals.vit;
  const fortitude = statTotals.for;
  const agi = statTotals.agi;
  const pow = statTotals.pow;
  const tec = statTotals.tec;
  const arc = statTotals.arc;

  const maxHpBase = PLAYER_HP_BASE + vit * PLAYER_HP_PER_VIT + PLAYER_HP_FLAT;
  const maxHp = Math.max(1, Math.round(maxHpBase * (1 + PLAYER_HP_PCT)));

  const moveSpeedMultiplier = Math.min(
    (1 + agi * PLAYER_MOVE_PER_AGI) * (1 + PLAYER_MOVE_BONUS_PCT),
    PLAYER_MOVE_MULT_CAP
  );
  const moveSpeedPxPerSec = Math.max(0, toFiniteNumber(baseMoveSpeedPxPerSec, 0)) * moveSpeedMultiplier;

  const damageMult = 1 + pow * PLAYER_DMG_PER_POW;
  const critChance = clamp(PLAYER_CRIT_BASE + tec * PLAYER_CRIT_PER_TEC, 0, PLAYER_CRIT_CAP);
  const critMult = clamp(PLAYER_CRIT_MULT_BASE + tec * PLAYER_CRIT_MULT_PER_TEC, 1, PLAYER_CRIT_MULT_CAP);

  const ailmentTakenMultBase = calcAilmentBaseFromForArc(fortitude, arc);

  return {
    statTotals,
    baseStats,
    runStats,
    equipStats,
    maxHp,
    moveSpeedPxPerSec,
    damageMult,
    critChance,
    critMult,
    ailmentTakenMult: ailmentTakenMultBase,
    durationMult: ailmentTakenMultBase,
    ccDurationMult: ailmentTakenMultBase,
  };
}

export function deriveEnemyCombatStats(definition, floor, baseMoveSpeedPxPerSec) {
  const vit = toStatValue(definition?.vit ?? 10);
  const fortitude = toStatValue(definition?.for ?? 10);
  const agi = toStatValue(definition?.agi ?? 10);
  const pow = toStatValue(definition?.pow ?? 10);
  const tec = toStatValue(definition?.tec ?? 10);
  const arc = toStatValue(definition?.arc ?? 10);
  const rank = normalizeRank(definition?.rank);
  const tags = normalizeTags(definition?.tags);

  const floorValue = Math.max(1, Math.floor(toFiniteNumber(floor, 1)));
  const floorHp = (1 + ENEMY_HP_GROW) ** (floorValue - 1);
  const floorAtk = (1 + ENEMY_ATK_GROW) ** (floorValue - 1);
  const floorMv = (1 + ENEMY_MV_GROW) ** (floorValue - 1);

  const rankScale = RANK_MULTIPLIERS[rank];
  const tagScale = multiplyTagScale(tags);

  const scales = {
    hp: floorHp * rankScale.hp * tagScale.hp,
    atk: floorAtk * rankScale.atk * tagScale.atk,
    mv: floorMv * rankScale.mv * tagScale.mv,
    ail: rankScale.ail * tagScale.ail,
    duration: rankScale.duration * tagScale.duration,
    cc: rankScale.cc * tagScale.cc,
  };

  const hpRaw = ENEMY_HP_BASE + vit * ENEMY_HP_PER_VIT;
  const toughMult = 1 + fortitude * ENEMY_HP_PER_FOR;
  const maxHpBase = hpRaw * toughMult;
  const maxHp = Math.max(1, Math.round(maxHpBase * scales.hp));

  const damageMult = 1 + pow * ENEMY_DMG_PER_POW;
  const moveSpeedBase = Math.max(0, toFiniteNumber(baseMoveSpeedPxPerSec, 0)) * (1 + agi * ENEMY_MOVE_PER_AGI);
  const moveSpeedPxPerSec = moveSpeedBase * scales.mv;
  const chaseSpeedPxPerSec = moveSpeedPxPerSec * ENEMY_CHASE_SPEED_MULTIPLIER;

  const critChance = clamp(ENEMY_CRIT_BASE + tec * ENEMY_CRIT_PER_TEC, 0, ENEMY_CRIT_CAP);
  const critMult = clamp(ENEMY_CRIT_MULT_BASE + tec * ENEMY_CRIT_MULT_PER_TEC, 1, ENEMY_CRIT_MULT_CAP);

  const ailmentTakenMultBase = calcAilmentBaseFromForArc(fortitude, arc);

  return {
    floor: floorValue,
    rank,
    tags,
    statTotals: {
      vit,
      for: fortitude,
      agi,
      pow,
      tec,
      arc,
    },
    scales,
    maxHp,
    damageMult,
    attackScale: scales.atk,
    moveSpeedPxPerSec,
    chaseSpeedPxPerSec,
    critChance,
    critMult,
    ailmentTakenMult: ailmentTakenMultBase * scales.ail,
    durationMult: ailmentTakenMultBase * scales.duration,
    ccDurationMult: ailmentTakenMultBase * scales.cc,
  };
}
