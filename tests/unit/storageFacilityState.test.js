import { describe, expect, it } from "vitest";
import {
  autoArrangeStorage,
  buildStorageFacilityViewModel,
  createStorageFacilityUiState,
  purchaseStorageUpgrade,
  sellSelectedStorageEntries,
  transferStorageEntry,
} from "../../src/surface/storageFacilityState.js";

function createEmptyQuickslots() {
  return Array.from({ length: 8 }, () => null);
}

function createPlayerState() {
  return {
    base: {
      wallet: { gold: 0 },
      unlocks: { inventory_slot_max: 10 },
      stash: {
        capacity: 30,
        items: [],
      },
    },
    in_run: true,
    run: {
      inventory: [],
      quickslots: createEmptyQuickslots(),
    },
  };
}

function createItemDefinitionsById() {
  return {
    item_herb_01: {
      id: "item_herb_01",
      nameKey: "name_item_herb_01",
      descriptionKey: "desc_item_herb_01",
      category: "consumable",
      subType: "heal",
      maxStack: 20,
    },
    item_potion_01: {
      id: "item_potion_01",
      nameKey: "item_potion_01",
      descriptionKey: "item_potion_01",
      category: "consumable",
      subType: "heal",
      maxStack: 10,
    },
  };
}

describe("storageFacilityState", () => {
  it("item分割移動でスタック合流し、余りは新規スタックになる", () => {
    const state = createPlayerState();
    const itemDefs = createItemDefinitionsById();
    state.run.inventory = [{ type: "item", item_def_id: "item_herb_01", count: 25 }];
    state.run.quickslots[0] = "item_herb_01";
    state.base.stash.items = [{ type: "item", item_def_id: "item_herb_01", count: 19 }];

    const result = transferStorageEntry(state, {
      fromPane: "run",
      entryIndex: 0,
      amount: 10,
      itemDefinitionsById: itemDefs,
    });

    expect(result.ok).toBe(true);
    expect(state.run.inventory).toEqual([{ type: "item", item_def_id: "item_herb_01", count: 15 }]);
    expect(state.base.stash.items).toEqual([
      { type: "item", item_def_id: "item_herb_01", count: 20 },
      { type: "item", item_def_id: "item_herb_01", count: 9 },
    ]);
    expect(state.run.quickslots[0]).toBe("item_herb_01");
  });

  it("容量不足時は原子的に失敗し、状態を変更しない", () => {
    const state = createPlayerState();
    const itemDefs = createItemDefinitionsById();
    state.base.stash.capacity = 1;
    state.base.stash.items = [{ type: "item", item_def_id: "item_herb_01", count: 20 }];
    state.run.inventory = [{ type: "item", item_def_id: "item_herb_01", count: 3 }];

    const result = transferStorageEntry(state, {
      fromPane: "run",
      entryIndex: 0,
      amount: 1,
      itemDefinitionsById: itemDefs,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("target_full");
    expect(state.run.inventory[0].count).toBe(3);
    expect(state.base.stash.items[0].count).toBe(20);
  });

  it("非スタック装備の移動は1枠単位で行う", () => {
    const state = createPlayerState();
    state.run.inventory = [
      {
        type: "weapon",
        weapon_def_id: "weapon_sword_01",
        rarity: "common",
        weapon_plus: 0,
        chip_slot_count: 2,
        formation_id: "formation_id_circle01",
        skills: [],
        identified: true,
      },
    ];

    const result = transferStorageEntry(state, {
      fromPane: "run",
      entryIndex: 0,
      amount: 1,
      itemDefinitionsById: createItemDefinitionsById(),
    });

    expect(result.ok).toBe(true);
    expect(state.run.inventory).toEqual([]);
    expect(state.base.stash.items).toHaveLength(1);
    expect(state.base.stash.items[0].type).toBe("weapon");
  });

  it("run側が空になったアイテムIDのquickslotは自動でnull化される", () => {
    const state = createPlayerState();
    state.run.inventory = [{ type: "item", item_def_id: "item_herb_01", count: 1 }];
    state.run.quickslots[0] = "item_herb_01";

    const result = transferStorageEntry(state, {
      fromPane: "run",
      entryIndex: 0,
      amount: 1,
      itemDefinitionsById: createItemDefinitionsById(),
    });

    expect(result.ok).toBe(true);
    expect(state.run.inventory).toEqual([]);
    expect(state.run.quickslots[0]).toBeNull();
  });

  it("売却は合計価格をgoldへ加算し、未鑑定係数を適用する", () => {
    const state = createPlayerState();
    const itemDefs = createItemDefinitionsById();
    state.base.wallet.gold = 100;
    state.run.inventory = [{ type: "item", item_def_id: "item_herb_01", count: 2 }];
    state.base.stash.items = [
      {
        type: "weapon",
        weapon_def_id: "weapon_sword_01",
        rarity: "rare",
        weapon_plus: 5,
        chip_slot_count: 3,
        formation_id: "formation_id_circle01",
        skills: [],
        identified: false,
      },
    ];

    const confirmNeeded = sellSelectedStorageEntries(state, {
      selectedEntries: ["run:0", "stash:0"],
      itemDefinitionsById: itemDefs,
      confirmHighValue: false,
    });
    expect(confirmNeeded.ok).toBe(false);
    expect(confirmNeeded.reason).toBe("confirm_required");

    const sold = sellSelectedStorageEntries(state, {
      selectedEntries: ["run:0", "stash:0"],
      itemDefinitionsById: itemDefs,
      confirmHighValue: true,
    });

    expect(sold.ok).toBe(true);
    expect(sold.totalPrice).toBe(334);
    expect(state.base.wallet.gold).toBe(434);
    expect(state.run.inventory).toEqual([]);
    expect(state.base.stash.items).toEqual([]);
  });

  it("拡張コストは段階的に上昇し、容量が増える", () => {
    const state = createPlayerState();
    state.base.wallet.gold = 5000;

    const stash1 = purchaseStorageUpgrade(state, "stash");
    const stash2 = purchaseStorageUpgrade(state, "stash");
    const inv1 = purchaseStorageUpgrade(state, "inventory");

    expect(stash1).toMatchObject({ ok: true, kind: "stash", cost: 280, newCapacity: 35 });
    expect(stash2).toMatchObject({ ok: true, kind: "stash", cost: 425, newCapacity: 40 });
    expect(inv1).toMatchObject({ ok: true, kind: "inventory", cost: 180, newCapacity: 11 });
  });

  it("自動整頓でitem合流+ソートされ、quickslot参照も正規化される", () => {
    const state = createPlayerState();
    const itemDefs = createItemDefinitionsById();
    state.run.inventory = [
      {
        type: "weapon",
        weapon_def_id: "weapon_sword_01",
        rarity: "common",
        weapon_plus: 0,
        chip_slot_count: 2,
        formation_id: "formation_id_circle01",
        skills: [],
        identified: true,
      },
      { type: "item", item_def_id: "item_herb_01", count: 3 },
      { type: "item", item_def_id: "item_herb_01", count: 18 },
      { type: "item", item_def_id: "item_potion_01", count: 25 },
    ];
    state.run.quickslots = ["item_herb_01", "item_missing", null, null, null, null, null, null];

    const result = autoArrangeStorage(state, "run", "type", {
      itemDefinitionsById: itemDefs,
      weaponDefinitionsById: {},
    });

    expect(result.ok).toBe(true);
    expect(state.run.inventory.slice(0, 5).every((entry) => entry.type === "item")).toBe(true);
    expect(state.run.inventory[0]).toEqual({ type: "item", item_def_id: "item_herb_01", count: 20 });
    expect(state.run.inventory[1]).toEqual({ type: "item", item_def_id: "item_herb_01", count: 1 });
    expect(state.run.inventory[2]).toEqual({ type: "item", item_def_id: "item_potion_01", count: 10 });
    expect(state.run.inventory[3]).toEqual({ type: "item", item_def_id: "item_potion_01", count: 10 });
    expect(state.run.inventory[4]).toEqual({ type: "item", item_def_id: "item_potion_01", count: 5 });
    expect(state.run.inventory[5].type).toBe("weapon");
    expect(state.run.quickslots[0]).toBe("item_herb_01");
    expect(state.run.quickslots[1]).toBeNull();
  });

  it("icon解決関数を注入するとentries/selectedへicon情報を反映する", () => {
    const state = createPlayerState();
    state.run.inventory = [{ type: "item", item_def_id: "item_herb_01", count: 2 }];
    state.base.stash.items = [
      {
        type: "weapon",
        weapon_def_id: "weapon_sword_01",
        rarity: "common",
        weapon_plus: 0,
        chip_slot_count: 2,
        formation_id: "formation_id_circle01",
        skills: [],
        identified: true,
      },
      {
        type: "armor",
        armor_def_id: "armor_chain_01",
        rarity: "common",
        plus: 0,
        durability: 100,
        identified: true,
      },
    ];

    const uiState = createStorageFacilityUiState();
    uiState.selectedPane = "stash";
    uiState.selectedIndex = 1;
    const vm = buildStorageFacilityViewModel({
      playerState: state,
      uiState,
      itemDefinitionsById: createItemDefinitionsById(),
      weaponDefinitionsById: {},
      resolveEntryIconSrc: (entry) => {
        if (entry?.type === "item") {
          return "asset://item";
        }
        if (entry?.type === "weapon") {
          return "asset://weapon";
        }
        return "";
      },
    });

    expect(vm.run.entries[0].iconImageSrc).toBe("asset://item");
    expect(vm.run.entries[0].iconFallbackKind).toBe("item");
    expect(vm.stash.entries[0].iconImageSrc).toBe("asset://weapon");
    expect(vm.stash.entries[0].iconFallbackKind).toBe("weapon");
    expect(vm.stash.entries[1].iconImageSrc).toBe("");
    expect(vm.stash.entries[1].iconFallbackKind).toBe("armor");
    expect(vm.selected).toMatchObject({
      type: "armor",
      iconImageSrc: "",
      iconFallbackKind: "armor",
    });
  });

  it("itemDefinitionsがある場合はitem idではなく定義ベースの名称/説明を使う", () => {
    const state = createPlayerState();
    state.base.stash.items = [{ type: "item", item_def_id: "item_herb_01", count: 1 }];
    const uiState = createStorageFacilityUiState();
    uiState.selectedPane = "stash";
    uiState.selectedIndex = 0;

    const t = (key, fallback) => {
      if (key === "name_item_herb_01") {
        return "薬草";
      }
      if (key === "desc_item_herb_01") {
        return "HPを回復する";
      }
      return fallback;
    };

    const vmWithDefinitions = buildStorageFacilityViewModel({
      playerState: state,
      uiState,
      itemDefinitionsById: createItemDefinitionsById(),
      weaponDefinitionsById: {},
      t,
    });

    const vmWithoutDefinitions = buildStorageFacilityViewModel({
      playerState: state,
      uiState,
      itemDefinitionsById: {},
      weaponDefinitionsById: {},
      t,
    });

    expect(vmWithDefinitions.selected?.name).toBe("薬草");
    expect(vmWithDefinitions.selected?.description).toBe("HPを回復する");
    expect(vmWithoutDefinitions.selected?.name).toBe("item_herb_01");
    expect(vmWithoutDefinitions.selected?.description).toBe("item_herb_01");
  });

  it("viewModel snapshotにsurface用の要約情報を返す", () => {
    const state = createPlayerState();
    state.base.wallet.gold = 777;
    state.run.inventory = [{ type: "item", item_def_id: "item_herb_01", count: 2 }];
    state.base.stash.items = [{ type: "item", item_def_id: "item_herb_01", count: 5 }];
    const uiState = createStorageFacilityUiState();
    uiState.open = true;
    uiState.activeTab = "item";
    uiState.sellMode = true;
    uiState.selectedPane = "stash";
    uiState.selectedIndex = 0;
    uiState.sellSelection = ["stash:0"];

    const vm = buildStorageFacilityViewModel({
      playerState: state,
      uiState,
      itemDefinitionsById: createItemDefinitionsById(),
      weaponDefinitionsById: {},
    });

    expect(vm.snapshot).toEqual({
      open: true,
      tab: "item",
      sellMode: true,
      capacity: { run: 10, stash: 30 },
      used: { run: 1, stash: 1 },
      gold: 777,
      selected: { pane: "stash", index: 0 },
      totalSellPrice: 70,
    });
  });
});
