import { deriveSeed } from "../core/rng.js";

export const MIN_FLOOR = 1;
export const MAX_FLOOR = 5;

function toInteger(value, fallback = MIN_FLOOR) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.floor(Number(value));
}

export function clampFloor(value) {
  return Math.max(MIN_FLOOR, Math.min(MAX_FLOOR, toInteger(value, MIN_FLOOR)));
}

export function resolveDungeonIdForFloor(floor) {
  const normalizedFloor = clampFloor(floor);
  return `dungeon_id_${String(normalizedFloor).padStart(2, "0")}`;
}

export function resolveFloorFromDungeonId(dungeonId, fallbackFloor = MIN_FLOOR) {
  if (typeof dungeonId !== "string") {
    return clampFloor(fallbackFloor);
  }

  const matched = dungeonId.trim().match(/^dungeon_id_(\d{2})$/);
  if (!matched) {
    return clampFloor(fallbackFloor);
  }

  return clampFloor(Number(matched[1]));
}

export function buildFloorSeed(baseSeed, floor) {
  const normalizedFloor = clampFloor(floor);
  const normalizedBaseSeed = String(baseSeed ?? "");
  return deriveSeed(normalizedBaseSeed, `floor:${normalizedFloor}`);
}
