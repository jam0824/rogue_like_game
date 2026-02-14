import { createRng } from "../core/rng.js";

const DMG_RAND_VAR_DEFAULT = 0.1;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toNonNegative(value, fallback) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

export function rollHitDamage(input) {
  const seedKey = typeof input?.seedKey === "string" && input.seedKey.length > 0 ? input.seedKey : "damage-roll-default";
  const rng = createRng(seedKey);

  const baseDamage = toNonNegative(input?.baseDamage, 0);
  const damageMult = toNonNegative(input?.damageMult, 1);
  const attackScale = toNonNegative(input?.attackScale, 1);
  const critChance = clamp(toFiniteNumber(input?.critChance, 0), 0, 1);
  const critMult = Math.max(1, toFiniteNumber(input?.critMult, 1));
  const randomVariance = toNonNegative(input?.randomVariance, DMG_RAND_VAR_DEFAULT);

  const triangular = (rng.float() + rng.float()) * 0.5;
  const randMult = (1 - randomVariance) + 2 * randomVariance * triangular;
  const isCritical = rng.float() < critChance;

  let raw = baseDamage * damageMult * attackScale * randMult;
  if (isCritical) {
    raw *= critMult;
  }

  return {
    damage: Math.max(1, Math.round(raw)),
    isCritical,
    randMult,
  };
}
