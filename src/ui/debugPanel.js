function renderStatsList(listElement, rows) {
  listElement.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("li");
    item.className = "debug-stats-item";
    item.textContent = `${row.label}: ${row.value}`;
    listElement.appendChild(item);
  }
}

export function createDebugPanel(root, handlers) {
  const seedInput = root.querySelector("#seed-input");
  const applySeedButton = root.querySelector("#apply-seed");
  const regenerateButton = root.querySelector("#regen-random");
  const pauseToggleButton = root.querySelector("#pause-toggle");
  const showStorageButton = root.querySelector("#show-storage");
  const statsList = root.querySelector("#debug-stats");
  const storageView = root.querySelector("#debug-storage");
  const errorMessage = root.querySelector("#debug-error");

  applySeedButton.addEventListener("click", () => {
    handlers.onApplySeed(seedInput.value);
  });

  seedInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    handlers.onApplySeed(seedInput.value);
  });

  regenerateButton.addEventListener("click", () => {
    handlers.onRegenerate();
  });

  pauseToggleButton.addEventListener("click", () => {
    handlers.onTogglePause();
  });

  if (showStorageButton) {
    showStorageButton.addEventListener("click", () => {
      if (typeof handlers.onShowStorage === "function") {
        handlers.onShowStorage();
      }
    });
  }

  return {
    setSeed(seed) {
      seedInput.value = String(seed);
    },
    setPaused(paused) {
      const nextPaused = paused === true;
      pauseToggleButton.textContent = nextPaused ? "再開" : "一時停止";
      pauseToggleButton.setAttribute("aria-pressed", nextPaused ? "true" : "false");
    },
    setStats(rows) {
      renderStatsList(statsList, rows);
    },
    setStorageDump(text) {
      if (!storageView) {
        return;
      }
      if (!text) {
        storageView.textContent = "";
        storageView.hidden = true;
        return;
      }
      storageView.textContent = text;
      storageView.hidden = false;
    },
    setError(message) {
      if (!message) {
        errorMessage.textContent = "";
        errorMessage.hidden = true;
        return;
      }
      errorMessage.textContent = message;
      errorMessage.hidden = false;
    },
  };
}
