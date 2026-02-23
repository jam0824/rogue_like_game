export const FLOOR_TRANSITION_PHASE = {
  IDLE: "idle",
  FADE_OUT: "fade_out",
  TITLE_HOLD: "title_hold",
  FADE_IN: "fade_in",
};

const DEFAULT_DURATIONS = {
  fadeOutSec: 0.35,
  titleHoldSec: 1,
  fadeInSec: 0.35,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toPositiveDuration(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Number(value);
}

function normalizeConfig(options = {}) {
  return {
    fadeOutSec: toPositiveDuration(options.fadeOutSec, DEFAULT_DURATIONS.fadeOutSec),
    titleHoldSec: toPositiveDuration(options.titleHoldSec, DEFAULT_DURATIONS.titleHoldSec),
    fadeInSec: toPositiveDuration(options.fadeInSec, DEFAULT_DURATIONS.fadeInSec),
  };
}

function resetRuntimeState(state) {
  state.active = false;
  state.phase = FLOOR_TRANSITION_PHASE.IDLE;
  state.timerSec = 0;
  state.alpha = 0;
  state.targetFloor = null;
  state.titleText = "";
  state.isDungeonReady = false;
  state.didRequestLoad = false;
}

export function createFloorTransitionState(options = {}) {
  const config = normalizeConfig(options);
  return {
    config,
    active: false,
    phase: FLOOR_TRANSITION_PHASE.IDLE,
    timerSec: 0,
    alpha: 0,
    targetFloor: null,
    titleText: "",
    isDungeonReady: false,
    didRequestLoad: false,
  };
}

export function startFloorTransition(state, options = {}) {
  if (!state || typeof state !== "object") {
    return;
  }

  state.active = true;
  state.phase = FLOOR_TRANSITION_PHASE.FADE_OUT;
  state.timerSec = 0;
  state.alpha = 0;
  state.targetFloor = Number.isFinite(options.targetFloor) ? Math.floor(Number(options.targetFloor)) : null;
  state.titleText = typeof options.titleText === "string" ? options.titleText : "";
  state.isDungeonReady = false;
  state.didRequestLoad = false;
}

export function markFloorTransitionDungeonReady(state) {
  if (!state || typeof state !== "object") {
    return;
  }

  state.isDungeonReady = true;
}

export function stepFloorTransition(state, dt) {
  if (!state || typeof state !== "object" || state.active !== true) {
    return;
  }

  const delta = Number.isFinite(dt) && dt > 0 ? Number(dt) : 0;
  const config = state.config ?? DEFAULT_DURATIONS;

  if (state.phase === FLOOR_TRANSITION_PHASE.FADE_OUT) {
    state.timerSec += delta;
    const progress = clamp(state.timerSec / toPositiveDuration(config.fadeOutSec, DEFAULT_DURATIONS.fadeOutSec), 0, 1);
    state.alpha = progress;
    if (progress >= 1) {
      state.phase = FLOOR_TRANSITION_PHASE.TITLE_HOLD;
      state.timerSec = 0;
      state.alpha = 1;
    }
    return;
  }

  if (state.phase === FLOOR_TRANSITION_PHASE.TITLE_HOLD) {
    state.timerSec += delta;
    state.alpha = 1;
    if (state.timerSec >= toPositiveDuration(config.titleHoldSec, DEFAULT_DURATIONS.titleHoldSec) && state.isDungeonReady) {
      state.phase = FLOOR_TRANSITION_PHASE.FADE_IN;
      state.timerSec = 0;
    }
    return;
  }

  if (state.phase === FLOOR_TRANSITION_PHASE.FADE_IN) {
    state.timerSec += delta;
    const progress = clamp(state.timerSec / toPositiveDuration(config.fadeInSec, DEFAULT_DURATIONS.fadeInSec), 0, 1);
    state.alpha = 1 - progress;
    if (progress >= 1) {
      resetRuntimeState(state);
    }
    return;
  }

  resetRuntimeState(state);
}

export function isFloorTransitionActive(state) {
  return state?.active === true;
}

export function isFloorTransitionBlocking(state) {
  return isFloorTransitionActive(state);
}

export function buildFloorTransitionTextState(state) {
  return {
    active: state?.active === true,
    phase: typeof state?.phase === "string" ? state.phase : FLOOR_TRANSITION_PHASE.IDLE,
    alpha: Math.round((Number(state?.alpha) || 0) * 1000) / 1000,
    targetFloor: Number.isFinite(state?.targetFloor) ? Math.floor(Number(state.targetFloor)) : null,
    titleText: typeof state?.titleText === "string" ? state.titleText : "",
    isDungeonReady: state?.isDungeonReady === true,
  };
}
