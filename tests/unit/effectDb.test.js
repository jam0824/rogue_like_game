import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEffectDefinitions } from "../../src/effect/effectDb.js";

function createEffectRecord(overrides = {}) {
  return {
    id: "effect_id_sword_slash_01",
    effect_file_name: "graphic/effect/effect_sword_slash_01.png",
    width: 120,
    height: 120,
    animation_fps: 30,
    animation_direction: "horizontal",
    scale: 1,
    blend_mode: "normal",
    loop: false,
    ...overrides,
  };
}

function createHtmlResponse(html) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "text/html" : null;
      },
    },
    async text() {
      return html;
    },
    async json() {
      throw new Error("JSON not expected for HTML response");
    },
  };
}

function createJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    async text() {
      return JSON.stringify(payload);
    },
    async json() {
      return payload;
    },
  };
}

function createDirectoryListing(fileNames) {
  return fileNames.map((fileName) => `<a href="${fileName}">${fileName}</a>`).join("\n");
}

function setupFetchMock({ fileNames, recordsByFileName }) {
  const listing = createDirectoryListing(fileNames);
  const fetchMock = vi.fn(async (input) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");

    if (url.includes("/db/effect_db/") && !url.includes(".json")) {
      return createHtmlResponse(listing);
    }

    const fileNameMatch = url.match(/\/([^/?#]+\.json)(?:[?#]|$)/);
    const fileName = fileNameMatch?.[1];
    if (fileName && recordsByFileName[fileName]) {
      return createJsonResponse(recordsByFileName[fileName]);
    }

    return {
      ok: false,
      status: 404,
      headers: { get: () => "application/json" },
      async text() {
        return "";
      },
      async json() {
        return {};
      },
    };
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("effectDb", () => {
  it("loadEffectDefinitions が EffectDef を正規化して返す", async () => {
    setupFetchMock({
      fileNames: ["effect_id_sword_slash_01.json"],
      recordsByFileName: {
        "effect_id_sword_slash_01.json": createEffectRecord({
          scale: 1.5,
          blend_mode: "add",
          loop: true,
        }),
      },
    });

    const definitions = await loadEffectDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toEqual({
      id: "effect_id_sword_slash_01",
      effectFileName: "graphic/effect/effect_sword_slash_01.png",
      width: 120,
      height: 120,
      animationFps: 30,
      animationDirection: "horizontal",
      scale: 1.5,
      blendMode: "add",
      loop: true,
    });
  });

  it("animation_direction が不正ならエラーになる", async () => {
    setupFetchMock({
      fileNames: ["effect_id_sword_slash_01.json"],
      recordsByFileName: {
        "effect_id_sword_slash_01.json": createEffectRecord({ animation_direction: "diagonal" }),
      },
    });

    await expect(loadEffectDefinitions()).rejects.toThrow("invalid animation_direction");
  });

  it("blend_mode が不正ならエラーになる", async () => {
    setupFetchMock({
      fileNames: ["effect_id_sword_slash_01.json"],
      recordsByFileName: {
        "effect_id_sword_slash_01.json": createEffectRecord({ blend_mode: "screen" }),
      },
    });

    await expect(loadEffectDefinitions()).rejects.toThrow("invalid blend_mode");
  });

  it("id 重複はエラーになる", async () => {
    setupFetchMock({
      fileNames: ["effect_a.json", "effect_b.json"],
      recordsByFileName: {
        "effect_a.json": createEffectRecord({ id: "effect_dup_01" }),
        "effect_b.json": createEffectRecord({ id: "effect_dup_01" }),
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(loadEffectDefinitions()).rejects.toThrow("duplicate id: effect_dup_01");
  });
});
