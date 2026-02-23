import { describe, expect, it } from "vitest";
import {
  isPlayerNearDownStair,
  isPlayerTouchingDownStair,
  placeDownStairSymbols,
} from "../../src/dungeon/downStairSystem.js";

function createSymbolGrid(width, height, fill = null) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

describe("downStairSystem", () => {
  it("placeDownStairSymbols は階段部屋上壁の中央寄り B 2列を S,S に置換する", () => {
    const symbolGrid = createSymbolGrid(20, 20, null);
    for (let x = 4; x <= 11; x += 1) {
      symbolGrid[4][x] = "B";
    }

    const dungeon = {
      stairsRoomId: 2,
      rooms: [{ id: 2, x: 4, y: 5, w: 8, h: 6, centerX: 8, centerY: 8 }],
    };

    const result = placeDownStairSymbols(symbolGrid, dungeon, 3);

    expect(result.downStair).toMatchObject({
      anchorTileX: 7,
      anchorTileY: 4,
      widthTiles: 2,
      heightTiles: 3,
      isEnabled: true,
    });
    expect(result.symbolGrid[4][7]).toBe("S");
    expect(result.symbolGrid[4][8]).toBe("S");
    expect(result.downStair?.triggerTiles).toEqual([
      { tileX: 7, tileY: 7 },
      { tileX: 8, tileY: 7 },
    ]);
  });

  it("B 2列が見つからない場合でもフォールバックで階段を配置する", () => {
    const symbolGrid = createSymbolGrid(12, 12, null);
    symbolGrid[2][4] = "B";
    symbolGrid[2][5] = " ";

    const dungeon = {
      stairsRoomId: 10,
      rooms: [{ id: 10, x: 4, y: 3, w: 4, h: 4, centerX: 6, centerY: 5 }],
    };

    const result = placeDownStairSymbols(symbolGrid, dungeon, 3);
    expect(result.downStair).toBeTruthy();
    expect(result.symbolGrid[2][5]).toBe("S");
    expect(result.symbolGrid[2][6]).toBe("S");
  });

  it("階段部屋が見つからない場合は downStair=null を返す", () => {
    const symbolGrid = createSymbolGrid(8, 8, "B");
    const result = placeDownStairSymbols(symbolGrid, { stairsRoomId: 99, rooms: [] }, 3);
    expect(result.downStair).toBeNull();
  });

  it("isPlayerNearDownStair は隣接1マスのマンハッタン距離で判定する", () => {
    const stairMeta = {
      triggerTiles: [
        { tileX: 10, tileY: 10 },
        { tileX: 11, tileY: 10 },
      ],
    };

    expect(isPlayerNearDownStair({ tileX: 10, tileY: 10 }, stairMeta, 1)).toBe(true);
    expect(isPlayerNearDownStair({ tileX: 10, tileY: 11 }, stairMeta, 1)).toBe(true);
    expect(isPlayerNearDownStair({ tileX: 12, tileY: 10 }, stairMeta, 1)).toBe(true);
    expect(isPlayerNearDownStair({ tileX: 13, tileY: 10 }, stairMeta, 1)).toBe(false);
  });

  it("isPlayerTouchingDownStair は足元タイル一致のみで判定する", () => {
    const stairMeta = {
      triggerTiles: [
        { tileX: 10, tileY: 10 },
        { tileX: 11, tileY: 10 },
      ],
    };

    expect(isPlayerTouchingDownStair({ tileX: 10, tileY: 10 }, stairMeta)).toBe(true);
    expect(isPlayerTouchingDownStair({ tileX: 11, tileY: 10 }, stairMeta)).toBe(true);

    expect(isPlayerTouchingDownStair({ tileX: 10, tileY: 11 }, stairMeta)).toBe(false);
    expect(isPlayerTouchingDownStair({ tileX: 9, tileY: 10 }, stairMeta)).toBe(false);
    expect(isPlayerTouchingDownStair({ tileX: 12, tileY: 10 }, stairMeta)).toBe(false);
    expect(isPlayerTouchingDownStair({ tileX: 9, tileY: 9 }, stairMeta)).toBe(false);
  });
});
