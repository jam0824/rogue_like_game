function renderStatsList(listElement, rows) {
  if (!listElement) {
    return;
  }

  listElement.innerHTML = "";
  const source = Array.isArray(rows) ? rows : [];
  for (const row of source) {
    const item = document.createElement("li");
    item.className = "debug-stats-item";
    item.textContent = `${row.label}: ${row.value}`;
    listElement.appendChild(item);
  }
}

export function createDebugPanel(root, handlers) {
  const seedInput = root.querySelector("#seed-input");
  const dungeonIdSelect = root.querySelector("#dungeon-id-select");
  const applySeedButton = root.querySelector("#apply-seed");
  const regenerateButton = root.querySelector("#regen-random");
  const pauseToggleButton = root.querySelector("#pause-toggle");
  const showStorageButton = root.querySelector("#show-storage");
  const resetStorageButton = root.querySelector("#reset-storage");
  const damagePreviewToggleButton = root.querySelector("#damage-preview-toggle");
  const togglePlayerStatsButton = root.querySelector("#toggle-player-stats");
  const statsList = root.querySelector("#debug-stats");
  const playerStatsWindow = root.querySelector("#debug-player-stats-window");
  const playerStatsList = root.querySelector("#debug-player-stats");
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

  if (togglePlayerStatsButton) {
    togglePlayerStatsButton.addEventListener("click", () => {
      if (typeof handlers.onTogglePlayerStats === "function") {
        handlers.onTogglePlayerStats();
      }
    });
  }

  if (dungeonIdSelect) {
    dungeonIdSelect.addEventListener("change", () => {
      if (typeof handlers.onDungeonIdChange === "function") {
        handlers.onDungeonIdChange(dungeonIdSelect.value);
      }
    });
  }

  return {
    setSeed(seed) {
      seedInput.value = String(seed);
    },
    setDungeonOptions(options, selectedId) {
      if (!dungeonIdSelect) {
        return;
      }

      dungeonIdSelect.innerHTML = "";
      const source = Array.isArray(options) ? options : [];
      for (const optionDef of source) {
        if (!optionDef || typeof optionDef.id !== "string" || optionDef.id.length <= 0) {
          continue;
        }

        const option = document.createElement("option");
        option.value = optionDef.id;
        option.textContent = optionDef.label ?? optionDef.id;
        dungeonIdSelect.appendChild(option);
      }

      if (typeof selectedId === "string" && selectedId.length > 0) {
        dungeonIdSelect.value = selectedId;
      }
    },
    setDungeonId(dungeonId) {
      if (!dungeonIdSelect) {
        return;
      }
      dungeonIdSelect.value = String(dungeonId);
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
    setPlayerStatsWindowOpen(open) {
      const isOpen = open === true;
      if (togglePlayerStatsButton) {
        togglePlayerStatsButton.textContent = isOpen ? "ステータス非表示" : "ステータス表示";
        togglePlayerStatsButton.setAttribute("aria-pressed", isOpen ? "true" : "false");
      }
      if (playerStatsWindow) {
        playerStatsWindow.hidden = !isOpen;
      }
    },
    setPlayerStats(rows) {
      renderStatsList(playerStatsList, rows);
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
