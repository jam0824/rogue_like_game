import { derivePlayerCombatStats } from "../status/derivedStats.js";

const STAT_KEYS = ["vit", "for", "agi", "pow", "tec", "arc"];
const STAT_LABELS = {
  vit: "VIT",
  for: "FOR",
  agi: "AGI",
  pow: "POW",
  tec: "TEC",
  arc: "ARC",
};

function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toStatInt(value) {
  return Math.max(0, Math.round(toFiniteNumber(value, 0)));
}

function formatFixed(value, digits) {
  return toFiniteNumber(value, 0).toFixed(digits);
}

function formatPercent(value) {
  return `${(toFiniteNumber(value, 0) * 100).toFixed(1)}%`;
}

function formatMultiplier(value, digits = 2) {
  return `x${toFiniteNumber(value, 1).toFixed(digits)}`;
}

function buildStatRows(prefix, stats) {
  const source = stats && typeof stats === "object" ? stats : {};
  return STAT_KEYS.map((key) => ({
    label: `${prefix} ${STAT_LABELS[key]}`,
    value: String(toStatInt(source[key])),
  }));
}

export function buildPlayerStatusRows(playerState, player, baseMoveSpeedPxPerSec) {
  if (!playerState || !player) {
    return [{ label: "状態", value: "プレイヤーデータ未初期化" }];
  }

  const derived = derivePlayerCombatStats(playerState, baseMoveSpeedPxPerSec);
  const currentHp = Math.max(0, Math.round(toFiniteNumber(player.hp, 0)));
  const maxHp = Math.max(1, Math.round(toFiniteNumber(derived.maxHp, 1)));

  return [
    ...buildStatRows("[基本]", derived.baseStats),
    ...buildStatRows("[ラン]", derived.runStats),
    ...buildStatRows("[装備]", derived.equipStats),
    ...buildStatRows("[合計]", derived.statTotals),
    { label: "HP(現在/最大)", value: `${currentHp}/${maxHp}` },
    { label: "移動速度(px/s)", value: formatFixed(derived.moveSpeedPxPerSec, 2) },
    { label: "与ダメ倍率", value: formatFixed(derived.damageMult, 3) },
    { label: "クリ率", value: formatPercent(derived.critChance) },
    { label: "クリ倍率", value: formatMultiplier(derived.critMult, 2) },
    { label: "状態異常被適用倍率", value: formatFixed(derived.ailmentTakenMult, 3) },
    { label: "持続時間倍率", value: formatFixed(derived.durationMult, 3) },
    { label: "CC時間倍率", value: formatFixed(derived.ccDurationMult, 3) },
  ];
}

export function buildPlayerStatusDigest(rows) {
  if (!Array.isArray(rows) || rows.length <= 0) {
    return "";
  }

  return rows
    .map((row) => `${String(row?.label ?? "")}:${String(row?.value ?? "")}`)
    .join("|");
}
