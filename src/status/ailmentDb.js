export const AILMENT_DB = {
  bleed: {
    maxStacks: 8,
    durationPerStack: 6,
    dotCoef: 0.07,
    isDot: true,
    isCC: false,
  },
  poison: {
    maxStacks: 12,
    durationPerStack: 8,
    dotCoef: 0.05,
    isDot: true,
    isCC: false,
  },
  burn: {
    maxStacks: 10,
    durationPerStack: 5,
    dotCoef: 0.06,
    isDot: true,
    isCC: false,
  },
  chill: {
    maxStacks: 6,
    durationPerStack: 6,
    isDot: false,
    isCC: false,
    moveSlowPerStack: 0.06,
    moveSlowCap: 0.40,
    atkSpdSlowPerStack: 0.04,
    atkSpdSlowCap: 0.30,
    escalateThreshold: 5,
    escalatesTo: "freeze",
  },
  shock: {
    maxStacks: 8,
    durationPerStack: 6,
    isDot: false,
    isCC: false,
    bonusDmgPerStack: 0.04,
    bonusDmgCap: 0.30,
    escalateThreshold: 6,
    escalatesTo: "paralyze",
  },
  brittle: {
    maxStacks: 6,
    durationPerStack: 5,
    isDot: false,
    isCC: false,
    damageTakenPerStack: 0.06,
    damageTakenCap: 0.30,
  },
};

export const CC_DB = {
  freeze: { durationSec: 1.2, immunityNormal: 3, immunityBoss: 6 },
  paralyze: { durationSec: 0.8, immunityNormal: 3, immunityBoss: 6 },
};

export const APPLY_MULT_MAX = 3.0;
export const APPLY_MULT_HALF = 25;

// ARC依存係数（A_APPLYと揃えた値。ARC+1につき付与量・DoTともに+2%）
export const A_APPLY = 0.02;
export const A_DOT = 0.02;
