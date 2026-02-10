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
  const resetStorageButton = root.querySelector("#reset-storage");
  const damagePreviewToggleButton = root.querySelector("#damage-preview-toggle");
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

  if (resetStorageButton) {
    resetStorageButton.addEventListener("click", () => {
      if (typeof handlers.onResetStorage === "function") {
        handlers.onResetStorage();
      }
    });
  }

  if (damagePreviewToggleButton) {
    damagePreviewToggleButton.addEventListener("click", () => {
      if (typeof handlers.onToggleDamagePreview === "function") {
        handlers.onToggleDamagePreview();
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
    setDamagePreviewOnly(enabled) {
      if (!damagePreviewToggleButton) {
        return;
      }

      const nextEnabled = enabled === true;
      damagePreviewToggleButton.textContent = nextEnabled ? "被ダメ無効(演出のみ)" : "被ダメ有効";
      damagePreviewToggleButton.setAttribute("aria-pressed", nextEnabled ? "true" : "false");
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
