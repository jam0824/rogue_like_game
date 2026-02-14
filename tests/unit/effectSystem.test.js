import { describe, expect, it } from "vitest";
import { createEffectRuntime, updateEffects } from "../../src/effect/effectSystem.js";

function createEffectDefinition(overrides = {}) {
  return {
    id: "effect_id_sword_slash_01",
    width: 120,
    height: 120,
    animationFps: 30,
    animationDirection: "horizontal",
    scale: 1,
    blendMode: "normal",
    loop: false,
    ...overrides,
  };
}

describe("effectSystem", () => {
  it("createEffectRuntime は初期frame=0でRuntimeを生成する", () => {
    const runtime = createEffectRuntime(createEffectDefinition(), {
      id: "effect-0",
      x: 100,
      y: 200,
      frameCount: 9,
    });

    expect(runtime).toEqual({
      id: "effect-0",
      effectId: "effect_id_sword_slash_01",
      x: 100,
      y: 200,
      frameIndex: 0,
      frameCount: 9,
      ageSec: 0,
      animationFps: 30,
      width: 120,
      height: 120,
      animationDirection: "horizontal",
      scale: 1,
      blendMode: "normal",
      loop: false,
    });
  });

  it("loop=false は最終フレーム再生後に消える", () => {
    const runtime = createEffectRuntime(createEffectDefinition({ animationFps: 10, loop: false }), {
      id: "effect-1",
      x: 0,
      y: 0,
      frameCount: 3,
    });

    const frame1 = updateEffects([runtime], 0.11);
    expect(frame1).toHaveLength(1);
    expect(frame1[0].frameIndex).toBe(1);

    const removed = updateEffects(frame1, 0.3);
    expect(removed).toEqual([]);
  });

  it("loop=true はフレームが循環する", () => {
    const runtime = createEffectRuntime(createEffectDefinition({ animationFps: 10, loop: true }), {
      id: "effect-2",
      x: 0,
      y: 0,
      frameCount: 3,
    });

    const updated = updateEffects([runtime], 0.35);
    expect(updated).toHaveLength(1);
    expect(updated[0].frameIndex).toBe(0);
    expect(updated[0].ageSec).toBeCloseTo(0.35, 5);
  });
});
