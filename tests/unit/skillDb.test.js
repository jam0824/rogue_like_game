import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSkillDefinitions } from "../../src/skill/skillDb.js";

function createSkillRecord(overrides = {}) {
  return {
    id: "skill_id_projectile_01",
    name_key: "name_skill_projectile_01",
    description_key: "desc_skill_projectile_01",
    skill_type: "attack",
    rarity: "common",
    max_plus: 99,
    unique_per_weapon: false,
    tags: ["skill_type:attack", "attack:projectile", "element:physical"],
    ui: {
      icon_file_name: "skill_projectile_01.png",
      sort_order: 120,
    },
    params: {
      attack_kind: "projectile",
      base_damage: 10,
      damage_element: "physical",
      start_spawn_timing: "start",
      chain_trigger: "on_hit",
      projectile: {
        speed_tile_per_sec: 10,
        life_sec: 1.2,
        move_direction: "to_target",
        sprite_effect_id: "effect_id_proj_basic_01",
        disappear_hit_wall: true,
      },
    },
    se_key_fire: "",
    se_key_hit: "",
    effect_id_fire: "",
    effect_id_hit: "",
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

    if (url.includes("/db/skill_db/") && !url.includes(".json")) {
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

describe("skillDb", () => {
  it("loadSkillDefinitions が Attack/Modifier を正規化して返す", async () => {
    setupFetchMock({
      fileNames: ["skill_id_projectile_01.json", "skill_id_poison_01.json"],
      recordsByFileName: {
        "skill_id_projectile_01.json": createSkillRecord(),
        "skill_id_poison_01.json": {
          id: "skill_id_poison_01",
          name_key: "name_skill_poison_01",
          description_key: "desc_skill_poison_01",
          skill_type: "modifier",
          rarity: "common",
          max_plus: 99,
          unique_per_weapon: false,
          tags: ["skill_type:modifier", "element:poison", "ailment:poison"],
          ui: {
            icon_file_name: "skill_poison_01.png",
            sort_order: 200,
          },
          params: {
            add_tags: ["element:poison", "ailment:poison"],
            apply_ailments: [{ ailment_id: "poison", apply_base: 0.6 }],
            add_attack_damage_pct: 0.2,
          },
        },
      },
    });

    const definitions = await loadSkillDefinitions();

    expect(definitions).toHaveLength(2);
    expect(definitions[0]).toMatchObject({
      id: "skill_id_poison_01",
      skillType: "modifier",
      params: {
        applyAilments: [{ ailmentId: "poison", applyBase: 0.6 }],
        addAttackDamagePct: 0.2,
      },
    });
    expect(definitions[1]).toMatchObject({
      id: "skill_id_projectile_01",
      skillType: "attack",
      params: {
        attackKind: "projectile",
        baseDamage: 10,
        projectile: {
          spriteEffectId: "effect_id_proj_basic_01",
        },
      },
    });
  });

  it("required key 欠落はエラーになる", async () => {
    const invalid = createSkillRecord();
    delete invalid.id;

    setupFetchMock({
      fileNames: ["skill_id_projectile_01.json"],
      recordsByFileName: {
        "skill_id_projectile_01.json": invalid,
      },
    });

    await expect(loadSkillDefinitions()).rejects.toThrow("missing required key: id");
  });

  it("id 重複はエラーになる", async () => {
    setupFetchMock({
      fileNames: ["skill_alpha.json", "skill_beta.json"],
      recordsByFileName: {
        "skill_alpha.json": createSkillRecord({ id: "skill_id_dup_01" }),
        "skill_beta.json": createSkillRecord({ id: "skill_id_dup_01" }),
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(loadSkillDefinitions()).rejects.toThrow("duplicate id: skill_id_dup_01");
  });
});
