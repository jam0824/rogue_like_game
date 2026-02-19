import { describe, expect, it } from "vitest";
import { computeCameraScroll, resolveGameViewScale } from "../../src/render/gameViewScale.js";

describe("gameViewScale", () => {
  it("resolveGameViewScale は有効な正の数値をそのまま返す", () => {
    expect(resolveGameViewScale(1.5)).toBe(1.5);
    expect(resolveGameViewScale("2")).toBe(2);
  });

  it("resolveGameViewScale は無効値を 1 にフォールバックする", () => {
    expect(resolveGameViewScale(0)).toBe(1);
    expect(resolveGameViewScale(-1)).toBe(1);
    expect(resolveGameViewScale(Number.NaN)).toBe(1);
    expect(resolveGameViewScale(Number.POSITIVE_INFINITY)).toBe(1);
    expect(resolveGameViewScale("abc")).toBe(1);
    expect(resolveGameViewScale(undefined)).toBe(1);
  });

  it("computeCameraScroll は scale を考慮したスクロール中心を計算する", () => {
    const scroll = computeCameraScroll({
      centerX: 500,
      centerY: 300,
      worldWidthPx: 1000,
      worldHeightPx: 800,
      viewportWidthPx: 400,
      viewportHeightPx: 200,
      scale: 1.5,
    });

    expect(scroll).toEqual({ left: 550, top: 350 });
  });

  it("computeCameraScroll はスクロール端を超えないようにクランプする", () => {
    const nearOrigin = computeCameraScroll({
      centerX: 10,
      centerY: 10,
      worldWidthPx: 1000,
      worldHeightPx: 800,
      viewportWidthPx: 400,
      viewportHeightPx: 200,
      scale: 1.5,
    });
    expect(nearOrigin).toEqual({ left: 0, top: 0 });

    const nearEdge = computeCameraScroll({
      centerX: 990,
      centerY: 790,
      worldWidthPx: 1000,
      worldHeightPx: 800,
      viewportWidthPx: 400,
      viewportHeightPx: 200,
      scale: 1.5,
    });
    expect(nearEdge).toEqual({ left: 1100, top: 1000 });
  });

  it("computeCameraScroll は無効 scale を 1 として扱う", () => {
    const scroll = computeCameraScroll({
      centerX: 500,
      centerY: 300,
      worldWidthPx: 1000,
      worldHeightPx: 800,
      viewportWidthPx: 400,
      viewportHeightPx: 200,
      scale: 0,
    });

    expect(scroll).toEqual({ left: 300, top: 200 });
  });

  it("computeCameraScroll は表示領域がワールドより大きい場合 0 を返す", () => {
    const scroll = computeCameraScroll({
      centerX: 50,
      centerY: 40,
      worldWidthPx: 100,
      worldHeightPx: 80,
      viewportWidthPx: 200,
      viewportHeightPx: 200,
      scale: 1.5,
    });

    expect(scroll).toEqual({ left: 0, top: 0 });
  });
});
