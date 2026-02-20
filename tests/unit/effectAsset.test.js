import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEffectAssets } from "../../src/effect/effectAsset.js";

function createEffectDefinition(overrides = {}) {
  return {
    id: "effect_test_01",
    effectFileName: "graphic/effect/effect_test_01.png",
    width: 120,
    height: 120,
    animationDirection: "horizontal",
    ...overrides,
  };
}

function installImageMock(sizeByToken) {
  class MockImage {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.onload = null;
      this.onerror = null;
      this._src = "";
    }

    set src(value) {
      this._src = String(value);
      const entry = Object.entries(sizeByToken).find(([token]) => this._src.includes(token));

      queueMicrotask(() => {
        if (!entry) {
          if (typeof this.onerror === "function") {
            this.onerror(new Error(`missing mock image for ${this._src}`));
          }
          return;
        }

        const [, size] = entry;
        this.width = size.width;
        this.height = size.height;
        if (typeof this.onload === "function") {
          this.onload();
        }
      });
    }

    get src() {
      return this._src;
    }
  }

  vi.stubGlobal("Image", MockImage);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("effectAsset", () => {
  it("horizontal 1段は width/frameWidth で frameCount を算出する", async () => {
    installImageMock({
      "effect_test_01.png": { width: 1080, height: 120 },
    });

    const assets = await loadEffectAssets([createEffectDefinition()]);
    expect(assets.effect_test_01.frameCount).toBe(9);
    expect(assets.effect_test_01.frameColumns).toBe(9);
    expect(assets.effect_test_01.frameRows).toBe(1);
  });

  it("horizontal 多段は行優先で frameCount を算出する", async () => {
    installImageMock({
      "effect_test_multi.png": { width: 600, height: 240 },
    });

    const assets = await loadEffectAssets([
      createEffectDefinition({
        id: "effect_test_multi",
        effectFileName: "graphic/effect/effect_test_multi.png",
      }),
    ]);

    expect(assets.effect_test_multi.frameCount).toBe(10);
    expect(assets.effect_test_multi.frameColumns).toBe(5);
    expect(assets.effect_test_multi.frameRows).toBe(2);
  });

  it("horizontal で割り切れない画像は端数切り捨て + warn で継続する", async () => {
    installImageMock({
      "effect_test_trim.png": { width: 610, height: 250 },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const assets = await loadEffectAssets([
      createEffectDefinition({
        id: "effect_test_trim",
        effectFileName: "graphic/effect/effect_test_trim.png",
      }),
    ]);

    expect(assets.effect_test_trim.frameCount).toBe(10);
    expect(assets.effect_test_trim.frameColumns).toBe(5);
    expect(assets.effect_test_trim.frameRows).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("sheet truncated");
  });

  it("vertical は高さ基準で frameCount を算出する", async () => {
    installImageMock({
      "effect_test_vertical.png": { width: 240, height: 360 },
    });

    const assets = await loadEffectAssets([
      createEffectDefinition({
        id: "effect_test_vertical",
        effectFileName: "graphic/effect/effect_test_vertical.png",
        animationDirection: "vertical",
      }),
    ]);

    expect(assets.effect_test_vertical.frameCount).toBe(3);
    expect(assets.effect_test_vertical.frameColumns).toBe(2);
    expect(assets.effect_test_vertical.frameRows).toBe(3);
  });
});
