import { describe, expect, it } from "vitest";
import {
  buildFloorTransitionTextState,
  createFloorTransitionState,
  FLOOR_TRANSITION_PHASE,
  isFloorTransitionActive,
  markFloorTransitionDungeonReady,
  startFloorTransition,
  stepFloorTransition,
} from "../../src/dungeon/floorTransitionState.js";

describe("floorTransitionState", () => {
  it("startFloorTransition で fade_out が始まる", () => {
    const state = createFloorTransitionState();
    startFloorTransition(state, { targetFloor: 2, titleText: "地下2階" });

    expect(isFloorTransitionActive(state)).toBe(true);
    expect(state.phase).toBe(FLOOR_TRANSITION_PHASE.FADE_OUT);
    expect(state.targetFloor).toBe(2);
    expect(state.titleText).toBe("地下2階");
  });

  it("fade_out -> title_hold -> fade_in -> idle の順で遷移する", () => {
    const state = createFloorTransitionState({
      fadeOutSec: 0.35,
      titleHoldSec: 1,
      fadeInSec: 0.35,
    });
    startFloorTransition(state, { targetFloor: 3, titleText: "地下3階" });

    stepFloorTransition(state, 0.35);
    expect(state.phase).toBe(FLOOR_TRANSITION_PHASE.TITLE_HOLD);
    expect(state.alpha).toBe(1);

    stepFloorTransition(state, 1.0);
    expect(state.phase).toBe(FLOOR_TRANSITION_PHASE.TITLE_HOLD);

    markFloorTransitionDungeonReady(state);
    stepFloorTransition(state, 0);
    expect(state.phase).toBe(FLOOR_TRANSITION_PHASE.FADE_IN);

    stepFloorTransition(state, 0.35);
    expect(state.phase).toBe(FLOOR_TRANSITION_PHASE.IDLE);
    expect(state.active).toBe(false);
    expect(state.alpha).toBe(0);
  });

  it("buildFloorTransitionTextState は描画/テキスト出力用の値を返す", () => {
    const state = createFloorTransitionState();
    startFloorTransition(state, { targetFloor: 4, titleText: "地下4階" });
    const snapshot = buildFloorTransitionTextState(state);

    expect(snapshot).toEqual({
      active: true,
      phase: FLOOR_TRANSITION_PHASE.FADE_OUT,
      alpha: 0,
      targetFloor: 4,
      titleText: "地下4階",
      isDungeonReady: false,
    });
  });
});
