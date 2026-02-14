function isPromiseLike(value) {
  return !!value && typeof value.then === "function";
}

function toNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function toPositiveInt(value, fallback = 1) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(Number(value)));
}

export function createSoundEffectPlayer(options = {}) {
  const createAudio =
    typeof options.createAudio === "function"
      ? options.createAudio
      : () => new Audio();

  let soundEffectMap =
    options.soundEffectMap && typeof options.soundEffectMap === "object"
      ? { ...options.soundEffectMap }
      : {};
  let pendingSources = [];
  const activeAudios = new Set();

  function setSoundEffectMap(nextMap) {
    if (!nextMap || typeof nextMap !== "object" || Array.isArray(nextMap)) {
      soundEffectMap = {};
      return;
    }

    soundEffectMap = { ...nextMap };
  }

  function resolveSourceByKey(soundKey) {
    const normalizedKey = toNonEmptyString(soundKey);
    if (!normalizedKey) {
      return "";
    }

    return toNonEmptyString(soundEffectMap[normalizedKey]);
  }

  function cleanupAudio(audioElement) {
    if (!audioElement || !activeAudios.has(audioElement)) {
      return;
    }
    activeAudios.delete(audioElement);
  }

  function trackAudio(audioElement) {
    if (!audioElement || typeof audioElement.addEventListener !== "function") {
      return;
    }

    activeAudios.add(audioElement);
    const onEnd = () => cleanupAudio(audioElement);
    audioElement.addEventListener("ended", onEnd, { once: true });
    audioElement.addEventListener("error", onEnd, { once: true });
  }

  function enqueuePendingSource(source) {
    if (!source) {
      return;
    }
    pendingSources.push(source);
  }

  function playSource(source) {
    const normalizedSource = toNonEmptyString(source);
    if (!normalizedSource) {
      return Promise.resolve(false);
    }

    let audioElement;
    try {
      audioElement = createAudio();
    } catch (error) {
      enqueuePendingSource(normalizedSource);
      console.warn(
        `[SE] Failed to create audio for "${normalizedSource}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return Promise.resolve(false);
    }

    if (!audioElement) {
      enqueuePendingSource(normalizedSource);
      return Promise.resolve(false);
    }

    audioElement.src = normalizedSource;
    audioElement.currentTime = 0;
    trackAudio(audioElement);

    let playResult;
    try {
      playResult = audioElement.play();
    } catch (error) {
      cleanupAudio(audioElement);
      enqueuePendingSource(normalizedSource);
      console.warn(
        `[SE] Failed to play "${normalizedSource}": ${error instanceof Error ? error.message : String(error)}`
      );
      return Promise.resolve(false);
    }

    if (!isPromiseLike(playResult)) {
      return Promise.resolve(true);
    }

    return playResult
      .then(() => true)
      .catch((error) => {
        cleanupAudio(audioElement);
        enqueuePendingSource(normalizedSource);
        console.warn(
          `[SE] Failed to play "${normalizedSource}": ${error instanceof Error ? error.message : String(error)}`
        );
        return false;
      });
  }

  async function playByKey(soundKey, repeat = 1) {
    const source = resolveSourceByKey(soundKey);
    if (!source) {
      return 0;
    }

    const repeatCount = toPositiveInt(repeat, 1);
    const results = await Promise.all(
      Array.from({ length: repeatCount }, () => playSource(source))
    );
    return results.filter((isPlayed) => isPlayed === true).length;
  }

  async function retryPending() {
    if (pendingSources.length <= 0) {
      return 0;
    }

    const retryTargets = pendingSources;
    pendingSources = [];
    const results = await Promise.all(retryTargets.map((source) => playSource(source)));
    return results.filter((isPlayed) => isPlayed === true).length;
  }

  return {
    setSoundEffectMap,
    playByKey,
    retryPending,
  };
}
