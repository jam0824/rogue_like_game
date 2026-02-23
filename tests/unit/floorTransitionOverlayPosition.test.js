import { describe, expect, it } from "vitest";
import { resolveOverlayCenterWorld } from "../../src/render/floorTransitionOverlayPosition.js";

describe("floorTransitionOverlayPosition", () => {
  it("scale=1, scroll=0 ではキャンバス中央を返す", () => {
    const center = resolveOverlayCenterWorld({
      canvasWidth: 960,
      canvasHeight: 540,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 960,
      viewportHeight: 540,
      scale: 1,
    });

    expect(center).toEqual({ x: 480, y: 270 });
  });

  it("scale != 1 でもビューポート中心をワールド座標に換算する", () => {
    const center = resolveOverlayCenterWorld({
      canvasWidth: 2000,
      canvasHeight: 1400,
      scrollLeft: 300,
      scrollTop: 200,
      viewportWidth: 600,
      viewportHeight: 400,
      scale: 2,
    });

    expect(center).toEqual({ x: 300, y: 200 });
  });

  it("異常入力時はフォールバックし、範囲外は clamp される", () => {
    const fallback = resolveOverlayCenterWorld({
      canvasWidth: 1000,
      canvasHeight: 800,
      scrollLeft: Number.NaN,
      scrollTop: 0,
      viewportWidth: 500,
      viewportHeight: 400,
      scale: 1,
    });
    expect(fallback).toEqual({ x: 500, y: 400 });

    const clamped = resolveOverlayCenterWorld({
      canvasWidth: 1000,
      canvasHeight: 800,
      scrollLeft: 5000,
      scrollTop: 5000,
      viewportWidth: 1000,
      viewportHeight: 800,
      scale: 1,
    });
    expect(clamped).toEqual({ x: 1000, y: 800 });
  });
});
