import { describe, expect, it, vi } from "vitest";
import { createDebugPanel } from "../../src/ui/debugPanel.js";

function createEventTarget(initial = {}) {
  const listeners = new Map();

  return {
    ...initial,
    addEventListener: vi.fn((type, handler) => {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    }),
    trigger(type, event = {}) {
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
    setAttribute(name, value) {
      if (!this.attributes) {
        this.attributes = {};
      }
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes?.[name] ?? null;
    },
    appendChild(child) {
      if (!Array.isArray(this.children)) {
        this.children = [];
      }
      this.children.push(child);
    },
  };
}

function createDebugRoot() {
  const seedInput = createEventTarget({ value: "", textContent: "" });
  const dungeonIdSelect = createEventTarget({ value: "", innerHTML: "" });
  const applySeedButton = createEventTarget({ textContent: "Apply Seed" });
  const regenerateButton = createEventTarget({ textContent: "再生成" });
  const pauseToggleButton = createEventTarget({ textContent: "一時停止", attributes: { "aria-pressed": "false" } });
  const showStorageButton = createEventTarget({ textContent: "Storage表示" });
  const resetStorageButton = createEventTarget({ textContent: "Storageリセット" });
  const damagePreviewToggleButton = createEventTarget({
    textContent: "被ダメ有効",
    attributes: { "aria-pressed": "false" },
  });
  const togglePlayerStatsButton = createEventTarget({ textContent: "ステータス表示" });
  const statsList = createEventTarget({ innerHTML: "" });
  const detailWindow = createEventTarget({ hidden: true });
  const detailTitle = createEventTarget({ textContent: "Debug Detail" });
  const detailCloseButton = createEventTarget({ textContent: "×" });
  const playerStatsList = createEventTarget({ innerHTML: "", hidden: true });
  const storageView = createEventTarget({ textContent: "", hidden: true });
  const errorMessage = createEventTarget({ textContent: "", hidden: true });

  const elements = {
    "#seed-input": seedInput,
    "#dungeon-id-select": dungeonIdSelect,
    "#apply-seed": applySeedButton,
    "#regen-random": regenerateButton,
    "#pause-toggle": pauseToggleButton,
    "#show-storage": showStorageButton,
    "#reset-storage": resetStorageButton,
    "#damage-preview-toggle": damagePreviewToggleButton,
    "#toggle-player-stats": togglePlayerStatsButton,
    "#debug-stats": statsList,
    "#debug-detail-window": detailWindow,
    "#debug-detail-title": detailTitle,
    "#debug-detail-close": detailCloseButton,
    "#debug-player-stats": playerStatsList,
    "#debug-storage": storageView,
    "#debug-error": errorMessage,
  };

  const root = {
    querySelector: vi.fn((selector) => elements[selector] ?? null),
  };

  return {
    root,
    dungeonIdSelect,
    pauseToggleButton,
    showStorageButton,
    resetStorageButton,
    damagePreviewToggleButton,
    togglePlayerStatsButton,
    detailWindow,
    detailTitle,
    detailCloseButton,
    playerStatsList,
    storageView,
  };
}

function withMockDocument(run) {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: vi.fn(() => ({ className: "", textContent: "" })),
  };

  try {
    run();
  } finally {
    if (typeof originalDocument === "undefined") {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
}

function createHandlers(overrides = {}) {
  return {
    onApplySeed: vi.fn(),
    onRegenerate: vi.fn(),
    onTogglePause: vi.fn(),
    onShowStorage: vi.fn(),
    onResetStorage: vi.fn(),
    onToggleDamagePreview: vi.fn(),
    onShowPlayerStats: vi.fn(),
    onCloseDetailWindow: vi.fn(),
    onDungeonIdChange: vi.fn(),
    ...overrides,
  };
}

describe("debugPanel", () => {
  it("一時停止ボタンクリックで onTogglePause が呼ばれる", () => {
    const { root, pauseToggleButton } = createDebugRoot();
    const handlers = createHandlers();

    createDebugPanel(root, handlers);
    pauseToggleButton.trigger("click");

    expect(handlers.onTogglePause).toHaveBeenCalledTimes(1);
  });

  it("setPaused でボタン文言と aria-pressed が切り替わる", () => {
    const { root, pauseToggleButton } = createDebugRoot();
    const panel = createDebugPanel(root, createHandlers());

    panel.setPaused(true);
    expect(pauseToggleButton.textContent).toBe("再開");
    expect(pauseToggleButton.getAttribute("aria-pressed")).toBe("true");

    panel.setPaused(false);
    expect(pauseToggleButton.textContent).toBe("一時停止");
    expect(pauseToggleButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("Storage表示ボタンクリックで onShowStorage が呼ばれる", () => {
    const { root, showStorageButton } = createDebugRoot();
    const handlers = createHandlers();

    createDebugPanel(root, handlers);
    showStorageButton.trigger("click");

    expect(handlers.onShowStorage).toHaveBeenCalledTimes(1);
  });

  it("setStorageDump で共通詳細ウィンドウが表示/非表示される", () => {
    const { root, detailWindow, detailTitle, storageView, playerStatsList } = createDebugRoot();
    const panel = createDebugPanel(root, createHandlers());

    panel.setStorageDump("keys: 1\n\n[test]\nvalue");
    expect(detailWindow.hidden).toBe(false);
    expect(detailTitle.textContent).toBe("Storage");
    expect(storageView.hidden).toBe(false);
    expect(storageView.textContent).toContain("keys: 1");
    expect(playerStatsList.hidden).toBe(true);

    panel.setStorageDump("");
    expect(detailWindow.hidden).toBe(true);
    expect(storageView.textContent).toBe("");
  });

  it("Storageリセットボタンクリックで onResetStorage が呼ばれる", () => {
    const { root, resetStorageButton } = createDebugRoot();
    const handlers = createHandlers();

    createDebugPanel(root, handlers);
    resetStorageButton.trigger("click");

    expect(handlers.onResetStorage).toHaveBeenCalledTimes(1);
  });

  it("被ダメ設定ボタンクリックで onToggleDamagePreview が呼ばれる", () => {
    const { root, damagePreviewToggleButton } = createDebugRoot();
    const handlers = createHandlers();

    createDebugPanel(root, handlers);
    damagePreviewToggleButton.trigger("click");

    expect(handlers.onToggleDamagePreview).toHaveBeenCalledTimes(1);
  });

  it("setDamagePreviewOnly でボタン文言と aria-pressed が切り替わる", () => {
    const { root, damagePreviewToggleButton } = createDebugRoot();
    const panel = createDebugPanel(root, createHandlers());

    panel.setDamagePreviewOnly(true);
    expect(damagePreviewToggleButton.textContent).toBe("被ダメ無効(演出のみ)");
    expect(damagePreviewToggleButton.getAttribute("aria-pressed")).toBe("true");

    panel.setDamagePreviewOnly(false);
    expect(damagePreviewToggleButton.textContent).toBe("被ダメ有効");
    expect(damagePreviewToggleButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("プレイヤーステータス表示ボタンで onShowPlayerStats が呼ばれる", () => {
    const { root, togglePlayerStatsButton } = createDebugRoot();
    const handlers = createHandlers();

    createDebugPanel(root, handlers);
    togglePlayerStatsButton.trigger("click");

    expect(handlers.onShowPlayerStats).toHaveBeenCalledTimes(1);
  });

  it("×ボタンで onCloseDetailWindow が呼ばれる", () => {
    const { root, detailCloseButton } = createDebugRoot();
    const handlers = createHandlers();

    createDebugPanel(root, handlers);
    detailCloseButton.trigger("click");

    expect(handlers.onCloseDetailWindow).toHaveBeenCalledTimes(1);
  });

  it("setPlayerStatsWindowOpen で共通詳細ウィンドウの player stats 表示が切り替わる", () => {
    const { root, detailWindow, detailTitle, playerStatsList, storageView } = createDebugRoot();
    const panel = createDebugPanel(root, createHandlers());

    panel.setPlayerStatsWindowOpen(true);
    expect(detailWindow.hidden).toBe(false);
    expect(detailTitle.textContent).toBe("Player Stats");
    expect(playerStatsList.hidden).toBe(false);
    expect(storageView.hidden).toBe(true);

    panel.setPlayerStatsWindowOpen(false);
    expect(detailWindow.hidden).toBe(true);
  });

  it("setPlayerStats で詳細行が描画される", () => {
    withMockDocument(() => {
      const { root, playerStatsList } = createDebugRoot();
      const panel = createDebugPanel(root, createHandlers());

      panel.setPlayerStats([
        { label: "[基本] VIT", value: "2" },
        { label: "与ダメ倍率", value: "1.140" },
      ]);

      expect(Array.isArray(playerStatsList.children)).toBe(true);
      expect(playerStatsList.children).toHaveLength(2);
      expect(playerStatsList.children[0].textContent).toBe("[基本] VIT: 2");
      expect(playerStatsList.children[1].textContent).toBe("与ダメ倍率: 1.140");
    });
  });

  it("storage 表示から player stats 表示へ切り替わる", () => {
    const { root, detailWindow, detailTitle, playerStatsList, storageView } = createDebugRoot();
    const panel = createDebugPanel(root, createHandlers());

    panel.setStorageDump("keys: 1");
    panel.setPlayerStatsWindowOpen(true);

    expect(detailWindow.hidden).toBe(false);
    expect(detailTitle.textContent).toBe("Player Stats");
    expect(playerStatsList.hidden).toBe(false);
    expect(storageView.hidden).toBe(true);
  });

  it("dungeon id 変更で onDungeonIdChange が呼ばれる", () => {
    const { root, dungeonIdSelect } = createDebugRoot();
    const handlers = createHandlers();

    createDebugPanel(root, handlers);
    dungeonIdSelect.value = "dungeon_id_01";
    dungeonIdSelect.trigger("change");

    expect(handlers.onDungeonIdChange).toHaveBeenCalledWith("dungeon_id_01");
  });

  it("setDungeonOptions と setDungeonId が選択状態を更新する", () => {
    withMockDocument(() => {
      const { root, dungeonIdSelect } = createDebugRoot();
      const panel = createDebugPanel(root, createHandlers());

      panel.setDungeonOptions(
        [
          { id: "dungeon_id_01", label: "dungeon_id_01" },
          { id: "dungeon_id_02", label: "dungeon_id_02" },
        ],
        "dungeon_id_02"
      );

      expect(Array.isArray(dungeonIdSelect.children)).toBe(true);
      expect(dungeonIdSelect.children).toHaveLength(2);
      expect(dungeonIdSelect.value).toBe("dungeon_id_02");

      panel.setDungeonId("dungeon_id_01");
      expect(dungeonIdSelect.value).toBe("dungeon_id_01");
    });
  });
});
