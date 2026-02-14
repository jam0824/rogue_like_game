import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTileAssets, resolveWalkableTileDecorationAsset } from "../../src/tiles/tileCatalog.js";

function createDungeonDefinition(overrides = {}) {
  return {
    tipSetRootPath: "graphic/dungeon_tip/dungeon_id_02",
    tipSet: {
      tile: ["tile_01.png"],
      A: ["left_top_01.png"],
      B: ["top_01.png"],
      C: ["right_top.png"],
      D: ["left_01.png"],
      E: ["right_01.png"],
      F: ["left_top_corner.png"],
      G: ["right_top_corner.png"],
      H: ["left_bottom_corner.png"],
      I: ["bottom_01.png"],
      J: ["right_bottom_corner.png"],
      K: ["left_bottom_01.png"],
      L: ["right_bottom_01.png"],
    },
    walkableTileDecoration: [],
    ...overrides,
  };
}

function setupImageMock() {
  const width = 32;
  const height = 32;

  class FakeImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.width = width;
      this.height = height;
      this.naturalWidth = width;
      this.naturalHeight = height;
    }

    set src(value) {
      this._src = value;
      Promise.resolve().then(() => {
        if (typeof this.onload === "function") {
          this.onload();
        }
      });
    }

    get src() {
      return this._src;
    }
  }

  vi.stubGlobal("Image", FakeImage);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("tileCatalog", () => {
  it("loadTileAssets は walkableTileDecoration を読み込む", async () => {
    setupImageMock();
    const definition = createDungeonDefinition({
      walkableTileDecoration: ["decoration_01.png", "decoration_02.png"],
    });

    const assets = await loadTileAssets(definition);
    expect(assets[" "].variants).toHaveLength(1);
    expect(assets.walkableTileDecoration.variants).toHaveLength(2);
    expect(assets.walkableTileDecoration.variants[0].src).toBe(
      "graphic/dungeon_tip/dungeon_id_02/decoration_01.png"
    );
    expect(assets.walkableTileDecoration.variants[1].src).toBe(
      "graphic/dungeon_tip/dungeon_id_02/decoration_02.png"
    );
  });

  it("resolveWalkableTileDecorationAsset は同一 seed と座標で決定的", () => {
    const assets = {
      walkableTileDecoration: {
        variants: [{ id: "decoration_a" }, { id: "decoration_b" }, { id: "decoration_c" }],
      },
    };

    const first = resolveWalkableTileDecorationAsset(assets, "seed-a", 10, 20, 1);
    const second = resolveWalkableTileDecorationAsset(assets, "seed-a", 10, 20, 1);
    expect(first).toBe(second);
  });

  it("resolveWalkableTileDecorationAsset は probability=0 なら常に非表示、1なら表示", () => {
    const assets = {
      walkableTileDecoration: {
        variants: [{ id: "decoration_a" }],
      },
    };

    expect(resolveWalkableTileDecorationAsset(assets, "seed-a", 1, 1, 0)).toBeNull();
    expect(resolveWalkableTileDecorationAsset(assets, "seed-a", 1, 1, 1)).not.toBeNull();
  });

  it("resolveWalkableTileDecorationAsset は 5% 近傍の出現率になる", () => {
    const assets = {
      walkableTileDecoration: {
        variants: [{ id: "decoration_a" }],
      },
    };

    let hitCount = 0;
    const total = 40000;
    for (let index = 0; index < total; index += 1) {
      const tileX = index % 200;
      const tileY = Math.floor(index / 200);
      if (resolveWalkableTileDecorationAsset(assets, "rate-check-seed", tileX, tileY, 0.05)) {
        hitCount += 1;
      }
    }

    const rate = hitCount / total;
    expect(rate).toBeGreaterThanOrEqual(0.04);
    expect(rate).toBeLessThanOrEqual(0.06);
  });
});
