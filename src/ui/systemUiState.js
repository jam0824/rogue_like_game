import { PLAYER_FOOT_HITBOX_HEIGHT, PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from "../config/constants.js";
import { tJa } from "./uiTextJa.js";

export const QUICK_SLOT_COUNT = 8;
export const DEFAULT_INVENTORY_CAPACITY = 10;
export const DROP_SEARCH_MAX_RADIUS = 6;

const STARTER_ITEMS = [
  {
    id: "run_item_potion_small",
    type: "consumable",
    count: 3,
    quickSlot: 0,
    iconKey: "potion_red",
    nameKey: "item_name_potion_small",
    descriptionKey: "item_desc_potion_small",
    effectKey: "item_effect_potion_small",
  },
  {
    id: "run_item_bomb_small",
    type: "consumable",
    count: 2,
    quickSlot: 1,
    iconKey: "bomb",
    nameKey: "item_name_bomb_small",
    descriptionKey: "item_desc_bomb_small",
    effectKey: "item_effect_bomb_small",
  },
  {
    id: "run_item_antidote",
    type: "consumable",
    count: 1,
    quickSlot: 2,
    iconKey: "antidote",
    nameKey: "item_name_antidote",
    descriptionKey: "item_desc_antidote",
    effectKey: "item_effect_antidote",
  },
  {
    id: "run_item_scroll_fire",
    type: "consumable",
    count: 2,
    quickSlot: 3,
    iconKey: "scroll",
    nameKey: "item_name_scroll_fire",
    descriptionKey: "item_desc_scroll_fire",
    effectKey: "item_effect_scroll_fire",
  },
  {
    id: "run_item_food_ration",
    type: "consumable",
    count: 4,
    quickSlot: 4,
    iconKey: "food",
    nameKey: "item_name_food_ration",
    descriptionKey: "item_desc_food_ration",
    effectKey: "item_effect_food_ration",
  },
  {
    id: "run_item_throwing_knife",
    type: "consumable",
    count: 5,
    quickSlot: 5,
    iconKey: "knife",
    nameKey: "item_name_throwing_knife",
    descriptionKey: "item_desc_throwing_knife",
    effectKey: "item_effect_throwing_knife",
  },
  {
    id: "run_item_short_sword",
    type: "equipment",
    count: 1,
    quickSlot: 6,
    iconKey: "sword",
    nameKey: "item_name_short_sword",
    descriptionKey: "item_desc_short_sword",
    effectKey: "item_effect_short_sword",
  },
  {
    id: "run_item_leather_boots",
    type: "equipment",
    count: 1,
    quickSlot: 7,
    iconKey: "boots",
    nameKey: "item_name_leather_boots",
    descriptionKey: "item_desc_leather_boots",
    effectKey: "item_effect_leather_boots",
  },
];

function toNonNegativeInt(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function toFiniteNumber(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Number(value);
}

function cloneInventoryItem(item) {
  return {
    id: item.id,
    type: item.type,
    count: toNonNegativeInt(item.count, 0),
    quickSlot: Number.isInteger(item.quickSlot) ? item.quickSlot : null,
    iconKey: typeof item.iconKey === "string" ? item.iconKey : "empty",
    nameKey: typeof item.nameKey === "string" ? item.nameKey : "ui_label_inventory_empty",
    descriptionKey: typeof item.descriptionKey === "string" ? item.descriptionKey : "ui_label_inventory_placeholder",
    effectKey: typeof item.effectKey === "string" ? item.effectKey : "ui_label_inventory_effect_placeholder",
    iconImageSrc: typeof item.iconImageSrc === "string" ? item.iconImageSrc : "",
  };
}

function cloneDroppedItem(item) {
  return {
    id: String(item.id),
    itemId: String(item.itemId),
    tileX: toNonNegativeInt(item.tileX, 0),
    tileY: toNonNegativeInt(item.tileY, 0),
    xPx: toFiniteNumber(item.xPx, 0),
    yPx: toFiniteNumber(item.yPx, 0),
    droppedAtMs: toNonNegativeInt(item.droppedAtMs, 0),
  };
}

function cloneStatusIcon(icon) {
  return {
    id: typeof icon?.id === "string" ? icon.id : "",
    iconKey: typeof icon?.iconKey === "string" ? icon.iconKey : "empty",
    nameKey: typeof icon?.nameKey === "string" ? icon.nameKey : "",
  };
}

function cloneSystemUiState(systemUi) {
  const source = systemUi && typeof systemUi === "object" ? systemUi : createInitialSystemUiState();
  const sourceInventory = source.inventory && typeof source.inventory === "object" ? source.inventory : {};
  const sourceStatus = source.statusEffects && typeof source.statusEffects === "object" ? source.statusEffects : {};

  return {
    inventory: {
      isWindowOpen: sourceInventory.isWindowOpen === true,
      capacity: Math.max(1, toNonNegativeInt(sourceInventory.capacity, DEFAULT_INVENTORY_CAPACITY)),
      items: Array.isArray(sourceInventory.items) ? sourceInventory.items.map(cloneInventoryItem) : [],
      selectedItemId: typeof sourceInventory.selectedItemId === "string" ? sourceInventory.selectedItemId : null,
      droppedItems: Array.isArray(sourceInventory.droppedItems)
        ? sourceInventory.droppedItems.map(cloneDroppedItem)
        : [],
    },
    statusEffects: {
      buffs: Array.isArray(sourceStatus.buffs) ? sourceStatus.buffs.map(cloneStatusIcon) : [],
      debuffs: Array.isArray(sourceStatus.debuffs) ? sourceStatus.debuffs.map(cloneStatusIcon) : [],
    },
    toastMessage: typeof source.toastMessage === "string" ? source.toastMessage : "",
  };
}

function findItemIndexById(items, itemId) {
  if (typeof itemId !== "string" || itemId.length <= 0) {
    return -1;
  }
  return items.findIndex((item) => item.id === itemId);
}

function findItemByQuickSlot(items, slotIndex) {
  return items.find((item) => item.quickSlot === slotIndex) ?? null;
}

function pickNextSelectedItemId(items, preferredItemId = null) {
  if (typeof preferredItemId === "string" && items.some((item) => item.id === preferredItemId)) {
    return preferredItemId;
  }

  return items[0]?.id ?? null;
}

function withToast(nextState, messageKey) {
  return {
    ...nextState,
    toastMessage: tJa(messageKey, messageKey),
  };
}

export function clearToastMessage(systemUi) {
  const nextState = cloneSystemUiState(systemUi);
  nextState.toastMessage = "";
  return nextState;
}

function normalizeIncomingInventoryItem(item) {
  if (!item || typeof item !== "object" || typeof item.id !== "string" || item.id.length <= 0) {
    return null;
  }

  return cloneInventoryItem({
    id: item.id,
    type: typeof item.type === "string" ? item.type : "consumable",
    count: Math.max(1, toNonNegativeInt(item.count, 1)),
    quickSlot: Number.isInteger(item.quickSlot) ? item.quickSlot : null,
    iconKey: item.iconKey,
    nameKey: item.nameKey,
    descriptionKey: item.descriptionKey,
    effectKey: item.effectKey,
    iconImageSrc: item.iconImageSrc,
  });
}

function getPlayerFeetTile(player) {
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)) {
    return null;
  }

  const feetX = player.x + PLAYER_WIDTH / 2;
  const feetY = player.y + PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2;
  return {
    tileX: Math.floor(feetX / TILE_SIZE),
    tileY: Math.floor(feetY / TILE_SIZE),
  };
}

function getWalkableGrid(dungeon) {
  if (!dungeon || typeof dungeon !== "object") {
    return null;
  }

  const grid = dungeon.walkableGrid ?? dungeon.floorGrid;
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
    return null;
  }

  return grid;
}

function isTileInBounds(grid, tileX, tileY) {
  return tileY >= 0 && tileY < grid.length && tileX >= 0 && tileX < grid[0].length;
}

function isTileWalkable(grid, tileX, tileY) {
  if (!isTileInBounds(grid, tileX, tileY)) {
    return false;
  }
  return grid[tileY][tileX] === true;
}

function buildOccupiedTileSet(droppedItems) {
  const occupied = new Set();
  for (const item of droppedItems) {
    if (!Number.isFinite(item?.tileX) || !Number.isFinite(item?.tileY)) {
      continue;
    }
    occupied.add(`${Math.floor(item.tileX)}:${Math.floor(item.tileY)}`);
  }
  return occupied;
}

function iterateRingCandidates(centerX, centerY, radius) {
  const candidates = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    const dxAbs = radius - Math.abs(dy);
    if (dxAbs === 0) {
      candidates.push({ tileX: centerX, tileY: centerY + dy });
      continue;
    }

    candidates.push({ tileX: centerX - dxAbs, tileY: centerY + dy });
    candidates.push({ tileX: centerX + dxAbs, tileY: centerY + dy });
  }
  return candidates;
}

export function createStarterInventoryItems() {
  return STARTER_ITEMS.map((item) => cloneInventoryItem(item));
}

export function createInitialSystemUiState() {
  const items = createStarterInventoryItems();

  return {
    inventory: {
      isWindowOpen: false,
      capacity: DEFAULT_INVENTORY_CAPACITY,
      items,
      selectedItemId: items[0]?.id ?? null,
      droppedItems: [],
    },
    statusEffects: {
      buffs: [],
      debuffs: [],
    },
    toastMessage: "",
  };
}

export function setInventoryWindowOpen(systemUi, isOpen) {
  const nextState = cloneSystemUiState(systemUi);
  nextState.inventory.isWindowOpen = isOpen === true;
  return nextState;
}

export function selectInventoryItem(systemUi, itemId) {
  const nextState = cloneSystemUiState(systemUi);
  nextState.inventory.selectedItemId = pickNextSelectedItemId(nextState.inventory.items, itemId);
  return nextState;
}

export function getSelectedInventoryItem(systemUi) {
  const state = cloneSystemUiState(systemUi);
  const selectedItemId = state.inventory.selectedItemId;
  if (typeof selectedItemId !== "string" || selectedItemId.length <= 0) {
    return null;
  }
  return state.inventory.items.find((item) => item.id === selectedItemId) ?? null;
}

export function buildQuickSlots(items, slotCount = QUICK_SLOT_COUNT) {
  const maxSlots = Math.max(0, toNonNegativeInt(slotCount, QUICK_SLOT_COUNT));
  const quickSlots = Array.from({ length: maxSlots }, (_, slot) => ({
    slot,
    item: null,
  }));

  if (!Array.isArray(items)) {
    return quickSlots;
  }

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (!Number.isInteger(item.quickSlot) || item.quickSlot < 0 || item.quickSlot >= maxSlots) {
      continue;
    }

    if (quickSlots[item.quickSlot].item) {
      continue;
    }

    quickSlots[item.quickSlot].item = cloneInventoryItem(item);
  }

  return quickSlots;
}

export function useInventoryItem(systemUi, itemId) {
  const nextState = cloneSystemUiState(systemUi);
  const index = findItemIndexById(nextState.inventory.items, itemId);

  if (index < 0) {
    return withToast(nextState, "ui_hint_item_not_found");
  }

  const item = nextState.inventory.items[index];
  if (item.type !== "consumable") {
    return withToast(nextState, "ui_hint_item_not_usable");
  }

  item.count = Math.max(0, toNonNegativeInt(item.count, 0) - 1);
  if (item.count <= 0) {
    nextState.inventory.items.splice(index, 1);
  }

  nextState.inventory.selectedItemId = pickNextSelectedItemId(
    nextState.inventory.items,
    nextState.inventory.selectedItemId
  );

  return withToast(nextState, "ui_hint_item_used");
}

export function useQuickSlotItem(systemUi, slotIndex) {
  const nextState = cloneSystemUiState(systemUi);
  const normalizedSlot = toNonNegativeInt(slotIndex, -1);
  const item = findItemByQuickSlot(nextState.inventory.items, normalizedSlot);

  if (!item) {
    return withToast(nextState, "ui_hint_slot_empty");
  }

  return useInventoryItem(nextState, item.id);
}

export function tryAddInventoryItem(systemUi, item, options = {}) {
  const nextState = cloneSystemUiState(systemUi);
  const incoming = normalizeIncomingInventoryItem(item);
  if (!incoming) {
    return {
      systemUi: withToast(nextState, "ui_hint_item_not_found"),
      success: false,
      addedCount: 0,
    };
  }

  const maxStack = Math.max(1, toNonNegativeInt(options.maxStack, Number.MAX_SAFE_INTEGER));
  let remaining = Math.max(1, toNonNegativeInt(incoming.count, 1));
  let addedCount = 0;

  while (remaining > 0) {
    const stackableItem = nextState.inventory.items.find(
      (inventoryItem) =>
        inventoryItem.id === incoming.id &&
        inventoryItem.type === incoming.type &&
        inventoryItem.count < maxStack
    );

    if (stackableItem) {
      const addable = Math.min(remaining, maxStack - stackableItem.count);
      stackableItem.count += addable;
      remaining -= addable;
      addedCount += addable;
      continue;
    }

    if (nextState.inventory.items.length >= nextState.inventory.capacity) {
      break;
    }

    const stackSize = Math.min(remaining, maxStack);
    nextState.inventory.items.push(
      cloneInventoryItem({
        ...incoming,
        count: stackSize,
        quickSlot: null,
      })
    );
    remaining -= stackSize;
    addedCount += stackSize;
  }

  nextState.inventory.selectedItemId = pickNextSelectedItemId(
    nextState.inventory.items,
    nextState.inventory.selectedItemId
  );

  if (remaining > 0) {
    const fullMessageKey =
      typeof options.fullMessageKey === "string" && options.fullMessageKey.length > 0
        ? options.fullMessageKey
        : "ui_hint_inventory_full";
    return {
      systemUi: withToast(nextState, fullMessageKey),
      success: false,
      addedCount,
    };
  }

  const successMessageKey =
    typeof options.successMessageKey === "string" && options.successMessageKey.length > 0
      ? options.successMessageKey
      : "";
  return {
    systemUi: successMessageKey ? withToast(nextState, successMessageKey) : nextState,
    success: true,
    addedCount,
  };
}

export function findDropTileNearPlayer(
  dungeon,
  player,
  droppedItems = [],
  maxRadius = DROP_SEARCH_MAX_RADIUS
) {
  const walkableGrid = getWalkableGrid(dungeon);
  const feetTile = getPlayerFeetTile(player);
  if (!walkableGrid || !feetTile) {
    return null;
  }

  const searchRadius = Math.max(0, toNonNegativeInt(maxRadius, DROP_SEARCH_MAX_RADIUS));
  const occupiedTiles = buildOccupiedTileSet(droppedItems);

  for (let radius = 0; radius <= searchRadius; radius += 1) {
    const candidates = iterateRingCandidates(feetTile.tileX, feetTile.tileY, radius);
    for (const candidate of candidates) {
      if (candidate.tileX === feetTile.tileX && candidate.tileY === feetTile.tileY) {
        continue;
      }

      const key = `${candidate.tileX}:${candidate.tileY}`;
      if (occupiedTiles.has(key)) {
        continue;
      }

      if (!isTileWalkable(walkableGrid, candidate.tileX, candidate.tileY)) {
        continue;
      }

      return {
        tileX: candidate.tileX,
        tileY: candidate.tileY,
        xPx: candidate.tileX * TILE_SIZE + TILE_SIZE / 2,
        yPx: candidate.tileY * TILE_SIZE + TILE_SIZE / 2,
      };
    }
  }

  return null;
}

export function dropSelectedInventoryItem(systemUi, dungeon, player, nowMs = Date.now()) {
  const nextState = cloneSystemUiState(systemUi);
  const selectedItemId = nextState.inventory.selectedItemId;
  const index = findItemIndexById(nextState.inventory.items, selectedItemId);

  if (index < 0) {
    return withToast(nextState, "ui_hint_item_none_selected");
  }

  const dropPosition = findDropTileNearPlayer(
    dungeon,
    player,
    nextState.inventory.droppedItems,
    DROP_SEARCH_MAX_RADIUS
  );

  if (!dropPosition) {
    return withToast(nextState, "ui_hint_item_drop_failed");
  }

  const item = nextState.inventory.items[index];
  item.count = Math.max(0, toNonNegativeInt(item.count, 0) - 1);

  const dropId = `drop_${toNonNegativeInt(nowMs, Date.now())}_${nextState.inventory.droppedItems.length}`;
  nextState.inventory.droppedItems.push({
    id: dropId,
    itemId: item.id,
    tileX: dropPosition.tileX,
    tileY: dropPosition.tileY,
    xPx: dropPosition.xPx,
    yPx: dropPosition.yPx,
    droppedAtMs: toNonNegativeInt(nowMs, Date.now()),
  });

  if (item.count <= 0) {
    nextState.inventory.items.splice(index, 1);
  }

  nextState.inventory.selectedItemId = pickNextSelectedItemId(
    nextState.inventory.items,
    nextState.inventory.selectedItemId
  );

  return withToast(nextState, "ui_hint_item_dropped");
}

export function dropSelectedInventoryItemToGround(
  systemUi,
  dungeon,
  player,
  groundItems = [],
  nowMs = Date.now()
) {
  const nextState = cloneSystemUiState(systemUi);
  const selectedItemId = nextState.inventory.selectedItemId;
  const index = findItemIndexById(nextState.inventory.items, selectedItemId);

  if (index < 0) {
    return {
      systemUi: withToast(nextState, "ui_hint_item_none_selected"),
      success: false,
      droppedGroundItem: null,
    };
  }

  const dropPosition = findDropTileNearPlayer(
    dungeon,
    player,
    Array.isArray(groundItems) ? groundItems : [],
    DROP_SEARCH_MAX_RADIUS
  );
  if (!dropPosition) {
    return {
      systemUi: withToast(nextState, "ui_hint_item_drop_failed"),
      success: false,
      droppedGroundItem: null,
    };
  }

  const item = nextState.inventory.items[index];
  const runtimeItem = cloneInventoryItem({
    ...item,
    count: 1,
    quickSlot: null,
  });
  item.count = Math.max(0, toNonNegativeInt(item.count, 0) - 1);

  if (item.count <= 0) {
    nextState.inventory.items.splice(index, 1);
  }

  nextState.inventory.selectedItemId = pickNextSelectedItemId(
    nextState.inventory.items,
    nextState.inventory.selectedItemId
  );

  const dropId = `ground_drop_${toNonNegativeInt(nowMs, Date.now())}_${toNonNegativeInt(
    Array.isArray(groundItems) ? groundItems.length : 0,
    0
  )}`;
  const droppedGroundItem = {
    id: dropId,
    sourceType: "inventory_drop",
    sourceChestId: null,
    itemId: runtimeItem.id,
    count: 1,
    tileX: dropPosition.tileX,
    tileY: dropPosition.tileY,
    xPx: dropPosition.xPx,
    yPx: dropPosition.yPx,
    runtimeItem,
  };

  return {
    systemUi: withToast(nextState, "ui_hint_item_dropped"),
    success: true,
    droppedGroundItem,
  };
}
