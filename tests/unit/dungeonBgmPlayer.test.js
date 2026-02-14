import { afterEach, describe, expect, it, vi } from "vitest";
import { createDungeonBgmPlayer } from "../../src/audio/dungeonBgmPlayer.js";

function createMockAudio(playImpl = () => Promise.resolve()) {
  return {
    loop: false,
    src: "",
    currentTime: 0,
    play: vi.fn(playImpl),
    pause: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dungeonBgmPlayer", () => {
  it("playLoop が src を設定してループ再生を開始する", async () => {
    const audio = createMockAudio();
    const player = createDungeonBgmPlayer({
      createAudio: () => audio,
    });

    const result = await player.playLoop(" sounds/bgm/KIRI.mp3 ");

    expect(result).toBe(true);
    expect(audio.loop).toBe(true);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.src).toBe("sounds/bgm/KIRI.mp3");
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("同じ曲の再生要求では src と currentTime を再初期化しない", async () => {
    const audio = createMockAudio();
    const player = createDungeonBgmPlayer({
      createAudio: () => audio,
    });

    await player.playLoop("sounds/bgm/KIRI.mp3");
    audio.currentTime = 12.5;
    await player.playLoop("sounds/bgm/KIRI.mp3");

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.src).toBe("sounds/bgm/KIRI.mp3");
    expect(audio.currentTime).toBe(12.5);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("別曲に切り替えると pause -> src 更新 -> 再生を行う", async () => {
    const audio = createMockAudio();
    const player = createDungeonBgmPlayer({
      createAudio: () => audio,
    });

    await player.playLoop("sounds/bgm/KIRI.mp3");
    audio.currentTime = 4.2;

    await player.playLoop("sounds/bgm/another.mp3");

    expect(audio.pause).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe("sounds/bgm/another.mp3");
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("自動再生拒否時は retryPending で再試行できる", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const audio = createMockAudio(
      vi
        .fn()
        .mockRejectedValueOnce(new Error("NotAllowedError"))
        .mockResolvedValue(undefined)
    );
    const player = createDungeonBgmPlayer({
      createAudio: () => audio,
    });

    const first = await player.playLoop("sounds/bgm/KIRI.mp3");
    const retried = await player.retryPending();
    const afterSuccessRetry = await player.retryPending();

    expect(first).toBe(false);
    expect(retried).toBe(true);
    expect(afterSuccessRetry).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("playLoop の rejection を未処理例外にしない", async () => {
    const unhandled = [];
    const onUnhandledRejection = (error) => {
      unhandled.push(error);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const audio = createMockAudio(vi.fn().mockRejectedValue(new Error("blocked")));
      const player = createDungeonBgmPlayer({
        createAudio: () => audio,
      });

      void player.playLoop("sounds/bgm/KIRI.mp3");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("stop が再生状態を停止してリセットする", async () => {
    const audio = createMockAudio();
    const player = createDungeonBgmPlayer({
      createAudio: () => audio,
    });

    await player.playLoop("sounds/bgm/KIRI.mp3");
    audio.currentTime = 6.1;
    player.stop();
    const retried = await player.retryPending();

    expect(audio.currentTime).toBe(0);
    expect(audio.pause).toHaveBeenCalledTimes(2);
    expect(retried).toBe(false);
  });
});
