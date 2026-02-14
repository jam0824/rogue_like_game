import { describe, expect, it } from "vitest";
import { buildWalkableGrid } from "../../src/tiles/walkableGrid.js";

function createFloorGrid(width, height, fill = true) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

function createSymbolGrid(width, height) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => null));
}

describe("walkableGrid", () => {
  it("tallWallTileHeight=3 のとき B/F/G は3タイル分をブロックする", () => {
    const floorGrid = createFloorGrid(8, 8, true);
    const symbolGrid = createSymbolGrid(8, 8);
    symbolGrid[1][2] = "B";

    const walkableGrid = buildWalkableGrid(floorGrid, symbolGrid, { tallWallTileHeight: 3 });

    expect(walkableGrid[1][2]).toBe(false);
    expect(walkableGrid[2][2]).toBe(false);
    expect(walkableGrid[3][2]).toBe(false);
    expect(walkableGrid[4][2]).toBe(true);
  });

  it("tallWallTileHeight=5 のとき B/F/G は5タイル分をブロックする", () => {
    const floorGrid = createFloorGrid(8, 8, true);
    const symbolGrid = createSymbolGrid(8, 8);
    symbolGrid[1][2] = "G";

    const walkableGrid = buildWalkableGrid(floorGrid, symbolGrid, { tallWallTileHeight: 5 });

    expect(walkableGrid[1][2]).toBe(false);
    expect(walkableGrid[2][2]).toBe(false);
    expect(walkableGrid[3][2]).toBe(false);
    expect(walkableGrid[4][2]).toBe(false);
    expect(walkableGrid[5][2]).toBe(false);
    expect(walkableGrid[6][2]).toBe(true);
  });

  it("非 tall symbol は追加ブロックしない", () => {
    const floorGrid = createFloorGrid(6, 6, true);
    const symbolGrid = createSymbolGrid(6, 6);
    symbolGrid[2][3] = "D";

    const walkableGrid = buildWalkableGrid(floorGrid, symbolGrid, { tallWallTileHeight: 3 });
    expect(walkableGrid[2][3]).toBe(true);
  });
});

