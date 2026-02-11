import { describe, expect, it } from "vitest";
import {
  createInitialSystemUiState,
  dropSelectedInventoryItem,
  findDropTileNearPlayer,
  useInventoryItem,
  useQuickSlotItem,
} from "../../src/ui/systemUiState.js";

const TILE_SIZE = 32;

function createWalkableDungeon(width, height, walkable = true) {
  return {
    walkableGrid: Array.from({ length: height }, () => Array.from({ length: width }, () => walkable)),
  };
}

function createPlayerAtFeetTile(tileX, tileY) {
  return {
    x: tileX * TILE_SIZE,
    y: tileY * TILE_SIZE - 48,
  };
}

describe("systemUiState", () => {
  it("consumable の USE で個数が減り 0 で削除される", () => {
    const state = createInitialSystemUiState();

    const afterOne = useInventoryItem(state, "run_item_antidote");
    expect(afterOne.inventory.items.some((item) => item.id === "run_item_antidote")).toBe(false);
    expect(afterOne.toastMessage).toContain("使用");

    const afterTwo = useInventoryItem(afterOne, "run_item_potion_small");
    const potion = afterTwo.inventory.items.find((item) => item.id === "run_item_potion_small");
    expect(potion?.count).toBe(2);
  });

  it("equipment の USE は拒否される", () => {
    const state = createInitialSystemUiState();
    const next = useInventoryItem(state, "run_item_short_sword");

    const sword = next.inventory.items.find((item) => item.id === "run_item_short_sword");
    expect(sword?.count).toBe(1);
    expect(next.toastMessage).toContain("使用できません");
  });

  it("quick slot の USE が正しいアイテムに適用される", () => {
    const state = createInitialSystemUiState();
    const next = useQuickSlotItem(state, 0);
    const potion = next.inventory.items.find((item) => item.id === "run_item_potion_small");

    expect(potion?.count).toBe(2);
  });

  it("DROP は同一タイルに重ならない", () => {
    const dungeon = createWalkableDungeon(8, 8, true);
    const player = createPlayerAtFeetTile(3, 3);
    const state = createInitialSystemUiState();

    const firstDrop = dropSelectedInventoryItem(state, dungeon, player, 1000);
    expect(firstDrop.inventory.droppedItems.length).toBe(1);

    const secondDrop = dropSelectedInventoryItem(firstDrop, dungeon, player, 1001);
    expect(secondDrop.inventory.droppedItems.length).toBe(2);

    const tileA = secondDrop.inventory.droppedItems[0];
    const tileB = secondDrop.inventory.droppedItems[1];
    expect(`${tileA.tileX}:${tileA.tileY}`).not.toBe(`${tileB.tileX}:${tileB.tileY}`);
  });

  it("DROP の配置先がない場合は失敗する", () => {
    const dungeon = createWalkableDungeon(6, 6, false);
    const player = createPlayerAtFeetTile(3, 3);
    const state = createInitialSystemUiState();

    const next = dropSelectedInventoryItem(state, dungeon, player, 1000);
    expect(next.inventory.droppedItems.length).toBe(0);
    expect(next.toastMessage).toContain("置ける場所がありません");
  });

  it("findDropTileNearPlayer は占有タイルを避ける", () => {
    const dungeon = createWalkableDungeon(7, 7, true);
    const player = createPlayerAtFeetTile(3, 3);
    const drop = findDropTileNearPlayer(dungeon, player, [
      { tileX: 3, tileY: 3 },
      { tileX: 2, tileY: 3 },
    ]);

    expect(drop).not.toBeNull();
    expect(`${drop.tileX}:${drop.tileY}`).not.toBe("3:3");
    expect(`${drop.tileX}:${drop.tileY}`).not.toBe("2:3");
  });
});
