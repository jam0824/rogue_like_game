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
      x: toFiniteNumber(event.worldX, 0),
      y: toFiniteNumber(event.worldY, 0),
      ageSec: 0,
      lifetimeSec: POPUP_LIFETIME_SEC,
      alpha: 1,
    });

    eventIndex += 1;
  }

  return popups;
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
    const ageSec = Math.max(0, toFiniteNumber(popup.ageSec, 0) + dt);
    if (ageSec >= lifetimeSec) {
      continue;
    }

    const alpha = clamp(1 - ageSec / lifetimeSec, 0, 1);

    next.push({
      id: popup.id,
      value: popup.value,
      x: toFiniteNumber(popup.x, 0),
      y: toFiniteNumber(popup.y, 0) - POPUP_RISE_SPEED_PX_PER_SEC * dt,
      ageSec,
      lifetimeSec,
      alpha,
    });
  }

  return next;
}
