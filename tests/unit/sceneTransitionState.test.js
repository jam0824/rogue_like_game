import { describe, expect, it } from "vitest";
import {
  buildSceneTransitionTextState,
  createSceneTransitionState,
  isSceneTransitionActive,
  markSceneTransitionReady,
  SCENE_TRANSITION_PHASE,
  startSceneTransition,
  stepSceneTransition,
} from "../../src/scene/sceneTransitionState.js";

describe("sceneTransitionState", () => {
  it("startSceneTransition で fade_in が始まる", () => {
    const state = createSceneTransitionState();
    startSceneTransition(state, {
      kind: "surface_to_dungeon",
      targetMode: "dungeon",
      targetFloor: 1,
      titleText: "地下1階",
      titleColor: "#f4f4f4",
    });

    expect(isSceneTransitionActive(state)).toBe(true);
    expect(state.phase).toBe(SCENE_TRANSITION_PHASE.FADE_IN);
    expect(state.kind).toBe("surface_to_dungeon");
    expect(state.targetMode).toBe("dungeon");
    expect(state.targetFloor).toBe(1);
    expect(state.titleText).toBe("地下1階");
    expect(state.titleColor).toBe("#f4f4f4");
    expect(state.isReady).toBe(false);
  });

  it("fade_in -> title_hold -> fade_out -> idle の順で遷移する", () => {
    const state = createSceneTransitionState({
      fadeInSec: 0.35,
      titleHoldSec: 1,
      fadeOutSec: 0.35,
    });
    startSceneTransition(state, {
      kind: "surface_to_dungeon",
      targetMode: "dungeon",
      targetFloor: 1,
      titleText: "地下1階",
      titleColor: "#f4f4f4",
    });

    stepSceneTransition(state, 0.35);
    expect(state.phase).toBe(SCENE_TRANSITION_PHASE.TITLE_HOLD);
    expect(state.alpha).toBe(1);

    stepSceneTransition(state, 1);
    expect(state.phase).toBe(SCENE_TRANSITION_PHASE.TITLE_HOLD);

    markSceneTransitionReady(state);
    stepSceneTransition(state, 0);
    expect(state.phase).toBe(SCENE_TRANSITION_PHASE.FADE_OUT);

    stepSceneTransition(state, 0.35);
    expect(state.phase).toBe(SCENE_TRANSITION_PHASE.IDLE);
    expect(state.active).toBe(false);
    expect(state.alpha).toBe(0);
  });

  it("buildSceneTransitionTextState は描画/テキスト出力用の値を返す", () => {
    const state = createSceneTransitionState();
    startSceneTransition(state, {
      kind: "player_death",
      targetMode: "surface",
      targetFloor: 1,
      titleText: "YOU DIED",
      titleColor: "#d22c2c",
      ready: true,
    });
    const snapshot = buildSceneTransitionTextState(state);

    expect(snapshot).toEqual({
      active: true,
      phase: SCENE_TRANSITION_PHASE.FADE_IN,
      alpha: 0,
      titleText: "YOU DIED",
      titleColor: "#d22c2c",
      kind: "player_death",
      targetMode: "surface",
      targetFloor: 1,
      isReady: true,
    });
  });

  it("titleHoldSec=0 のときは待機せず fade_out に遷移できる", () => {
    const state = createSceneTransitionState({
      fadeInSec: 0.35,
      titleHoldSec: 0,
      fadeOutSec: 0.35,
    });
    startSceneTransition(state, {
      kind: "surface_hub_to_storage",
      targetMode: "surface",
      ready: true,
    });

    stepSceneTransition(state, 0.35);
    expect(state.phase).toBe(SCENE_TRANSITION_PHASE.TITLE_HOLD);
    expect(state.alpha).toBe(1);

    stepSceneTransition(state, 0);
    expect(state.phase).toBe(SCENE_TRANSITION_PHASE.FADE_OUT);
  });
});
