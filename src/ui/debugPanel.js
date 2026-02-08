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
  const statsList = root.querySelector("#debug-stats");
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

  return {
    setSeed(seed) {
      seedInput.value = String(seed);
    },
    setStats(rows) {
      renderStatsList(statsList, rows);
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
