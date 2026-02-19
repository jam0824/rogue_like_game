function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNonNegativeNumber(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return 0;
  }
  return numberValue;
}

export function resolveGameViewScale(rawScale) {
  const scale = Number(rawScale);
  if (!Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  return scale;
}

export function computeCameraScroll({
  centerX,
  centerY,
  worldWidthPx,
  worldHeightPx,
  viewportWidthPx,
  viewportHeightPx,
  scale,
}) {
  const resolvedScale = resolveGameViewScale(scale);
  const worldWidth = toNonNegativeNumber(worldWidthPx) * resolvedScale;
  const worldHeight = toNonNegativeNumber(worldHeightPx) * resolvedScale;
  const viewportWidth = toNonNegativeNumber(viewportWidthPx);
  const viewportHeight = toNonNegativeNumber(viewportHeightPx);
  const targetCenterX = toNonNegativeNumber(centerX) * resolvedScale;
  const targetCenterY = toNonNegativeNumber(centerY) * resolvedScale;
  const maxLeft = Math.max(0, worldWidth - viewportWidth);
  const maxTop = Math.max(0, worldHeight - viewportHeight);

  return {
    left: clamp(targetCenterX - viewportWidth / 2, 0, maxLeft),
    top: clamp(targetCenterY - viewportHeight / 2, 0, maxTop),
  };
}
