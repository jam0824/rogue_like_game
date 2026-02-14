function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createEffectRuntime(effectDefinition, options = {}) {
  const frameCount = Math.max(1, Math.floor(toFiniteNumber(options.frameCount, 1)));

  return {
    id:
      typeof options.id === "string" && options.id.length > 0
        ? options.id
        : `effect-${effectDefinition.id}-${Date.now()}`,
    effectId: effectDefinition.id,
    x: toFiniteNumber(options.x, 0),
    y: toFiniteNumber(options.y, 0),
    frameIndex: 0,
    frameCount,
    ageSec: 0,
    animationFps: Math.max(0.0001, toFiniteNumber(effectDefinition.animationFps, 1)),
    width: Math.max(1, toFiniteNumber(effectDefinition.width, 1)),
    height: Math.max(1, toFiniteNumber(effectDefinition.height, 1)),
    animationDirection: effectDefinition.animationDirection === "vertical" ? "vertical" : "horizontal",
    scale: Math.max(0.0001, toFiniteNumber(effectDefinition.scale, 1)),
    blendMode: effectDefinition.blendMode === "add" ? "add" : "normal",
    loop: effectDefinition.loop === true,
  };
}

export function updateEffects(effects, dt) {
  if (!Array.isArray(effects) || effects.length === 0) {
    return [];
  }

  if (!Number.isFinite(dt) || dt <= 0) {
    return effects.slice();
  }

  const next = [];

  for (const effect of effects) {
    const frameCount = Math.max(1, Math.floor(toFiniteNumber(effect?.frameCount, 1)));
    const animationFps = Math.max(0.0001, toFiniteNumber(effect?.animationFps, 1));
    const ageSec = Math.max(0, toFiniteNumber(effect?.ageSec, 0) + dt);
    const elapsedFrames = Math.floor(ageSec * animationFps);
    const loop = effect?.loop === true;

    if (!loop && elapsedFrames >= frameCount) {
      continue;
    }

    const frameIndex = loop ? elapsedFrames % frameCount : clamp(elapsedFrames, 0, frameCount - 1);

    next.push({
      ...effect,
      frameCount,
      animationFps,
      ageSec,
      frameIndex,
      blendMode: effect?.blendMode === "add" ? "add" : "normal",
      scale: Math.max(0.0001, toFiniteNumber(effect?.scale, 1)),
      loop,
    });
  }

  return next;
}
