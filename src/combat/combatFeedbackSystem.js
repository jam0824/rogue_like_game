const POPUP_LIFETIME_SEC = 0.45;
const POPUP_RISE_SPEED_PX_PER_SEC = 28;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function spawnDamagePopupsFromEvents(events, nowSeq = 0) {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  const popups = [];
  let eventIndex = 0;

  for (const event of events) {
    if (!event || event.kind !== "damage") {
      continue;
    }

    const damageValue = Math.max(0, Math.round(toFiniteNumber(event.damage, 0)));
    if (damageValue <= 0) {
      continue;
    }

    popups.push({
      id: `popup-${nowSeq}-${eventIndex}`,
      value: damageValue,
      isCritical: event.isCritical === true,
      text: "",
      textKey: "",
      x: toFiniteNumber(event.worldX, 0),
      y: toFiniteNumber(event.worldY, 0),
      targetType: event.targetType === "player" ? "player" : "enemy",
      ageSec: 0,
      lifetimeSec: POPUP_LIFETIME_SEC,
      riseSpeedPxPerSec: POPUP_RISE_SPEED_PX_PER_SEC,
      fillStyle: "",
      strokeStyle: "",
      alpha: 1,
    });

    eventIndex += 1;
  }

  return popups;
}

export function createFloatingTextPopup({
  id,
  text,
  textKey = "",
  x,
  y,
  lifetimeSec = 0.7,
  riseSpeedPxPerSec = 24,
  fillStyle = "#ffffff",
  strokeStyle = "#000000",
} = {}) {
  return {
    id: typeof id === "string" && id.length > 0 ? id : `popup-text-${Date.now()}`,
    value: 0,
    isCritical: false,
    text: typeof text === "string" ? text : "",
    textKey: typeof textKey === "string" ? textKey : "",
    x: toFiniteNumber(x, 0),
    y: toFiniteNumber(y, 0),
    targetType: "enemy",
    ageSec: 0,
    lifetimeSec: Math.max(0.01, toFiniteNumber(lifetimeSec, 0.7)),
    riseSpeedPxPerSec: Math.max(0, toFiniteNumber(riseSpeedPxPerSec, 24)),
    fillStyle: typeof fillStyle === "string" ? fillStyle : "#ffffff",
    strokeStyle: typeof strokeStyle === "string" ? strokeStyle : "#000000",
    alpha: 1,
  };
}

export function updateDamagePopups(popups, dt) {
  if (!Array.isArray(popups) || popups.length === 0) {
    return [];
  }

  if (!Number.isFinite(dt) || dt <= 0) {
    return popups.slice();
  }

  const next = [];

  for (const popup of popups) {
    const lifetimeSec = Math.max(0.01, toFiniteNumber(popup.lifetimeSec, POPUP_LIFETIME_SEC));
    const riseSpeedPxPerSec = Math.max(0, toFiniteNumber(popup.riseSpeedPxPerSec, POPUP_RISE_SPEED_PX_PER_SEC));
    const ageSec = Math.max(0, toFiniteNumber(popup.ageSec, 0) + dt);
    if (ageSec >= lifetimeSec) {
      continue;
    }

    const alpha = clamp(1 - ageSec / lifetimeSec, 0, 1);

    next.push({
      id: popup.id,
      value: popup.value,
      isCritical: popup.isCritical === true,
      text: typeof popup.text === "string" ? popup.text : "",
      textKey: typeof popup.textKey === "string" ? popup.textKey : "",
      x: toFiniteNumber(popup.x, 0),
      y: toFiniteNumber(popup.y, 0) - riseSpeedPxPerSec * dt,
      targetType: popup.targetType === "player" ? "player" : "enemy",
      ageSec,
      lifetimeSec,
      riseSpeedPxPerSec,
      fillStyle: typeof popup.fillStyle === "string" ? popup.fillStyle : "",
      strokeStyle: typeof popup.strokeStyle === "string" ? popup.strokeStyle : "",
      alpha,
    });
  }

  return next;
}
