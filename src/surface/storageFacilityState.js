const STORAGE_TAB_ALL = "all";
const STORAGE_TABS = new Set([STORAGE_TAB_ALL, "item", "weapon", "armor", "accessory"]);
const STORAGE_PANE_RUN = "run";
const STORAGE_PANE_STASH = "stash";
const QUICK_SLOT_COUNT = 8;
const DEFAULT_ITEM_MAX_STACK = 20;
const DEFAULT_INVENTORY_CAPACITY = 10;
const DEFAULT_STASH_CAPACITY = 30;
const STASH_UPGRADE_BASE_CAPACITY = 30;
const STASH_UPGRADE_STEP = 5;
const STASH_UPGRADE_BASE_COST = 280;
const STASH_UPGRADE_GROWTH = 1.52;
const INVENTORY_UPGRADE_BASE_CAPACITY = 10;
const INVENTORY_UPGRADE_STEP = 1;
const INVENTORY_UPGRADE_BASE_COST = 180;
const INVENTORY_UPGRADE_GROWTH = 1.58;
const RARE_CONFIRM_SET = new Set(["rare", "epic", "legendary"]);
const RARITY_SORT_WEIGHT = {
  legendary: 5,
  epic: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
  normal: 1,
};
const TYPE_SORT_WEIGHT = {
  item: 0,
  weapon: 1,
  armor: 2,
  accessory: 3,
};
const SELL_BASE_PRICE = {
  weapon: 120,
  armor: 90,
  accessory: 80,
};
const SELL_PLUS_BONUS = {
  weapon: 30,
  armor: 24,
  accessory: 24,
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toNonNegativeInt(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTab(tab) {
  return STORAGE_TABS.has(tab) ? tab : STORAGE_TAB_ALL;
}

function normalizePane(pane) {
  return pane === STORAGE_PANE_STASH ? STORAGE_PANE_STASH : STORAGE_PANE_RUN;
}

function getRunSection(playerState) {
  if (!isPlainObject(playerState.run)) {
    playerState.run = {};
  }
  if (!Array.isArray(playerState.run.inventory)) {
    playerState.run.inventory = [];
  }
  return playerState.run;
}

function getBaseSection(playerState) {
  if (!isPlainObject(playerState.base)) {
    playerState.base = {};
  }
  const base = playerState.base;
  if (!isPlainObject(base.wallet)) {
    base.wallet = {};
  }
  if (!isPlainObject(base.unlocks)) {
    base.unlocks = {};
  }
  if (!isPlainObject(base.stash)) {
    base.stash = {};
  }
  if (!Array.isArray(base.stash.items)) {
    base.stash.items = [];
  }
  return base;
}

function getRunInventory(playerState) {
  return getRunSection(playerState).inventory;
}

function getStashItems(playerState) {
  return getBaseSection(playerState).stash.items;
}

function getRunCapacity(playerState) {
  const base = getBaseSection(playerState);
  return Math.max(1, toNonNegativeInt(base.unlocks.inventory_slot_max, DEFAULT_INVENTORY_CAPACITY));
}

function getStashCapacity(playerState) {
  const base = getBaseSection(playerState);
  return Math.max(0, toNonNegativeInt(base.stash.capacity, DEFAULT_STASH_CAPACITY));
}

function getWalletGold(playerState) {
  const base = getBaseSection(playerState);
  return Math.max(0, toNonNegativeInt(base.wallet.gold, 0));
}

function setWalletGold(playerState, gold) {
  const base = getBaseSection(playerState);
  base.wallet.gold = Math.max(0, toNonNegativeInt(gold, 0));
}

function getItemMaxStack(itemDefId, itemDefinitionsById) {
  const maxStack = Number(itemDefinitionsById?.[itemDefId]?.maxStack);
  if (!Number.isFinite(maxStack) || maxStack <= 0) {
    return DEFAULT_ITEM_MAX_STACK;
  }
  return Math.max(1, Math.floor(maxStack));
}

function getEntryType(entry) {
  if (!isPlainObject(entry)) {
    return "";
  }
  const type = typeof entry.type === "string" ? entry.type : "";
  return TYPE_SORT_WEIGHT[type] !== undefined ? type : "";
}

function getEntryPlus(entry) {
  if (!isPlainObject(entry)) {
    return 0;
  }
  if (entry.type === "weapon") {
    return toNonNegativeInt(entry.weapon_plus, 0);
  }
  return toNonNegativeInt(entry.plus, 0);
}

function getEntryRarity(entry) {
  if (!isPlainObject(entry)) {
    return "common";
  }
  const rarity = typeof entry.rarity === "string" ? entry.rarity.trim().toLowerCase() : "";
  return rarity.length > 0 ? rarity : "common";
}

function getEntryId(entry) {
  if (!isPlainObject(entry)) {
    return "";
  }
  if (entry.type === "item") {
    return typeof entry.item_def_id === "string" ? entry.item_def_id : "";
  }
  if (entry.type === "weapon") {
    return typeof entry.weapon_def_id === "string" ? entry.weapon_def_id : "";
  }
  if (entry.type === "armor") {
    return typeof entry.armor_def_id === "string" ? entry.armor_def_id : "";
  }
  if (entry.type === "accessory") {
    return typeof entry.accessory_def_id === "string" ? entry.accessory_def_id : "";
  }
  return "";
}

function resolveEntryIconFallbackKind(type) {
  if (type === "item" || type === "weapon" || type === "armor" || type === "accessory") {
    return type;
  }
  return "unknown";
}

function resolveEntryIconImageSrc(entry, resolveEntryIconSrc) {
  if (typeof resolveEntryIconSrc !== "function") {
    return "";
  }
  const iconImageSrc = resolveEntryIconSrc(entry);
  return typeof iconImageSrc === "string" ? iconImageSrc : "";
}

function translateLabel(t, key, fallback) {
  if (typeof t !== "function") {
    return fallback;
  }
  return t(key, fallback);
}

function resolveEntryName(entry, itemDefinitionsById, weaponDefinitionsById, t) {
  const type = getEntryType(entry);
  const identified = entry?.identified !== false;
  if (!identified && type !== "item") {
    return "???";
  }

  if (type === "item") {
    const itemDefId = getEntryId(entry);
    const definition = itemDefinitionsById?.[itemDefId];
    const nameKey = typeof definition?.nameKey === "string" ? definition.nameKey : itemDefId;
    return translateLabel(t, nameKey, nameKey);
  }

  if (type === "weapon") {
    const weaponDefId = getEntryId(entry);
    const definition = weaponDefinitionsById?.[weaponDefId];
    const nameKey = typeof definition?.nameKey === "string" ? definition.nameKey : weaponDefId;
    return translateLabel(t, nameKey, nameKey);
  }

  const fallbackId = getEntryId(entry);
  return fallbackId.length > 0 ? fallbackId : "-";
}

function resolveEntryDescription(entry, itemDefinitionsById, weaponDefinitionsById, t) {
  const type = getEntryType(entry);
  const identified = entry?.identified !== false;
  if (!identified && type !== "item") {
    return "未鑑定装備";
  }

  if (type === "item") {
    const itemDefId = getEntryId(entry);
    const definition = itemDefinitionsById?.[itemDefId];
    const descriptionKey = typeof definition?.descriptionKey === "string" ? definition.descriptionKey : "";
    if (descriptionKey.length <= 0) {
      return itemDefId;
    }
    return translateLabel(t, descriptionKey, descriptionKey);
  }

  if (type === "weapon") {
    const weaponDefId = getEntryId(entry);
    const definition = weaponDefinitionsById?.[weaponDefId];
    const descriptionKey = typeof definition?.descriptionKey === "string" ? definition.descriptionKey : "";
    if (descriptionKey.length <= 0) {
      return weaponDefId;
    }
    return translateLabel(t, descriptionKey, descriptionKey);
  }

  return getEntryId(entry);
}

function resolveItemUnitSellPrice(itemDefId, itemDefinitionsById) {
  const definition = itemDefinitionsById?.[itemDefId];
  const category = typeof definition?.category === "string" ? definition.category : "";
  const subType = typeof definition?.subType === "string" ? definition.subType : "";
  let base = category === "consumable" ? 12 : 10;
  if (subType === "heal") {
    base = 14;
  }
  return Math.max(1, Math.floor(base));
}

function computeSellPriceForEntry(entry, itemDefinitionsById) {
  const type = getEntryType(entry);
  if (!type) {
    return 0;
  }
  if (type === "item") {
    const count = Math.max(1, toNonNegativeInt(entry.count, 1));
    const unitPrice = resolveItemUnitSellPrice(entry.item_def_id, itemDefinitionsById);
    return unitPrice * count;
  }

  const rarity = getEntryRarity(entry);
  const rarityWeight = RARITY_SORT_WEIGHT[rarity] ?? 1;
  const basePrice = SELL_BASE_PRICE[type] ?? 50;
  const plus = getEntryPlus(entry);
  const plusBonus = (SELL_PLUS_BONUS[type] ?? 20) * plus;
  const identifiedMultiplier = entry.identified === false ? 0.6 : 1;
  return Math.max(1, Math.floor((basePrice * rarityWeight + plusBonus) * identifiedMultiplier));
}

function buildItemCountMap(entries) {
  const map = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (getEntryType(entry) !== "item") {
      continue;
    }
    const itemDefId = getEntryId(entry);
    const count = toNonNegativeInt(entry.count, 0);
    if (!itemDefId || count <= 0) {
      continue;
    }
    map.set(itemDefId, (map.get(itemDefId) ?? 0) + count);
  }
  return map;
}

function normalizeRunQuickslots(playerState) {
  const run = getRunSection(playerState);
  const quickslots = Array.isArray(run.quickslots) ? run.quickslots : [];
  const inventory = Array.isArray(run.inventory) ? run.inventory : [];
  const availableMap = buildItemCountMap(inventory);
  const normalized = Array.from({ length: QUICK_SLOT_COUNT }, (_, index) => {
    const itemDefId = typeof quickslots[index] === "string" ? quickslots[index] : "";
    if (!itemDefId) {
      return null;
    }
    return (availableMap.get(itemDefId) ?? 0) > 0 ? itemDefId : null;
  });
  run.quickslots = normalized;
  return normalized;
}

function listForPane(playerState, pane) {
  return pane === STORAGE_PANE_STASH ? getStashItems(playerState) : getRunInventory(playerState);
}

function capacityForPane(playerState, pane) {
  return pane === STORAGE_PANE_STASH ? getStashCapacity(playerState) : getRunCapacity(playerState);
}

function canFitItemAmount(targetEntries, targetCapacity, itemDefId, amount, itemDefinitionsById) {
  let remaining = Math.max(0, toNonNegativeInt(amount, 0));
  if (remaining <= 0) {
    return true;
  }

  const maxStack = getItemMaxStack(itemDefId, itemDefinitionsById);
  for (const targetEntry of targetEntries) {
    if (
      getEntryType(targetEntry) !== "item" ||
      typeof targetEntry.item_def_id !== "string" ||
      targetEntry.item_def_id !== itemDefId
    ) {
      continue;
    }
    const currentCount = Math.max(0, toNonNegativeInt(targetEntry.count, 0));
    if (currentCount >= maxStack) {
      continue;
    }
    const addable = Math.min(remaining, maxStack - currentCount);
    remaining -= addable;
    if (remaining <= 0) {
      return true;
    }
  }

  const freeSlots = Math.max(0, targetCapacity - targetEntries.length);
  const stacksNeeded = Math.ceil(remaining / maxStack);
  return freeSlots >= stacksNeeded;
}

function pushItemAmount(targetEntries, itemDefId, amount, itemDefinitionsById) {
  let remaining = Math.max(0, toNonNegativeInt(amount, 0));
  if (remaining <= 0) {
    return;
  }
  const maxStack = getItemMaxStack(itemDefId, itemDefinitionsById);

  for (const targetEntry of targetEntries) {
    if (
      getEntryType(targetEntry) !== "item" ||
      typeof targetEntry.item_def_id !== "string" ||
      targetEntry.item_def_id !== itemDefId
    ) {
      continue;
    }
    const currentCount = Math.max(0, toNonNegativeInt(targetEntry.count, 0));
    if (currentCount >= maxStack) {
      continue;
    }
    const addable = Math.min(remaining, maxStack - currentCount);
    targetEntry.count = currentCount + addable;
    remaining -= addable;
    if (remaining <= 0) {
      return;
    }
  }

  while (remaining > 0) {
    const stackCount = Math.min(remaining, maxStack);
    targetEntries.push({
      type: "item",
      item_def_id: itemDefId,
      count: stackCount,
    });
    remaining -= stackCount;
  }
}

function parseSelectionKey(rawKey) {
  if (typeof rawKey !== "string") {
    return null;
  }
  const [pane, indexText] = rawKey.split(":");
  if ((pane !== STORAGE_PANE_RUN && pane !== STORAGE_PANE_STASH) || !Number.isFinite(Number(indexText))) {
    return null;
  }
  return {
    pane,
    index: Math.max(0, Math.floor(Number(indexText))),
  };
}

function toSelectionKey(pane, index) {
  return `${pane}:${Math.max(0, Math.floor(index))}`;
}

function normalizeUiState(input) {
  const source = isPlainObject(input) ? input : {};
  const selectedPane = source.selectedPane === STORAGE_PANE_STASH ? STORAGE_PANE_STASH : STORAGE_PANE_RUN;
  const selectedIndex = Number.isInteger(source.selectedIndex) ? Math.max(0, source.selectedIndex) : -1;
  const transferAmount = Math.max(1, toNonNegativeInt(source.transferAmount, 1));
  const sellSelectionSource = Array.isArray(source.sellSelection) ? source.sellSelection : [];
  const sellSelection = [];
  for (const raw of sellSelectionSource) {
    if (typeof raw === "string") {
      const parsed = parseSelectionKey(raw);
      if (parsed) {
        sellSelection.push(toSelectionKey(parsed.pane, parsed.index));
      }
      continue;
    }
    if (!isPlainObject(raw)) {
      continue;
    }
    const pane = normalizePane(raw.pane);
    const index = Math.max(0, toNonNegativeInt(raw.index, 0));
    sellSelection.push(toSelectionKey(pane, index));
  }

  return {
    open: source.open === true,
    activeTab: normalizeTab(source.activeTab),
    selectedPane,
    selectedIndex,
    transferAmount,
    sellMode: source.sellMode === true,
    sellSelection: Array.from(new Set(sellSelection)),
    sortKey: typeof source.sortKey === "string" ? source.sortKey : "type",
    toastMessage: typeof source.toastMessage === "string" ? source.toastMessage : "",
  };
}

function entryMatchesTab(entry, tab) {
  if (tab === STORAGE_TAB_ALL) {
    return true;
  }
  return getEntryType(entry) === tab;
}

function buildPaneEntriesView({
  pane,
  entries,
  tab,
  selectedPane,
  selectedIndex,
  sellSelectionSet,
  itemDefinitionsById,
  weaponDefinitionsById,
  resolveEntryIconSrc,
  t,
}) {
  const rows = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entryMatchesTab(entry, tab)) {
      continue;
    }
    const type = getEntryType(entry);
    const key = toSelectionKey(pane, index);
    const iconImageSrc = resolveEntryIconImageSrc(entry, resolveEntryIconSrc);
    rows.push({
      key,
      pane,
      index,
      type,
      name: resolveEntryName(entry, itemDefinitionsById, weaponDefinitionsById, t),
      description: resolveEntryDescription(entry, itemDefinitionsById, weaponDefinitionsById, t),
      rarity: getEntryRarity(entry),
      plus: getEntryPlus(entry),
      identified: entry?.identified !== false,
      count: type === "item" ? Math.max(1, toNonNegativeInt(entry.count, 1)) : 1,
      sellPrice: computeSellPriceForEntry(entry, itemDefinitionsById),
      iconImageSrc,
      iconFallbackKind: resolveEntryIconFallbackKind(type),
      isSelected: pane === selectedPane && index === selectedIndex,
      isSellSelected: sellSelectionSet.has(key),
    });
  }
  return rows;
}

function buildSellPreview(playerState, sellSelection, itemDefinitionsById) {
  const runEntries = getRunInventory(playerState);
  const stashEntries = getStashItems(playerState);
  let totalPrice = 0;
  let selectedCount = 0;
  let requiresConfirm = false;

  for (const rawKey of sellSelection) {
    const selection = parseSelectionKey(rawKey);
    if (!selection) {
      continue;
    }
    const list = selection.pane === STORAGE_PANE_STASH ? stashEntries : runEntries;
    const entry = list[selection.index];
    if (!entry) {
      continue;
    }
    selectedCount += 1;
    totalPrice += computeSellPriceForEntry(entry, itemDefinitionsById);
    const rarity = getEntryRarity(entry);
    const plus = getEntryPlus(entry);
    if (RARE_CONFIRM_SET.has(rarity) || plus >= 7) {
      requiresConfirm = true;
    }
  }

  return {
    selectedCount,
    totalPrice: Math.max(0, Math.floor(totalPrice)),
    requiresConfirm,
  };
}

function resolveUpgradePreview(playerState, kind) {
  const gold = getWalletGold(playerState);
  if (kind === "stash") {
    const capacity = getStashCapacity(playerState);
    const level = Math.max(
      0,
      Math.floor((Math.max(STASH_UPGRADE_BASE_CAPACITY, capacity) - STASH_UPGRADE_BASE_CAPACITY) / STASH_UPGRADE_STEP)
    );
    const cost = Math.max(1, Math.floor(STASH_UPGRADE_BASE_COST * Math.pow(STASH_UPGRADE_GROWTH, level)));
    return {
      kind,
      level,
      cost,
      canAfford: gold >= cost,
      nextCapacity: capacity + STASH_UPGRADE_STEP,
      currentCapacity: capacity,
    };
  }

  const capacity = getRunCapacity(playerState);
  const level = Math.max(
    0,
    Math.floor(
      (Math.max(INVENTORY_UPGRADE_BASE_CAPACITY, capacity) - INVENTORY_UPGRADE_BASE_CAPACITY) / INVENTORY_UPGRADE_STEP
    )
  );
  const cost = Math.max(1, Math.floor(INVENTORY_UPGRADE_BASE_COST * Math.pow(INVENTORY_UPGRADE_GROWTH, level)));
  return {
    kind: "inventory",
    level,
    cost,
    canAfford: gold >= cost,
    nextCapacity: capacity + INVENTORY_UPGRADE_STEP,
    currentCapacity: capacity,
  };
}

export function createStorageFacilityUiState() {
  return {
    open: false,
    activeTab: STORAGE_TAB_ALL,
    selectedPane: STORAGE_PANE_RUN,
    selectedIndex: -1,
    transferAmount: 1,
    sellMode: false,
    sellSelection: [],
    sortKey: "type",
    toastMessage: "",
  };
}

export function buildStorageFacilityViewModel(params = {}) {
  const playerState = isPlainObject(params.playerState) ? params.playerState : { base: {}, run: {} };
  const itemDefinitionsById = isPlainObject(params.itemDefinitionsById) ? params.itemDefinitionsById : {};
  const weaponDefinitionsById = isPlainObject(params.weaponDefinitionsById) ? params.weaponDefinitionsById : {};
  const resolveEntryIconSrc = typeof params.resolveEntryIconSrc === "function" ? params.resolveEntryIconSrc : null;
  const t = typeof params.t === "function" ? params.t : null;
  const uiState = normalizeUiState(params.uiState);

  const runEntries = getRunInventory(playerState);
  const stashEntries = getStashItems(playerState);
  const sellSelectionSet = new Set(uiState.sellSelection);
  const tab = normalizeTab(uiState.activeTab);
  const isInRun = playerState.in_run !== false;
  const selectedEntry = listForPane(playerState, uiState.selectedPane)[uiState.selectedIndex] ?? null;
  const selectedType = getEntryType(selectedEntry);
  const selectedCount = selectedType === "item" ? Math.max(1, toNonNegativeInt(selectedEntry?.count, 1)) : 1;
  const transferAmount = clamp(uiState.transferAmount, 1, selectedCount);
  const sellPreview = buildSellPreview(playerState, uiState.sellSelection, itemDefinitionsById);
  const stashUpgrade = resolveUpgradePreview(playerState, "stash");
  const inventoryUpgrade = resolveUpgradePreview(playerState, "inventory");
  const canDeposit = uiState.selectedPane === STORAGE_PANE_RUN && uiState.selectedIndex >= 0 && isInRun;
  const canWithdraw = uiState.selectedPane === STORAGE_PANE_STASH && uiState.selectedIndex >= 0;

  return {
    open: uiState.open === true,
    tab,
    sellMode: uiState.sellMode === true,
    toastMessage: uiState.toastMessage,
    isInRun,
    gold: getWalletGold(playerState),
    run: {
      used: runEntries.length,
      capacity: getRunCapacity(playerState),
      entries: buildPaneEntriesView({
        pane: STORAGE_PANE_RUN,
        entries: runEntries,
        tab,
        selectedPane: uiState.selectedPane,
        selectedIndex: uiState.selectedIndex,
        sellSelectionSet,
        itemDefinitionsById,
        weaponDefinitionsById,
        resolveEntryIconSrc,
        t,
      }),
    },
    stash: {
      used: stashEntries.length,
      capacity: getStashCapacity(playerState),
      entries: buildPaneEntriesView({
        pane: STORAGE_PANE_STASH,
        entries: stashEntries,
        tab,
        selectedPane: uiState.selectedPane,
        selectedIndex: uiState.selectedIndex,
        sellSelectionSet,
        itemDefinitionsById,
        weaponDefinitionsById,
        resolveEntryIconSrc,
        t,
      }),
    },
    selected: selectedEntry
      ? {
          pane: uiState.selectedPane,
          index: uiState.selectedIndex,
          type: selectedType,
          name: resolveEntryName(selectedEntry, itemDefinitionsById, weaponDefinitionsById, t),
          description: resolveEntryDescription(selectedEntry, itemDefinitionsById, weaponDefinitionsById, t),
          count: selectedCount,
          plus: getEntryPlus(selectedEntry),
          rarity: getEntryRarity(selectedEntry),
          identified: selectedEntry.identified !== false,
          sellPrice: computeSellPriceForEntry(selectedEntry, itemDefinitionsById),
          iconImageSrc: resolveEntryIconImageSrc(selectedEntry, resolveEntryIconSrc),
          iconFallbackKind: resolveEntryIconFallbackKind(selectedType),
        }
      : null,
    transfer: {
      amount: transferAmount,
      maxAmount: selectedCount,
      canDeposit,
      canWithdraw,
    },
    sell: {
      selectedCount: sellPreview.selectedCount,
      totalPrice: sellPreview.totalPrice,
      requiresConfirm: sellPreview.requiresConfirm,
      canSell: uiState.sellMode === true && sellPreview.selectedCount > 0,
    },
    upgrades: {
      stash: stashUpgrade,
      inventory: inventoryUpgrade,
    },
    snapshot: {
      open: uiState.open === true,
      tab,
      sellMode: uiState.sellMode === true,
      capacity: {
        run: getRunCapacity(playerState),
        stash: getStashCapacity(playerState),
      },
      used: {
        run: runEntries.length,
        stash: stashEntries.length,
      },
      gold: getWalletGold(playerState),
      selected:
        uiState.selectedIndex >= 0
          ? {
              pane: uiState.selectedPane,
              index: uiState.selectedIndex,
            }
          : null,
      totalSellPrice: sellPreview.totalPrice,
    },
  };
}

export function transferStorageEntry(playerState, params = {}) {
  if (!isPlainObject(playerState)) {
    return { ok: false, reason: "invalid_state" };
  }

  const fromPane = normalizePane(params.fromPane);
  const toPane = fromPane === STORAGE_PANE_RUN ? STORAGE_PANE_STASH : STORAGE_PANE_RUN;
  const fromEntries = listForPane(playerState, fromPane);
  const toEntries = listForPane(playerState, toPane);
  const toCapacity = capacityForPane(playerState, toPane);
  const itemDefinitionsById = isPlainObject(params.itemDefinitionsById) ? params.itemDefinitionsById : {};
  const entryIndex = Math.max(0, toNonNegativeInt(params.entryIndex, -1));
  const sourceEntry = fromEntries[entryIndex];
  if (!sourceEntry) {
    return { ok: false, reason: "entry_not_found" };
  }

  const type = getEntryType(sourceEntry);
  if (!type) {
    return { ok: false, reason: "unsupported_type" };
  }

  if (type === "item") {
    const itemDefId = getEntryId(sourceEntry);
    const sourceCount = Math.max(0, toNonNegativeInt(sourceEntry.count, 0));
    const requestAmount = clamp(
      Math.max(1, toNonNegativeInt(params.amount, 1)),
      1,
      Math.max(1, sourceCount)
    );
    if (sourceCount <= 0) {
      return { ok: false, reason: "empty_item_stack" };
    }
    if (!canFitItemAmount(toEntries, toCapacity, itemDefId, requestAmount, itemDefinitionsById)) {
      return { ok: false, reason: "target_full" };
    }

    sourceEntry.count = sourceCount - requestAmount;
    if (sourceEntry.count <= 0) {
      fromEntries.splice(entryIndex, 1);
    }
    pushItemAmount(toEntries, itemDefId, requestAmount, itemDefinitionsById);
    normalizeRunQuickslots(playerState);
    return {
      ok: true,
      movedType: type,
      movedCount: requestAmount,
      fromPane,
      toPane,
    };
  }

  if (toEntries.length >= toCapacity) {
    return { ok: false, reason: "target_full" };
  }

  const [entry] = fromEntries.splice(entryIndex, 1);
  toEntries.push(entry);
  normalizeRunQuickslots(playerState);
  return {
    ok: true,
    movedType: type,
    movedCount: 1,
    fromPane,
    toPane,
  };
}

export function sellSelectedStorageEntries(playerState, params = {}) {
  if (!isPlainObject(playerState)) {
    return { ok: false, reason: "invalid_state" };
  }
  const selectionSource = Array.isArray(params.selectedEntries) ? params.selectedEntries : [];
  const itemDefinitionsById = isPlainObject(params.itemDefinitionsById) ? params.itemDefinitionsById : {};
  const deduped = new Set();
  const resolved = [];
  let totalPrice = 0;
  let requiresConfirm = false;

  for (const rawSelection of selectionSource) {
    const selection = typeof rawSelection === "string" ? parseSelectionKey(rawSelection) : rawSelection;
    if (!selection || !Number.isFinite(selection.index)) {
      continue;
    }
    const pane = normalizePane(selection.pane);
    const index = Math.max(0, Math.floor(Number(selection.index)));
    const key = toSelectionKey(pane, index);
    if (deduped.has(key)) {
      continue;
    }
    deduped.add(key);
    const list = listForPane(playerState, pane);
    const entry = list[index];
    if (!entry) {
      continue;
    }
    const entryPrice = computeSellPriceForEntry(entry, itemDefinitionsById);
    totalPrice += entryPrice;
    const rarity = getEntryRarity(entry);
    const plus = getEntryPlus(entry);
    if (RARE_CONFIRM_SET.has(rarity) || plus >= 7) {
      requiresConfirm = true;
    }
    resolved.push({
      pane,
      index,
    });
  }

  if (resolved.length <= 0) {
    return { ok: false, reason: "no_selection", totalPrice: 0, soldCount: 0, requiresConfirm: false };
  }

  if (requiresConfirm && params.confirmHighValue !== true) {
    return {
      ok: false,
      reason: "confirm_required",
      totalPrice: Math.max(0, Math.floor(totalPrice)),
      soldCount: resolved.length,
      requiresConfirm: true,
    };
  }

  const runIndexes = resolved
    .filter((entry) => entry.pane === STORAGE_PANE_RUN)
    .map((entry) => entry.index)
    .sort((a, b) => b - a);
  const stashIndexes = resolved
    .filter((entry) => entry.pane === STORAGE_PANE_STASH)
    .map((entry) => entry.index)
    .sort((a, b) => b - a);

  const runEntries = getRunInventory(playerState);
  const stashEntries = getStashItems(playerState);
  for (const index of runIndexes) {
    if (runEntries[index]) {
      runEntries.splice(index, 1);
    }
  }
  for (const index of stashIndexes) {
    if (stashEntries[index]) {
      stashEntries.splice(index, 1);
    }
  }

  setWalletGold(playerState, getWalletGold(playerState) + Math.max(0, Math.floor(totalPrice)));
  normalizeRunQuickslots(playerState);
  return {
    ok: true,
    totalPrice: Math.max(0, Math.floor(totalPrice)),
    soldCount: resolved.length,
    requiresConfirm: false,
  };
}

function compareByTypeThenId(a, b) {
  const typeDiff = (TYPE_SORT_WEIGHT[getEntryType(a)] ?? 99) - (TYPE_SORT_WEIGHT[getEntryType(b)] ?? 99);
  if (typeDiff !== 0) {
    return typeDiff;
  }
  return getEntryId(a).localeCompare(getEntryId(b));
}

function compareByName(a, b, itemDefinitionsById, weaponDefinitionsById) {
  const nameA = resolveEntryName(a, itemDefinitionsById, weaponDefinitionsById, null);
  const nameB = resolveEntryName(b, itemDefinitionsById, weaponDefinitionsById, null);
  const cmp = nameA.localeCompare(nameB);
  if (cmp !== 0) {
    return cmp;
  }
  return compareByTypeThenId(a, b);
}

function compareByRarity(a, b, itemDefinitionsById, weaponDefinitionsById) {
  const rarityDiff = (RARITY_SORT_WEIGHT[getEntryRarity(b)] ?? 0) - (RARITY_SORT_WEIGHT[getEntryRarity(a)] ?? 0);
  if (rarityDiff !== 0) {
    return rarityDiff;
  }
  const plusDiff = getEntryPlus(b) - getEntryPlus(a);
  if (plusDiff !== 0) {
    return plusDiff;
  }
  return compareByName(a, b, itemDefinitionsById, weaponDefinitionsById);
}

function mergeItemStacks(entries, itemDefinitionsById) {
  const counts = new Map();
  const nonItems = [];
  for (const entry of entries) {
    if (getEntryType(entry) !== "item") {
      nonItems.push(entry);
      continue;
    }
    const itemDefId = getEntryId(entry);
    if (!itemDefId) {
      continue;
    }
    const count = Math.max(0, toNonNegativeInt(entry.count, 0));
    if (count <= 0) {
      continue;
    }
    counts.set(itemDefId, (counts.get(itemDefId) ?? 0) + count);
  }

  const mergedItems = [];
  const itemIds = Array.from(counts.keys()).sort();
  for (const itemDefId of itemIds) {
    let remaining = counts.get(itemDefId) ?? 0;
    const maxStack = getItemMaxStack(itemDefId, itemDefinitionsById);
    while (remaining > 0) {
      const stackCount = Math.min(remaining, maxStack);
      mergedItems.push({
        type: "item",
        item_def_id: itemDefId,
        count: stackCount,
      });
      remaining -= stackCount;
    }
  }
  return [...mergedItems, ...nonItems];
}

export function autoArrangeStorage(playerState, pane, sortKey = "type", options = {}) {
  if (!isPlainObject(playerState)) {
    return { ok: false, reason: "invalid_state" };
  }
  const normalizedPane = normalizePane(pane);
  const entries = listForPane(playerState, normalizedPane);
  const itemDefinitionsById = isPlainObject(options.itemDefinitionsById) ? options.itemDefinitionsById : {};
  const weaponDefinitionsById = isPlainObject(options.weaponDefinitionsById) ? options.weaponDefinitionsById : {};

  const merged = mergeItemStacks(entries, itemDefinitionsById);
  let sorted = merged.slice();
  if (sortKey === "name") {
    sorted.sort((a, b) => compareByName(a, b, itemDefinitionsById, weaponDefinitionsById));
  } else if (sortKey === "rarity") {
    sorted.sort((a, b) => compareByRarity(a, b, itemDefinitionsById, weaponDefinitionsById));
  } else {
    sorted.sort(compareByTypeThenId);
  }

  const target = listForPane(playerState, normalizedPane);
  target.length = 0;
  for (const entry of sorted) {
    target.push(entry);
  }
  normalizeRunQuickslots(playerState);
  return {
    ok: true,
    pane: normalizedPane,
    sortKey,
  };
}

export function purchaseStorageUpgrade(playerState, kind) {
  if (!isPlainObject(playerState)) {
    return { ok: false, reason: "invalid_state" };
  }

  const normalizedKind = kind === "stash" ? "stash" : kind === "inventory" ? "inventory" : "";
  if (!normalizedKind) {
    return { ok: false, reason: "invalid_kind" };
  }

  const preview = resolveUpgradePreview(playerState, normalizedKind);
  const currentGold = getWalletGold(playerState);
  if (currentGold < preview.cost) {
    return {
      ok: false,
      reason: "not_enough_gold",
      cost: preview.cost,
      currentGold,
      kind: normalizedKind,
    };
  }

  setWalletGold(playerState, currentGold - preview.cost);
  if (normalizedKind === "stash") {
    const base = getBaseSection(playerState);
    base.stash.capacity = preview.nextCapacity;
  } else {
    const base = getBaseSection(playerState);
    base.unlocks.inventory_slot_max = preview.nextCapacity;
  }

  return {
    ok: true,
    kind: normalizedKind,
    cost: preview.cost,
    newCapacity: preview.nextCapacity,
    levelBefore: preview.level,
    goldAfter: getWalletGold(playerState),
  };
}
