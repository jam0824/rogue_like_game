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
  };
}

function createDebugRoot() {
  const seedInput = createEventTarget({ value: "", textContent: "" });
  const applySeedButton = createEventTarget({ textContent: "Apply Seed" });
  const regenerateButton = createEventTarget({ textContent: "再生成" });
  const pauseToggleButton = createEventTarget({ textContent: "一時停止", attributes: { "aria-pressed": "false" } });
  const showStorageButton = createEventTarget({ textContent: "Storage表示" });
  const statsList = createEventTarget({ innerHTML: "" });
  const storageView = createEventTarget({ textContent: "", hidden: true });
  const errorMessage = createEventTarget({ textContent: "", hidden: true });

  const elements = {
    "#seed-input": seedInput,
    "#apply-seed": applySeedButton,
    "#regen-random": regenerateButton,
    "#pause-toggle": pauseToggleButton,
    "#show-storage": showStorageButton,
    "#debug-stats": statsList,
    "#debug-storage": storageView,
    "#debug-error": errorMessage,
  };

  const root = {
    querySelector: vi.fn((selector) => elements[selector] ?? null),
  };

  return {
    root,
    pauseToggleButton,
    showStorageButton,
    storageView,
  };
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
    });

    panel.setStorageDump("keys: 1\n\n[test]\nvalue");
    expect(storageView.hidden).toBe(false);
    expect(storageView.textContent).toContain("keys: 1");

    panel.setStorageDump("");
    expect(storageView.hidden).toBe(true);
    expect(storageView.textContent).toBe("");
  });
});
