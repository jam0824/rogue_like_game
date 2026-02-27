import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultInputBindings,
  loadInputBindings,
  normalizeInputBindings,
} from "../../src/input/inputConfigDb.js";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("inputConfigDb", () => {
  it("normalizeInputBindings は欠落/不正値を既定値へフォールバックする", () => {
    const normalized = normalizeInputBindings({
      keyboard: {
        move_up: ["KeyZ", "", 1, "KeyZ"],
      },
      gamepad: {
        move_axis: {
          x: 2,
          y: 3,
          deadzone: 1.4,
        },
        pause: [9, 9, "bad", -1],
      },
    });

    expect(normalized.version).toBe("input_bindings_v1");
    expect(normalized.keyboard.move_up).toEqual(["KeyZ"]);
    expect(normalized.keyboard.pause).toEqual(["Escape"]);
    expect(normalized.gamepad.move_axis).toEqual({ x: 2, y: 3, deadzone: 0.95 });
    expect(normalized.gamepad.pause).toEqual([9]);
    expect(normalized.gamepad.inventory_toggle).toEqual([3]);
  });

  it("loadInputBindings はJSONを読み込み正規化する", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        keyboard: {
          interact: ["KeyF"],
          quickslot_1: ["Digit9", "Digit9"],
        },
        gamepad: {
          interact: [2],
          move_axis: {
            x: 4,
            y: 5,
            deadzone: 0.4,
          },
        },
      }),
    }));

    const bindings = await loadInputBindings();
    expect(bindings.keyboard.interact).toEqual(["KeyF"]);
    expect(bindings.keyboard.quickslot_1).toEqual(["Digit9"]);
    expect(bindings.gamepad.interact).toEqual([2]);
    expect(bindings.gamepad.move_axis).toEqual({ x: 4, y: 5, deadzone: 0.4 });
  });

  it("loadInputBindings は取得失敗時に既定値を返す", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network");
    });

    const bindings = await loadInputBindings();
    const defaults = getDefaultInputBindings();
    expect(bindings).toEqual(defaults);
  });
});
