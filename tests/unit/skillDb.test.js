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
        hit_box_per: 0.5,
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
          hitBoxPer: 0.5,
        },
      },
    });
  });

  it("hit_box_per は省略時/不正値で 1.0 に自動補正される", async () => {
    setupFetchMock({
      fileNames: ["skill_id_aoe_invalid.json", "skill_id_projectile_default.json", "skill_id_projectile_invalid.json"],
      recordsByFileName: {
        "skill_id_projectile_default.json": createSkillRecord({
          id: "skill_id_projectile_default",
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
        }),
        "skill_id_projectile_invalid.json": createSkillRecord({
          id: "skill_id_projectile_invalid",
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
              hit_box_per: 2,
              disappear_hit_wall: true,
            },
          },
        }),
        "skill_id_aoe_invalid.json": createSkillRecord({
          id: "skill_id_aoe_invalid",
          params: {
            attack_kind: "aoe",
            base_damage: 12,
            damage_element: "fire",
            start_spawn_timing: "hit",
            chain_trigger: "on_hit",
            aoe: {
              sprite_effect_id: "effect_id_explosion_01",
              hit_box_per: -0.2,
              hit_interval_sec: 0,
            },
          },
        }),
      },
    });

    const definitions = await loadSkillDefinitions();
    const projectileDefault = definitions.find((definition) => definition.id === "skill_id_projectile_default");
    const projectileInvalid = definitions.find((definition) => definition.id === "skill_id_projectile_invalid");
    const aoeInvalid = definitions.find((definition) => definition.id === "skill_id_aoe_invalid");

    expect(projectileDefault?.params?.projectile?.hitBoxPer).toBe(1);
    expect(projectileInvalid?.params?.projectile?.hitBoxPer).toBe(1);
    expect(aoeInvalid?.params?.aoe?.hitBoxPer).toBe(1);
  });

  it("projectile is_rotate は省略時 true、false 指定時 false に正規化される", async () => {
    setupFetchMock({
      fileNames: ["skill_id_projectile_rotate_default.json", "skill_id_projectile_rotate_false.json"],
      recordsByFileName: {
        "skill_id_projectile_rotate_default.json": createSkillRecord({
          id: "skill_id_projectile_rotate_default",
        }),
        "skill_id_projectile_rotate_false.json": createSkillRecord({
          id: "skill_id_projectile_rotate_false",
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
              is_rotate: false,
              disappear_hit_wall: true,
            },
          },
        }),
      },
    });

    const definitions = await loadSkillDefinitions();
    const rotateDefault = definitions.find((definition) => definition.id === "skill_id_projectile_rotate_default");
    const rotateFalse = definitions.find((definition) => definition.id === "skill_id_projectile_rotate_false");

    expect(rotateDefault?.params?.projectile?.isRotate).toBe(true);
    expect(rotateFalse?.params?.projectile?.isRotate).toBe(false);
  });

  it("charge/summon と aoe拡張を正規化し、ui.icon_file_name:null を許容する", async () => {
    setupFetchMock({
      fileNames: ["skill_charge.json", "skill_press.json", "skill_summon.json"],
      recordsByFileName: {
        "skill_charge.json": createSkillRecord({
          id: "skill_charge",
          ui: {
            icon_file_name: null,
            sort_order: 1,
          },
          params: {
            attack_kind: "charge",
            base_damage: 20,
            damage_element: "physical",
            chain_trigger: "on_hit",
            charge: {
              dash_distance_tiles: 7,
              speed_tile_per_sec: 12,
              direction_lock_timing: "on_windup_start",
              stop_on_player_hit: true,
              wall_hit_recover_sec: 1.2,
              telegraph_style: "line_red_translucent",
              telegraph_width_tiles: 0.8,
            },
          },
        }),
        "skill_press.json": createSkillRecord({
          id: "skill_press",
          ui: {
            icon_file_name: null,
            sort_order: 2,
          },
          params: {
            attack_kind: "aoe",
            base_damage: 25,
            damage_element: "physical",
            aoe: {
              sprite_effect_id: "effect_ogre_hammer_press_01",
              hit_box_per: 0.8,
              hit_interval_sec: 0,
              target_position: "target_locked",
              position_lock_timing: "on_windup_start",
              telegraph_style: "circle_red_translucent",
              telegraph_radius_tiles: 2,
            },
          },
        }),
        "skill_summon.json": createSkillRecord({
          id: "skill_summon",
          ui: {
            icon_file_name: null,
            sort_order: 3,
          },
          params: {
            attack_kind: "summon",
            base_damage: 0,
            summon: {
              enemy_id: "OgreMinion_01",
              count: { min: 2, max: 3 },
              spawn_style: "boss_ring_outside",
              spawn_telegraph_sec: 0.5,
              spawn_telegraph_style: "circle_red_translucent",
              spawn_telegraph_radius_tiles: 0.5,
              max_alive_in_room: 8,
              max_alive_per_summoner: 6,
              vanish_on_summoner_death: true,
              cast_effect_id: "effect_ogre_summon_cast_01",
            },
          },
        }),
      },
    });

    const definitions = await loadSkillDefinitions();
    const charge = definitions.find((definition) => definition.id === "skill_charge");
    const press = definitions.find((definition) => definition.id === "skill_press");
    const summon = definitions.find((definition) => definition.id === "skill_summon");

    expect(charge?.ui.iconFileName).toBeNull();
    expect(charge?.params?.attackKind).toBe("charge");
    expect(charge?.params?.charge?.telegraphStyle).toBe("line_red_translucent");
    expect(press?.params?.aoe?.targetPosition).toBe("target_locked");
    expect(press?.params?.aoe?.positionLockTiming).toBe("on_windup_start");
    expect(summon?.params?.attackKind).toBe("summon");
    expect(summon?.params?.summon?.count).toEqual({ min: 2, max: 3 });
    expect(summon?.params?.summon?.spawnStyle).toBe("boss_ring_outside");
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
