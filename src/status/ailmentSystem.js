import { AILMENT_DB, CC_DB, APPLY_MULT_MAX, APPLY_MULT_HALF, A_APPLY, A_DOT } from "./ailmentDb.js";

const MIN_DAMAGE = 1;

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toNonNegativeInt(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calcApplyMult(plus) {
  const safePlus = Math.max(0, toFiniteNumber(plus, 0));
  return 1 + APPLY_MULT_MAX * safePlus / (safePlus + APPLY_MULT_HALF);
}

/**
 * エンティティの ailments[id] フィールドをレイジー初期化して返す。
 * 不正なエンティティや未知の ailmentId の場合は null を返す。
 */
export function ensureAilmentRuntime(entity, ailmentId) {
  if (!entity || typeof entity !== "object") {
    return null;
  }

  if (!entity.ailments || typeof entity.ailments !== "object") {
    entity.ailments = {};
  }

  const def = AILMENT_DB[ailmentId];
  if (!def) {
    return null;
  }

  if (!entity.ailments[ailmentId] || typeof entity.ailments[ailmentId] !== "object") {
    const base = { stacks: 0, applyRemainder: 0, decayTimerSec: 0 };
    if (def.isDot) {
      base.dotTimerSec = 0;
      base.dotPerStack = 0;
    }
    entity.ailments[ailmentId] = base;
  }

  const state = entity.ailments[ailmentId];
  state.stacks = Math.max(0, toNonNegativeInt(state.stacks, 0));
  state.applyRemainder = Math.max(0, toFiniteNumber(state.applyRemainder, 0));
  state.decayTimerSec = Math.max(0, toFiniteNumber(state.decayTimerSec, 0));
  if (def.isDot) {
    state.dotTimerSec = Math.max(0, toFiniteNumber(state.dotTimerSec, 0));
    state.dotPerStack = Math.max(0, toFiniteNumber(state.dotPerStack, 0));
  }

  return state;
}

/**
 * 命中時の状態異常付与処理。
 * @returns {{ addedStacks: number, newStacks: number, escalated: boolean, escalatesTo: string|null }}
 */
export function applyAilmentOnHit(entity, ailmentId, applyBase, plus, arc, ailmentTakenMult, baseHitNonCrit) {
  const def = AILMENT_DB[ailmentId];
  if (!def || !entity) {
    return { addedStacks: 0, newStacks: 0, escalated: false, escalatesTo: null };
  }

  const state = ensureAilmentRuntime(entity, ailmentId);
  if (!state) {
    return { addedStacks: 0, newStacks: 0, escalated: false, escalatesTo: null };
  }

  const safeApplyBase = Math.max(0, toFiniteNumber(applyBase, 0));
  const applyMult = calcApplyMult(plus);
  const safeAilmentTakenMult = Math.max(0, toFiniteNumber(ailmentTakenMult, 1));
  const safeArc = Math.max(0, toFiniteNumber(arc, 0));
  const arcBonus = 1 + safeArc * A_APPLY;
  const apply = safeApplyBase * applyMult * safeAilmentTakenMult * arcBonus;

  state.applyRemainder += apply;
  const addStacksRaw = Math.floor(state.applyRemainder);
  const addStacks = Math.max(0, addStacksRaw);
  state.applyRemainder = Math.max(0, state.applyRemainder - addStacks);

  if (addStacks <= 0) {
    return { addedStacks: 0, newStacks: state.stacks, escalated: false, escalatesTo: null };
  }

  const previousStacks = state.stacks;
  const nextStacks = clamp(previousStacks + addStacks, 0, def.maxStacks);
  const addedStacks = Math.max(0, nextStacks - previousStacks);

  if (addedStacks <= 0) {
    return { addedStacks: 0, newStacks: state.stacks, escalated: false, escalatesTo: null };
  }

  state.stacks = nextStacks;

  // durationMult を decayTimer リセット値に乗算（仕様決定事項）
  const durationMult = Math.max(0, toFiniteNumber(entity.durationMult, 1));
  state.decayTimerSec = def.durationPerStack * durationMult;

  if (def.isDot) {
    const safeBaseHitNonCrit = Math.max(0, toFiniteNumber(baseHitNonCrit, 0));
    const addedDotPerStack = safeBaseHitNonCrit * def.dotCoef * (1 + safeArc * A_DOT);
    const weightedTotal = state.dotPerStack * previousStacks + addedDotPerStack * addedStacks;
    state.dotPerStack = nextStacks > 0 ? weightedTotal / nextStacks : 0;
  }

  // 昇格チェック
  let escalated = false;
  let escalatesTo = null;
  if (def.escalateThreshold != null && def.escalatesTo && nextStacks >= def.escalateThreshold) {
    escalated = true;
    escalatesTo = def.escalatesTo;
  }

  return { addedStacks, newStacks: nextStacks, escalated, escalatesTo };
}

/**
 * 毎フレーム呼び出す減衰・DoTティック処理。
 * DoTダメージ発生時に onDot(ailmentId, damage) コールバックを呼ぶ。
 */
export function tickAilments(entity, dt, onDot) {
  if (!entity || !entity.ailments || !Number.isFinite(dt) || dt <= 0) {
    return;
  }

  for (const ailmentId of Object.keys(entity.ailments)) {
    const def = AILMENT_DB[ailmentId];
    if (!def) {
      continue;
    }

    const state = entity.ailments[ailmentId];
    if (!state || state.stacks <= 0) {
      if (state) {
        state.decayTimerSec = 0;
        if (def.isDot) {
          state.dotTimerSec = 0;
        }
      }
      continue;
    }

    // スタック減衰
    state.decayTimerSec -= dt;
    while (state.decayTimerSec <= 0 && state.stacks > 0) {
      state.stacks -= 1;
      if (state.stacks > 0) {
        state.decayTimerSec += def.durationPerStack;
      } else {
        state.stacks = 0;
        state.decayTimerSec = 0;
        if (def.isDot) {
          state.dotTimerSec = 0;
          state.dotPerStack = 0;
        }
        break;
      }
    }

    if (state.stacks <= 0) {
      continue;
    }

    // DoTティック（1秒ごと）
    if (def.isDot && typeof onDot === "function") {
      state.dotTimerSec += dt;
      let safetyCounter = 0;
      while (state.dotTimerSec >= 1 && state.stacks > 0 && safetyCounter < 100) {
        state.dotTimerSec -= 1;
        safetyCounter += 1;
        const dotDamage = Math.max(MIN_DAMAGE, Math.round(Math.max(0, state.dotPerStack) * state.stacks));
        onDot(ailmentId, dotDamage);
      }
    }
  }
}

/**
 * エンティティの ccState フィールドをレイジー初期化する。
 */
export function ensureCcRuntime(entity) {
  if (!entity || typeof entity !== "object") {
    return;
  }

  if (!entity.ccState || typeof entity.ccState !== "object") {
    entity.ccState = { id: null, timerSec: 0, immunitySec: 0, pendingImmunitySec: 0 };
  }
}

/**
 * エンティティに CC を付与する。CC免疫中は無視する。
 * CC終了後に immunitySec 秒の免疫が付く。
 */
export function applyCcToEntity(entity, ccId, durationSec, immunitySec) {
  if (!entity || !ccId) {
    return;
  }

  ensureCcRuntime(entity);

  if (isEntityCcImmune(entity)) {
    return;
  }

  entity.ccState.id = ccId;
  entity.ccState.timerSec = Math.max(0, toFiniteNumber(durationSec, 0));
  entity.ccState.pendingImmunitySec = Math.max(0, toFiniteNumber(immunitySec, 0));
}

/**
 * CC持続・免疫タイマーを更新する。
 * @returns {boolean} 現在 CC 中なら true
 */
export function tickCcState(entity, dt) {
  if (!entity?.ccState || !Number.isFinite(dt) || dt <= 0) {
    return false;
  }

  const cc = entity.ccState;

  if (cc.immunitySec > 0) {
    cc.immunitySec = Math.max(0, cc.immunitySec - dt);
  }

  if (cc.id !== null && cc.timerSec > 0) {
    cc.timerSec -= dt;
    if (cc.timerSec <= 0) {
      cc.timerSec = 0;
      cc.immunitySec = Math.max(0, toFiniteNumber(cc.pendingImmunitySec, 0));
      cc.pendingImmunitySec = 0;
      cc.id = null;
    } else {
      return true;
    }
  }

  return false;
}

/**
 * エンティティが CC 免疫中か判定する。
 */
export function isEntityCcImmune(entity) {
  if (!entity?.ccState) {
    return false;
  }
  return entity.ccState.immunitySec > 0;
}

/**
 * 冷却による移動速度乗数を返す（1 = 減衰なし）。
 */
export function getChillSpeedMult(entity) {
  const def = AILMENT_DB.chill;
  const stacks = entity?.ailments?.chill?.stacks ?? 0;
  if (stacks <= 0) {
    return 1;
  }
  const slow = clamp(stacks * def.moveSlowPerStack, 0, def.moveSlowCap);
  return 1 - slow;
}

/**
 * 脆化による被ダメ乗数を返す（1 = 増幅なし）。
 */
export function getBrittleDamageTakenMult(entity) {
  const def = AILMENT_DB.brittle;
  const stacks = entity?.ailments?.brittle?.stacks ?? 0;
  if (stacks <= 0) {
    return 1;
  }
  const bonus = clamp(stacks * def.damageTakenPerStack, 0, def.damageTakenCap);
  return 1 + bonus;
}

/**
 * 感電による雷ヒット追加ダメ乗数を返す（1 = 追加なし）。
 */
export function getShockBonusDmgMult(entity) {
  const def = AILMENT_DB.shock;
  const stacks = entity?.ailments?.shock?.stacks ?? 0;
  if (stacks <= 0) {
    return 1;
  }
  const bonus = clamp(stacks * def.bonusDmgPerStack, 0, def.bonusDmgCap);
  return 1 + bonus;
}

/**
 * HUD表示用にアクティブな状態異常の一覧を返す。
 * @returns {{ id: string, stacks: number }[]}
 */
export function getActiveAilmentSummary(entity) {
  if (!entity?.ailments) {
    return [];
  }

  const result = [];
  for (const [id, state] of Object.entries(entity.ailments)) {
    if (state && state.stacks > 0) {
      result.push({ id, stacks: state.stacks });
    }
  }
  return result;
}
