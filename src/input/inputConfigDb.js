const INPUT_BINDINGS_VERSION = "input_bindings_v1";

const BASE_ACTIONS = [
  "move_up",
  "move_down",
  "move_left",
  "move_right",
  "interact",
  "pause",
  "inventory_toggle",
  "ui_up",
  "ui_down",
  "ui_left",
  "ui_right",
  "ui_confirm",
  "ui_cancel",
  "ui_tab_prev",
  "ui_tab_next",
];

const QUICKSLOT_ACTIONS = Array.from({ length: 8 }, (_, index) => `quickslot_${index + 1}`);

export const INPUT_ACTIONS = Object.freeze([...BASE_ACTIONS, ...QUICKSLOT_ACTIONS]);
export const INPUT_BINDINGS_URL = new URL("../../db/input_config/input_bindings_v1.json", import.meta.url).href;

const DEFAULT_INPUT_BINDINGS = Object.freeze({
  version: INPUT_BINDINGS_VERSION,
  keyboard: Object.freeze({
    move_up: Object.freeze(["KeyW", "ArrowUp"]),
    move_down: Object.freeze(["KeyS", "ArrowDown"]),
    move_left: Object.freeze(["KeyA", "ArrowLeft"]),
    move_right: Object.freeze(["KeyD", "ArrowRight"]),
    interact: Object.freeze(["KeyE"]),
    pause: Object.freeze(["Escape"]),
    inventory_toggle: Object.freeze(["KeyI"]),
    ui_up: Object.freeze(["ArrowUp", "KeyW"]),
    ui_down: Object.freeze(["ArrowDown", "KeyS"]),
    ui_left: Object.freeze(["ArrowLeft", "KeyA"]),
    ui_right: Object.freeze(["ArrowRight", "KeyD"]),
    ui_confirm: Object.freeze(["Enter", "Space"]),
    ui_cancel: Object.freeze(["Escape"]),
    ui_tab_prev: Object.freeze(["KeyQ"]),
    ui_tab_next: Object.freeze(["KeyE"]),
    quickslot_1: Object.freeze(["Digit1"]),
    quickslot_2: Object.freeze(["Digit2"]),
    quickslot_3: Object.freeze(["Digit3"]),
    quickslot_4: Object.freeze(["Digit4"]),
    quickslot_5: Object.freeze(["Digit5"]),
    quickslot_6: Object.freeze(["Digit6"]),
    quickslot_7: Object.freeze(["Digit7"]),
    quickslot_8: Object.freeze(["Digit8"]),
  }),
  gamepad: Object.freeze({
    move_axis: Object.freeze({
      x: 0,
      y: 1,
      deadzone: 0.25,
    }),
    move_up: Object.freeze([12]),
    move_down: Object.freeze([13]),
    move_left: Object.freeze([14]),
    move_right: Object.freeze([15]),
    interact: Object.freeze([0]),
    pause: Object.freeze([9]),
    inventory_toggle: Object.freeze([3]),
    ui_up: Object.freeze([12]),
    ui_down: Object.freeze([13]),
    ui_left: Object.freeze([14]),
    ui_right: Object.freeze([15]),
    ui_confirm: Object.freeze([0]),
    ui_cancel: Object.freeze([1]),
    ui_tab_prev: Object.freeze([4]),
    ui_tab_next: Object.freeze([5]),
    quickslot_1: Object.freeze([]),
    quickslot_2: Object.freeze([]),
    quickslot_3: Object.freeze([]),
    quickslot_4: Object.freeze([]),
    quickslot_5: Object.freeze([]),
    quickslot_6: Object.freeze([]),
    quickslot_7: Object.freeze([]),
    quickslot_8: Object.freeze([]),
  }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.floor(Number(value));
}

function normalizeKeyList(rawList, fallbackList) {
  const source = Array.isArray(rawList) ? rawList : fallbackList;
  const result = [];
  const seen = new Set();

  for (const value of source) {
    if (typeof value !== "string" || value.trim().length <= 0) {
      continue;
    }
    const code = value.trim();
    if (seen.has(code)) {
      continue;
    }
    seen.add(code);
    result.push(code);
  }

  if (result.length > 0) {
    return result;
  }

  return Array.isArray(fallbackList) ? [...fallbackList] : [];
}

function normalizeButtonList(rawList, fallbackList) {
  const source = Array.isArray(rawList) ? rawList : fallbackList;
  const result = [];
  const seen = new Set();

  for (const value of source) {
    const index = toInteger(value, -1);
    if (index < 0 || index > 31) {
      continue;
    }
    if (seen.has(index)) {
      continue;
    }
    seen.add(index);
    result.push(index);
  }

  if (result.length > 0 || (Array.isArray(rawList) && rawList.length === 0)) {
    return result;
  }

  return Array.isArray(fallbackList) ? [...fallbackList] : [];
}

function normalizeMoveAxis(rawMoveAxis, fallbackMoveAxis) {
  const source = rawMoveAxis && typeof rawMoveAxis === "object" ? rawMoveAxis : fallbackMoveAxis;
  const fallback = fallbackMoveAxis && typeof fallbackMoveAxis === "object"
    ? fallbackMoveAxis
    : { x: 0, y: 1, deadzone: 0.25 };

  return {
    x: toInteger(source?.x, fallback.x),
    y: toInteger(source?.y, fallback.y),
    deadzone: clamp(Number.isFinite(source?.deadzone) ? Number(source.deadzone) : fallback.deadzone, 0, 0.95),
  };
}

function normalizeKeyboardBindings(rawKeyboard = {}, fallbackKeyboard = {}) {
  const normalized = {};
  for (const action of INPUT_ACTIONS) {
    normalized[action] = normalizeKeyList(rawKeyboard[action], fallbackKeyboard[action]);
  }
  return normalized;
}

function normalizeGamepadBindings(rawGamepad = {}, fallbackGamepad = {}) {
  const normalized = {
    move_axis: normalizeMoveAxis(rawGamepad.move_axis, fallbackGamepad.move_axis),
  };

  for (const action of INPUT_ACTIONS) {
    normalized[action] = normalizeButtonList(rawGamepad[action], fallbackGamepad[action]);
  }

  return normalized;
}

export function getDefaultInputBindings() {
  return deepClone(DEFAULT_INPUT_BINDINGS);
}

export function normalizeInputBindings(rawBindings) {
  const fallback = getDefaultInputBindings();
  const source = rawBindings && typeof rawBindings === "object" ? rawBindings : {};
  const keyboard = source.keyboard && typeof source.keyboard === "object" ? source.keyboard : {};
  const gamepad = source.gamepad && typeof source.gamepad === "object" ? source.gamepad : {};

  return {
    version: INPUT_BINDINGS_VERSION,
    keyboard: normalizeKeyboardBindings(keyboard, fallback.keyboard),
    gamepad: normalizeGamepadBindings(gamepad, fallback.gamepad),
  };
}

export async function loadInputBindings() {
  const cacheBustKey = Date.now();
  const url = new URL(INPUT_BINDINGS_URL);
  url.searchParams.set("cb", String(cacheBustKey));

  try {
    const response = await fetch(url.href, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rawBindings = await response.json();
    return normalizeInputBindings(rawBindings);
  } catch (error) {
    console.warn(`[Input] Failed to load input bindings: ${error instanceof Error ? error.message : String(error)}`);
    return getDefaultInputBindings();
  }
}
