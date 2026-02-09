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
  const statsList = createEventTarget({ innerHTML: "" });
  const errorMessage = createEventTarget({ textContent: "", hidden: true });

  const elements = {
    "#seed-input": seedInput,
    "#apply-seed": applySeedButton,
    "#regen-random": regenerateButton,
    "#pause-toggle": pauseToggleButton,
    "#debug-stats": statsList,
    "#debug-error": errorMessage,
  };

  const root = {
    querySelector: vi.fn((selector) => elements[selector] ?? null),
  };

  return {
    root,
    pauseToggleButton,
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
    });

    panel.setPaused(true);
    expect(pauseToggleButton.textContent).toBe("再開");
    expect(pauseToggleButton.getAttribute("aria-pressed")).toBe("true");

    panel.setPaused(false);
    expect(pauseToggleButton.textContent).toBe("一時停止");
    expect(pauseToggleButton.getAttribute("aria-pressed")).toBe("false");
  });
});
