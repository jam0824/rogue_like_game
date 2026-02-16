import { describe, expect, it, vi } from "vitest";
import { createSystemHud } from "../../src/ui/systemHud.js";

function createClassList() {
  const values = new Set();
  return {
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    toggle(value, force) {
      if (force === true) {
        values.add(value);
        return true;
      }
      if (force === false) {
        values.delete(value);
        return false;
      }
      if (values.has(value)) {
        values.delete(value);
        return false;
      }
      values.add(value);
      return true;
    },
    contains(value) {
      return values.has(value);
    },
  };
}

function createElement() {
  const listeners = new Map();
  const attributes = {};
  const children = {};

  return {
    textContent: "",
    hidden: false,
    disabled: false,
    innerHTML: "",
    dataset: {},
    style: {},
    classList: createClassList(),
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    trigger(type, event = {}) {
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    querySelector(selector) {
      return children[selector] ?? null;
    },
    __setChild(selector, child) {
      children[selector] = child;
    },
  };
}

function createSlotButton() {
  const button = createElement();
  const icon = createElement();
  const qty = createElement();
  button.__setChild("[data-ui-icon]", icon);
  button.__setChild("[data-ui-qty]", qty);
  return { button, icon, qty };
}

function createWeaponSlotButton() {
  const button = createElement();
  const icon = createElement();
  button.__setChild("[data-ui-weapon-icon]", icon);
  return { button, icon };
}

function createHudRoot() {
  const hpBar = createElement();
  const hpFill = createElement();
  const hpText = createElement();
  const levelText = createElement();
  const buffList = createElement();
  const debuffList = createElement();
  const goldText = createElement();
  const bagButton = createElement();
  const inventoryOverlay = createElement();
  const inventoryWindow = createElement();
  const inventoryClose = createElement();
  const detailsIcon = createElement();
  const detailsName = createElement();
  const detailsDescription = createElement();
  const detailsEffect = createElement();
  const useButton = createElement();
  const dropButton = createElement();
  const weaponEquipButton = createElement();
  const weaponDetailsIcon = createElement();
  const weaponDetailsName = createElement();
  const weaponDetailsRarity = createElement();
  const weaponDetailsStats = createElement();
  const weaponDetailsSkills = createElement();
  const chipList = createElement();
  const chipDetailsIcon = createElement();
  const chipDetailsName = createElement();
  const chipDetailsType = createElement();
  const chipDetailsDescription = createElement();
  const weaponSkillOverlay = createElement();
  const weaponSkillClose = createElement();
  const weaponSkillWeaponIcon = createElement();
  const weaponSkillWeaponName = createElement();
  const weaponSkillHeld = createElement();
  const weaponSkillChainRow = createElement();
  const weaponSkillFormationLabel = createElement();
  const weaponSkillFormationSlot = createElement();
  const toast = createElement();

  const quickSlots = Array.from({ length: 8 }, () => createSlotButton());
  const inventorySlots = Array.from({ length: 10 }, () => createSlotButton());
  const weaponSlots = Array.from({ length: 8 }, (_, index) => {
    const slot = createWeaponSlotButton();
    slot.button.dataset.uiWeaponSlot = String(index);
    return slot;
  });
  const tabButtons = ["item", "weapon", "chip"].map((tab) => {
    const button = createElement();
    button.dataset.uiInventoryTab = tab;
    return button;
  });
  const tabPanels = ["item", "weapon", "chip"].map((tab) => {
    const panel = createElement();
    panel.dataset.uiTabPanel = tab;
    return panel;
  });

  const byId = {
    "#system-hp-bar": hpBar,
    "#system-hp-fill": hpFill,
    "#system-hp-text": hpText,
    "#system-level": levelText,
    "#system-buff-list": buffList,
    "#system-debuff-list": debuffList,
    "#system-gold": goldText,
    "#system-bag-button": bagButton,
    "#inventory-overlay": inventoryOverlay,
    "#inventory-window": inventoryWindow,
    "#inventory-close": inventoryClose,
    "#inventory-details-icon": detailsIcon,
    "#inventory-details-name": detailsName,
    "#inventory-details-description": detailsDescription,
    "#inventory-details-effect": detailsEffect,
    "#inventory-use": useButton,
    "#inventory-drop": dropButton,
    "#inventory-weapon-equip": weaponEquipButton,
    "#inventory-weapon-details-icon": weaponDetailsIcon,
    "#inventory-weapon-details-name": weaponDetailsName,
    "#inventory-weapon-details-rarity": weaponDetailsRarity,
    "#inventory-weapon-details-stats": weaponDetailsStats,
    "#inventory-weapon-details-skills": weaponDetailsSkills,
    "#inventory-chip-list": chipList,
    "#inventory-chip-details-icon": chipDetailsIcon,
    "#inventory-chip-details-name": chipDetailsName,
    "#inventory-chip-details-type": chipDetailsType,
    "#inventory-chip-details-description": chipDetailsDescription,
    "#weapon-skill-overlay": weaponSkillOverlay,
    "#weapon-skill-close": weaponSkillClose,
    "#weapon-skill-weapon-icon": weaponSkillWeaponIcon,
    "#weapon-skill-weapon-name": weaponSkillWeaponName,
    "#weapon-skill-held": weaponSkillHeld,
    "#weapon-skill-chain-row": weaponSkillChainRow,
    "#weapon-skill-formation-label": weaponSkillFormationLabel,
    "#weapon-skill-formation-slot": weaponSkillFormationSlot,
    "#system-ui-toast": toast,
  };

  const root = {
    querySelector: vi.fn((selector) => byId[selector] ?? null),
    querySelectorAll: vi.fn((selector) => {
      if (selector === "[data-ui-quick-slot]") {
        return quickSlots.map((slot) => slot.button);
      }
      if (selector === "[data-ui-inventory-slot]") {
        return inventorySlots.map((slot) => slot.button);
      }
      if (selector === "[data-ui-inventory-tab]") {
        return tabButtons;
      }
      if (selector === "[data-ui-tab-panel]") {
        return tabPanels;
      }
      if (selector === "[data-ui-weapon-slot]") {
        return weaponSlots.map((slot) => slot.button);
      }
      return [];
    }),
  };

  return {
    root,
    hpBar,
    hpFill,
    hpText,
    levelText,
    buffList,
    goldText,
    bagButton,
    inventoryOverlay,
    inventoryWindow,
    inventoryClose,
    detailsIcon,
    detailsName,
    detailsDescription,
    detailsEffect,
    useButton,
    dropButton,
    tabButtons,
    tabPanels,
    weaponSlots,
    weaponEquipButton,
    weaponSkillChainRow,
    weaponSkillFormationLabel,
    weaponSkillFormationSlot,
    toast,
    quickSlots,
    inventorySlots,
  };
}

describe("systemHud", () => {
  it("HP表示・LV・所持金を更新する", () => {
    const refs = createHudRoot();
    const hud = createSystemHud(refs.root, {});

    hud.setHud({
      hpCurrent: 80,
      hpMax: 120,
      runLevel: 4,
      gold: 1000,
      buffs: [{ id: "buff_speed", iconKey: "buff", nameKey: "buff_speed" }],
      debuffs: [],
    });

    expect(refs.hpBar.style.width).toBe("120px");
    expect(refs.hpText.textContent).toBe("80/120");
    expect(refs.levelText.textContent).toBe("LV 4");
    expect(refs.goldText.textContent).toBe("$1,000");
    expect(refs.buffList.hidden).toBe(false);
    expect(refs.buffList.innerHTML).toContain("BF");
  });

  it("クイックスロットクリックで onUseQuickSlot が呼ばれる", () => {
    const refs = createHudRoot();
    const onUseQuickSlot = vi.fn();
    const hud = createSystemHud(refs.root, { onUseQuickSlot });

    hud.setInventory({
      capacity: 10,
      items: [
        {
          id: "run_item_potion_small",
          type: "consumable",
          count: 3,
          quickSlot: 0,
          iconKey: "potion_red",
          iconImageSrc: "/graphic/item/item_herb_01.png",
          nameKey: "item_name_potion_small",
          descriptionKey: "item_desc_potion_small",
          effectKey: "item_effect_potion_small",
        },
      ],
      selectedItemId: "run_item_potion_small",
      quickSlots: [{ slot: 0, item: { id: "run_item_potion_small", count: 3, iconKey: "potion_red", nameKey: "item_name_potion_small" } }],
      isWindowOpen: false,
      toastMessage: "",
    });

    refs.quickSlots[0].button.trigger("click");
    expect(onUseQuickSlot).toHaveBeenCalledTimes(1);
    expect(onUseQuickSlot).toHaveBeenCalledWith(0);
  });

  it("道具袋・オーバーレイ・閉じるボタンで開閉ハンドラが呼ばれる", () => {
    const refs = createHudRoot();
    const onOpenInventoryWindow = vi.fn();
    const onCloseInventoryWindow = vi.fn();
    createSystemHud(refs.root, { onOpenInventoryWindow, onCloseInventoryWindow });

    refs.bagButton.trigger("click");
    refs.inventoryOverlay.trigger("click", { target: refs.inventoryOverlay });
    refs.inventoryClose.trigger("click");

    expect(onOpenInventoryWindow).toHaveBeenCalledTimes(1);
    expect(onCloseInventoryWindow).toHaveBeenCalledTimes(2);
  });

  it("タブクリックで onSelectInventoryTab が呼ばれる", () => {
    const refs = createHudRoot();
    const onSelectInventoryTab = vi.fn();
    createSystemHud(refs.root, { onSelectInventoryTab });

    refs.tabButtons[1].trigger("click");
    expect(onSelectInventoryTab).toHaveBeenCalledTimes(1);
    expect(onSelectInventoryTab).toHaveBeenCalledWith("weapon");
  });

  it("武器スロットクリックで onSelectWeaponSlot が呼ばれ、再クリックで onOpenWeaponSkillEditor が呼ばれる", () => {
    const refs = createHudRoot();
    const onSelectWeaponSlot = vi.fn();
    const onOpenWeaponSkillEditor = vi.fn();
    const hud = createSystemHud(refs.root, { onSelectWeaponSlot, onOpenWeaponSkillEditor });

    hud.setInventory({
      capacity: 10,
      items: [],
      selectedItemId: null,
      quickSlots: [],
      isWindowOpen: true,
      activeTab: "weapon",
      weapon: {
        selectedSlot: 0,
        swapTargetSlot: null,
        canEquipSwap: false,
        slots: [{ slot: 0, hasWeapon: true, weaponDefId: "weapon_sword_01", iconImageSrc: "/graphic/ui/icon/icon_weapon/icon_sword_01.png" }],
        details: null,
        skillEditor: { isOpen: false, heldSource: null, chainSlots: [], formationSlot: null },
      },
      chip: { entries: [], selectedChipKey: null, details: null },
      toastMessage: "",
    });

    refs.weaponSlots[0].button.trigger("click");
    expect(onSelectWeaponSlot).toHaveBeenCalledWith(0);
    expect(onOpenWeaponSkillEditor).toHaveBeenCalledWith(0);
  });

  it("スキルスロットクリックで onSkillSlotClick の payload が渡る", () => {
    const refs = createHudRoot();
    const onSkillSlotClick = vi.fn();
    createSystemHud(refs.root, { onSkillSlotClick });

    const eventTarget = {
      dataset: {
        uiSkillRow: "chain",
        uiSkillIndex: "2",
      },
      closest() {
        return this;
      },
    };
    refs.weaponSkillChainRow.trigger("click", { target: eventTarget });

    expect(onSkillSlotClick).toHaveBeenCalledTimes(1);
    expect(onSkillSlotClick).toHaveBeenCalledWith({ row: "chain", index: 2 });
  });

  it("スキルエディタが開いている場合、Formation 枠を描画する", () => {
    const refs = createHudRoot();
    const hud = createSystemHud(refs.root, {});

    hud.setInventory({
      capacity: 10,
      items: [],
      selectedItemId: null,
      quickSlots: [],
      isWindowOpen: true,
      activeTab: "weapon",
      weapon: {
        selectedSlot: 0,
        swapTargetSlot: null,
        canEquipSwap: false,
        slots: [{ slot: 0, hasWeapon: true, weaponDefId: "weapon_sword_01", iconImageSrc: "/graphic/ui/icon/icon_weapon/icon_sword_01.png" }],
        details: null,
        skillEditor: {
          isOpen: true,
          heldSource: null,
          chainSlots: [],
          formationSlot: {
            formationId: "formation_id_circle01",
            nameKey: "formation_name_circle",
            descriptionKey: "formation_desc_circle",
            iconImageSrc: "/graphic/ui/icon/icon_skill/icon_orbit_circle_01.png",
          },
        },
      },
      chip: { entries: [], selectedChipKey: null, details: null },
      toastMessage: "",
    });

    expect(refs.weaponSkillFormationLabel.textContent).toBe("Formation");
    expect(refs.weaponSkillFormationSlot.innerHTML).toContain("weapon-formation-slot");
    expect(refs.weaponSkillFormationSlot.innerHTML).toContain("サークル");
  });

  it("選択アイテムに応じて詳細とボタン活性を更新する", () => {
    const refs = createHudRoot();
    const hud = createSystemHud(refs.root, {});

    hud.setInventory({
      capacity: 10,
      items: [
        {
          id: "run_item_potion_small",
          type: "consumable",
          count: 3,
          quickSlot: 0,
          iconKey: "potion_red",
          iconImageSrc: "/graphic/item/item_herb_01.png",
          nameKey: "item_name_potion_small",
          descriptionKey: "item_desc_potion_small",
          effectKey: "item_effect_potion_small",
        },
      ],
      selectedItemId: "run_item_potion_small",
      quickSlots: [{ slot: 0, item: { id: "run_item_potion_small", count: 3, iconKey: "potion_red", nameKey: "item_name_potion_small" } }],
      isWindowOpen: true,
      toastMessage: "ok",
    });

    expect(refs.inventoryOverlay.hidden).toBe(false);
    expect(refs.inventoryWindow.hidden).toBe(false);
    expect(refs.detailsIcon.innerHTML).toContain("<img");
    expect(refs.detailsName.textContent).toContain("ポーション");
    expect(refs.useButton.disabled).toBe(false);
    expect(refs.dropButton.disabled).toBe(false);
    expect(refs.toast.hidden).toBe(false);

    hud.setInventory({
      capacity: 10,
      items: [],
      selectedItemId: null,
      quickSlots: [],
      isWindowOpen: false,
      toastMessage: "",
    });

    expect(refs.inventoryOverlay.hidden).toBe(true);
    expect(refs.inventoryWindow.hidden).toBe(true);
    expect(refs.quickSlots[0].icon.textContent).toBe("");
    expect(refs.inventorySlots[0].icon.textContent).toBe("");
    expect(refs.detailsIcon.textContent).toBe("");
    expect(refs.detailsDescription.textContent).toContain("選択");
    expect(refs.useButton.disabled).toBe(true);
    expect(refs.dropButton.disabled).toBe(true);
    expect(refs.toast.hidden).toBe(true);
  });
});
