import { describe, expect, it } from "vitest";
import {
  clearToastMessage,
  createInitialSystemUiState,
  dropSelectedInventoryItemToGround,
  findDropTileNearPlayer,
  tryAddInventoryItem,
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
  it("clearToastMessage は toastMessage を空にする", () => {
    const state = createInitialSystemUiState();
    state.toastMessage = "temporary";

    const next = clearToastMessage(state);
    expect(next.toastMessage).toBe("");
    expect(state.toastMessage).toBe("temporary");
  });

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

  it("dropSelectedInventoryItemToGround は足元以外かつ既存groundItemsと重ならない", () => {
    const dungeon = createWalkableDungeon(8, 8, true);
    const player = createPlayerAtFeetTile(3, 3);
    const state = createInitialSystemUiState();

    const firstDrop = dropSelectedInventoryItemToGround(state, dungeon, player, [], 1000);
    expect(firstDrop.success).toBe(true);
    expect(firstDrop.droppedGroundItem).toBeTruthy();
    expect(`${firstDrop.droppedGroundItem.tileX}:${firstDrop.droppedGroundItem.tileY}`).not.toBe("3:3");

    const secondDrop = dropSelectedInventoryItemToGround(
      firstDrop.systemUi,
      dungeon,
      player,
      [firstDrop.droppedGroundItem],
      1001
    );
    expect(secondDrop.success).toBe(true);
    expect(secondDrop.droppedGroundItem).toBeTruthy();

    const tileA = firstDrop.droppedGroundItem;
    const tileB = secondDrop.droppedGroundItem;
    expect(`${tileA.tileX}:${tileA.tileY}`).not.toBe(`${tileB.tileX}:${tileB.tileY}`);
  });

  it("dropSelectedInventoryItemToGround は在庫を減らし、0になったアイテムを削除する", () => {
    const dungeon = createWalkableDungeon(8, 8, true);
    const player = createPlayerAtFeetTile(3, 3);
    const state = createInitialSystemUiState();
    state.inventory.selectedItemId = "run_item_antidote";

    const next = dropSelectedInventoryItemToGround(state, dungeon, player, [], 1000);
    expect(next.success).toBe(true);
    expect(next.droppedGroundItem).toBeTruthy();
    expect(next.systemUi.inventory.items.some((item) => item.id === "run_item_antidote")).toBe(false);
    expect(next.systemUi.toastMessage).toContain("捨てました");
  });

  it("dropSelectedInventoryItemToGround は配置先がない場合は失敗し在庫を維持する", () => {
    const dungeon = createWalkableDungeon(6, 6, false);
    const player = createPlayerAtFeetTile(3, 3);
    const state = createInitialSystemUiState();

    const beforePotionCount = state.inventory.items.find((item) => item.id === "run_item_potion_small")?.count;
    const next = dropSelectedInventoryItemToGround(state, dungeon, player, [], 1000);
    expect(next.success).toBe(false);
    expect(next.droppedGroundItem).toBeNull();
    expect(next.systemUi.toastMessage).toContain("置ける場所がありません");
    const afterPotionCount = next.systemUi.inventory.items.find((item) => item.id === "run_item_potion_small")?.count;
    expect(afterPotionCount).toBe(beforePotionCount);
  });

  it("findDropTileNearPlayer はプレイヤー足元と占有タイルを避ける", () => {
    const dungeon = createWalkableDungeon(7, 7, true);
    const player = createPlayerAtFeetTile(3, 3);
    const drop = findDropTileNearPlayer(dungeon, player, [
      { tileX: 2, tileY: 3 },
    ]);

    expect(drop).not.toBeNull();
    expect(`${drop.tileX}:${drop.tileY}`).not.toBe("3:3");
    expect(`${drop.tileX}:${drop.tileY}`).not.toBe("2:3");
  });

  it("dropSelectedInventoryItemToGround は runtimeItem の主要情報を保持する", () => {
    const dungeon = createWalkableDungeon(8, 8, true);
    const player = createPlayerAtFeetTile(3, 3);
    const state = createInitialSystemUiState();

    const next = dropSelectedInventoryItemToGround(state, dungeon, player, [], 1000);
    expect(next.success).toBe(true);
    expect(next.droppedGroundItem?.sourceType).toBe("inventory_drop");
    expect(next.droppedGroundItem?.runtimeItem).toMatchObject({
      id: "run_item_potion_small",
      type: "consumable",
      iconKey: "potion_red",
      nameKey: "item_name_potion_small",
      descriptionKey: "item_desc_potion_small",
      effectKey: "item_effect_potion_small",
      count: 1,
    });
    expect(typeof next.droppedGroundItem?.runtimeItem?.iconImageSrc).toBe("string");
  });

  it("tryAddInventoryItem は既存スタックに加算し、画像srcを保持する", () => {
    const state = createInitialSystemUiState();

    const result = tryAddInventoryItem(
      state,
      {
        id: "item_herb_01",
        type: "consumable",
        count: 1,
        iconKey: "herb",
        iconImageSrc: "/graphic/item/item_herb_01.png",
        nameKey: "name_item_herb_01",
        descriptionKey: "desc_item_herb_01",
        effectKey: "item_effect_herb_01",
      },
      { maxStack: 20 }
    );

    expect(result.success).toBe(true);
    const herb = result.systemUi.inventory.items.find((item) => item.id === "item_herb_01");
    expect(herb).toBeTruthy();
    expect(herb.count).toBe(1);
    expect(herb.iconImageSrc).toContain("item_herb_01.png");

    const stacked = tryAddInventoryItem(
      result.systemUi,
      {
        id: "item_herb_01",
        type: "consumable",
        count: 2,
        iconKey: "herb",
        nameKey: "name_item_herb_01",
        descriptionKey: "desc_item_herb_01",
        effectKey: "item_effect_herb_01",
      },
      { maxStack: 20 }
    );
    const stackedHerb = stacked.systemUi.inventory.items.find((item) => item.id === "item_herb_01");
    expect(stackedHerb.count).toBe(3);
  });

  it("tryAddInventoryItem は空き枠がない場合に失敗する", () => {
    const state = createInitialSystemUiState();
    state.inventory.capacity = 1;
    state.inventory.items = [
      {
        id: "item_herb_01",
        type: "consumable",
        count: 20,
        quickSlot: null,
        iconKey: "herb",
        nameKey: "name_item_herb_01",
        descriptionKey: "desc_item_herb_01",
        effectKey: "item_effect_herb_01",
      },
    ];
    state.inventory.selectedItemId = "item_herb_01";

    const result = tryAddInventoryItem(
      state,
      {
        id: "item_herb_01",
        type: "consumable",
        count: 1,
        iconKey: "herb",
        nameKey: "name_item_herb_01",
        descriptionKey: "desc_item_herb_01",
        effectKey: "item_effect_herb_01",
      },
      { maxStack: 20 }
    );

    expect(result.success).toBe(false);
    expect(result.systemUi.toastMessage).toContain("いっぱい");
    const herb = result.systemUi.inventory.items.find((item) => item.id === "item_herb_01");
    expect(herb.count).toBe(20);
  });
});
