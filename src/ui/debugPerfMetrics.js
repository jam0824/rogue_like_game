const DEFAULT_WINDOW_MS = 1000;
const DEFAULT_PUBLISH_INTERVAL_MS = 250;
const DEFAULT_SLOW_FRAME_THRESHOLD_MS = 1000 / 60;

function toPositiveNumber(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function createEmptySnapshot() {
  return {
    fps: 0,
    frameMsAvg: 0,
    updateMsAvg: 0,
    renderMsAvg: 0,
    slowFrames: 0,
    sampleCount: 0,
  };
}

function normalizeMetric(value) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function pruneExpiredSamples(tracker, nowMs) {
  const keepFromMs = nowMs - tracker.windowMs;
  while (tracker.samples.length > 0 && tracker.samples[0].nowMs < keepFromMs) {
    tracker.samples.shift();
  }
}

function computeSnapshot(samples, slowFrameThresholdMs) {
  if (!Array.isArray(samples) || samples.length <= 0) {
    return createEmptySnapshot();
  }

  let frameMsTotal = 0;
  let updateMsTotal = 0;
  let renderMsTotal = 0;
  let slowFrames = 0;

  for (const sample of samples) {
    frameMsTotal += sample.frameMs;
    updateMsTotal += sample.updateMs;
    renderMsTotal += sample.renderMs;
    if (sample.frameMs > slowFrameThresholdMs) {
      slowFrames += 1;
    }
  }

  const sampleCount = samples.length;
  const frameMsAvg = frameMsTotal / sampleCount;
  const updateMsAvg = updateMsTotal / sampleCount;
  const renderMsAvg = renderMsTotal / sampleCount;
  const fps = frameMsAvg > 0 ? 1000 / frameMsAvg : 0;

  return {
    fps,
    frameMsAvg,
    updateMsAvg,
    renderMsAvg,
    slowFrames,
    sampleCount,
  };
}

export function createDebugPerfMetricsTracker(options = {}) {
  const windowMs = toPositiveNumber(Number(options.windowMs), DEFAULT_WINDOW_MS);
  const publishIntervalMs = toPositiveNumber(Number(options.publishIntervalMs), DEFAULT_PUBLISH_INTERVAL_MS);
  const slowFrameThresholdMs = toPositiveNumber(
    Number(options.slowFrameThresholdMs),
    DEFAULT_SLOW_FRAME_THRESHOLD_MS
  );

  return {
    windowMs,
    publishIntervalMs,
    slowFrameThresholdMs,
    samples: [],
    snapshot: createEmptySnapshot(),
    lastPublishedAtMs: Number.NEGATIVE_INFINITY,
  };
}

export function getDebugPerfSnapshot(tracker) {
  if (!tracker || typeof tracker !== "object") {
    return createEmptySnapshot();
  }
  const snapshot = tracker.snapshot ?? createEmptySnapshot();
  return { ...snapshot };
}

export function resetDebugPerfMetricsTracker(tracker) {
  if (!tracker || typeof tracker !== "object") {
    return;
  }

  tracker.samples = [];
  tracker.snapshot = createEmptySnapshot();
  tracker.lastPublishedAtMs = Number.NEGATIVE_INFINITY;
}

export function recordDebugPerfSample(tracker, sample) {
  if (!tracker || typeof tracker !== "object") {
    return false;
  }

  const nowMs = Number(sample?.nowMs);
  if (!Number.isFinite(nowMs)) {
    return false;
  }

  tracker.samples.push({
    nowMs,
    frameMs: normalizeMetric(Number(sample?.frameMs)),
    updateMs: normalizeMetric(Number(sample?.updateMs)),
    renderMs: normalizeMetric(Number(sample?.renderMs)),
  });
  pruneExpiredSamples(tracker, nowMs);

  if (nowMs - tracker.lastPublishedAtMs < tracker.publishIntervalMs) {
    return false;
  }

  tracker.snapshot = computeSnapshot(tracker.samples, tracker.slowFrameThresholdMs);
  tracker.lastPublishedAtMs = nowMs;
  return true;
}
