import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWeaponDefinitions } from "../../src/weapon/weaponDb.js";

function createWeaponRecord(overrides = {}) {
  return {
    id: "weapon_sword_01",
    name_key: "name_weapon_sword_01",
    description_key: "description_weapon_sword_01",
    weapon_file_name: "weapon_sword_01.png",
    width: 32,
    height: 64,
    se_key_start_attack: "se_key_start_sword_01",
    se_key_hit_attack: "se_key_hit_sword_01",
    effect_id_start_attack: "effect_id_start_sword_01",
    effect_id_hit_attack: "effect_id_hit_sword_01",
    rarity: "rare",
    weapon_plus: 0,
    base_damage: 12,
    attack_cooldown_sec: 2,
    hit_num: 1,
    pierce_count: 10,
    chip_slot_count: 3,
    formation_id: "formation_id_circle01",
    skills: [
      { id: "skill_id_fire01", plus: 0 },
      { id: "skill_id_poison01", plus: 3 },
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

    if (url.includes("/db/weapon_db/") && !url.includes(".json")) {
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

describe("weaponDb", () => {
  it("loadWeaponDefinitions が JSON id を WeaponDef.id に採用する", async () => {
    setupFetchMock({
      fileNames: ["weapon_sword_01.json"],
      recordsByFileName: {
        "weapon_sword_01.json": createWeaponRecord({ id: "weapon_sword_01" }),
      },
    });

    const definitions = await loadWeaponDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0].id).toBe("weapon_sword_01");
    expect(definitions[0].seKeyStartAttack).toBe("se_key_start_sword_01");
    expect(definitions[0].seKeyHitAttack).toBe("se_key_hit_sword_01");
    expect(definitions[0].effectIdStartAttack).toBe("effect_id_start_sword_01");
    expect(definitions[0].effectIdHitAttack).toBe("effect_id_hit_sword_01");
  });

  it("ファイル名とJSON idが不一致なら警告しつつ JSON id を使う", async () => {
    setupFetchMock({
      fileNames: ["weapon_sword_01.json"],
      recordsByFileName: {
        "weapon_sword_01.json": createWeaponRecord({ id: "weapon_blade_custom_01" }),
      },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const definitions = await loadWeaponDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0].id).toBe("weapon_blade_custom_01");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("id mismatch"));
  });

  it("JSON id 欠損はエラーになる", async () => {
    const missingIdRecord = createWeaponRecord();
    delete missingIdRecord.id;

    setupFetchMock({
      fileNames: ["weapon_sword_01.json"],
      recordsByFileName: {
        "weapon_sword_01.json": missingIdRecord,
      },
    });

    await expect(loadWeaponDefinitions()).rejects.toThrow("missing required key: id");
  });

  it("JSON id 重複はエラーになる", async () => {
    setupFetchMock({
      fileNames: ["weapon_alpha_01.json", "weapon_beta_01.json"],
      recordsByFileName: {
        "weapon_alpha_01.json": createWeaponRecord({ id: "weapon_dup_01" }),
        "weapon_beta_01.json": createWeaponRecord({
          id: "weapon_dup_01",
          name_key: "name_weapon_beta_01",
          description_key: "description_weapon_beta_01",
          weapon_file_name: "weapon_beta_01.png",
        }),
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(loadWeaponDefinitions()).rejects.toThrow("duplicate id: weapon_dup_01");
  });

  it("se_key_* が空なら sound_key_* をフォールバック採用する", async () => {
    setupFetchMock({
      fileNames: ["weapon_sword_01.json"],
      recordsByFileName: {
        "weapon_sword_01.json": createWeaponRecord({
          se_key_start_attack: "",
          se_key_hit_attack: "",
          sound_key_start_attack: "se_key_start_legacy",
          sound_key_hit_attack: "se_key_hit_legacy",
        }),
      },
    });

    const definitions = await loadWeaponDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0].seKeyStartAttack).toBe("se_key_start_legacy");
    expect(definitions[0].seKeyHitAttack).toBe("se_key_hit_legacy");
  });
});
