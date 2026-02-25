export const SCENE_TRANSITION_PHASE = {
  IDLE: "idle",
  FADE_IN: "fade_in",
  TITLE_HOLD: "title_hold",
  FADE_OUT: "fade_out",
};

const DEFAULT_DURATIONS = {
  fadeInSec: 0.35,
  titleHoldSec: 1,
  fadeOutSec: 0.35,
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
    fadeInSec: toPositiveDuration(options.fadeInSec, DEFAULT_DURATIONS.fadeInSec),
    titleHoldSec: toPositiveDuration(options.titleHoldSec, DEFAULT_DURATIONS.titleHoldSec),
    fadeOutSec: toPositiveDuration(options.fadeOutSec, DEFAULT_DURATIONS.fadeOutSec),
  };
}

function resetRuntimeState(state) {
  state.active = false;
  state.phase = SCENE_TRANSITION_PHASE.IDLE;
  state.timerSec = 0;
  state.alpha = 0;
  state.titleText = "";
  state.titleColor = "";
  state.kind = "";
  state.targetMode = "";
  state.targetFloor = null;
  state.isReady = false;
  state.didRequestLoad = false;
  state.loadToken = null;
  state.didApplyTarget = false;
}

export function createSceneTransitionState(options = {}) {
  const config = normalizeConfig(options);
  return {
    config,
    active: false,
    phase: SCENE_TRANSITION_PHASE.IDLE,
    timerSec: 0,
    alpha: 0,
    titleText: "",
    titleColor: "",
    kind: "",
    targetMode: "",
    targetFloor: null,
    isReady: false,
    didRequestLoad: false,
    loadToken: null,
    didApplyTarget: false,
  };
}

export function startSceneTransition(state, options = {}) {
  if (!state || typeof state !== "object") {
    return;
  }

  state.active = true;
  state.phase = SCENE_TRANSITION_PHASE.FADE_IN;
  state.timerSec = 0;
  state.alpha = 0;
  state.titleText = typeof options.titleText === "string" ? options.titleText : "";
  state.titleColor = typeof options.titleColor === "string" ? options.titleColor : "";
  state.kind = typeof options.kind === "string" ? options.kind : "";
  state.targetMode = typeof options.targetMode === "string" ? options.targetMode : "";
  state.targetFloor = Number.isFinite(options.targetFloor) ? Math.floor(Number(options.targetFloor)) : null;
  state.isReady = options.ready === true;
  state.didRequestLoad = false;
  state.loadToken = null;
  state.didApplyTarget = false;
}

export function markSceneTransitionReady(state) {
  if (!state || typeof state !== "object") {
    return;
  }

  state.isReady = true;
}

export function stepSceneTransition(state, dt) {
  if (!state || typeof state !== "object" || state.active !== true) {
    return;
  }

  const delta = Number.isFinite(dt) && dt > 0 ? Number(dt) : 0;
  const config = state.config ?? DEFAULT_DURATIONS;

  if (state.phase === SCENE_TRANSITION_PHASE.FADE_IN) {
    state.timerSec += delta;
    const progress = clamp(state.timerSec / toPositiveDuration(config.fadeInSec, DEFAULT_DURATIONS.fadeInSec), 0, 1);
    state.alpha = progress;
    if (progress >= 1) {
      state.phase = SCENE_TRANSITION_PHASE.TITLE_HOLD;
      state.timerSec = 0;
      state.alpha = 1;
    }
    return;
  }

  if (state.phase === SCENE_TRANSITION_PHASE.TITLE_HOLD) {
    state.timerSec += delta;
    state.alpha = 1;
    if (state.timerSec >= toPositiveDuration(config.titleHoldSec, DEFAULT_DURATIONS.titleHoldSec) && state.isReady) {
      state.phase = SCENE_TRANSITION_PHASE.FADE_OUT;
      state.timerSec = 0;
    }
    return;
  }

  if (state.phase === SCENE_TRANSITION_PHASE.FADE_OUT) {
    state.timerSec += delta;
    const progress = clamp(state.timerSec / toPositiveDuration(config.fadeOutSec, DEFAULT_DURATIONS.fadeOutSec), 0, 1);
    state.alpha = 1 - progress;
    if (progress >= 1) {
      resetRuntimeState(state);
    }
    return;
  }

  resetRuntimeState(state);
}

export function isSceneTransitionActive(state) {
  return state?.active === true;
}

export function buildSceneTransitionTextState(state) {
  return {
    active: state?.active === true,
    phase: typeof state?.phase === "string" ? state.phase : SCENE_TRANSITION_PHASE.IDLE,
    alpha: Math.round((Number(state?.alpha) || 0) * 1000) / 1000,
    titleText: typeof state?.titleText === "string" ? state.titleText : "",
    titleColor: typeof state?.titleColor === "string" ? state.titleColor : "",
    kind: typeof state?.kind === "string" ? state.kind : "",
    targetMode: typeof state?.targetMode === "string" ? state.targetMode : "",
    targetFloor: Number.isFinite(state?.targetFloor) ? Math.floor(Number(state.targetFloor)) : null,
    isReady: state?.isReady === true,
  };
}
