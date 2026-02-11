import { describe, expect, it } from "vitest";
import { createAppState, setDungeonState, setErrorState } from "../../src/state/appState.js";

describe("appState", () => {
  it("初期化で seed 文字列化と空状態が設定される", () => {
    const state = createAppState(12345);

    expect(state).toEqual({
      seed: "12345",
      isPaused: false,
      debugPlayerDamagePreviewOnly: true,
      dungeon: null,
      validation: null,
      playerState: null,
      player: null,
      enemies: [],
      weapons: [],
      damagePopups: [],
      systemUi: {
        inventory: {
          isWindowOpen: false,
          capacity: 10,
          items: [],
          selectedItemId: null,
          droppedItems: [],
        },
        statusEffects: {
          buffs: [],
          debuffs: [],
        },
        toastMessage: "",
      },
      backdrop: null,
      error: null,
    });
  });

  it("ダンジョン設定で状態を更新しエラーをクリアする", () => {
    const state = createAppState("old-seed");
    state.error = "old error";
    state.isPaused = true;
    state.debugPlayerDamagePreviewOnly = true;

    const payload = {
      seed: "new-seed",
      dungeon: { id: "dungeon" },
      validation: { ok: true },
      playerState: { schema_version: "player_state_v1" },
      player: { id: "player" },
      enemies: [{ id: "enemy-1" }],
      weapons: [{ id: "weapon-1" }],
      damagePopups: [{ id: "popup-1" }],
      systemUi: {
        inventory: {
          isWindowOpen: true,
          capacity: 10,
          items: [{ id: "run_item_potion_small" }],
          selectedItemId: "run_item_potion_small",
          droppedItems: [],
        },
        statusEffects: {
          buffs: [{ id: "buff_a" }],
          debuffs: [],
        },
        toastMessage: "ok",
      },
      backdrop: { widthPx: 960, heightPx: 540 },
    };

    setDungeonState(state, payload);

    expect(state.seed).toBe("new-seed");
    expect(state.isPaused).toBe(false);
    expect(state.debugPlayerDamagePreviewOnly).toBe(true);
    expect(state.dungeon).toEqual({ id: "dungeon" });
    expect(state.validation).toEqual({ ok: true });
    expect(state.playerState).toEqual({ schema_version: "player_state_v1" });
    expect(state.player).toEqual({ id: "player" });
    expect(state.enemies).toEqual([{ id: "enemy-1" }]);
    expect(state.weapons).toEqual([{ id: "weapon-1" }]);
    expect(state.damagePopups).toEqual([{ id: "popup-1" }]);
    expect(state.systemUi).toEqual({
      inventory: {
        isWindowOpen: true,
        capacity: 10,
        items: [{ id: "run_item_potion_small" }],
        selectedItemId: "run_item_potion_small",
        droppedItems: [],
      },
      statusEffects: {
        buffs: [{ id: "buff_a" }],
        debuffs: [],
      },
      toastMessage: "ok",
    });
    expect(state.backdrop).toEqual({ widthPx: 960, heightPx: 540 });
    expect(state.error).toBeNull();
  });

  it("エラー設定で状態をリセットし、表示用メッセージに変換する", () => {
    const state = createAppState("base");
    setDungeonState(state, {
      seed: "filled",
      dungeon: { id: "dungeon" },
      validation: { ok: true },
      playerState: { schema_version: "player_state_v1" },
      player: { id: "player" },
      enemies: [{ id: "enemy" }],
      weapons: [{ id: "weapon" }],
      damagePopups: [{ id: "popup" }],
      systemUi: {
        inventory: {
          isWindowOpen: true,
          capacity: 10,
          items: [{ id: "run_item_potion_small" }],
          selectedItemId: "run_item_potion_small",
          droppedItems: [],
        },
        statusEffects: {
          buffs: [{ id: "buff_a" }],
          debuffs: [{ id: "debuff_a" }],
        },
        toastMessage: "active",
      },
      backdrop: { widthPx: 960, heightPx: 540 },
    });
    state.isPaused = true;

    setErrorState(state, 999, new Error("boom"));

    expect(state).toEqual({
      seed: "999",
      isPaused: false,
      debugPlayerDamagePreviewOnly: true,
      dungeon: null,
      validation: null,
      playerState: { schema_version: "player_state_v1" },
      player: null,
      enemies: [],
      weapons: [],
      damagePopups: [],
      systemUi: {
        inventory: {
          isWindowOpen: false,
          capacity: 10,
          items: [{ id: "run_item_potion_small" }],
          selectedItemId: "run_item_potion_small",
          droppedItems: [],
        },
        statusEffects: {
          buffs: [{ id: "buff_a" }],
          debuffs: [{ id: "debuff_a" }],
        },
        toastMessage: "active",
      },
      backdrop: null,
      error: "boom",
    });

    setErrorState(state, "next", "failure");
    expect(state.seed).toBe("next");
    expect(state.error).toBe("failure");
  });
});
