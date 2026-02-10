import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnemyWeaponLoadouts } from "../../src/enemy/enemyWeaponLoadoutDb.js";

function createLoadoutRecord(overrides = {}) {
  return {
    id: "enemy_loadout_rabbit_claw01",
    attack_linked: true,
    weapons: [
      {
        weapon_def_id: "weapon_sword_01",
        rarity: "common",
        weapon_plus: 0,
        formation_id: "formation_id_circle01",
        skills: [{ id: "skill_id_fire01", plus: 0 }],
      },
    ],
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

    if (url.includes("/db/enemy_weapon_loadout_db/") && !url.includes(".json")) {
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

describe("enemyWeaponLoadoutDb", () => {
  it("loadEnemyWeaponLoadouts が正規化済みロードアウトを返す", async () => {
    setupFetchMock({
      fileNames: ["enemy_loadout_rabbit_claw01.json"],
      recordsByFileName: {
        "enemy_loadout_rabbit_claw01.json": createLoadoutRecord(),
      },
    });

    const loadouts = await loadEnemyWeaponLoadouts();

    expect(loadouts).toHaveLength(1);
    expect(loadouts[0]).toMatchObject({
      id: "enemy_loadout_rabbit_claw01",
      attackLinked: true,
      weapons: [
        {
          weaponDefId: "weapon_sword_01",
          formationId: "formation_id_circle01",
        },
      ],
    });
  });

  it("必須キー欠損はエラー", async () => {
    const invalid = createLoadoutRecord();
    delete invalid.weapons;

    setupFetchMock({
      fileNames: ["enemy_loadout_rabbit_claw01.json"],
      recordsByFileName: {
        "enemy_loadout_rabbit_claw01.json": invalid,
      },
    });

    await expect(loadEnemyWeaponLoadouts()).rejects.toThrow("missing required key: weapons");
  });

  it("id 重複はエラー", async () => {
    setupFetchMock({
      fileNames: ["enemy_loadout_a.json", "enemy_loadout_b.json"],
      recordsByFileName: {
        "enemy_loadout_a.json": createLoadoutRecord({ id: "dup" }),
        "enemy_loadout_b.json": createLoadoutRecord({ id: "dup", attack_linked: false }),
      },
    });

    await expect(loadEnemyWeaponLoadouts()).rejects.toThrow("duplicate id: dup");
  });
});
