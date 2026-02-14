import { formatGold, getIconLabelForKey, tJa } from "./uiTextJa.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function setButtonItem(button, item, { selected = false, emptyLabel = "--", disableWhenEmpty = true } = {}) {
  if (!button) {
    return;
  }

  const icon = button.querySelector("[data-ui-icon]");
  const qty = button.querySelector("[data-ui-qty]");

  if (!item) {
    if (button.classList && typeof button.classList.remove === "function") {
      button.classList.remove("is-selected");
    }
    button.disabled = disableWhenEmpty;
    button.dataset.itemId = "";
    button.setAttribute("aria-label", tJa("ui_label_inventory_empty"));
    if (icon) {
      icon.innerHTML = "";
    }
    setText(icon, emptyLabel);
    setText(qty, "");
    return;
  }

  if (button.classList && typeof button.classList.toggle === "function") {
    button.classList.toggle("is-selected", selected === true);
  }

  button.disabled = false;
  button.dataset.itemId = item.id;
  button.setAttribute("aria-label", tJa(item.nameKey, item.nameKey));
  if (icon && typeof item.iconImageSrc === "string" && item.iconImageSrc.length > 0) {
    icon.innerHTML = `<img class="system-item-icon-image" src="${escapeHtml(item.iconImageSrc)}" alt="${escapeHtml(
      tJa(item.nameKey, item.nameKey)
    )}" />`;
  } else {
    if (icon) {
      icon.innerHTML = "";
    }
    setText(icon, getIconLabelForKey(item.iconKey));
  }
  setText(qty, Number(item.count) > 1 ? String(Math.floor(Number(item.count))) : "");
}

function setDetailsIcon(element, item) {
  if (!element) {
    return;
  }

  if (item && typeof item.iconImageSrc === "string" && item.iconImageSrc.length > 0) {
    const alt = tJa(item.nameKey, item.nameKey);
    element.innerHTML = `<img class="inventory-details-icon-image" src="${escapeHtml(item.iconImageSrc)}" alt="${escapeHtml(
      alt
    )}" />`;
    return;
  }

  element.innerHTML = "";
  setText(element, getIconLabelForKey(item?.iconKey ?? "empty"));
}

function resolveStatusName(status) {
  if (!status || typeof status !== "object") {
    return "";
  }

  if (typeof status.nameKey === "string" && status.nameKey.length > 0) {
    return tJa(status.nameKey, status.nameKey);
  }

  if (typeof status.id === "string" && status.id.length > 0) {
    return status.id;
  }

  return "";
}

function renderStatusIcons(container, statuses, kind) {
  if (!container) {
    return;
  }

  const icons = Array.isArray(statuses) ? statuses : [];
  if (icons.length <= 0) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = icons
    .map((status, index) => {
      const iconLabel = getIconLabelForKey(status?.iconKey ?? kind);
      const title = resolveStatusName(status);
      return `<span class="system-status-icon" data-kind="${escapeHtml(kind)}" data-index="${index}" title="${escapeHtml(
        title
      )}">${escapeHtml(iconLabel)}</span>`;
    })
    .join("");
}

export function createSystemHud(root, handlers = {}) {
  const hpBar = root.querySelector("#system-hp-bar");
  const hpFill = root.querySelector("#system-hp-fill");
  const hpText = root.querySelector("#system-hp-text");
  const levelText = root.querySelector("#system-level");
  const buffList = root.querySelector("#system-buff-list");
  const debuffList = root.querySelector("#system-debuff-list");
  const goldText = root.querySelector("#system-gold");
  const quickSlotButtons = Array.from(root.querySelectorAll("[data-ui-quick-slot]"));
  const bagButton = root.querySelector("#system-bag-button");
  const inventoryOverlay = root.querySelector("#inventory-overlay");
  const inventoryWindow = root.querySelector("#inventory-window");
  const inventoryClose = root.querySelector("#inventory-close");
  const inventorySlotButtons = Array.from(root.querySelectorAll("[data-ui-inventory-slot]"));
  const detailsIcon = root.querySelector("#inventory-details-icon");
  const detailsName = root.querySelector("#inventory-details-name");
  const detailsDescription = root.querySelector("#inventory-details-description");
  const detailsEffect = root.querySelector("#inventory-details-effect");
  const useButton = root.querySelector("#inventory-use");
  const dropButton = root.querySelector("#inventory-drop");
  const toast = root.querySelector("#system-ui-toast");

  for (const [index, button] of quickSlotButtons.entries()) {
    button.addEventListener("click", () => {
      if (typeof handlers.onUseQuickSlot === "function") {
        handlers.onUseQuickSlot(index);
      }
    });
  }

  for (const button of inventorySlotButtons) {
    button.addEventListener("click", () => {
      const itemId = typeof button.dataset?.itemId === "string" ? button.dataset.itemId : "";
      if (itemId.length <= 0) {
        return;
      }
      if (typeof handlers.onSelectInventoryItem === "function") {
        handlers.onSelectInventoryItem(itemId);
      }
    });
  }

  if (bagButton) {
    bagButton.addEventListener("click", () => {
      if (typeof handlers.onOpenInventoryWindow === "function") {
        handlers.onOpenInventoryWindow();
      }
    });
  }

  if (inventoryOverlay) {
    inventoryOverlay.addEventListener("click", (event) => {
      if (event?.target !== inventoryOverlay) {
        return;
      }
      if (typeof handlers.onCloseInventoryWindow === "function") {
        handlers.onCloseInventoryWindow();
      }
    });
  }

  if (inventoryClose) {
    inventoryClose.addEventListener("click", () => {
      if (typeof handlers.onCloseInventoryWindow === "function") {
        handlers.onCloseInventoryWindow();
      }
    });
  }

  if (useButton) {
    useButton.addEventListener("click", () => {
      if (typeof handlers.onUseSelectedItem === "function") {
        handlers.onUseSelectedItem();
      }
    });
  }

  if (dropButton) {
    dropButton.addEventListener("click", () => {
      if (typeof handlers.onDropSelectedItem === "function") {
        handlers.onDropSelectedItem();
      }
    });
  }

  return {
    setHud({ hpCurrent, hpMax, runLevel, gold, buffs = [], debuffs = [] }) {
      const maxValue = Math.max(1, Math.round(Number(hpMax) || 0));
      const currentValue = clamp(Math.round(Number(hpCurrent) || 0), 0, maxValue);
      const hpRatio = clamp(maxValue > 0 ? currentValue / maxValue : 0, 0, 1);
      const levelValue = Math.max(1, Math.round(Number(runLevel) || 1));

      if (hpBar) {
        hpBar.style.width = `${maxValue}px`;
        hpBar.setAttribute("aria-label", `HP ${currentValue}/${maxValue}`);
      }
      if (hpFill) {
        hpFill.style.width = `${Math.round(hpRatio * 100)}%`;
      }
      setText(hpText, `${currentValue}/${maxValue}`);
      setText(levelText, `LV ${levelValue}`);
      setText(goldText, formatGold(gold));
      renderStatusIcons(buffList, buffs, "buff");
      renderStatusIcons(debuffList, debuffs, "debuff");
    },

    setInventory({ capacity, items, selectedItemId, quickSlots, isWindowOpen, toastMessage }) {
      const normalizedItems = Array.isArray(items) ? items : [];
      const normalizedQuickSlots = Array.isArray(quickSlots) ? quickSlots : [];
      const selectedItem =
        typeof selectedItemId === "string"
          ? normalizedItems.find((item) => item.id === selectedItemId) ?? null
          : null;
      const visibleCapacity = Math.max(1, Math.floor(Number(capacity) || 10));

      for (const [index, button] of quickSlotButtons.entries()) {
        const slotEntry = normalizedQuickSlots[index];
        setButtonItem(button, slotEntry?.item ?? null, {
          selected: false,
          emptyLabel: String(index + 1),
          disableWhenEmpty: true,
        });
      }

      for (const [index, button] of inventorySlotButtons.entries()) {
        const visible = index < visibleCapacity;
        button.hidden = !visible;
        if (!visible) {
          continue;
        }

        const item = normalizedItems[index] ?? null;
        setButtonItem(button, item, {
          selected: item?.id === selectedItem?.id,
          emptyLabel: "--",
          disableWhenEmpty: true,
        });
      }

      if (!selectedItem) {
        setDetailsIcon(detailsIcon, null);
        setText(detailsName, tJa("ui_label_inventory_empty"));
        setText(detailsDescription, tJa("ui_label_inventory_placeholder"));
        setText(detailsEffect, tJa("ui_label_inventory_effect_placeholder"));
        if (useButton) {
          useButton.disabled = true;
        }
        if (dropButton) {
          dropButton.disabled = true;
        }
      } else {
        setDetailsIcon(detailsIcon, selectedItem);
        setText(detailsName, tJa(selectedItem.nameKey, selectedItem.nameKey));
        setText(detailsDescription, tJa(selectedItem.descriptionKey, selectedItem.descriptionKey));
        setText(detailsEffect, tJa(selectedItem.effectKey, selectedItem.effectKey));
        if (useButton) {
          useButton.disabled = false;
        }
        if (dropButton) {
          dropButton.disabled = false;
        }
      }

      setHidden(inventoryOverlay, isWindowOpen !== true);
      setHidden(inventoryWindow, isWindowOpen !== true);

      const nextToast = typeof toastMessage === "string" ? toastMessage.trim() : "";
      setHidden(toast, nextToast.length <= 0);
      setText(toast, nextToast);
    },
  };
}
