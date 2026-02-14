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
  const togglePlayerStatsButton = createEventTarget({
    textContent: "ステータス表示",
    attributes: { "aria-pressed": "false" },
  });
  const statsList = createEventTarget({ innerHTML: "" });
  const playerStatsWindow = createEventTarget({ hidden: true });
  const playerStatsList = createEventTarget({ innerHTML: "" });
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
    "#debug-player-stats-window": playerStatsWindow,
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
    playerStatsWindow,
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

describe("debugPanel", () => {
  it("一時停止ボタンクリックで onTogglePause が呼ばれる", () => {
    const { root, pauseToggleButton } = createDebugRoot();
    const onTogglePause = vi.fn();

    createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause,
      onShowStorage: vi.fn(),
      onResetStorage: vi.fn(),
      onToggleDamagePreview: vi.fn(),
      onTogglePlayerStats: vi.fn(),
    });

    pauseToggleButton.trigger("click");
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it("setPaused でボタン文言と aria-pressed が切り替わる", () => {
    const { root, pauseToggleButton } = createDebugRoot();

    const panel = createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause: vi.fn(),
      onShowStorage: vi.fn(),
      onResetStorage: vi.fn(),
      onToggleDamagePreview: vi.fn(),
      onTogglePlayerStats: vi.fn(),
    });

    panel.setPaused(true);
    expect(pauseToggleButton.textContent).toBe("再開");
    expect(pauseToggleButton.getAttribute("aria-pressed")).toBe("true");

    panel.setPaused(false);
    expect(pauseToggleButton.textContent).toBe("一時停止");
    expect(pauseToggleButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("Storage表示ボタンクリックで onShowStorage が呼ばれる", () => {
    const { root, showStorageButton } = createDebugRoot();
    const onShowStorage = vi.fn();

    createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause: vi.fn(),
      onShowStorage,
      onResetStorage: vi.fn(),
      onToggleDamagePreview: vi.fn(),
      onTogglePlayerStats: vi.fn(),
    });

    showStorageButton.trigger("click");
    expect(onShowStorage).toHaveBeenCalledTimes(1);
  });

  it("setStorageDump で表示/非表示が切り替わる", () => {
    const { root, storageView } = createDebugRoot();

    const panel = createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause: vi.fn(),
      onShowStorage: vi.fn(),
      onResetStorage: vi.fn(),
      onToggleDamagePreview: vi.fn(),
      onTogglePlayerStats: vi.fn(),
    });

    panel.setStorageDump("keys: 1\n\n[test]\nvalue");
    expect(storageView.hidden).toBe(false);
    expect(storageView.textContent).toContain("keys: 1");

    panel.setStorageDump("");
    expect(storageView.hidden).toBe(true);
    expect(storageView.textContent).toBe("");
  });

  it("Storageリセットボタンクリックで onResetStorage が呼ばれる", () => {
    const { root, resetStorageButton } = createDebugRoot();
    const onResetStorage = vi.fn();

    createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause: vi.fn(),
      onShowStorage: vi.fn(),
      onResetStorage,
      onToggleDamagePreview: vi.fn(),
      onTogglePlayerStats: vi.fn(),
    });

    resetStorageButton.trigger("click");
    expect(onResetStorage).toHaveBeenCalledTimes(1);
  });

  it("被ダメ設定ボタンクリックで onToggleDamagePreview が呼ばれる", () => {
    const { root, damagePreviewToggleButton } = createDebugRoot();
    const onToggleDamagePreview = vi.fn();

    createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause: vi.fn(),
      onShowStorage: vi.fn(),
      onResetStorage: vi.fn(),
      onToggleDamagePreview,
      onTogglePlayerStats: vi.fn(),
    });

    damagePreviewToggleButton.trigger("click");
    expect(onToggleDamagePreview).toHaveBeenCalledTimes(1);
  });

  it("setDamagePreviewOnly でボタン文言と aria-pressed が切り替わる", () => {
    const { root, damagePreviewToggleButton } = createDebugRoot();

    const panel = createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause: vi.fn(),
      onShowStorage: vi.fn(),
      onResetStorage: vi.fn(),
      onToggleDamagePreview: vi.fn(),
      onTogglePlayerStats: vi.fn(),
    });

    panel.setDamagePreviewOnly(true);
    expect(damagePreviewToggleButton.textContent).toBe("被ダメ無効(演出のみ)");
    expect(damagePreviewToggleButton.getAttribute("aria-pressed")).toBe("true");

    panel.setDamagePreviewOnly(false);
    expect(damagePreviewToggleButton.textContent).toBe("被ダメ有効");
    expect(damagePreviewToggleButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("プレイヤーステータス表示ボタンで onTogglePlayerStats が呼ばれる", () => {
    const { root, togglePlayerStatsButton } = createDebugRoot();
    const onTogglePlayerStats = vi.fn();

    createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause: vi.fn(),
      onShowStorage: vi.fn(),
      onResetStorage: vi.fn(),
      onToggleDamagePreview: vi.fn(),
      onTogglePlayerStats,
    });

    togglePlayerStatsButton.trigger("click");
    expect(onTogglePlayerStats).toHaveBeenCalledTimes(1);
  });

  it("setPlayerStatsWindowOpen でボタン文言と表示状態が切り替わる", () => {
    const { root, togglePlayerStatsButton, playerStatsWindow } = createDebugRoot();

    const panel = createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause: vi.fn(),
      onShowStorage: vi.fn(),
      onResetStorage: vi.fn(),
      onToggleDamagePreview: vi.fn(),
      onTogglePlayerStats: vi.fn(),
    });

    panel.setPlayerStatsWindowOpen(true);
    expect(togglePlayerStatsButton.textContent).toBe("ステータス非表示");
    expect(togglePlayerStatsButton.getAttribute("aria-pressed")).toBe("true");
    expect(playerStatsWindow.hidden).toBe(false);

    panel.setPlayerStatsWindowOpen(false);
    expect(togglePlayerStatsButton.textContent).toBe("ステータス表示");
    expect(togglePlayerStatsButton.getAttribute("aria-pressed")).toBe("false");
    expect(playerStatsWindow.hidden).toBe(true);
  });

  it("setPlayerStats で詳細行が描画される", () => {
    withMockDocument(() => {
      const { root, playerStatsList } = createDebugRoot();

      const panel = createDebugPanel(root, {
        onApplySeed: vi.fn(),
        onRegenerate: vi.fn(),
        onTogglePause: vi.fn(),
        onShowStorage: vi.fn(),
        onResetStorage: vi.fn(),
        onToggleDamagePreview: vi.fn(),
        onTogglePlayerStats: vi.fn(),
      });

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

  it("dungeon id 変更で onDungeonIdChange が呼ばれる", () => {
    const { root, dungeonIdSelect } = createDebugRoot();
    const onDungeonIdChange = vi.fn();

    createDebugPanel(root, {
      onApplySeed: vi.fn(),
      onRegenerate: vi.fn(),
      onTogglePause: vi.fn(),
      onShowStorage: vi.fn(),
      onResetStorage: vi.fn(),
      onToggleDamagePreview: vi.fn(),
      onTogglePlayerStats: vi.fn(),
      onDungeonIdChange,
    });

    dungeonIdSelect.value = "dungeon_id_01";
    dungeonIdSelect.trigger("change");
    expect(onDungeonIdChange).toHaveBeenCalledWith("dungeon_id_01");
  });

  it("setDungeonOptions と setDungeonId が選択状態を更新する", () => {
    withMockDocument(() => {
      const { root, dungeonIdSelect } = createDebugRoot();

      const panel = createDebugPanel(root, {
        onApplySeed: vi.fn(),
        onRegenerate: vi.fn(),
        onTogglePause: vi.fn(),
        onShowStorage: vi.fn(),
        onResetStorage: vi.fn(),
        onToggleDamagePreview: vi.fn(),
        onTogglePlayerStats: vi.fn(),
        onDungeonIdChange: vi.fn(),
      });

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
