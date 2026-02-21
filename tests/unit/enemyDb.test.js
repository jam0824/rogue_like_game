import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnemyDefinitions, loadWalkEnemyDefinitions } from "../../src/enemy/enemyDb.js";

function createEnemyRecord(overrides = {}) {
  return {
    name_key: "name_enemy_01",
    description_key: "description_enemy_01",
    type: "walk",
    walk_png_file_path: "graphic/enemy/test/walk.png",
    idle_png_file_path: "graphic/enemy/test/idle.png",
    death_png_file_path: "graphic/enemy/test/death.png",
    width: 32,
    height: 32,
    fps: 12,
    png_facing_direction: "right",
    image_magnification: 1.5,
    notice_distance: 8,
    giveup_distance: 16,
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

function setupFetchMock({ directoryHtml, fileNames = [], recordsByFileName = {} }) {
  const listing = createDirectoryListing(fileNames);
  const fetchMock = vi.fn(async (input) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");

    if (url.includes("/db/enemy_db/") && !url.includes(".json")) {
      return createHtmlResponse(directoryHtml ?? listing);
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

describe("enemyDb", () => {
  it("directory listing 失敗時のフォールバックに Bee_01 と BrownMushroom_01 を使う", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setupFetchMock({
      directoryHtml: "<html><body><h1>enemy_db</h1></body></html>",
      recordsByFileName: {
        "Bee_01.json": createEnemyRecord({
          name_key: "name_Bee_01",
          type: "fly",
        }),
        "BrownMushroom_01.json": createEnemyRecord({
          name_key: "name_BrownMushroom_01",
          type: "walk",
        }),
      },
    });

    const definitions = await loadEnemyDefinitions();

    expect(warnSpy).toHaveBeenCalled();
    expect(definitions.map((definition) => definition.id)).toEqual(["Bee_01", "BrownMushroom_01"]);
    expect(definitions.find((definition) => definition.id === "Bee_01")?.type).toBe("fly");
  });

  it("loadWalkEnemyDefinitions はフォールバック時も walk のみ返す", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setupFetchMock({
      directoryHtml: "<html><body><h1>enemy_db</h1></body></html>",
      recordsByFileName: {
        "Bee_01.json": createEnemyRecord({
          name_key: "name_Bee_01",
          type: "fly",
        }),
        "BrownMushroom_01.json": createEnemyRecord({
          name_key: "name_BrownMushroom_01",
          type: "walk",
        }),
      },
    });

    const walkDefinitions = await loadWalkEnemyDefinitions();

    expect(walkDefinitions).toHaveLength(1);
    expect(walkDefinitions[0].id).toBe("BrownMushroom_01");
    expect(walkDefinitions[0].type).toBe("walk");
  });

  it("必須キー検証を維持する", async () => {
    setupFetchMock({
      fileNames: ["invalid_enemy.json"],
      recordsByFileName: {
        "invalid_enemy.json": createEnemyRecord({
          notice_distance: undefined,
        }),
      },
    });

    await expect(loadEnemyDefinitions()).rejects.toThrow("invalid notice_distance");
  });
});
