import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnemyAiProfiles } from "../../src/enemy/enemyAiProfileDb.js";

function createAiProfileRecord(overrides = {}) {
  return {
    id: "ai_profile_chaser_v1",
    role: "chaser",
    attack_windup_sec: 0.25,
    recover_sec: 0.35,
    weapon_aim_mode: "to_target",
    weapon_visibility_mode: "burst",
    weapon_attack_cycles: 1,
    weapon_active_range_tiles: 2,
    weapon_cooldown_mul: 1,
    los_required: true,
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

    if (url.includes("/db/enemy_ai_profile_db/") && !url.includes(".json")) {
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

describe("enemyAiProfileDb", () => {
  it("loadEnemyAiProfiles が正規化済みプロファイルを返す", async () => {
    setupFetchMock({
      fileNames: ["ai_profile_chaser_v1.json"],
      recordsByFileName: {
        "ai_profile_chaser_v1.json": createAiProfileRecord(),
      },
    });

    const profiles = await loadEnemyAiProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      id: "ai_profile_chaser_v1",
      attackWindupSec: 0.25,
      recoverSec: 0.35,
      weaponAimMode: "to_target",
      weaponVisibilityMode: "burst",
      weaponActiveRangeTiles: 2,
      losRequired: true,
    });
  });

  it("必須キー欠損はエラー", async () => {
    const invalid = createAiProfileRecord();
    delete invalid.id;

    setupFetchMock({
      fileNames: ["ai_profile_chaser_v1.json"],
      recordsByFileName: {
        "ai_profile_chaser_v1.json": invalid,
      },
    });

    await expect(loadEnemyAiProfiles()).rejects.toThrow("missing required key: id");
  });

  it("id 重複はエラー", async () => {
    setupFetchMock({
      fileNames: ["ai_profile_a.json", "ai_profile_b.json"],
      recordsByFileName: {
        "ai_profile_a.json": createAiProfileRecord({ id: "dup" }),
        "ai_profile_b.json": createAiProfileRecord({ id: "dup", role: "shooter" }),
      },
    });

    await expect(loadEnemyAiProfiles()).rejects.toThrow("duplicate id: dup");
  });
});
