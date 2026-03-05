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
    preferred_range_tiles: 1.2,
    engage_range_tiles: 1.0,
    retreat_range_tiles: 0.5,
    weapon_attack_cycles: 1,
    weapon_active_range_tiles: 2,
    weapon_cooldown_mul: 1,
    los_required: true,
    ...overrides,
  };
}

function createBossAiProfileRecord(overrides = {}) {
  return {
    id: "ai_profile_boss_ogre_v1",
    role: "boss",
    weapon_aim_mode: "to_target",
    weapon_visibility_mode: "burst",
    weapon_attack_cycles: 1,
    weapon_active_range_tiles: 4,
    weapon_cooldown_mul: 1,
    los_required: true,
    phases: [
      { phase: 1, hp_ratio_min: 0.6, hp_ratio_max: 1.01, summon_count: { min: 2, max: 2 } },
      { phase: 2, hp_ratio_min: 0.0, hp_ratio_max: 0.6, summon_count: { min: 3, max: 4 } },
    ],
    action_priority: [
      { action: "summon", when: "minion_count_lt && cooldown_ready" },
      { action: "chase", when: "always" },
    ],
    actions: {
      summon: {
        weapon_index: 2,
        cooldown_sec: 9,
        minion_count_lt: 3,
        windup_sec: 1,
        recover_sec: 0.5,
      },
      chase: {
        repath_interval_sec: 0.4,
      },
    },
    summon_rules: {
      max_alive_in_room: 8,
      max_alive_per_summoner: 6,
      vanish_on_summoner_death: true,
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
      preferredRangeTiles: 1.2,
      engageRangeTiles: 1.0,
      retreatRangeTiles: 0.5,
      weaponActiveRangeTiles: 2,
      losRequired: true,
    });
  });

  it("レンジ系パラメータが負値ならエラー", async () => {
    setupFetchMock({
      fileNames: ["ai_profile_chaser_v1.json"],
      recordsByFileName: {
        "ai_profile_chaser_v1.json": createAiProfileRecord({
          engage_range_tiles: -1,
        }),
      },
    });

    await expect(loadEnemyAiProfiles()).rejects.toThrow("invalid engage_range_tiles");
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

  it("boss スキーマを正規化する", async () => {
    setupFetchMock({
      fileNames: ["ai_profile_boss_ogre_v1.json"],
      recordsByFileName: {
        "ai_profile_boss_ogre_v1.json": createBossAiProfileRecord(),
      },
    });

    const profiles = await loadEnemyAiProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].role).toBe("boss");
    expect(profiles[0].phases[0]).toMatchObject({
      phase: 1,
      hpRatioMin: 0.6,
      hpRatioMax: 1.01,
      summonCount: { min: 2, max: 2 },
    });
    expect(profiles[0].actionPriority[0]).toEqual({
      action: "summon",
      when: "minion_count_lt && cooldown_ready",
    });
    expect(profiles[0].summonRules).toEqual({
      maxAliveInRoom: 8,
      maxAlivePerSummoner: 6,
      vanishOnSummonerDeath: true,
    });
  });

  it("boss の when 条件式に不正トークンがある場合はエラー", async () => {
    setupFetchMock({
      fileNames: ["ai_profile_boss_ogre_v1.json"],
      recordsByFileName: {
        "ai_profile_boss_ogre_v1.json": createBossAiProfileRecord({
          action_priority: [{ action: "summon", when: "invalid_token && cooldown_ready" }],
        }),
      },
    });

    await expect(loadEnemyAiProfiles()).rejects.toThrow("invalid when token");
  });

  it("boss の必須フィールド欠損はエラー", async () => {
    const invalidBoss = createBossAiProfileRecord();
    delete invalidBoss.phases;
    setupFetchMock({
      fileNames: ["ai_profile_boss_ogre_v1.json"],
      recordsByFileName: {
        "ai_profile_boss_ogre_v1.json": invalidBoss,
      },
    });

    await expect(loadEnemyAiProfiles()).rejects.toThrow("missing required key: phases");
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
