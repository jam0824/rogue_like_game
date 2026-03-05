import { describe, expect, it } from "vitest";
import { generateDungeon } from "../../src/generation/dungeonGenerator.js";
import { validateDungeon } from "../../src/generation/layoutValidator.js";

describe("dungeonGenerator", () => {
  it("bossFloor=true ではアリーナ1部屋 + 柱2-4 + 南側開始 + 中央ボス点を生成する", () => {
    const dungeon = generateDungeon({
      seed: "boss-floor-seed",
      wallHeightTiles: 3,
      bossFloor: true,
    });

    expect(dungeon.isBossFloor).toBe(true);
    expect(dungeon.rooms).toHaveLength(1);
    expect(dungeon.graph.branchPaths).toHaveLength(0);
    expect(dungeon.graph.edges).toHaveLength(0);
    expect(dungeon.bossArena).not.toBeNull();
    expect(dungeon.bossArena?.pillars.length).toBeGreaterThanOrEqual(2);
    expect(dungeon.bossArena?.pillars.length).toBeLessThanOrEqual(4);

    const room = dungeon.rooms[0];
    const startTile = dungeon.bossArena.startTile;
    const bossTile = dungeon.bossArena.bossTile;
    const startBossDistance =
      Math.abs(Math.floor(startTile.tileX) - Math.floor(bossTile.tileX)) +
      Math.abs(Math.floor(startTile.tileY) - Math.floor(bossTile.tileY));
    expect(room.w).toBeGreaterThanOrEqual(26);
    expect(room.w).toBeLessThanOrEqual(32);
    expect(room.h).toBeGreaterThanOrEqual(24);
    expect(room.h).toBeLessThanOrEqual(28);
    expect(startTile.tileY).toBeGreaterThanOrEqual(room.y + room.h - 3);
    expect(Math.abs(bossTile.tileX - room.centerX)).toBeLessThanOrEqual(1);
    expect(Math.abs(bossTile.tileY - room.centerY)).toBeLessThanOrEqual(1);
    expect(startBossDistance).toBeGreaterThanOrEqual(10);

    const validation = validateDungeon(dungeon);
    expect(validation.ok).toBe(true);
  });

  it("通常モードは既存の部屋/分岐制約を満たす", () => {
    const dungeon = generateDungeon({
      seed: "normal-floor-seed",
      wallHeightTiles: 5,
    });

    expect(dungeon.isBossFloor).toBe(false);
    expect(dungeon.rooms.length).toBeGreaterThan(1);
    expect(dungeon.bossArena).toBeNull();

    const validation = validateDungeon(dungeon);
    expect(validation.ok).toBe(true);
  });
});
