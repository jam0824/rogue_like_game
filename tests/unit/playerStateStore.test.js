import { describe, expect, it } from "vitest";
import {
  applySavedWeaponRuntime,
  buildWeaponDefinitionsFromPlayerState,
  createDefaultPlayerState,
  loadPlayerStateFromStorage,
  PLAYER_STATE_SCHEMA_VERSION,
  PLAYER_STATE_STORAGE_KEY,
  savePlayerStateToStorage,
  syncPlayerStateFromRuntime,
} from "../../src/player/playerStateStore.js";

function createStarterWeaponRaw() {
  return {
    name_key: "name_wepon_sword_01",
    description_key: "description_wepon_sword_01",
    weapon_file_name: "wepon_sword_01.png",
    width: 32,
    height: 64,
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
  };
}

function createMemoryStorage(initial = {}) {
  const bucket = { ...initial };
  return {
    getItem(key) {
      return key in bucket ? bucket[key] : null;
    },
    setItem(key, value) {
      bucket[key] = String(value);
    },
    dump() {
      return { ...bucket };
    },
  };
}

describe("playerStateStore", () => {
  it("createDefaultPlayerState が spec 形を作り、初期武器をコピーする", () => {
    const starter = createStarterWeaponRaw();
    const state = createDefaultPlayerState(starter, 1760000000);

    expect(state.schema_version).toBe(PLAYER_STATE_SCHEMA_VERSION);
    expect(state.saved_at).toBe(1760000000);
    expect(state.base.base_stats).toEqual({ vit: 0, for: 0, agi: 0, pow: 0, tec: 0, arc: 0 });
    expect(state.run.floor).toBe(1);
    expect(state.run.run_level).toBe(1);
    expect(state.run.xp).toBe(0);
    expect(state.run.hp).toBe(100);
    expect(state.run.equipped_weapons).toHaveLength(1);
    expect(state.run.equipped_weapons[0].weapon).toEqual(starter);
    expect(state.run.equipped_weapons[0].weapon).not.toBe(starter);
  });

  it("loadPlayerStateFromStorage は壊れたデータを補正して読み込む", () => {
    const starter = createStarterWeaponRaw();
    const brokenPayload = JSON.stringify({
      schema_version: "unknown",
      run: {
        floor: -9,
        run_level: 0,
        xp: -1,
        hp: -999,
        pos: { x: "bad", y: null },
        equipped_weapons: [
          {
            slot: "bad",
            weapon: { weapon_file_name: "", hit_num: 0 },
            runtime: { attack_seq: -20, cooldown_remaining_sec: -5 },
          },
        ],
      },
    });
    const storage = createMemoryStorage({ [PLAYER_STATE_STORAGE_KEY]: brokenPayload });

    const state = loadPlayerStateFromStorage(storage, PLAYER_STATE_STORAGE_KEY, starter, 1700000000);

    expect(state.schema_version).toBe(PLAYER_STATE_SCHEMA_VERSION);
    expect(state.run.floor).toBe(1);
    expect(state.run.run_level).toBe(1);
    expect(state.run.xp).toBe(0);
    expect(state.run.hp).toBe(0);
    expect(state.run.pos).toEqual({ x: 0, y: 0 });
    expect(state.run.equipped_weapons[0].weapon.weapon_file_name).toBe("wepon_sword_01.png");
    expect(state.run.equipped_weapons[0].runtime).toEqual({
      attack_seq: 0,
      cooldown_remaining_sec: 0,
    });
  });

  it("syncPlayerStateFromRuntime が pos と武器runtimeを更新し、savePlayerStateToStorage で保存できる", () => {
    const starter = createStarterWeaponRaw();
    const state = createDefaultPlayerState(starter, 1700000000);
    const runtimePlayer = { x: 12.5, y: 34.25 };
    const runtimeWeapons = [{ attackSeq: 7, cooldownRemainingSec: 0.75 }];
    syncPlayerStateFromRuntime(state, runtimePlayer, runtimeWeapons, 1700001111);

    expect(state.saved_at).toBe(1700001111);
    expect(state.run.pos).toEqual({ x: 12.5, y: 34.25 });
    expect(state.run.equipped_weapons[0].runtime).toEqual({
      attack_seq: 7,
      cooldown_remaining_sec: 0.75,
    });

    const storage = createMemoryStorage();
    const saved = savePlayerStateToStorage(storage, PLAYER_STATE_STORAGE_KEY, state);
    expect(saved).toBe(true);
    const dumped = storage.dump();
    expect(typeof dumped[PLAYER_STATE_STORAGE_KEY]).toBe("string");
  });

  it("buildWeaponDefinitionsFromPlayerState と applySavedWeaponRuntime が保存値を反映する", () => {
    const starter = createStarterWeaponRaw();
    const state = createDefaultPlayerState(starter, 1700000000);
    state.run.equipped_weapons[0].runtime.attack_seq = 11;
    state.run.equipped_weapons[0].runtime.cooldown_remaining_sec = 1.25;

    const definitions = buildWeaponDefinitionsFromPlayerState(state, starter);
    expect(definitions).toHaveLength(1);
    expect(definitions[0].id).toBe("wepon_sword_01");
    expect(definitions[0].formationId).toBe("formation_id_circle01");

    const runtimeWeapons = [{ attackSeq: 0, cooldownRemainingSec: 0, hitSet: new Set(["enemy-1"]) }];
    applySavedWeaponRuntime(state, runtimeWeapons);

    expect(runtimeWeapons[0].attackSeq).toBe(11);
    expect(runtimeWeapons[0].cooldownRemainingSec).toBe(1.25);
    expect(runtimeWeapons[0].hitSet.size).toBe(0);
  });
});
