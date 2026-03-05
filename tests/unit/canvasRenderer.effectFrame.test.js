import { describe, expect, it } from "vitest";
import { renderFrame } from "../../src/render/canvasRenderer.js";

function createMockContext() {
  const drawCalls = [];

  return {
    drawCalls,
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineWidth: 1,
    strokeStyle: "#000000",
    fillStyle: "#000000",
    font: "12px monospace",
    textAlign: "left",
    textBaseline: "alphabetic",
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    strokeText() {},
    drawImage(...args) {
      drawCalls.push(args);
    },
  };
}

function createMockCanvas(context) {
  return {
    width: 0,
    height: 0,
    getContext(type) {
      if (type !== "2d") {
        throw new Error(`unexpected context type: ${type}`);
      }
      return context;
    },
  };
}

function findEffectDrawCall(drawCalls, image) {
  return drawCalls.find((args) => args.length === 9 && args[0] === image) ?? null;
}

describe("canvasRenderer effect frame source", () => {
  it("horizontal 多段は frameColumns を使って sx/sy を行送りする", () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);
    const backdrop = { canvas: {}, widthPx: 320, heightPx: 240 };
    const image = { width: 600, height: 240 };

    renderFrame(
      canvas,
      backdrop,
      null,
      null,
      null,
      0,
      "#ffffff",
      [],
      [],
      [],
      [],
      [
        {
          effect: {
            x: 160,
            y: 120,
            frameIndex: 7,
            scale: 1,
            blendMode: "normal",
            rotationRad: 0,
          },
          asset: {
            image,
            frameWidth: 120,
            frameHeight: 120,
            frameCount: 10,
            frameColumns: 5,
            frameRows: 2,
            animationDirection: "horizontal",
          },
        },
      ],
      [],
      [],
      []
    );

    const call = findEffectDrawCall(context.drawCalls, image);
    expect(call).not.toBeNull();
    expect(call[1]).toBe(240);
    expect(call[2]).toBe(120);
  });

  it("frameColumns 未指定でも image.width から fallback 計算する", () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);
    const backdrop = { canvas: {}, widthPx: 320, heightPx: 240 };
    const image = { width: 600, height: 240 };

    renderFrame(
      canvas,
      backdrop,
      null,
      null,
      null,
      0,
      "#ffffff",
      [],
      [],
      [],
      [],
      [
        {
          effect: {
            x: 160,
            y: 120,
            frameIndex: 6,
            scale: 1,
            blendMode: "normal",
            rotationRad: 0,
          },
          asset: {
            image,
            frameWidth: 120,
            frameHeight: 120,
            frameCount: 10,
            animationDirection: "horizontal",
          },
        },
      ],
      [],
      [],
      []
    );

    const call = findEffectDrawCall(context.drawCalls, image);
    expect(call).not.toBeNull();
    expect(call[1]).toBe(120);
    expect(call[2]).toBe(120);
  });
});
