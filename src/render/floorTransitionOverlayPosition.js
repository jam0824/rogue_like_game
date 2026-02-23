import { resolveGameViewScale } from "./gameViewScale.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNonNegativeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function toFiniteNumberOrNull(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

/**
 * @param {{canvasWidth:number,canvasHeight:number,scrollLeft:number,scrollTop:number,viewportWidth:number,viewportHeight:number,scale:number}} params
 */
export function resolveOverlayCenterWorld({
  canvasWidth,
  canvasHeight,
  scrollLeft,
  scrollTop,
  viewportWidth,
  viewportHeight,
  scale,
}) {
  const worldWidth = toNonNegativeNumber(canvasWidth);
  const worldHeight = toNonNegativeNumber(canvasHeight);
  const fallbackX = worldWidth / 2;
  const fallbackY = worldHeight / 2;

  const normalizedScale = resolveGameViewScale(scale);
  const left = toFiniteNumberOrNull(scrollLeft);
  const top = toFiniteNumberOrNull(scrollTop);
  const viewWidth = toFiniteNumberOrNull(viewportWidth);
  const viewHeight = toFiniteNumberOrNull(viewportHeight);

  if (
    !Number.isFinite(normalizedScale) ||
    normalizedScale <= 0 ||
    left === null ||
    top === null ||
    viewWidth === null ||
    viewHeight === null
  ) {
    return { x: fallbackX, y: fallbackY };
  }

  const centerX = (left + viewWidth / 2) / normalizedScale;
  const centerY = (top + viewHeight / 2) / normalizedScale;

  return {
    x: clamp(centerX, 0, worldWidth),
    y: clamp(centerY, 0, worldHeight),
  };
}
