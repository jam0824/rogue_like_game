import {
  getDefaultInputBindings,
  INPUT_ACTIONS,
  normalizeInputBindings,
} from "./inputConfigDb.js";

const MOVE_ACTIONS = Object.freeze(["move_up", "move_down", "move_left", "move_right"]);
const UI_REPEAT_ACTIONS = Object.freeze(["ui_up", "ui_down", "ui_left", "ui_right"]);
const DEFAULT_UI_REPEAT_INITIAL_DELAY_MS = 220;
const DEFAULT_UI_REPEAT_INTERVAL_MS = 110;
const GAMEPAD_BUTTON_THRESHOLD = 0.5;
const MOVE_EPSILON = 0.0001;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildActionState(defaultValue = false) {
  const state = {};
  for (const action of INPUT_ACTIONS) {
    state[action] = defaultValue;
  }
  return state;
}

function buildUiRepeatState() {
  const state = {};
  for (const action of UI_REPEAT_ACTIONS) {
    state[action] = {
      nextRepeatMs: 0,
    };
  }
  return state;
}

function normalizeNowMs(value) {
  if (Number.isFinite(value)) {
    return Number(value);
  }
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function defaultGamepadSource() {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return [];
  }
  try {
    return Array.from(navigator.getGamepads() ?? []);
  } catch {
    return [];
  }
}

function isEditableTarget(target) {
  if (!target || typeof target !== "object") {
    return false;
  }

  if (target.isContentEditable === true) {
    return true;
  }

  const tagName = typeof target.tagName === "string" ? target.tagName.toLowerCase() : "";
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function applyDeadzone(value, deadzone) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const threshold = clamp(Number(deadzone), 0, 0.95);
  const absValue = Math.abs(value);
  if (absValue <= threshold) {
    return 0;
  }

  const normalized = (absValue - threshold) / Math.max(0.0001, 1 - threshold);
  return Math.sign(value) * clamp(normalized, 0, 1);
}

function isGamepadButtonDown(gamepad, buttonIndex) {
  if (!gamepad || !Array.isArray(gamepad.buttons) || !Number.isInteger(buttonIndex)) {
    return false;
  }
  const button = gamepad.buttons[buttonIndex];
  if (button === undefined || button === null) {
    return false;
  }
  if (typeof button === "number") {
    return button > GAMEPAD_BUTTON_THRESHOLD;
  }

  const pressed = button.pressed === true;
  const value = Number.isFinite(button.value) ? Number(button.value) : 0;
  return pressed || value > GAMEPAD_BUTTON_THRESHOLD;
}

function getPrimaryGamepad(gamepads) {
  if (!Array.isArray(gamepads)) {
    return null;
  }

  for (const gamepad of gamepads) {
    if (!gamepad || gamepad.connected !== true) {
      continue;
    }
    if (gamepad.mapping === "standard") {
      return gamepad;
    }
  }

  for (const gamepad of gamepads) {
    if (gamepad && gamepad.connected === true) {
      return gamepad;
    }
  }

  return null;
}

function buildBoundKeyboardCodeSet(bindings) {
  const boundCodes = new Set();
  for (const action of INPUT_ACTIONS) {
    const codes = Array.isArray(bindings?.keyboard?.[action]) ? bindings.keyboard[action] : [];
    for (const code of codes) {
      if (typeof code === "string" && code.length > 0) {
        boundCodes.add(code);
      }
    }
  }
  return boundCodes;
}

function buildDownSnapshot(bindings, keyboardDownCodes, gamepad) {
  const down = buildActionState(false);
  for (const action of INPUT_ACTIONS) {
    const keyboardCodes = Array.isArray(bindings?.keyboard?.[action]) ? bindings.keyboard[action] : [];
    const gamepadButtons = Array.isArray(bindings?.gamepad?.[action]) ? bindings.gamepad[action] : [];

    const keyboardDown = keyboardCodes.some((code) => keyboardDownCodes.has(code));
    const gamepadDown = gamepadButtons.some((buttonIndex) => isGamepadButtonDown(gamepad, buttonIndex));
    down[action] = keyboardDown || gamepadDown;
  }
  return down;
}

function resolveMoveVector(down, bindings, gamepad) {
  const digitalX = (down.move_right ? 1 : 0) - (down.move_left ? 1 : 0);
  const digitalY = (down.move_down ? 1 : 0) - (down.move_up ? 1 : 0);

  const moveAxis = bindings?.gamepad?.move_axis ?? { x: 0, y: 1, deadzone: 0.25 };
  const axisXIndex = Number.isInteger(moveAxis.x) ? moveAxis.x : 0;
  const axisYIndex = Number.isInteger(moveAxis.y) ? moveAxis.y : 1;
  const deadzone = clamp(Number.isFinite(moveAxis.deadzone) ? Number(moveAxis.deadzone) : 0.25, 0, 0.95);
  const axisX = applyDeadzone(Number(gamepad?.axes?.[axisXIndex]), deadzone);
  const axisY = applyDeadzone(Number(gamepad?.axes?.[axisYIndex]), deadzone);

  let x = digitalX !== 0 ? digitalX : axisX;
  let y = digitalY !== 0 ? digitalY : axisY;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }

  if (Math.abs(x) <= MOVE_EPSILON) {
    x = 0;
  }
  if (Math.abs(y) <= MOVE_EPSILON) {
    y = 0;
  }

  return {
    x,
    y,
    active: Math.hypot(x, y) > MOVE_EPSILON,
  };
}

function resolvePressedForAction({
  action,
  down,
  wasDown,
  nowMs,
  uiRepeatStateByAction,
  initialDelayMs,
  repeatIntervalMs,
}) {
  if (!down) {
    if (uiRepeatStateByAction[action]) {
      uiRepeatStateByAction[action].nextRepeatMs = 0;
    }
    return false;
  }

  if (!wasDown) {
    if (uiRepeatStateByAction[action]) {
      uiRepeatStateByAction[action].nextRepeatMs = nowMs + initialDelayMs;
    }
    return true;
  }

  const repeatState = uiRepeatStateByAction[action];
  if (!repeatState) {
    return false;
  }
  if (nowMs < repeatState.nextRepeatMs) {
    return false;
  }

  repeatState.nextRepeatMs = nowMs + repeatIntervalMs;
  return true;
}

export function createInputController(options = {}) {
  const keyboardTarget =
    options.keyboardTarget ??
    (typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null);
  const gamepadSource = typeof options.gamepadSource === "function" ? options.gamepadSource : defaultGamepadSource;
  const initialDelayMs = Math.max(0, Math.floor(Number(options.uiRepeatInitialDelayMs) || DEFAULT_UI_REPEAT_INITIAL_DELAY_MS));
  const repeatIntervalMs = Math.max(1, Math.floor(Number(options.uiRepeatIntervalMs) || DEFAULT_UI_REPEAT_INTERVAL_MS));

  let bindings = normalizeInputBindings(options.bindings ?? getDefaultInputBindings());
  let boundKeyboardCodeSet = buildBoundKeyboardCodeSet(bindings);
  const keyboardDownCodes = new Set();
  const lastDownByAction = buildActionState(false);
  const uiRepeatStateByAction = buildUiRepeatState();

  function onKeyDown(event) {
    const code = typeof event?.code === "string" ? event.code : "";
    if (code.length <= 0) {
      return;
    }
    if (event?.ctrlKey || event?.altKey || event?.metaKey) {
      return;
    }
    if (isEditableTarget(event?.target)) {
      return;
    }
    if (boundKeyboardCodeSet.has(code) && typeof event?.preventDefault === "function") {
      event.preventDefault();
    }
    keyboardDownCodes.add(code);
  }

  function onKeyUp(event) {
    const code = typeof event?.code === "string" ? event.code : "";
    if (code.length <= 0) {
      return;
    }
    keyboardDownCodes.delete(code);
  }

  function onBlur() {
    keyboardDownCodes.clear();
    for (const action of INPUT_ACTIONS) {
      lastDownByAction[action] = false;
      if (uiRepeatStateByAction[action]) {
        uiRepeatStateByAction[action].nextRepeatMs = 0;
      }
    }
  }

  if (keyboardTarget) {
    keyboardTarget.addEventListener("keydown", onKeyDown);
    keyboardTarget.addEventListener("keyup", onKeyUp);
    keyboardTarget.addEventListener("blur", onBlur);
  }

  return {
    setBindings(nextBindings) {
      bindings = normalizeInputBindings(nextBindings);
      boundKeyboardCodeSet = buildBoundKeyboardCodeSet(bindings);
      onBlur();
    },

    update(nowMs = null) {
      const resolvedNowMs = normalizeNowMs(nowMs);
      const gamepad = getPrimaryGamepad(gamepadSource());
      const down = buildDownSnapshot(bindings, keyboardDownCodes, gamepad);
      const pressed = buildActionState(false);

      for (const action of INPUT_ACTIONS) {
        pressed[action] = resolvePressedForAction({
          action,
          down: down[action] === true,
          wasDown: lastDownByAction[action] === true,
          nowMs: resolvedNowMs,
          uiRepeatStateByAction,
          initialDelayMs,
          repeatIntervalMs,
        });
        if (!UI_REPEAT_ACTIONS.includes(action) && down[action] === true && lastDownByAction[action] !== true) {
          pressed[action] = true;
        }
        if (!down[action] && !UI_REPEAT_ACTIONS.includes(action)) {
          pressed[action] = false;
        }
        lastDownByAction[action] = down[action] === true;
      }

      return {
        timestampMs: resolvedNowMs,
        down,
        pressed,
        move: resolveMoveVector(down, bindings, gamepad),
      };
    },

    destroy() {
      onBlur();
      if (!keyboardTarget) {
        return;
      }
      keyboardTarget.removeEventListener("keydown", onKeyDown);
      keyboardTarget.removeEventListener("keyup", onKeyUp);
      keyboardTarget.removeEventListener("blur", onBlur);
    },
  };
}

export { MOVE_ACTIONS, UI_REPEAT_ACTIONS };
