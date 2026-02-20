import { describe, expect, it } from "vitest";
import {
  createDebugPerfMetricsTracker,
  getDebugPerfSnapshot,
  recordDebugPerfSample,
} from "../../src/ui/debugPerfMetrics.js";

describe("debugPerfMetrics", () => {
  it("60fps 相当の入力では fps が約 60 で slow frame が 0 になる", () => {
    const frameMs = 1000 / 60;
    const tracker = createDebugPerfMetricsTracker({
      windowMs: 1000,
      publishIntervalMs: 1,
      slowFrameThresholdMs: frameMs,
    });

    for (let index = 1; index <= 60; index += 1) {
      recordDebugPerfSample(tracker, {
        nowMs: index * frameMs,
        frameMs,
        updateMs: 4,
        renderMs: 3,
      });
    }

    const snapshot = getDebugPerfSnapshot(tracker);
    expect(snapshot.sampleCount).toBe(60);
    expect(snapshot.fps).toBeCloseTo(60, 3);
    expect(snapshot.slowFrames).toBe(0);
    expect(snapshot.updateMsAvg).toBeCloseTo(4, 6);
    expect(snapshot.renderMsAvg).toBeCloseTo(3, 6);
  });

  it("slow frame が混在する場合に件数を正しく集計する", () => {
    const tracker = createDebugPerfMetricsTracker({
      windowMs: 1000,
      publishIntervalMs: 1,
      slowFrameThresholdMs: 1000 / 60,
    });

    const frames = [16, 20, 10, 30];
    let nowMs = 0;
    for (const frameMs of frames) {
      nowMs += frameMs;
      recordDebugPerfSample(tracker, {
        nowMs,
        frameMs,
        updateMs: frameMs / 2,
        renderMs: frameMs / 3,
      });
    }

    const snapshot = getDebugPerfSnapshot(tracker);
    expect(snapshot.sampleCount).toBe(frames.length);
    expect(snapshot.slowFrames).toBe(2);
    expect(snapshot.frameMsAvg).toBeCloseTo(19, 6);
    expect(snapshot.fps).toBeCloseTo(1000 / 19, 6);
  });

  it("1秒窓を超えた古いサンプルを除外する", () => {
    const tracker = createDebugPerfMetricsTracker({
      windowMs: 1000,
      publishIntervalMs: 1,
      slowFrameThresholdMs: 1000 / 60,
    });

    recordDebugPerfSample(tracker, { nowMs: 0, frameMs: 12, updateMs: 6, renderMs: 4 });
    recordDebugPerfSample(tracker, { nowMs: 500, frameMs: 14, updateMs: 7, renderMs: 3 });
    recordDebugPerfSample(tracker, { nowMs: 1001, frameMs: 16, updateMs: 8, renderMs: 2 });

    const snapshot = getDebugPerfSnapshot(tracker);
    expect(snapshot.sampleCount).toBe(2);
    expect(snapshot.frameMsAvg).toBeCloseTo(15, 6);
    expect(snapshot.updateMsAvg).toBeCloseTo(7.5, 6);
    expect(snapshot.renderMsAvg).toBeCloseTo(2.5, 6);
  });

  it("publish interval 250ms の間は snapshot を更新しない", () => {
    const tracker = createDebugPerfMetricsTracker({
      windowMs: 1000,
      publishIntervalMs: 250,
      slowFrameThresholdMs: 1000 / 60,
    });

    const publishedAt0 = recordDebugPerfSample(tracker, {
      nowMs: 0,
      frameMs: 16,
      updateMs: 6,
      renderMs: 5,
    });
    expect(publishedAt0).toBe(true);
    expect(getDebugPerfSnapshot(tracker).sampleCount).toBe(1);

    const publishedAt100 = recordDebugPerfSample(tracker, {
      nowMs: 100,
      frameMs: 20,
      updateMs: 7,
      renderMs: 4,
    });
    expect(publishedAt100).toBe(false);
    expect(getDebugPerfSnapshot(tracker).sampleCount).toBe(1);

    const publishedAt260 = recordDebugPerfSample(tracker, {
      nowMs: 260,
      frameMs: 12,
      updateMs: 5,
      renderMs: 3,
    });
    expect(publishedAt260).toBe(true);
    expect(getDebugPerfSnapshot(tracker).sampleCount).toBe(3);
  });
});
