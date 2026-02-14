import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSoundEffectMap, normalizeSoundEffectMap } from "../../src/audio/soundDb.js";

function createJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
  };
}

function createErrorResponse(status = 404) {
  return {
    ok: false,
    status,
    async json() {
      return {};
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("soundDb", () => {
  it("normalizeSoundEffectMap はトップレベルと weapon/skill を1つの map に正規化する", () => {
    const normalized = normalizeSoundEffectMap({
      se_key_open_chest: " sounds/se/open.wav ",
      weapon: {
        se_key_hit_sword_01: "sounds/se/sword.mp3",
      },
      skill: {
        se_key_small_heal: "sounds/se/heal.mp3",
      },
      not_used: 123,
    });

    expect(normalized).toEqual({
      se_key_open_chest: "sounds/se/open.wav",
      se_key_hit_sword_01: "sounds/se/sword.mp3",
      se_key_small_heal: "sounds/se/heal.mp3",
    });
  });

  it("loadSoundEffectMap は sound DB を読み込み正規化結果を返す", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        se_key_get_item: "sounds/se/get.mp3",
        weapon: {
          se_key_hit_sword_01: "sounds/se/hit.mp3",
        },
        skill: {
          se_key_small_heal: "sounds/se/heal.mp3",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const soundMap = await loadSoundEffectMap();

    expect(soundMap).toEqual({
      se_key_get_item: "sounds/se/get.mp3",
      se_key_hit_sword_01: "sounds/se/hit.mp3",
      se_key_small_heal: "sounds/se/heal.mp3",
    });
    const firstRequestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(firstRequestedUrl).toContain("/db/sound_db/sound_db.json");
  });

  it("先頭候補が404でも旧パスへフォールバックして読み込める", async () => {
    const fetchMock = vi.fn(async (url) => {
      const rawUrl = String(url ?? "");
      if (rawUrl.includes("/db/sound_db/sound_db.json")) {
        return createErrorResponse(404);
      }
      return createJsonResponse({
        se_key_open_chest: "sounds/se/open.wav",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const soundMap = await loadSoundEffectMap();

    expect(soundMap).toEqual({
      se_key_open_chest: "sounds/se/open.wav",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
