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

function queryElement(root, selector) {
  if (root && typeof root.querySelector === "function") {
    const local = root.querySelector(selector);
    if (local) {
      return local;
    }
  }

  if (typeof document !== "undefined" && typeof document.querySelector === "function") {
    return document.querySelector(selector);
  }

  return null;
}

export function createDebugPanel(root, handlers) {
  const seedInput = root.querySelector("#seed-input");
  const dungeonIdSelect = root.querySelector("#dungeon-id-select");
  const applySeedButton = root.querySelector("#apply-seed");
  const regenerateButton = root.querySelector("#regen-random");
  const pauseToggleButton = root.querySelector("#pause-toggle");
  const goSurfaceButton = root.querySelector("#go-surface");
  const showStorageButton = root.querySelector("#show-storage");
  const resetStorageButton = root.querySelector("#reset-storage");
  const damagePreviewToggleButton = root.querySelector("#damage-preview-toggle");
  const togglePlayerStatsButton = root.querySelector("#toggle-player-stats");
  const statsList = root.querySelector("#debug-stats");
  const detailWindow = queryElement(root, "#debug-detail-window");
  const detailTitle = queryElement(root, "#debug-detail-title");
  const detailCloseButton = queryElement(root, "#debug-detail-close");
  const playerStatsList = queryElement(root, "#debug-player-stats");
  const storageView = queryElement(root, "#debug-storage");
  const errorMessage = root.querySelector("#debug-error");
  let detailMode = "none";

  function setDetailMode(mode) {
    const nextMode = mode === "storage" || mode === "playerStats" ? mode : "none";
    detailMode = nextMode;

    if (detailWindow) {
      detailWindow.hidden = nextMode === "none";
    }

    if (detailTitle) {
      if (nextMode === "storage") {
        detailTitle.textContent = "Storage";
      } else if (nextMode === "playerStats") {
        detailTitle.textContent = "Player Stats";
      } else {
        detailTitle.textContent = "Debug Detail";
      }
    }

    if (playerStatsList) {
      playerStatsList.hidden = nextMode !== "playerStats";
    }

    if (storageView) {
      storageView.hidden = nextMode !== "storage";
    }
  }

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

  if (goSurfaceButton) {
    goSurfaceButton.addEventListener("click", () => {
      if (typeof handlers.onGoSurface === "function") {
        handlers.onGoSurface();
      }
    });
  }

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
      if (typeof handlers.onShowPlayerStats === "function") {
        handlers.onShowPlayerStats();
      }
    });
  }

  if (detailCloseButton) {
    detailCloseButton.addEventListener("click", () => {
      if (typeof handlers.onCloseDetailWindow === "function") {
        handlers.onCloseDetailWindow();
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
      setDetailMode(isOpen ? "playerStats" : "none");
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
        if (detailMode === "storage") {
          setDetailMode("none");
        }
        return;
      }
      storageView.textContent = text;
      setDetailMode("storage");
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
