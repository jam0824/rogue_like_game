import { describe, expect, it, vi } from "vitest";
import { createInputController } from "../../src/input/inputController.js";

function createKeyboardTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type, event = {}) {
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
  };
}

function createGamepad(options = {}) {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const pressedButtons = Array.isArray(options.pressedButtons) ? options.pressedButtons : [];
  for (const index of pressedButtons) {
    if (!buttons[index]) {
      continue;
    }
    buttons[index] = {
      pressed: true,
      value: 1,
    };
  }
  const axes = Array.isArray(options.axes) ? options.axes : [0, 0];
  return {
    connected: true,
    mapping: "standard",
    buttons,
    axes,
  };
}

describe("inputController", () => {
  it("keydown/keyup の down と pressed を分離して返す", () => {
    const keyboardTarget = createKeyboardTarget();
    const controller = createInputController({
      keyboardTarget,
      gamepadSource: () => [],
    });

    const preventDefault = vi.fn();
    keyboardTarget.dispatch("keydown", {
      code: "KeyE",
      preventDefault,
      target: { tagName: "DIV", isContentEditable: false },
    });

    const first = controller.update(0);
    expect(first.down.interact).toBe(true);
    expect(first.pressed.interact).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);

    const second = controller.update(16);
    expect(second.down.interact).toBe(true);
    expect(second.pressed.interact).toBe(false);

    keyboardTarget.dispatch("keyup", { code: "KeyE" });
    const third = controller.update(32);
    expect(third.down.interact).toBe(false);
    expect(third.pressed.interact).toBe(false);

    controller.destroy();
  });

  it("ui方向入力は初回+遅延リピートで pressed=true になる", () => {
    const keyboardTarget = createKeyboardTarget();
    const controller = createInputController({
      keyboardTarget,
      gamepadSource: () => [],
      uiRepeatInitialDelayMs: 220,
      uiRepeatIntervalMs: 110,
    });

    keyboardTarget.dispatch("keydown", {
      code: "ArrowDown",
      preventDefault: vi.fn(),
      target: { tagName: "DIV", isContentEditable: false },
    });

    expect(controller.update(0).pressed.ui_down).toBe(true);
    expect(controller.update(100).pressed.ui_down).toBe(false);
    expect(controller.update(221).pressed.ui_down).toBe(true);
    expect(controller.update(331).pressed.ui_down).toBe(true);

    keyboardTarget.dispatch("keyup", { code: "ArrowDown" });
    expect(controller.update(340).pressed.ui_down).toBe(false);
    controller.destroy();
  });

  it("ゲームパッドのボタンと左スティックを取り込む", () => {
    const keyboardTarget = createKeyboardTarget();
    let gamepads = [createGamepad({ pressedButtons: [0], axes: [0.6, -0.7] })];
    const controller = createInputController({
      keyboardTarget,
      gamepadSource: () => gamepads,
    });

    const snapshot = controller.update(0);
    expect(snapshot.down.interact).toBe(true);
    expect(snapshot.pressed.interact).toBe(true);
    expect(snapshot.move.active).toBe(true);
    expect(snapshot.move.x).toBeGreaterThan(0);
    expect(snapshot.move.y).toBeLessThan(0);

    gamepads = [createGamepad({ pressedButtons: [], axes: [0, 0] })];
    const released = controller.update(16);
    expect(released.down.interact).toBe(false);
    expect(released.move.active).toBe(false);
    controller.destroy();
  });

  it("setBindings で割り当てを差し替える", () => {
    const keyboardTarget = createKeyboardTarget();
    const controller = createInputController({
      keyboardTarget,
      gamepadSource: () => [],
    });

    controller.setBindings({
      keyboard: {
        interact: ["KeyF"],
      },
      gamepad: {},
    });

    keyboardTarget.dispatch("keydown", {
      code: "KeyE",
      preventDefault: vi.fn(),
      target: { tagName: "DIV", isContentEditable: false },
    });
    expect(controller.update(0).down.interact).toBe(false);

    keyboardTarget.dispatch("keydown", {
      code: "KeyF",
      preventDefault: vi.fn(),
      target: { tagName: "DIV", isContentEditable: false },
    });
    expect(controller.update(16).down.interact).toBe(true);
    controller.destroy();
  });
});
