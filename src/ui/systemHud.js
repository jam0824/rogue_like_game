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

function setAssetIcon(element, iconImageSrc, altText, fallbackLabel = "") {
  if (!element) {
    return;
  }

  if (typeof iconImageSrc === "string" && iconImageSrc.length > 0) {
    element.innerHTML = `<img class="inventory-asset-icon-image" src="${escapeHtml(iconImageSrc)}" alt="${escapeHtml(
      altText
    )}" />`;
    return;
  }

  element.innerHTML = "";
  setText(element, fallbackLabel);
}

function setButtonItem(button, item, { selected = false, emptyLabel = "", disableWhenEmpty = true } = {}) {
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
  setText(element, "");
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

function readDatasetValue(element, keyName, fallbackAttribute) {
  if (!element) {
    return "";
  }
  if (element.dataset && typeof element.dataset[keyName] === "string") {
    return element.dataset[keyName];
  }
  if (typeof element.getAttribute === "function") {
    return element.getAttribute(fallbackAttribute) ?? "";
  }
  return "";
}

function toNonNegativeInt(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function resolveTabValue(tab) {
  if (tab === "weapon" || tab === "chip") {
    return tab;
  }
  return "item";
}

function resolveSkillSlotElement(target) {
  if (!target) {
    return null;
  }

  if (typeof target.closest === "function") {
    const closest = target.closest("[data-ui-skill-row][data-ui-skill-index]");
    if (closest) {
      return closest;
    }
  }

  if (target.dataset && typeof target.dataset.uiSkillRow === "string" && typeof target.dataset.uiSkillIndex === "string") {
    return target;
  }

  return null;
}

function buildSkillSlotPayload(element) {
  if (!element) {
    return null;
  }
  const row = readDatasetValue(element, "uiSkillRow", "data-ui-skill-row");
  const index = toNonNegativeInt(Number(readDatasetValue(element, "uiSkillIndex", "data-ui-skill-index")), -1);
  if ((row !== "chain" && row !== "orbit") || index < 0) {
    return null;
  }
  return {
    row,
    index,
  };
}

function buildSkillSlotMarkup(slot, row, heldSource) {
  const iconImageSrc = typeof slot?.iconImageSrc === "string" ? slot.iconImageSrc : "";
  const skillName = typeof slot?.name === "string" ? slot.name : tJa("ui_label_inventory_empty");
  const skillType = typeof slot?.skillType === "string" ? slot.skillType : "";
  const plus = Number.isFinite(slot?.plus) ? Math.max(0, Math.floor(Number(slot.plus))) : 0;
  const isHeldSource =
    heldSource &&
    heldSource.row === row &&
    toNonNegativeInt(heldSource.index, -1) === toNonNegativeInt(slot?.index, -1);
  const hasSkill = typeof slot?.skillId === "string" && slot.skillId.length > 0;
  const className = `weapon-skill-slot${isHeldSource ? " is-held-source" : ""}`;

  return `<button type="button"
    class="${className}"
    data-ui-skill-row="${escapeHtml(row)}"
    data-ui-skill-index="${toNonNegativeInt(slot?.index, 0)}"
    data-ui-skill-id="${escapeHtml(slot?.skillId ?? "")}"
    draggable="${hasSkill ? "true" : "false"}"
    title="${escapeHtml(`${skillName}${skillType ? ` (${skillType})` : ""}`)}">
      <span class="weapon-skill-slot-icon">${
        iconImageSrc
          ? `<img class="inventory-asset-icon-image" src="${escapeHtml(iconImageSrc)}" alt="${escapeHtml(skillName)}" />`
          : ""
      }</span>
      ${hasSkill && plus > 0 ? `<span class="weapon-skill-slot-plus">+${plus}</span>` : ""}
    </button>`;
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
  const inventoryTabButtons = Array.from(root.querySelectorAll("[data-ui-inventory-tab]"));
  const inventoryTabPanels = Array.from(root.querySelectorAll("[data-ui-tab-panel]"));

  const detailsIcon = root.querySelector("#inventory-details-icon");
  const detailsName = root.querySelector("#inventory-details-name");
  const detailsDescription = root.querySelector("#inventory-details-description");
  const detailsEffect = root.querySelector("#inventory-details-effect");
  const useButton = root.querySelector("#inventory-use");
  const dropButton = root.querySelector("#inventory-drop");

  const weaponSlotButtons = Array.from(root.querySelectorAll("[data-ui-weapon-slot]"));
  const weaponEquipButton = root.querySelector("#inventory-weapon-equip");
  const weaponDetailsIcon = root.querySelector("#inventory-weapon-details-icon");
  const weaponDetailsName = root.querySelector("#inventory-weapon-details-name");
  const weaponDetailsRarity = root.querySelector("#inventory-weapon-details-rarity");
  const weaponDetailsStats = root.querySelector("#inventory-weapon-details-stats");
  const weaponDetailsSkills = root.querySelector("#inventory-weapon-details-skills");

  const chipList = root.querySelector("#inventory-chip-list");
  const chipDetailsIcon = root.querySelector("#inventory-chip-details-icon");
  const chipDetailsName = root.querySelector("#inventory-chip-details-name");
  const chipDetailsType = root.querySelector("#inventory-chip-details-type");
  const chipDetailsDescription = root.querySelector("#inventory-chip-details-description");

  const weaponSkillOverlay = root.querySelector("#weapon-skill-overlay");
  const weaponSkillClose = root.querySelector("#weapon-skill-close");
  const weaponSkillWeaponIcon = root.querySelector("#weapon-skill-weapon-icon");
  const weaponSkillWeaponName = root.querySelector("#weapon-skill-weapon-name");
  const weaponSkillHeld = root.querySelector("#weapon-skill-held");
  const weaponSkillChainRow = root.querySelector("#weapon-skill-chain-row");
  const weaponSkillOrbitRow = root.querySelector("#weapon-skill-orbit-row");

  const toast = root.querySelector("#system-ui-toast");

  let currentSkillEditorState = {
    isOpen: false,
    heldSource: null,
  };

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

  for (const button of inventoryTabButtons) {
    button.addEventListener("click", () => {
      const tab = resolveTabValue(readDatasetValue(button, "uiInventoryTab", "data-ui-inventory-tab"));
      if (typeof handlers.onSelectInventoryTab === "function") {
        handlers.onSelectInventoryTab(tab);
      }
    });
  }

  for (const button of weaponSlotButtons) {
    button.addEventListener("click", () => {
      const slot = toNonNegativeInt(Number(readDatasetValue(button, "uiWeaponSlot", "data-ui-weapon-slot")), -1);
      if (slot < 0) {
        return;
      }
      const wasSelected = button.classList && typeof button.classList.contains === "function"
        ? button.classList.contains("is-selected")
        : false;
      if (typeof handlers.onSelectWeaponSlot === "function") {
        handlers.onSelectWeaponSlot(slot);
      }
      if (wasSelected && typeof handlers.onOpenWeaponSkillEditor === "function") {
        handlers.onOpenWeaponSkillEditor(slot);
      }
    });
  }

  if (weaponEquipButton) {
    weaponEquipButton.addEventListener("click", () => {
      if (typeof handlers.onEquipWeaponSwap === "function") {
        handlers.onEquipWeaponSwap();
      }
    });
  }

  if (chipList) {
    chipList.addEventListener("click", (event) => {
      const target = event?.target;
      if (!target) {
        return;
      }
      if (typeof target.closest !== "function") {
        return;
      }
      const chipButton = target.closest("[data-ui-chip-key]");
      if (!chipButton) {
        return;
      }
      const chipKey = readDatasetValue(chipButton, "uiChipKey", "data-ui-chip-key");
      if (typeof handlers.onSelectChipEntry === "function") {
        handlers.onSelectChipEntry(chipKey);
      }
    });
  }

  if (weaponSkillClose) {
    weaponSkillClose.addEventListener("click", () => {
      if (typeof handlers.onCloseWeaponSkillEditor === "function") {
        handlers.onCloseWeaponSkillEditor();
      }
    });
  }

  if (weaponSkillOverlay) {
    weaponSkillOverlay.addEventListener("click", (event) => {
      if (event?.target !== weaponSkillOverlay) {
        return;
      }
      if (typeof handlers.onCloseWeaponSkillEditor === "function") {
        handlers.onCloseWeaponSkillEditor();
      }
    });
  }

  for (const rowElement of [weaponSkillChainRow, weaponSkillOrbitRow]) {
    if (!rowElement) {
      continue;
    }

    rowElement.addEventListener("click", (event) => {
      const slotElement = resolveSkillSlotElement(event?.target);
      const payload = buildSkillSlotPayload(slotElement);
      if (!payload) {
        return;
      }
      if (typeof handlers.onSkillSlotClick === "function") {
        handlers.onSkillSlotClick(payload);
      }
    });

    rowElement.addEventListener("dragstart", (event) => {
      const slotElement = resolveSkillSlotElement(event?.target);
      const payload = buildSkillSlotPayload(slotElement);
      if (!payload) {
        return;
      }
      const skillId = readDatasetValue(slotElement, "uiSkillId", "data-ui-skill-id");
      if (skillId.length <= 0) {
        event.preventDefault?.();
        return;
      }
      event.dataTransfer?.setData("text/plain", JSON.stringify(payload));
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });

    rowElement.addEventListener("dragover", (event) => {
      const slotElement = resolveSkillSlotElement(event?.target);
      if (!slotElement) {
        return;
      }
      event.preventDefault?.();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });

    rowElement.addEventListener("drop", (event) => {
      const slotElement = resolveSkillSlotElement(event?.target);
      const targetPayload = buildSkillSlotPayload(slotElement);
      if (!targetPayload) {
        return;
      }
      event.preventDefault?.();
      const rawPayload = event.dataTransfer?.getData("text/plain") ?? "";
      if (!rawPayload) {
        return;
      }
      let sourcePayload = null;
      try {
        sourcePayload = JSON.parse(rawPayload);
      } catch {
        sourcePayload = null;
      }
      if (!sourcePayload || typeof handlers.onSkillSlotDrop !== "function") {
        return;
      }
      handlers.onSkillSlotDrop({
        source: sourcePayload,
        target: targetPayload,
      });
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

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("keydown", (event) => {
      if (event?.key !== "Escape") {
        return;
      }
      if (currentSkillEditorState.isOpen !== true) {
        return;
      }
      if (currentSkillEditorState.heldSource && typeof handlers.onClearHeldSkill === "function") {
        handlers.onClearHeldSkill();
        return;
      }
      if (typeof handlers.onCloseWeaponSkillEditor === "function") {
        handlers.onCloseWeaponSkillEditor();
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

    setInventory({
      capacity,
      items,
      selectedItemId,
      quickSlots,
      isWindowOpen,
      toastMessage,
      activeTab = "item",
      weapon = {},
      chip = {},
    }) {
      const normalizedItems = Array.isArray(items) ? items : [];
      const normalizedQuickSlots = Array.isArray(quickSlots) ? quickSlots : [];
      const selectedItem =
        typeof selectedItemId === "string"
          ? normalizedItems.find((item) => item.id === selectedItemId) ?? null
          : null;
      const visibleCapacity = Math.max(1, Math.floor(Number(capacity) || 10));
      const resolvedTab = resolveTabValue(activeTab);

      for (const [index, button] of quickSlotButtons.entries()) {
        const slotEntry = normalizedQuickSlots[index];
        setButtonItem(button, slotEntry?.item ?? null, {
          selected: false,
          emptyLabel: "",
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
          emptyLabel: "",
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

      for (const button of inventoryTabButtons) {
        const tab = resolveTabValue(readDatasetValue(button, "uiInventoryTab", "data-ui-inventory-tab"));
        if (button.classList && typeof button.classList.toggle === "function") {
          button.classList.toggle("is-active", tab === resolvedTab);
        }
      }

      for (const panel of inventoryTabPanels) {
        const panelTab = resolveTabValue(readDatasetValue(panel, "uiTabPanel", "data-ui-tab-panel"));
        panel.hidden = panelTab !== resolvedTab;
      }

      const weaponSlots = Array.isArray(weapon.slots) ? weapon.slots : [];
      const selectedWeaponSlot = toNonNegativeInt(weapon.selectedSlot, 0);
      const swapTargetSlot = Number.isInteger(weapon.swapTargetSlot) ? weapon.swapTargetSlot : null;
      for (const [index, button] of weaponSlotButtons.entries()) {
        const slotData = weaponSlots[index] ?? null;
        const icon = button.querySelector("[data-ui-weapon-icon]");
        const hasWeapon = slotData?.hasWeapon === true;
        const iconImageSrc = hasWeapon && typeof slotData.iconImageSrc === "string" ? slotData.iconImageSrc : "";
        if (icon) {
          if (iconImageSrc) {
            const alt = tJa(slotData.nameKey, slotData.name ?? slotData.nameKey ?? "");
            icon.innerHTML = `<img class="inventory-asset-icon-image" src="${escapeHtml(iconImageSrc)}" alt="${escapeHtml(
              alt
            )}" />`;
          } else {
            icon.innerHTML = "";
          }
        }
        button.dataset.weaponId = hasWeapon ? String(slotData.weaponDefId ?? "") : "";
        button.disabled = false;
        const label = hasWeapon
          ? tJa(slotData.nameKey, slotData.name ?? slotData.nameKey ?? "")
          : tJa("ui_label_weapon_slot_empty");
        button.setAttribute("aria-label", label);
        if (button.classList && typeof button.classList.toggle === "function") {
          button.classList.toggle("is-selected", index === selectedWeaponSlot);
          button.classList.toggle("is-swap-target", Number.isInteger(swapTargetSlot) && index === swapTargetSlot);
        }
      }

      const weaponDetails = weapon.details && typeof weapon.details === "object" ? weapon.details : null;
      if (!weaponDetails || weaponDetails.hasWeapon !== true) {
        setAssetIcon(weaponDetailsIcon, "", "", "");
        setText(weaponDetailsName, tJa("ui_label_weapon_none"));
        setText(weaponDetailsRarity, tJa("ui_label_weapon_rarity", "Rarity: -"));
        if (weaponDetailsStats) {
          weaponDetailsStats.innerHTML = "";
        }
        if (weaponDetailsSkills) {
          weaponDetailsSkills.innerHTML = "";
        }
      } else {
        const name = tJa(weaponDetails.nameKey, weaponDetails.name ?? weaponDetails.nameKey ?? "");
        setAssetIcon(weaponDetailsIcon, weaponDetails.iconImageSrc, name, "");
        setText(weaponDetailsName, name);
        setText(
          weaponDetailsRarity,
          `${tJa("ui_label_weapon_rarity_prefix", "Rarity")}: ${weaponDetails.rarityText ?? weaponDetails.rarity ?? "-"}`
        );
        if (weaponDetailsStats) {
          const stats = Array.isArray(weaponDetails.stats) ? weaponDetails.stats : [];
          weaponDetailsStats.innerHTML = stats
            .map((stat) => `<li>${escapeHtml(stat.label)}: ${escapeHtml(String(stat.value))}</li>`)
            .join("");
        }
        if (weaponDetailsSkills) {
          const skills = Array.isArray(weaponDetails.skillNames) ? weaponDetails.skillNames : [];
          weaponDetailsSkills.innerHTML = skills.map((skillName) => `<li>${escapeHtml(skillName)}</li>`).join("");
        }
      }

      if (weaponEquipButton) {
        weaponEquipButton.disabled = weapon.canEquipSwap !== true;
      }

      const chipEntries = Array.isArray(chip.entries) ? chip.entries : [];
      const selectedChipKey =
        typeof chip.selectedChipKey === "string" && chip.selectedChipKey.length > 0 ? chip.selectedChipKey : null;
      if (chipList) {
        chipList.innerHTML = chipEntries
          .map((entry) => {
            const name = tJa(entry.nameKey, entry.name ?? entry.nameKey ?? "");
            const plus = Number.isFinite(entry.plus) ? Math.max(0, Math.floor(Number(entry.plus))) : 0;
            const isSelected = selectedChipKey && selectedChipKey === entry.key;
            return `<button type="button" class="inventory-chip-entry${isSelected ? " is-selected" : ""}" data-ui-chip-key="${escapeHtml(
              entry.key
            )}" title="${escapeHtml(name)}">
              <span class="inventory-chip-entry-icon">${
                typeof entry.iconImageSrc === "string" && entry.iconImageSrc.length > 0
                  ? `<img class="inventory-asset-icon-image" src="${escapeHtml(entry.iconImageSrc)}" alt="${escapeHtml(name)}" />`
                  : ""
              }</span>
              ${plus > 0 ? `<span class="inventory-chip-entry-plus">+${plus}</span>` : ""}
            </button>`;
          })
          .join("");
      }

      const chipDetails = chip.details && typeof chip.details === "object" ? chip.details : null;
      if (!chipDetails) {
        setAssetIcon(chipDetailsIcon, "", "", "");
        setText(chipDetailsName, tJa("ui_label_chip_none"));
        setText(chipDetailsType, tJa("ui_label_chip_type", "Type: -"));
        setText(chipDetailsDescription, tJa("ui_label_chip_description_placeholder"));
      } else {
        const name = tJa(chipDetails.nameKey, chipDetails.name ?? chipDetails.nameKey ?? "");
        setAssetIcon(chipDetailsIcon, chipDetails.iconImageSrc, name, "");
        setText(chipDetailsName, name);
        setText(
          chipDetailsType,
          `${tJa("ui_label_chip_type_prefix", "Type")}: ${chipDetails.skillTypeText ?? chipDetails.skillType ?? "-"}`
        );
        setText(
          chipDetailsDescription,
          tJa(chipDetails.descriptionKey, chipDetails.description ?? chipDetails.descriptionKey ?? "")
        );
      }

      const skillEditor = weapon.skillEditor && typeof weapon.skillEditor === "object" ? weapon.skillEditor : null;
      const editorOpen = skillEditor?.isOpen === true;
      currentSkillEditorState = {
        isOpen: editorOpen,
        heldSource: skillEditor?.heldSource ?? null,
      };
      setHidden(weaponSkillOverlay, !editorOpen);
      if (editorOpen) {
        const weaponName = tJa(skillEditor.weaponNameKey, skillEditor.weaponName ?? skillEditor.weaponNameKey ?? "");
        setAssetIcon(weaponSkillWeaponIcon, skillEditor.weaponIconImageSrc, weaponName, "");
        setText(weaponSkillWeaponName, weaponName || tJa("ui_label_skill_editor_title"));
        setText(weaponSkillHeld, skillEditor.heldLabel ?? tJa("ui_label_skill_editor_holding"));

        const chainSlots = Array.isArray(skillEditor.chainSlots) ? skillEditor.chainSlots : [];
        const orbitSlots = Array.isArray(skillEditor.orbitSlots) ? skillEditor.orbitSlots : [];
        if (weaponSkillChainRow) {
          weaponSkillChainRow.innerHTML = chainSlots
            .map((slot) => buildSkillSlotMarkup(slot, "chain", skillEditor.heldSource))
            .join("");
        }
        if (weaponSkillOrbitRow) {
          weaponSkillOrbitRow.innerHTML = orbitSlots
            .map((slot) => buildSkillSlotMarkup(slot, "orbit", skillEditor.heldSource))
            .join("");
        }
      } else {
        if (weaponSkillChainRow) {
          weaponSkillChainRow.innerHTML = "";
        }
        if (weaponSkillOrbitRow) {
          weaponSkillOrbitRow.innerHTML = "";
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
