import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDefaultPlayerDefinition } from "../../src/player/playerDb.js";

function createPlayerRecord(overrides = {}) {
  return {
    id: "player_01",
    name_key: "name_player_01",
    description_key: "description_player_01",
    width: 24,
    height: 24,
    fps: 10,
    player_png_facing_direction: "facing left",
    walk_png_file_path: "graphic/player/player_chip/player_01_walk.png",
    idle_png_file_path: "graphic/player/player_chip/player_01_idle.png",
    death_png_file_path: "graphic/player/player_chip/player_01_death.png",
    ...overrides,
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

function setupFetchMock(record) {
  const fetchMock = vi.fn(async (input) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.includes("/db/player_db/player_01.json")) {
      return createJsonResponse(record);
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

describe("playerDb", () => {
  it("loadDefaultPlayerDefinition は player_01.json を正規化して返す", async () => {
    setupFetchMock(createPlayerRecord({ player_png_facing_direction: "Facing Left" }));

    const definition = await loadDefaultPlayerDefinition();

    expect(definition).toEqual({
      id: "player_01",
      nameKey: "name_player_01",
      descriptionKey: "description_player_01",
      width: 24,
      height: 24,
      fps: 10,
      playerPngFacingDirection: "left",
      walkPngFilePath: "graphic/player/player_chip/player_01_walk.png",
      idlePngFilePath: "graphic/player/player_chip/player_01_idle.png",
      deathPngFilePath: "graphic/player/player_chip/player_01_death.png",
    });
  });

  it("player_png_facing_direction が不正ならエラーになる", async () => {
    setupFetchMock(createPlayerRecord({ player_png_facing_direction: "upward" }));

    await expect(loadDefaultPlayerDefinition()).rejects.toThrow("invalid player_png_facing_direction");
  });

  it("必須キー欠落はエラーになる", async () => {
    const record = createPlayerRecord();
    delete record.walk_png_file_path;
    setupFetchMock(record);

    await expect(loadDefaultPlayerDefinition()).rejects.toThrow("missing required key: walk_png_file_path");
  });
});
