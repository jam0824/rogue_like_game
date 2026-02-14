import { describe, expect, it, vi } from "vitest";
import { createSoundEffectPlayer } from "../../src/audio/soundEffectPlayer.js";

function createMockAudio(playImpl = () => Promise.resolve()) {
  return {
    src: "",
    currentTime: 0,
    play: vi.fn(playImpl),
    addEventListener: vi.fn(),
  };
}

describe("soundEffectPlayer", () => {
  it("playByKey は repeat 回数ぶん再生を試みる", async () => {
    const audios = [];
    const player = createSoundEffectPlayer({
      soundEffectMap: {
        se_key_hit_sword_01: "sounds/se/sword.mp3",
      },
      createAudio: () => {
        const audio = createMockAudio();
        audios.push(audio);
        return audio;
      },
    });

    const playedCount = await player.playByKey("se_key_hit_sword_01", 3);

    expect(playedCount).toBe(3);
    expect(audios).toHaveLength(3);
    expect(audios.every((audio) => audio.src === "sounds/se/sword.mp3")).toBe(true);
  });

  it("再生失敗したSEは retryPending で再試行できる", async () => {
    let playAttempt = 0;
    const player = createSoundEffectPlayer({
      soundEffectMap: {
        se_key_open_chest: "sounds/se/open.wav",
      },
      createAudio: () =>
        createMockAudio(() => {
          playAttempt += 1;
          if (playAttempt === 1) {
            return Promise.reject(new Error("blocked"));
          }
          return Promise.resolve();
        }),
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const firstPlayedCount = await player.playByKey("se_key_open_chest", 1);
    const retryPlayedCount = await player.retryPending();
    const afterSuccessRetry = await player.retryPending();

    expect(firstPlayedCount).toBe(0);
    expect(retryPlayedCount).toBe(1);
    expect(afterSuccessRetry).toBe(0);
    expect(playAttempt).toBe(2);
  });

  it("未定義キーの再生は無音スキップする", async () => {
    const createAudio = vi.fn(() => createMockAudio());
    const player = createSoundEffectPlayer({
      soundEffectMap: {},
      createAudio,
    });

    const playedCount = await player.playByKey("se_key_not_found", 2);

    expect(playedCount).toBe(0);
    expect(createAudio).not.toHaveBeenCalled();
  });
});
