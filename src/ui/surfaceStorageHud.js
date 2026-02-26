function setText(element, value) {
  if (!element) {
    return;
  }
  element.textContent = value;
}

function setHidden(element, hidden) {
  if (!element) {
    return;
  }
  element.hidden = hidden === true;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toNonNegativeInt(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function resolveEntryTypeLabel(type) {
  if (type === "item") {
    return "ITEM";
  }
  if (type === "weapon") {
    return "WEAPON";
  }
  if (type === "armor") {
    return "ARMOR";
  }
  if (type === "accessory") {
    return "ACCESSORY";
  }
  return "-";
}

function formatEntryCount(entry) {
  if (entry?.type !== "item") {
    return "";
  }
  return `x${Math.max(1, toNonNegativeInt(entry.count, 1))}`;
}

function formatSellPrice(entry) {
  const price = Math.max(0, toNonNegativeInt(entry?.sellPrice, 0));
  return `${price}G`;
}

function resolveIconFallbackKind(kind) {
  if (kind === "item" || kind === "weapon" || kind === "armor" || kind === "accessory") {
    return kind;
  }
  return "unknown";
}

function buildEntryAriaLabel(entry) {
  const name = typeof entry?.name === "string" && entry.name.length > 0 ? entry.name : "-";
  const typeLabel = resolveEntryTypeLabel(entry?.type);
  const countText = formatEntryCount(entry);
  const plusText = Number(entry?.plus) > 0 ? `+${toNonNegativeInt(entry.plus, 0)}` : "";
  const priceText = formatSellPrice(entry);
  return [name, typeLabel, countText, plusText, priceText].filter((part) => part.length > 0).join(" / ");
}

function buildEntryIconMarkup(entry) {
  const iconImageSrc = typeof entry?.iconImageSrc === "string" ? entry.iconImageSrc : "";
  const altText = typeof entry?.name === "string" && entry.name.length > 0 ? entry.name : resolveEntryTypeLabel(entry?.type);
  if (iconImageSrc.length > 0) {
    return `<img class="surface-storage-entry-icon-image" src="${escapeHtml(iconImageSrc)}" alt="${escapeHtml(altText)}" />`;
  }

  const kind = resolveIconFallbackKind(entry?.iconFallbackKind);
  return `<span class="surface-storage-entry-icon-placeholder" data-kind="${escapeHtml(kind)}" aria-hidden="true"></span>`;
}

function buildEntryMarkup(entry) {
  const selectedClass = entry?.isSelected ? " is-selected" : "";
  const sellClass = entry?.isSellSelected ? " is-sell-selected" : "";
  const plusText = entry?.plus > 0 ? `+${entry.plus}` : "";
  const countText = formatEntryCount(entry);
  const sellPriceText = formatSellPrice(entry);
  const ariaLabel = buildEntryAriaLabel(entry);
  return `<button type="button"
      class="surface-storage-entry${selectedClass}${sellClass}"
      data-storage-pane="${escapeHtml(entry?.pane ?? "")}"
      data-storage-index="${toNonNegativeInt(entry?.index, 0)}"
      aria-label="${escapeHtml(ariaLabel)}">
      <span class="surface-storage-entry-icon">${buildEntryIconMarkup(entry)}</span>
      ${plusText ? `<span class="surface-storage-entry-plus">${escapeHtml(plusText)}</span>` : ""}
      ${countText ? `<span class="surface-storage-entry-count">${escapeHtml(countText)}</span>` : ""}
      <span class="surface-storage-entry-price">${escapeHtml(sellPriceText)}</span>
      ${entry?.isSellSelected ? `<span class="surface-storage-entry-sell-flag">✓</span>` : ""}
    </button>`;
}

function renderEntryList(container, entries = []) {
  if (!container) {
    return;
  }
  if (!Array.isArray(entries) || entries.length <= 0) {
    container.innerHTML = `<div class="surface-storage-empty" aria-hidden="true"></div>`;
    return;
  }
  container.innerHTML = entries.map((entry) => buildEntryMarkup(entry)).join("");
}

function resolveClosestEntryButton(target) {
  if (!target || typeof target.closest !== "function") {
    if (target?.dataset?.storagePane && target?.dataset?.storageIndex) {
      return target;
    }
    return null;
  }
  return target.closest("[data-storage-pane][data-storage-index]");
}

function normalizeSortKey(sortKey) {
  if (sortKey === "name" || sortKey === "rarity") {
    return sortKey;
  }
  return "type";
}

export function createSurfaceStorageHud(root, handlers = {}) {
  const backButton = root.querySelector("#surface-storage-back");
  const goldText = root.querySelector("#surface-storage-gold");
  const runCapacityText = root.querySelector("#surface-storage-run-cap");
  const stashCapacityText = root.querySelector("#surface-storage-stash-cap");
  const tabButtons = Array.from(root.querySelectorAll("[data-storage-tab]"));
  const runList = root.querySelector("#surface-storage-run-list");
  const stashList = root.querySelector("#surface-storage-stash-list");
  const detailName = root.querySelector("#surface-storage-detail-name");
  const detailMeta = root.querySelector("#surface-storage-detail-meta");
  const detailDescription = root.querySelector("#surface-storage-detail-desc");
  const detailSellPrice = root.querySelector("#surface-storage-detail-price");
  const transferAmountInput = root.querySelector("#surface-storage-transfer-amount");
  const depositButton = root.querySelector("#surface-storage-deposit");
  const withdrawButton = root.querySelector("#surface-storage-withdraw");
  const sellModeButton = root.querySelector("#surface-storage-sell-mode");
  const sellSummary = root.querySelector("#surface-storage-sell-summary");
  const sellExecuteButton = root.querySelector("#surface-storage-sell-exec");
  const sortKeySelect = root.querySelector("#surface-storage-sort-key");
  const arrangeRunButton = root.querySelector("#surface-storage-arrange-run");
  const arrangeStashButton = root.querySelector("#surface-storage-arrange-stash");
  const upgradeStashButton = root.querySelector("#surface-storage-upgrade-stash");
  const upgradeInventoryButton = root.querySelector("#surface-storage-upgrade-inventory");
  const toast = root.querySelector("#surface-storage-toast");

  let currentSellMode = false;
  let currentSortKey = "type";

  function readTransferAmount() {
    const raw = Number(transferAmountInput?.value);
    return Math.max(1, toNonNegativeInt(raw, 1));
  }

  if (backButton) {
    backButton.addEventListener("click", () => {
      if (typeof handlers.onClose === "function") {
        handlers.onClose();
      }
    });
  }

  for (const tabButton of tabButtons) {
    tabButton.addEventListener("click", () => {
      const tab = typeof tabButton.dataset?.storageTab === "string" ? tabButton.dataset.storageTab : "all";
      if (typeof handlers.onSelectTab === "function") {
        handlers.onSelectTab(tab);
      }
    });
  }

  if (runList) {
    runList.addEventListener("click", (event) => {
      const button = resolveClosestEntryButton(event?.target);
      if (!button) {
        return;
      }
      const index = toNonNegativeInt(Number(button.dataset.storageIndex), -1);
      if (index < 0) {
        return;
      }
      const pane = button.dataset.storagePane === "stash" ? "stash" : "run";
      if (typeof handlers.onSelectEntry === "function") {
        handlers.onSelectEntry({ pane, index });
      }
      if (currentSellMode && typeof handlers.onToggleSellEntry === "function") {
        handlers.onToggleSellEntry({ pane, index });
      }
    });
  }

  if (stashList) {
    stashList.addEventListener("click", (event) => {
      const button = resolveClosestEntryButton(event?.target);
      if (!button) {
        return;
      }
      const index = toNonNegativeInt(Number(button.dataset.storageIndex), -1);
      if (index < 0) {
        return;
      }
      const pane = button.dataset.storagePane === "stash" ? "stash" : "run";
      if (typeof handlers.onSelectEntry === "function") {
        handlers.onSelectEntry({ pane, index });
      }
      if (currentSellMode && typeof handlers.onToggleSellEntry === "function") {
        handlers.onToggleSellEntry({ pane, index });
      }
    });
  }

  if (transferAmountInput) {
    transferAmountInput.addEventListener("change", () => {
      if (typeof handlers.onChangeTransferAmount === "function") {
        handlers.onChangeTransferAmount(readTransferAmount());
      }
    });
  }

  if (depositButton) {
    depositButton.addEventListener("click", () => {
      if (typeof handlers.onTransfer === "function") {
        handlers.onTransfer({ direction: "deposit", amount: readTransferAmount() });
      }
    });
  }

  if (withdrawButton) {
    withdrawButton.addEventListener("click", () => {
      if (typeof handlers.onTransfer === "function") {
        handlers.onTransfer({ direction: "withdraw", amount: readTransferAmount() });
      }
    });
  }

  if (sellModeButton) {
    sellModeButton.addEventListener("click", () => {
      if (typeof handlers.onToggleSellMode === "function") {
        handlers.onToggleSellMode();
      }
    });
  }

  if (sellExecuteButton) {
    sellExecuteButton.addEventListener("click", () => {
      if (typeof handlers.onExecuteSell === "function") {
        handlers.onExecuteSell();
      }
    });
  }

  if (sortKeySelect) {
    sortKeySelect.addEventListener("change", () => {
      currentSortKey = normalizeSortKey(sortKeySelect.value);
      if (typeof handlers.onChangeSortKey === "function") {
        handlers.onChangeSortKey(currentSortKey);
      }
    });
  }

  if (arrangeRunButton) {
    arrangeRunButton.addEventListener("click", () => {
      if (typeof handlers.onAutoArrange === "function") {
        handlers.onAutoArrange({ pane: "run", sortKey: currentSortKey });
      }
    });
  }

  if (arrangeStashButton) {
    arrangeStashButton.addEventListener("click", () => {
      if (typeof handlers.onAutoArrange === "function") {
        handlers.onAutoArrange({ pane: "stash", sortKey: currentSortKey });
      }
    });
  }

  if (upgradeStashButton) {
    upgradeStashButton.addEventListener("click", () => {
      if (typeof handlers.onPurchaseUpgrade === "function") {
        handlers.onPurchaseUpgrade("stash");
      }
    });
  }

  if (upgradeInventoryButton) {
    upgradeInventoryButton.addEventListener("click", () => {
      if (typeof handlers.onPurchaseUpgrade === "function") {
        handlers.onPurchaseUpgrade("inventory");
      }
    });
  }

  return {
    setOpen(isOpen) {
      setHidden(root, isOpen !== true);
    },

    setToast(message) {
      const text = typeof message === "string" ? message.trim() : "";
      setHidden(toast, text.length <= 0);
      setText(toast, text);
    },

    setViewModel(viewModel = {}) {
      currentSellMode = viewModel.sellMode === true;
      currentSortKey = normalizeSortKey(viewModel.sortKey);

      setText(goldText, `${Math.max(0, toNonNegativeInt(viewModel.gold, 0))}G`);
      setText(runCapacityText, `${toNonNegativeInt(viewModel.run?.used, 0)} / ${toNonNegativeInt(viewModel.run?.capacity, 0)}`);
      setText(
        stashCapacityText,
        `${toNonNegativeInt(viewModel.stash?.used, 0)} / ${toNonNegativeInt(viewModel.stash?.capacity, 0)}`
      );

      for (const tabButton of tabButtons) {
        const tab = typeof tabButton.dataset?.storageTab === "string" ? tabButton.dataset.storageTab : "all";
        if (tabButton.classList?.toggle) {
          tabButton.classList.toggle("is-active", tab === viewModel.tab);
        }
      }

      if (sortKeySelect) {
        sortKeySelect.value = currentSortKey;
      }

      renderEntryList(runList, viewModel.run?.entries);
      renderEntryList(stashList, viewModel.stash?.entries);

      if (!viewModel.selected) {
        setText(detailName, "未選択");
        setText(detailMeta, "-");
        setText(detailDescription, "アイテムを選択してください。");
        setText(detailSellPrice, "-");
      } else {
        const selected = viewModel.selected;
        const amountText = selected.type === "item" ? ` x${Math.max(1, toNonNegativeInt(selected.count, 1))}` : "";
        const identifiedText = selected.identified === false ? " / 未鑑定" : "";
        const plusText = selected.plus > 0 ? ` / +${selected.plus}` : "";
        const rarityText = selected.rarity ? ` / ${selected.rarity}` : "";
        setText(detailName, `${selected.name ?? "-"}${amountText}`);
        setText(detailMeta, `${resolveEntryTypeLabel(selected.type)}${rarityText}${plusText}${identifiedText}`);
        setText(detailDescription, selected.description ?? "-");
        setText(detailSellPrice, `${Math.max(0, toNonNegativeInt(selected.sellPrice, 0))}G`);
      }

      if (transferAmountInput) {
        transferAmountInput.max = String(Math.max(1, toNonNegativeInt(viewModel.transfer?.maxAmount, 1)));
        transferAmountInput.value = String(Math.max(1, toNonNegativeInt(viewModel.transfer?.amount, 1)));
      }
      if (depositButton) {
        depositButton.disabled = viewModel.transfer?.canDeposit !== true;
      }
      if (withdrawButton) {
        withdrawButton.disabled = viewModel.transfer?.canWithdraw !== true;
      }

      if (sellModeButton) {
        sellModeButton.textContent = currentSellMode ? "売却モードON" : "売却モードOFF";
      }
      if (sellSummary) {
        setText(
          sellSummary,
          `選択: ${toNonNegativeInt(viewModel.sell?.selectedCount, 0)} / 合計: ${toNonNegativeInt(
            viewModel.sell?.totalPrice,
            0
          )}G${viewModel.sell?.requiresConfirm ? " (要確認)" : ""}`
        );
      }
      if (sellExecuteButton) {
        sellExecuteButton.disabled = viewModel.sell?.canSell !== true;
      }

      if (upgradeStashButton) {
        const upgrade = viewModel.upgrades?.stash ?? {};
        upgradeStashButton.textContent = `保管庫拡張 (${toNonNegativeInt(upgrade.cost, 0)}G) -> ${toNonNegativeInt(
          upgrade.nextCapacity,
          0
        )}`;
        upgradeStashButton.disabled = upgrade.canAfford !== true;
      }

      if (upgradeInventoryButton) {
        const upgrade = viewModel.upgrades?.inventory ?? {};
        upgradeInventoryButton.textContent = `手持ち拡張 (${toNonNegativeInt(upgrade.cost, 0)}G) -> ${toNonNegativeInt(
          upgrade.nextCapacity,
          0
        )}`;
        upgradeInventoryButton.disabled = upgrade.canAfford !== true;
      }
    },
  };
}
