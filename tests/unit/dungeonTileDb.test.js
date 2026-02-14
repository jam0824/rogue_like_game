import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDungeonDefinitions } from "../../src/tiles/dungeonTileDb.js";

function createDungeonRecord(overrides = {}) {
  return {
    id: "dungeon_id_01",
    name_key: "name_dungeon_01",
    description_key: "description_dungeon_01",
    tip_set_root_path: "graphic/dungeon_tip/dungeon_id_01",
    bgm: "sounds/bgm/KIRI.mp3",
    wall_height: 5,
    tip_set: {
      tile: ["tile_normal.png"],
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

    if (url.includes("/db/dungeon_db/") && !url.includes(".json")) {
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
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dungeonTileDb", () => {
  it("loadDungeonDefinitions が正規化済み定義を返す", async () => {
    setupFetchMock({
      fileNames: ["dungeon_id_01.json"],
      recordsByFileName: {
        "dungeon_id_01.json": createDungeonRecord(),
      },
    });

    const definitions = await loadDungeonDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      id: "dungeon_id_01",
      nameKey: "name_dungeon_01",
      descriptionKey: "description_dungeon_01",
      tipSetRootPath: "graphic/dungeon_tip/dungeon_id_01",
      bgmPath: "sounds/bgm/KIRI.mp3",
      wallHeightTiles: 5,
    });
    expect(definitions[0].tipSet.tile).toEqual(["tile_normal.png"]);
    expect(definitions[0].tipSet.B).toEqual(["top_01.png"]);
  });

  it("tip_set の必須キー欠損はエラー", async () => {
    const invalidRecord = createDungeonRecord();
    delete invalidRecord.tip_set.K;

    setupFetchMock({
      fileNames: ["dungeon_id_01.json"],
      recordsByFileName: {
        "dungeon_id_01.json": invalidRecord,
      },
    });

    await expect(loadDungeonDefinitions()).rejects.toThrow("invalid tip_set.K");
  });

  it("wall_height が不正値ならエラー", async () => {
    setupFetchMock({
      fileNames: ["dungeon_id_01.json"],
      recordsByFileName: {
        "dungeon_id_01.json": createDungeonRecord({ wall_height: 0 }),
      },
    });

    await expect(loadDungeonDefinitions()).rejects.toThrow("invalid wall_height");
  });

  it("bgm 欠損はエラー", async () => {
    const invalidRecord = createDungeonRecord();
    delete invalidRecord.bgm;

    setupFetchMock({
      fileNames: ["dungeon_id_01.json"],
      recordsByFileName: {
        "dungeon_id_01.json": invalidRecord,
      },
    });

    await expect(loadDungeonDefinitions()).rejects.toThrow("missing required key: bgm");
  });

  it("bgm が空文字ならエラー", async () => {
    setupFetchMock({
      fileNames: ["dungeon_id_01.json"],
      recordsByFileName: {
        "dungeon_id_01.json": createDungeonRecord({ bgm: "   " }),
      },
    });

    await expect(loadDungeonDefinitions()).rejects.toThrow("invalid bgm");
  });

  it("id 重複はエラー", async () => {
    setupFetchMock({
      fileNames: ["dungeon_alpha.json", "dungeon_beta.json"],
      recordsByFileName: {
        "dungeon_alpha.json": createDungeonRecord({ id: "dungeon_dup_id" }),
        "dungeon_beta.json": createDungeonRecord({
          id: "dungeon_dup_id",
          name_key: "name_dungeon_02",
          description_key: "description_dungeon_02",
          tip_set_root_path: "graphic/dungeon_tip/dungeon_id_02",
        }),
      },
    });

    await expect(loadDungeonDefinitions()).rejects.toThrow("duplicate id: dungeon_dup_id");
  });
});
