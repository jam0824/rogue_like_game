import { describe, expect, it, vi } from "vitest";
import { createSurfaceStorageHud } from "../../src/ui/surfaceStorageHud.js";

function createClassList() {
  const values = new Set();
  return {
    toggle(name, force) {
      if (force === true) {
        values.add(name);
        return true;
      }
      if (force === false) {
        values.delete(name);
        return false;
      }
      if (values.has(name)) {
        values.delete(name);
        return false;
      }
      values.add(name);
      return true;
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createElement(initial = {}) {
  const listeners = new Map();
  return {
    textContent: "",
    hidden: false,
    disabled: false,
    value: "",
    max: "",
    innerHTML: "",
    dataset: {},
    classList: createClassList(),
    ...initial,
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    trigger(type, event = {}) {
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
  };
}

function createRoot() {
  const backButton = createElement();
  const goldText = createElement();
  const runCap = createElement();
  const stashCap = createElement();
  const runList = createElement();
  const stashList = createElement();
  const detailName = createElement();
  const detailMeta = createElement();
  const detailDesc = createElement();
  const detailPrice = createElement();
  const transferAmountInput = createElement({ value: "1" });
  const depositButton = createElement();
  const withdrawButton = createElement();
  const sellModeButton = createElement();
  const sellSummary = createElement();
  const sellExecButton = createElement();
  const sortKeySelect = createElement({ value: "type" });
  const arrangeRunButton = createElement();
  const arrangeStashButton = createElement();
  const upgradeStashButton = createElement();
  const upgradeInventoryButton = createElement();
  const toast = createElement({ hidden: true });
  const tabButtons = ["all", "item", "weapon", "armor", "accessory"].map((tab) => createElement({ dataset: { storageTab: tab } }));

  const byId = {
    "#surface-storage-back": backButton,
    "#surface-storage-gold": goldText,
    "#surface-storage-run-cap": runCap,
    "#surface-storage-stash-cap": stashCap,
    "#surface-storage-run-list": runList,
    "#surface-storage-stash-list": stashList,
    "#surface-storage-detail-name": detailName,
    "#surface-storage-detail-meta": detailMeta,
    "#surface-storage-detail-desc": detailDesc,
    "#surface-storage-detail-price": detailPrice,
    "#surface-storage-transfer-amount": transferAmountInput,
    "#surface-storage-deposit": depositButton,
    "#surface-storage-withdraw": withdrawButton,
    "#surface-storage-sell-mode": sellModeButton,
    "#surface-storage-sell-summary": sellSummary,
    "#surface-storage-sell-exec": sellExecButton,
    "#surface-storage-sort-key": sortKeySelect,
    "#surface-storage-arrange-run": arrangeRunButton,
    "#surface-storage-arrange-stash": arrangeStashButton,
    "#surface-storage-upgrade-stash": upgradeStashButton,
    "#surface-storage-upgrade-inventory": upgradeInventoryButton,
    "#surface-storage-toast": toast,
  };

  const root = createElement();
  root.querySelector = vi.fn((selector) => byId[selector] ?? null);
  root.querySelectorAll = vi.fn((selector) => {
    if (selector === "[data-storage-tab]") {
      return tabButtons;
    }
    return [];
  });

  return {
    root,
    tabButtons,
    runList,
    stashList,
    transferAmountInput,
    depositButton,
    withdrawButton,
    sellModeButton,
    sellExecButton,
    sortKeySelect,
    arrangeRunButton,
    arrangeStashButton,
    upgradeStashButton,
    upgradeInventoryButton,
    goldText,
    runCap,
    stashCap,
    detailName,
    detailMeta,
    detailDesc,
    detailPrice,
    toast,
  };
}

describe("surfaceStorageHud", () => {
  it("setOpen で表示状態を切り替える", () => {
    const refs = createRoot();
    const hud = createSurfaceStorageHud(refs.root, {});

    hud.setOpen(true);
    expect(refs.root.hidden).toBe(false);

    hud.setOpen(false);
    expect(refs.root.hidden).toBe(true);
  });

  it("タブ選択・エントリ選択・移動操作イベントを発火する", () => {
    const refs = createRoot();
    const handlers = {
      onSelectTab: vi.fn(),
      onSelectEntry: vi.fn(),
      onChangeTransferAmount: vi.fn(),
      onTransfer: vi.fn(),
      onClose: vi.fn(),
    };
    const hud = createSurfaceStorageHud(refs.root, handlers);

    refs.tabButtons[1].trigger("click");
    refs.transferAmountInput.value = "3";
    refs.transferAmountInput.trigger("change");
    refs.depositButton.trigger("click");
    refs.withdrawButton.trigger("click");
    refs.root.querySelector("#surface-storage-back").trigger("click");

    const clickTarget = {
      dataset: { storagePane: "run", storageIndex: "2" },
      closest() {
        return this;
      },
    };
    refs.runList.trigger("click", { target: clickTarget });

    expect(handlers.onSelectTab).toHaveBeenCalledWith("item");
    expect(handlers.onChangeTransferAmount).toHaveBeenCalledWith(3);
    expect(handlers.onTransfer).toHaveBeenNthCalledWith(1, { direction: "deposit", amount: 3 });
    expect(handlers.onTransfer).toHaveBeenNthCalledWith(2, { direction: "withdraw", amount: 3 });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onSelectEntry).toHaveBeenCalledWith({ pane: "run", index: 2 });

    hud.setViewModel({
      sellMode: true,
      tab: "all",
      gold: 0,
      run: { used: 0, capacity: 10, entries: [] },
      stash: { used: 0, capacity: 30, entries: [] },
      transfer: { amount: 1, maxAmount: 1, canDeposit: false, canWithdraw: false },
      sell: { selectedCount: 0, totalPrice: 0, canSell: false, requiresConfirm: false },
      upgrades: {
        stash: { cost: 10, nextCapacity: 35, canAfford: true },
        inventory: { cost: 10, nextCapacity: 11, canAfford: true },
      },
      selected: null,
      sortKey: "type",
    });
    handlers.onToggleSellEntry = vi.fn();
    const hudWithSellHandlers = createSurfaceStorageHud(refs.root, handlers);
    hudWithSellHandlers.setViewModel({
      sellMode: true,
      tab: "all",
      gold: 0,
      run: { used: 1, capacity: 10, entries: [{ pane: "run", index: 0, type: "item", name: "A", count: 1, sellPrice: 1 }] },
      stash: { used: 0, capacity: 30, entries: [] },
      transfer: { amount: 1, maxAmount: 1, canDeposit: true, canWithdraw: false },
      sell: { selectedCount: 0, totalPrice: 0, canSell: false, requiresConfirm: false },
      upgrades: {
        stash: { cost: 10, nextCapacity: 35, canAfford: true },
        inventory: { cost: 10, nextCapacity: 11, canAfford: true },
      },
      selected: null,
      sortKey: "type",
    });
    refs.runList.trigger("click", {
      target: {
        dataset: { storagePane: "run", storageIndex: "0" },
        closest() {
          return this;
        },
      },
    });
    expect(handlers.onToggleSellEntry).toHaveBeenCalledWith({ pane: "run", index: 0 });
  });

  it("売却・整頓・拡張操作イベントを発火する", () => {
    const refs = createRoot();
    const handlers = {
      onToggleSellMode: vi.fn(),
      onExecuteSell: vi.fn(),
      onChangeSortKey: vi.fn(),
      onAutoArrange: vi.fn(),
      onPurchaseUpgrade: vi.fn(),
    };
    createSurfaceStorageHud(refs.root, handlers);

    refs.sellModeButton.trigger("click");
    refs.sellExecButton.trigger("click");
    refs.sortKeySelect.value = "rarity";
    refs.sortKeySelect.trigger("change");
    refs.arrangeRunButton.trigger("click");
    refs.arrangeStashButton.trigger("click");
    refs.upgradeStashButton.trigger("click");
    refs.upgradeInventoryButton.trigger("click");

    expect(handlers.onToggleSellMode).toHaveBeenCalledTimes(1);
    expect(handlers.onExecuteSell).toHaveBeenCalledTimes(1);
    expect(handlers.onChangeSortKey).toHaveBeenCalledWith("rarity");
    expect(handlers.onAutoArrange).toHaveBeenNthCalledWith(1, { pane: "run", sortKey: "rarity" });
    expect(handlers.onAutoArrange).toHaveBeenNthCalledWith(2, { pane: "stash", sortKey: "rarity" });
    expect(handlers.onPurchaseUpgrade).toHaveBeenNthCalledWith(1, "stash");
    expect(handlers.onPurchaseUpgrade).toHaveBeenNthCalledWith(2, "inventory");
  });

  it("setViewModel で表示内容と活性状態を更新する", () => {
    const refs = createRoot();
    const hud = createSurfaceStorageHud(refs.root, {});

    hud.setViewModel({
      tab: "item",
      sortKey: "name",
      sellMode: true,
      gold: 777,
      run: {
        used: 0,
        capacity: 10,
        entries: [],
      },
      stash: {
        used: 2,
        capacity: 30,
        entries: [
          {
            pane: "stash",
            index: 0,
            type: "item",
            name: "薬草",
            description: "説明",
            count: 3,
            sellPrice: 42,
            isSelected: true,
            isSellSelected: true,
            plus: 0,
            iconImageSrc: "asset://herb",
            iconFallbackKind: "item",
          },
          {
            pane: "stash",
            index: 1,
            type: "armor",
            name: "鎖帷子",
            description: "防具",
            count: 1,
            sellPrice: 12,
            isSelected: false,
            isSellSelected: false,
            plus: 1,
            iconImageSrc: "",
            iconFallbackKind: "armor",
          },
        ],
      },
      selected: {
        type: "item",
        name: "薬草",
        description: "説明",
        count: 3,
        rarity: "common",
        plus: 0,
        identified: true,
        sellPrice: 42,
      },
      transfer: {
        amount: 2,
        maxAmount: 3,
        canDeposit: false,
        canWithdraw: true,
      },
      sell: {
        selectedCount: 1,
        totalPrice: 42,
        canSell: false,
        requiresConfirm: true,
      },
      upgrades: {
        stash: { cost: 280, nextCapacity: 35, canAfford: false },
        inventory: { cost: 180, nextCapacity: 11, canAfford: true },
      },
    });

    expect(refs.goldText.textContent).toBe("777G");
    expect(refs.runCap.textContent).toBe("0 / 10");
    expect(refs.stashCap.textContent).toBe("2 / 30");
    expect(refs.tabButtons[1].classList.contains("is-active")).toBe(true);
    expect(refs.transferAmountInput.value).toBe("2");
    expect(refs.transferAmountInput.max).toBe("3");
    expect(refs.depositButton.disabled).toBe(true);
    expect(refs.withdrawButton.disabled).toBe(false);
    expect(refs.sellModeButton.textContent).toContain("ON");
    expect(refs.sellExecButton.disabled).toBe(true);
    expect(refs.upgradeStashButton.disabled).toBe(true);
    expect(refs.upgradeInventoryButton.disabled).toBe(false);
    expect(refs.detailName.textContent).toContain("薬草");
    expect(refs.detailPrice.textContent).toBe("42G");
    expect(refs.stashList.innerHTML).toContain("surface-storage-entry-icon-image");
    expect(refs.stashList.innerHTML).toContain("surface-storage-entry-icon-placeholder");
    expect(refs.stashList.innerHTML).not.toContain("surface-storage-entry-name");
    expect(refs.stashList.innerHTML).not.toContain("surface-storage-entry-type");
    expect(refs.runList.innerHTML).toContain("surface-storage-empty");
    expect(refs.runList.innerHTML).not.toContain("（該当なし）");
  });

  it("setToast でメッセージ表示を切り替える", () => {
    const refs = createRoot();
    const hud = createSurfaceStorageHud(refs.root, {});

    hud.setToast("保存しました");
    expect(refs.toast.hidden).toBe(false);
    expect(refs.toast.textContent).toBe("保存しました");

    hud.setToast("");
    expect(refs.toast.hidden).toBe(true);
  });
});
