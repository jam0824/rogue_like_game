import { describe, expect, it } from "vitest";
import {
  applyChestBlockingToWalkableGrid,
  buildBlockedTileSetFromChests,
  createCommonTreasureChest,
  tryOpenChestByClick,
} from "../../src/item/treasureSystem.js";
import { PLAYER_FOOT_HITBOX_HEIGHT, PLAYER_HEIGHT, TILE_SIZE } from "../../src/config/constants.js";

function createWalkableGrid(width = 24, height = 24, initial = true) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => initial));
}

function createDungeonMock(overrides = {}) {
  const walkableGrid = overrides.walkableGrid ?? createWalkableGrid();

  return {
    seed: "seed-01",
    startRoomId: 1,
    stairsRoomId: 3,
    walkableGrid,
    rooms: [
      { id: 1, x: 2, y: 2, w: 4, h: 4, centerX: 4, centerY: 4 },
      { id: 2, x: 8, y: 8, w: 5, h: 5, centerX: 10, centerY: 10 },
      { id: 3, x: 14, y: 14, w: 4, h: 4, centerX: 16, centerY: 16 },
      { id: 4, x: 18, y: 6, w: 4, h: 4, centerX: 20, centerY: 8 },
    ],
    ...overrides,
  };
}

function createPlayerAtFeetTile(tileX, tileY) {
  return {
    x: tileX * TILE_SIZE,
    y: tileY * TILE_SIZE - (PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2),
  };
}

describe("treasureSystem", () => {
  it("createCommonTreasureChest は開始/階段部屋以外に1個配置する", () => {
    const dungeon = createDungeonMock();

    const chest = createCommonTreasureChest(dungeon, "fixed-seed");

    expect(chest).toBeTruthy();
    expect(chest.tier).toBe("common");
    expect([dungeon.startRoomId, dungeon.stairsRoomId]).not.toContain(chest.roomId);
    expect(chest.isOpened).toBe(false);
    expect(dungeon.walkableGrid[chest.tileY][chest.tileX]).toBe(true);
  });

  it("createCommonTreasureChest は中心タイルが非walkableでも最近傍のwalkableタイルへ配置する", () => {
    const walkableGrid = createWalkableGrid(24, 24, true);
    walkableGrid[9][9] = false;

    const dungeon = createDungeonMock({
      walkableGrid,
      rooms: [
        { id: 1, x: 2, y: 2, w: 4, h: 4, centerX: 4, centerY: 4 },
        { id: 2, x: 8, y: 8, w: 3, h: 3, centerX: 9, centerY: 9 },
        { id: 3, x: 14, y: 14, w: 4, h: 4, centerX: 16, centerY: 16 },
      ],
    });

    const chest = createCommonTreasureChest(dungeon, "fixed-seed");

    expect(chest).toBeTruthy();
    expect(chest.roomId).toBe(2);
    expect(chest.tileX).toBe(9);
    expect(chest.tileY).toBe(8);
    expect(dungeon.walkableGrid[chest.tileY][chest.tileX]).toBe(true);
  });

  it("createCommonTreasureChest は選ばれた宝箱タイルが常にwalkableである", () => {
    const walkableGrid = createWalkableGrid(24, 24, true);
    walkableGrid[10][10] = false;
    walkableGrid[9][10] = false;

    const dungeon = createDungeonMock({ walkableGrid });

    const chest = createCommonTreasureChest(dungeon, "fixed-seed");

    expect(chest).toBeTruthy();
    expect(dungeon.walkableGrid[chest.tileY][chest.tileX]).toBe(true);
  });

  it("createCommonTreasureChest は候補部屋にwalkableタイルが無い場合 null を返す", () => {
    const walkableGrid = createWalkableGrid(24, 24, true);
    walkableGrid[8][8] = false;
    walkableGrid[8][9] = false;
    walkableGrid[8][10] = false;
    walkableGrid[9][8] = false;
    walkableGrid[9][9] = false;
    walkableGrid[9][10] = false;
    walkableGrid[10][8] = false;
    walkableGrid[10][9] = false;
    walkableGrid[10][10] = false;

    const dungeon = createDungeonMock({
      walkableGrid,
      rooms: [
        { id: 1, x: 2, y: 2, w: 4, h: 4, centerX: 4, centerY: 4 },
        { id: 2, x: 8, y: 8, w: 3, h: 3, centerX: 9, centerY: 9 },
        { id: 3, x: 14, y: 14, w: 4, h: 4, centerX: 16, centerY: 16 },
      ],
    });

    const chest = createCommonTreasureChest(dungeon, "fixed-seed");

    expect(chest).toBeNull();
  });

  it("tryOpenChestByClick は playerFeetTileOverride が距離2なら開封しない", () => {
    const chest = {
      id: "chest_01",
      tier: "common",
      roomId: 2,
      tileX: 8,
      tileY: 8,
      isOpened: false,
    };
    const player = createPlayerAtFeetTile(8, 8);

    const result = tryOpenChestByClick(
      [chest],
      [],
      player,
      chest.tileX * TILE_SIZE + 16,
      chest.tileY * TILE_SIZE + 16,
      {
        interactRangeTiles: 1,
        playerFeetTileOverride: { tileX: 8, tileY: 6 },
        dungeon: createDungeonMock(),
      }
    );

    expect(result.opened).toBe(false);
    expect(result.groundItems).toHaveLength(0);
  });

  it("tryOpenChestByClick は playerFeetTileOverride が距離1なら開封する", () => {
    const chest = {
      id: "chest_01",
      tier: "common",
      roomId: 2,
      tileX: 8,
      tileY: 8,
      isOpened: false,
    };
    const player = createPlayerAtFeetTile(1, 1);

    const result = tryOpenChestByClick(
      [chest],
      [],
      player,
      chest.tileX * TILE_SIZE + 16,
      chest.tileY * TILE_SIZE + 16,
      {
        interactRangeTiles: 1,
        playerFeetTileOverride: { tileX: 8, tileY: 7 },
        dungeon: createDungeonMock(),
      }
    );

    expect(result.opened).toBe(true);
    expect(result.treasureChests[0].isOpened).toBe(true);
    expect(result.groundItems).toHaveLength(1);
  });

  it("tryOpenChestByClick は距離内でも宝箱以外のクリックでは開封しない", () => {
    const dungeon = createDungeonMock();
    const chest = {
      id: "chest_01",
      tier: "common",
      roomId: 2,
      tileX: 8,
      tileY: 8,
      isOpened: false,
    };
    const player = createPlayerAtFeetTile(8, 7);

    const result = tryOpenChestByClick([chest], [], player, 7 * TILE_SIZE + 16, 8 * TILE_SIZE + 16, {
      interactRangeTiles: 1,
      dungeon,
    });

    expect(result.opened).toBe(false);
    expect(result.groundItems).toHaveLength(0);
    expect(result.treasureChests[0].isOpened).toBe(false);
  });

  it("tryOpenChestByClick は遠距離クリックで開封しない", () => {
    const chest = {
      id: "chest_01",
      tier: "common",
      roomId: 2,
      tileX: 8,
      tileY: 8,
      isOpened: false,
    };
    const player = createPlayerAtFeetTile(1, 1);

    const result = tryOpenChestByClick([chest], [], player, chest.tileX * TILE_SIZE + 16, chest.tileY * TILE_SIZE + 16);

    expect(result.opened).toBe(false);
    expect(result.treasureChests[0].isOpened).toBe(false);
    expect(result.groundItems).toHaveLength(0);
  });

  it("tryOpenChestByClick は近距離クリックで開封し薬草を1個落とす", () => {
    const dungeon = createDungeonMock();
    const chest = {
      id: "chest_01",
      tier: "common",
      roomId: 2,
      tileX: 8,
      tileY: 8,
      isOpened: false,
    };
    const player = createPlayerAtFeetTile(8, 7);

    const result = tryOpenChestByClick(
      [chest],
      [],
      player,
      chest.tileX * TILE_SIZE + 16,
      chest.tileY * TILE_SIZE + 16,
      {
        dungeon,
      }
    );

    expect(result.opened).toBe(true);
    expect(result.treasureChests[0].isOpened).toBe(true);
    expect(result.groundItems).toHaveLength(1);
    expect(result.groundItems[0]).toMatchObject({
      itemId: "item_herb_01",
      tileX: 8,
      tileY: 7,
      count: 1,
      sourceChestId: "chest_01",
    });
  });

  it("tryOpenChestByClick は近傍が埋まっていても探索半径を拡張してdrop先を見つける", () => {
    const walkableGrid = createWalkableGrid(24, 24, false);
    walkableGrid[8][8] = false;
    walkableGrid[7][8] = true;
    walkableGrid[8][7] = true;
    walkableGrid[8][9] = false;
    walkableGrid[9][8] = false;
    walkableGrid[6][8] = true;
    const dungeon = createDungeonMock({ walkableGrid });
    const chest = {
      id: "chest_01",
      tier: "common",
      roomId: 2,
      tileX: 8,
      tileY: 8,
      isOpened: false,
    };
    const player = createPlayerAtFeetTile(8, 7);
    const occupied = [
      { id: "g1", itemId: "item_herb_01", tileX: 8, tileY: 7 },
      { id: "g2", itemId: "item_herb_01", tileX: 7, tileY: 8 },
    ];

    const result = tryOpenChestByClick(
      [chest],
      occupied,
      player,
      chest.tileX * TILE_SIZE + 16,
      chest.tileY * TILE_SIZE + 16,
      { dungeon }
    );

    expect(result.opened).toBe(true);
    expect(result.groundItems).toHaveLength(3);
    expect(result.groundItems[2]).toMatchObject({
      tileX: 8,
      tileY: 6,
    });
  });

  it("tryOpenChestByClick は全域非walkableなら開封を成立させない", () => {
    const dungeon = createDungeonMock({
      walkableGrid: createWalkableGrid(24, 24, false),
    });
    const chest = {
      id: "chest_01",
      tier: "common",
      roomId: 2,
      tileX: 8,
      tileY: 8,
      isOpened: false,
    };
    const player = createPlayerAtFeetTile(8, 7);

    const result = tryOpenChestByClick(
      [chest],
      [],
      player,
      chest.tileX * TILE_SIZE + 16,
      chest.tileY * TILE_SIZE + 16,
      { dungeon }
    );

    expect(result.opened).toBe(false);
    expect(result.groundItems).toHaveLength(0);
    expect(result.treasureChests[0].isOpened).toBe(false);
  });

  it("tryOpenChestByClick は同じ宝箱を二重開封しない", () => {
    const chest = {
      id: "chest_01",
      tier: "common",
      roomId: 2,
      tileX: 8,
      tileY: 8,
      isOpened: true,
    };
    const player = createPlayerAtFeetTile(8, 8);

    const result = tryOpenChestByClick([chest], [], player, chest.tileX * TILE_SIZE + 16, chest.tileY * TILE_SIZE + 16);

    expect(result.opened).toBe(false);
    expect(result.groundItems).toHaveLength(0);
  });

  it("buildBlockedTileSetFromChests は宝箱タイルを塞ぐ", () => {
    const blocked = buildBlockedTileSetFromChests([
      { tileX: 4, tileY: 7 },
      { tileX: 9, tileY: 11 },
    ]);

    expect(blocked.has("4:7")).toBe(true);
    expect(blocked.has("9:11")).toBe(true);
  });

  it("applyChestBlockingToWalkableGrid は宝箱タイルだけ false にした新しい配列を返す", () => {
    const source = createWalkableGrid(6, 6, true);
    const next = applyChestBlockingToWalkableGrid(source, [{ tileX: 2, tileY: 3 }]);

    expect(next).not.toBe(source);
    expect(next[3][2]).toBe(false);
    expect(next[2][2]).toBe(true);
    expect(source[3][2]).toBe(true);
  });
});
