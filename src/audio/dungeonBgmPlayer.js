function isPromiseLike(value) {
  return !!value && typeof value.then === "function";
}

function normalizeSrc(src) {
  if (typeof src !== "string") {
    return "";
  }
  return src.trim();
}

export function createDungeonBgmPlayer(options = {}) {
  const createAudio =
    typeof options.createAudio === "function"
      ? options.createAudio
      : () => new Audio();

  let audio = null;
  let currentSrc = "";
  let hasPendingRetry = false;

  function ensureAudio() {
    if (audio) {
      return audio;
    }

    audio = createAudio();
    audio.loop = true;
    return audio;
  }

  function warnPlayFailure(src, error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[BGM] Failed to play "${src}": ${message}`);
  }

  function tryPlay() {
    if (!audio || !currentSrc) {
      return Promise.resolve(false);
    }

    let playResult;
    try {
      playResult = audio.play();
    } catch (error) {
      hasPendingRetry = true;
      warnPlayFailure(currentSrc, error);
      return Promise.resolve(false);
    }

    if (!isPromiseLike(playResult)) {
      hasPendingRetry = false;
      return Promise.resolve(true);
    }

    return playResult
      .then(() => {
        hasPendingRetry = false;
        return true;
      })
      .catch((error) => {
        hasPendingRetry = true;
        warnPlayFailure(currentSrc, error);
        return false;
      });
  }

  function playLoop(src) {
    const normalizedSrc = normalizeSrc(src);
    if (!normalizedSrc) {
      console.warn("[BGM] Skipped playback because src is empty.");
      stop();
      return Promise.resolve(false);
    }

    const audioElement = ensureAudio();
    audioElement.loop = true;

    if (currentSrc !== normalizedSrc) {
      audioElement.pause();
      audioElement.src = normalizedSrc;
      audioElement.currentTime = 0;
      currentSrc = normalizedSrc;
      hasPendingRetry = false;
    }

    return tryPlay();
  }

  function retryPending() {
    if (!hasPendingRetry) {
      return Promise.resolve(false);
    }
    return tryPlay();
  }

  function stop() {
    hasPendingRetry = false;
    currentSrc = "";
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }

  return {
    playLoop,
    retryPending,
    stop,
  };
}
