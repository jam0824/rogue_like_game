import { describe, expect, it, vi } from "vitest";
import { createPointerController } from "../../src/input/pointerController.js";

function createCanvasMock({
  width = 400,
  height = 300,
  rect = { left: 50, top: 10, width: 200, height: 100 },
} = {}) {
  const listeners = new Map();

  const canvas = {
    width,
    height,
    setPointerCapture: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({ ...rect })),
    addEventListener: vi.fn((type, handler) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(handler);
    }),
    removeEventListener: vi.fn((type, handler) => {
      listeners.get(type)?.delete(handler);
    }),
  };

  function dispatch(type, event = {}) {
    const handlers = listeners.get(type);
    if (!handlers) {
      return null;
    }

    const payload = {
      pointerId: 1,
      button: 0,
      clientX: rect.left,
      clientY: rect.top,
      preventDefault: vi.fn(),
      ...event,
    };

    for (const handler of handlers) {
      handler(payload);
    }

    return payload;
  }

  return { canvas, dispatch };
}

describe("pointerController", () => {
  it("左クリックのみ受理する", () => {
    const onPointerTarget = vi.fn();
    const { canvas, dispatch } = createCanvasMock();

    createPointerController(canvas, { onPointerTarget });

    dispatch("pointerdown", { button: 1, pointerId: 10, clientX: 120, clientY: 40 });
    expect(onPointerTarget).not.toHaveBeenCalled();
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();

    const downEvent = dispatch("pointerdown", {
      button: 0,
      pointerId: 10,
      clientX: 150,
      clientY: 60,
    });

    expect(canvas.setPointerCapture).toHaveBeenCalledWith(10);
    expect(onPointerTarget).toHaveBeenCalledTimes(1);
    expect(onPointerTarget).toHaveBeenLastCalledWith(true, 200, 150);
    expect(downEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("アクティブポインターのみ追跡し、解除時だけ終了通知する", () => {
    const onPointerTarget = vi.fn();
    const { canvas, dispatch } = createCanvasMock();

    createPointerController(canvas, { onPointerTarget });

    dispatch("pointerdown", { pointerId: 1, button: 0, clientX: 150, clientY: 60 });
    dispatch("pointermove", { pointerId: 2, clientX: 170, clientY: 60 });
    dispatch("pointermove", { pointerId: 1, clientX: 170, clientY: 60 });
    dispatch("pointerup", { pointerId: 2 });
    dispatch("pointerup", { pointerId: 1 });

    expect(onPointerTarget).toHaveBeenCalledTimes(3);
    expect(onPointerTarget).toHaveBeenNthCalledWith(1, true, 200, 150);
    expect(onPointerTarget).toHaveBeenNthCalledWith(2, true, 240, 150);
    expect(onPointerTarget).toHaveBeenNthCalledWith(3, false, null, null);
  });

  it("座標をキャンバス座標へ変換し範囲外をクランプする", () => {
    const onPointerTarget = vi.fn();
    const { canvas, dispatch } = createCanvasMock();

    createPointerController(canvas, { onPointerTarget });

    dispatch("pointerdown", { pointerId: 3, button: 0, clientX: -100, clientY: -100 });
    dispatch("pointermove", { pointerId: 3, clientX: 9999, clientY: 9999 });

    expect(onPointerTarget).toHaveBeenNthCalledWith(1, true, 0, 0);
    expect(onPointerTarget).toHaveBeenNthCalledWith(2, true, 399, 299);
  });

  it("pointercancel と lostpointercapture で解除通知する", () => {
    for (const releaseEventType of ["pointercancel", "lostpointercapture"]) {
      const onPointerTarget = vi.fn();
      const { canvas, dispatch } = createCanvasMock();

      createPointerController(canvas, { onPointerTarget });

      dispatch("pointerdown", { pointerId: 7, button: 0, clientX: 120, clientY: 60 });
      dispatch(releaseEventType, { pointerId: 7 });

      expect(onPointerTarget).toHaveBeenCalledTimes(2);
      expect(onPointerTarget).toHaveBeenNthCalledWith(1, true, 140, 150);
      expect(onPointerTarget).toHaveBeenNthCalledWith(2, false, null, null);
    }
  });

  it("destroy 後はイベントに反応しない", () => {
    const onPointerTarget = vi.fn();
    const { canvas, dispatch } = createCanvasMock();

    const controller = createPointerController(canvas, { onPointerTarget });
    controller.destroy();

    dispatch("pointerdown", { pointerId: 1, button: 0, clientX: 150, clientY: 60 });
    dispatch("pointermove", { pointerId: 1, clientX: 180, clientY: 60 });
    dispatch("pointerup", { pointerId: 1 });

    expect(onPointerTarget).not.toHaveBeenCalled();
  });
});
