import { describe, expect, it } from "vitest";
import {
  buildFloorSeed,
  clampFloor,
  MAX_FLOOR,
  MIN_FLOOR,
  resolveDungeonIdForFloor,
  resolveFloorFromDungeonId,
} from "../../src/dungeon/floorProgression.js";

describe("floorProgression", () => {
  it("clampFloor は 1..5 の範囲に丸める", () => {
    expect(clampFloor(-10)).toBe(MIN_FLOOR);
    expect(clampFloor(0)).toBe(MIN_FLOOR);
    expect(clampFloor(1)).toBe(1);
    expect(clampFloor(3.8)).toBe(3);
    expect(clampFloor(5)).toBe(MAX_FLOOR);
    expect(clampFloor(99)).toBe(MAX_FLOOR);
  });

  it("resolveDungeonIdForFloor は floor を dungeon_id_XX に変換する", () => {
    expect(resolveDungeonIdForFloor(1)).toBe("dungeon_id_01");
    expect(resolveDungeonIdForFloor(2)).toBe("dungeon_id_02");
    expect(resolveDungeonIdForFloor(5)).toBe("dungeon_id_05");
    expect(resolveDungeonIdForFloor(99)).toBe("dungeon_id_05");
  });

  it("resolveFloorFromDungeonId は dungeon_id_XX から floor を復元し範囲外を clamp する", () => {
    expect(resolveFloorFromDungeonId("dungeon_id_01")).toBe(1);
    expect(resolveFloorFromDungeonId("dungeon_id_03")).toBe(3);
    expect(resolveFloorFromDungeonId("dungeon_id_20")).toBe(5);
    expect(resolveFloorFromDungeonId("invalid", 4)).toBe(4);
  });

  it("buildFloorSeed は baseSeed + floor に対して決定的", () => {
    const first = buildFloorSeed("seed-a", 2);
    const second = buildFloorSeed("seed-a", 2);
    const otherFloor = buildFloorSeed("seed-a", 3);

    expect(first).toBe(second);
    expect(first).not.toBe(otherFloor);
  });
});
