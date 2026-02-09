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

function createStarterWeaponDef() {
  return {
    id: "wepon_sword_01",
    nameKey: "name_wepon_sword_01",
    descriptionKey: "description_wepon_sword_01",
    weaponFileName: "wepon_sword_01.png",
    width: 32,
    height: 64,
    rarity: "rare",
    weaponPlus: 0,
    baseDamage: 12,
    attackCooldownSec: 2,
    hitNum: 1,
    pierceCount: 10,
    chipSlotCount: 3,
    formationId: "formation_id_circle01",
    skills: [
      { id: "skill_id_fire01", plus: 0 },
      { id: "skill_id_poison01", plus: 3 },
    ],
  };
}

function createWeaponDefinitionsById() {
  const starter = createStarterWeaponDef();
  return {
    [starter.id]: starter,
    wepon_spear_01: {
      id: "wepon_spear_01",
      nameKey: "name_wepon_spear_01",
      descriptionKey: "description_wepon_spear_01",
      weaponFileName: "wepon_spear_01.png",
      width: 24,
      height: 64,
      rarity: "normal",
      weaponPlus: 0,
      baseDamage: 8,
      attackCooldownSec: 1.5,
      hitNum: 1,
      pierceCount: 1,
      chipSlotCount: 2,
      formationId: "formation_id_line_front01",
      skills: [{ id: "skill_id_ice01", plus: 0 }],
    },
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
  it("createDefaultPlayerState が instance形の武器保存を作る", () => {
    const starter = createStarterWeaponDef();
    const state = createDefaultPlayerState(starter, 1760000000);

    expect(state.schema_version).toBe(PLAYER_STATE_SCHEMA_VERSION);
    expect(state.saved_at).toBe(1760000000);
    expect(state.base.base_stats).toEqual({ vit: 0, for: 0, agi: 0, pow: 0, tec: 0, arc: 0 });
    expect(state.run.equipped_weapons).toHaveLength(1);
    expect(state.run.equipped_weapons[0].weapon).toEqual({
      weapon_def_id: "wepon_sword_01",
      rarity: "rare",
      weapon_plus: 0,
      formation_id: "formation_id_circle01",
      skills: [
        { id: "skill_id_fire01", plus: 0 },
        { id: "skill_id_poison01", plus: 3 },
      ],
    });
    expect("weapon_file_name" in state.run.equipped_weapons[0].weapon).toBe(false);
    expect("base_damage" in state.run.equipped_weapons[0].weapon).toBe(false);
  });

  it("旧形式（Def丸ごと保存）を検出したらデフォルト再初期化する", () => {
    const weaponDefs = createWeaponDefinitionsById();
    const brokenPayload = JSON.stringify({
      schema_version: "player_state_v1",
      run: {
        floor: 1,
        run_level: 1,
        xp: 0,
        stat_run: { vit: 0, for: 0, agi: 0, pow: 0, tec: 0, arc: 0 },
        hp: 100,
        pos: { x: 0, y: 0 },
        equipped_weapons: [
          {
            slot: 0,
            weapon: {
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
              skills: [{ id: "skill_id_fire01", plus: 0 }],
            },
            runtime: { attack_seq: 2, cooldown_remaining_sec: 0.5 },
          },
        ],
      },
    });
    const storage = createMemoryStorage({ [PLAYER_STATE_STORAGE_KEY]: brokenPayload });

    const state = loadPlayerStateFromStorage(
      storage,
      PLAYER_STATE_STORAGE_KEY,
      weaponDefs,
      "wepon_sword_01",
      1700000000
    );

    expect(state.schema_version).toBe(PLAYER_STATE_SCHEMA_VERSION);
    expect(state.run.equipped_weapons[0].weapon.weapon_def_id).toBe("wepon_sword_01");
    expect("weapon_file_name" in state.run.equipped_weapons[0].weapon).toBe(false);
    expect(state.run.equipped_weapons[0].runtime).toEqual({ attack_seq: 0, cooldown_remaining_sec: 0 });
  });

  it("buildWeaponDefinitionsFromPlayerState が weapon_def_id解決+formation_id上書きを行う", () => {
    const weaponDefs = createWeaponDefinitionsById();
    const starter = weaponDefs.wepon_sword_01;
    const state = createDefaultPlayerState(starter, 1700000000);

    state.run.equipped_weapons[0].weapon = {
      weapon_def_id: "wepon_spear_01",
      rarity: "rare",
      weapon_plus: 7,
      formation_id: "formation_id_circle01",
      skills: [{ id: "skill_id_ice01", plus: 2 }],
    };

    const resolved = buildWeaponDefinitionsFromPlayerState(state, weaponDefs, "wepon_sword_01");

    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe("wepon_spear_01");
    expect(resolved[0].weaponFileName).toBe("wepon_spear_01.png");
    expect(resolved[0].formationId).toBe("formation_id_circle01");
    expect(resolved[0].baseDamage).toBe(8);
    expect(resolved[0].weaponPlus).toBe(7);
    expect(resolved[0].skills).toEqual([{ id: "skill_id_ice01", plus: 2 }]);
  });

  it("sync/save/apply runtime が instanceを壊さずruntimeを更新する", () => {
    const starter = createStarterWeaponDef();
    const state = createDefaultPlayerState(starter, 1700000000);
    state.run.equipped_weapons[0].weapon.weapon_plus = 9;

    const runtimePlayer = { x: 12.5, y: 34.25 };
    const runtimeWeapons = [{ attackSeq: 7, cooldownRemainingSec: 0.75 }];
    syncPlayerStateFromRuntime(state, runtimePlayer, runtimeWeapons, 1700001111);

    expect(state.saved_at).toBe(1700001111);
    expect(state.run.pos).toEqual({ x: 12.5, y: 34.25 });
    expect(state.run.equipped_weapons[0].weapon.weapon_plus).toBe(9);
    expect(state.run.equipped_weapons[0].runtime).toEqual({
      attack_seq: 7,
      cooldown_remaining_sec: 0.75,
    });

    const storage = createMemoryStorage();
    const saved = savePlayerStateToStorage(storage, PLAYER_STATE_STORAGE_KEY, state);
    expect(saved).toBe(true);

    const runtimeAfterLoad = [{ attackSeq: 0, cooldownRemainingSec: 0, hitSet: new Set(["enemy-1"]) }];
    applySavedWeaponRuntime(state, runtimeAfterLoad);
    expect(runtimeAfterLoad[0].attackSeq).toBe(7);
    expect(runtimeAfterLoad[0].cooldownRemainingSec).toBe(0.75);
    expect(runtimeAfterLoad[0].hitSet.size).toBe(0);
  });
});
