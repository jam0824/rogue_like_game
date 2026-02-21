import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWeaponAssets } from "../../src/weapon/weaponAsset.js";

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

describe("weaponAsset", () => {
  it("weaponFileName が空なら画像読み込みをスキップして null asset を返す", async () => {
    const assets = await loadWeaponAssets([
      {
        id: "weapon_enemy_bite_01",
        weaponFileName: "",
        width: 0,
        height: 0,
      },
    ]);

    expect(assets.weapon_enemy_bite_01).toBeNull();
  });

  it("weaponFileName がある場合は画像を読み込む", async () => {
    installImageMock({
      "weapon_sword_01.png": { width: 32, height: 64 },
    });

    const assets = await loadWeaponAssets([
      {
        id: "weapon_sword_01",
        weaponFileName: "weapon_sword_01.png",
        width: 32,
        height: 64,
      },
    ]);

    expect(assets.weapon_sword_01).toMatchObject({
      frameWidth: 32,
      frameHeight: 64,
      columns: 1,
      rows: 1,
    });
    expect(assets.weapon_sword_01?.image).toBeTruthy();
  });
});
