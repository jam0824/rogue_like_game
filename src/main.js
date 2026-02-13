import { INITIAL_SEED, PLAYER_FOOT_HITBOX_HEIGHT, PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from "./config/constants.js";
import { loadEnemyAssets } from "./enemy/enemyAsset.js";
import { loadEnemyAiProfiles } from "./enemy/enemyAiProfileDb.js";
import { loadEnemyDefinitions } from "./enemy/enemyDb.js";
import { loadEnemyWeaponLoadouts } from "./enemy/enemyWeaponLoadoutDb.js";
import {
  createEnemies,
  getEnemyTelegraphAlpha,
  getEnemyFrame,
  getEnemyHitFlashAlpha,
  getEnemyWeaponRuntimes,
  getEnemyWallHitbox,
  updateEnemyAttacks,
  updateEnemies,
} from "./enemy/enemySystem.js";
import { generateDungeon } from "./generation/dungeonGenerator.js";
import { validateDungeon } from "./generation/layoutValidator.js";
import { createPointerController } from "./input/pointerController.js";
import { loadItemAssets } from "./item/itemAsset.js";
import { loadItemDefinitions } from "./item/itemDb.js";
import {
  applyChestBlockingToWalkableGrid,
  buildBlockedTileSetFromChests,
  createCommonTreasureChest,
  loadTreasureChestAssets,
  TREASURE_CHEST_RENDER_FRAME_SIZE,
  tryOpenChestByClick,
} from "./item/treasureSystem.js";
import {
  createPlayerState,
  getPlayerFeetHitbox,
  getPlayerFrame,
  getPlayerHitFlashAlpha,
  setPointerTarget,
  tryRestorePlayerPosition,
  updatePlayer,
} from "./player/playerSystem.js";
import {
  applySavedWeaponRuntime,
  buildWeaponDefinitionsFromPlayerState,
  createDefaultPlayerState,
  loadPlayerStateFromStorage,
  PLAYER_STATE_STORAGE_KEY,
  savePlayerStateToStorage,
  syncPlayerStateFromRuntime,
} from "./player/playerStateStore.js";
import { buildDungeonBackdrop, renderFrame } from "./render/canvasRenderer.js";
import { createAppState, setDungeonState, setErrorState } from "./state/appState.js";
import { loadTileAssets } from "./tiles/tileCatalog.js";
import { buildWalkableGrid } from "./tiles/walkableGrid.js";
import { resolveWallSymbols } from "./tiles/wallSymbolResolver.js";
import { createDebugPanel } from "./ui/debugPanel.js";
import {
  buildQuickSlots,
  createInitialSystemUiState,
  dropSelectedInventoryItemToGround,
  QUICK_SLOT_COUNT,
  selectInventoryItem,
  setInventoryWindowOpen,
  tryAddInventoryItem,
  useInventoryItem,
  useQuickSlotItem,
} from "./ui/systemUiState.js";
import { createSystemHud } from "./ui/systemHud.js";
import { getIconLabelForKey, tJa } from "./ui/uiTextJa.js";
import { loadPlayerAsset } from "./player/playerAsset.js";
import { createFloatingTextPopup, spawnDamagePopupsFromEvents, updateDamagePopups } from "./combat/combatFeedbackSystem.js";
import { loadWeaponDefinitions } from "./weapon/weaponDb.js";
import { loadFormationDefinitions } from "./weapon/formationDb.js";
import { loadWeaponAssets } from "./weapon/weaponAsset.js";
import {
  createPlayerWeapons,
  getWeaponHitbox,
  removeDefeatedEnemies,
  updateWeaponsAndCombat,
} from "./weapon/weaponSystem.js";

const FIXED_DT = 1 / 60;
const FRAME_MS = 1000 / 60;
const INITIAL_WEAPON_ID = "weapon_sword_01";
const HERB_ITEM_ID = "item_herb_01";
const HERB_HEAL_AMOUNT = 50;
const PLAYER_STATE_SAVE_INTERVAL_MS = 1000;
const MIN_ENEMY_ATTACK_COOLDOWN_SEC = 0.05;

const appState = createAppState(INITIAL_SEED);
const canvas = document.querySelector("#dungeon-canvas");
const canvasScroll = document.querySelector("#canvas-scroll");
const debugPanelRoot = document.querySelector("#debug-panel");
const systemUiRoot = document.querySelector("#system-ui-layer");

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const appStorage = getStorage();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function makeRandomSeed() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function nowUnixSec() {
  return Math.floor(Date.now() / 1000);
}

function formatStorageValue(rawValue) {
  if (typeof rawValue !== "string") {
    return String(rawValue);
  }

  try {
    return JSON.stringify(JSON.parse(rawValue), null, 2);
  } catch {
    return rawValue;
  }
}

function buildLocalStorageDump(storage) {
  if (!storage || typeof storage.length !== "number" || typeof storage.getItem !== "function") {
    return "localStorage is unavailable.";
  }

  if (storage.length <= 0) {
    return "localStorage is empty.";
  }

  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string" && key.length > 0) {
      keys.push(key);
    }
  }
  keys.sort((a, b) => a.localeCompare(b));

  if (keys.length === 0) {
    return "localStorage is empty.";
  }

  const rows = keys.map((key) => {
    try {
      const value = storage.getItem(key);
      return `[${key}]\n${formatStorageValue(value)}`;
    } catch (error) {
      return `[${key}]\n<failed to read: ${error instanceof Error ? error.message : String(error)}>`;
    }
  });

  return `keys: ${keys.length}\n\n${rows.join("\n\n")}`;
}

function findRoomById(dungeon, roomId) {
  return dungeon.rooms.find((room) => room.id === roomId) ?? null;
}

function buildStatsRows(dungeon, player = null, debugPlayerDamagePreviewOnly = false) {
  const startRoom = findRoomById(dungeon, dungeon.startRoomId);
  const stairsRoom = findRoomById(dungeon, dungeon.stairsRoomId);
  const hpValue =
    player && Number.isFinite(player.hp) && Number.isFinite(player.maxHp)
      ? `${Math.max(0, Math.round(player.hp))} / ${Math.max(0, Math.round(player.maxHp))}`
      : "-";
  const damageMode = debugPlayerDamagePreviewOnly ? "演出のみ（HP減少なし）" : "通常";

  return [
    { label: "seed", value: dungeon.seed },
    { label: "HP", value: hpValue },
    { label: "被ダメ設定", value: damageMode },
    { label: "部屋数", value: dungeon.stats.roomCount },
    { label: "主線部屋数", value: dungeon.stats.mainPathCount },
    { label: "枝道本数", value: dungeon.stats.branchCount },
    { label: "小ループ", value: dungeon.stats.hasLoop ? "あり" : "なし" },
    {
      label: "開始座標",
      value: startRoom ? `(${startRoom.centerX}, ${startRoom.centerY})` : "-",
    },
    {
      label: "階段座標",
      value: stairsRoom ? `(${stairsRoom.centerX}, ${stairsRoom.centerY})` : "-",
    },
    { label: "生成試行", value: dungeon.stats.attempts },
  ];
}

function getRunLevel(playerState) {
  const runLevel = Number(playerState?.run?.run_level);
  if (!Number.isFinite(runLevel)) {
    return 1;
  }
  return Math.max(1, Math.round(runLevel));
}

function getGold(playerState) {
  const gold = Number(playerState?.base?.wallet?.gold);
  if (!Number.isFinite(gold)) {
    return 0;
  }
  return Math.max(0, Math.floor(gold));
}

function getSystemUiState() {
  return appState.systemUi ?? createInitialSystemUiState();
}

function buildInventoryItemTextState(item) {
  return {
    id: item.id,
    type: item.type,
    count: Math.max(0, Math.floor(Number(item.count) || 0)),
    quickSlot: Number.isInteger(item.quickSlot) ? item.quickSlot : null,
    iconKey: item.iconKey,
    nameKey: item.nameKey,
    descriptionKey: item.descriptionKey,
    effectKey: item.effectKey,
    iconImageSrc: typeof item.iconImageSrc === "string" ? item.iconImageSrc : "",
  };
}

function buildInventoryQuickSlotTextState(slot) {
  if (!slot?.item) {
    return {
      slot: slot?.slot ?? 0,
      item: null,
    };
  }

  return {
    slot: slot.slot,
    item: buildInventoryItemTextState(slot.item),
  };
}

function buildHudTextState() {
  return {
    hp: {
      current: round2(appState.player?.hp ?? 0),
      max: round2(appState.player?.maxHp ?? 0),
    },
    runLevel: getRunLevel(appState.playerState),
    gold: getGold(appState.playerState),
    buffs: [...(getSystemUiState().statusEffects?.buffs ?? [])],
    debuffs: [...(getSystemUiState().statusEffects?.debuffs ?? [])],
  };
}

function buildInventoryTextState() {
  const systemUi = getSystemUiState();
  const items = Array.isArray(systemUi.inventory?.items) ? systemUi.inventory.items : [];
  const droppedItems = Array.isArray(systemUi.inventory?.droppedItems) ? systemUi.inventory.droppedItems : [];

  return {
    capacity: Number(systemUi.inventory?.capacity) || 10,
    isWindowOpen: systemUi.inventory?.isWindowOpen === true,
    selectedItemId: typeof systemUi.inventory?.selectedItemId === "string" ? systemUi.inventory.selectedItemId : null,
    quickSlots: buildQuickSlots(items, QUICK_SLOT_COUNT).map((slot) => buildInventoryQuickSlotTextState(slot)),
    items: items.map((item) => buildInventoryItemTextState(item)),
    droppedItems: droppedItems.map((item) => ({
      id: item.id,
      itemId: item.itemId,
      tileX: item.tileX,
      tileY: item.tileY,
      xPx: round2(item.xPx),
      yPx: round2(item.yPx),
      droppedAtMs: item.droppedAtMs,
    })),
    toastMessage: typeof systemUi.toastMessage === "string" ? systemUi.toastMessage : "",
  };
}

function buildTreasureChestTextState(chest) {
  return {
    id: chest.id,
    tier: chest.tier,
    roomId: chest.roomId,
    tileX: chest.tileX,
    tileY: chest.tileY,
    xPx: round2(chest.xPx),
    yPx: round2(chest.yPx),
    isOpened: chest.isOpened === true,
  };
}

function buildGroundItemTextState(item) {
  const iconKey = typeof item?.runtimeItem?.iconKey === "string" && item.runtimeItem.iconKey.length > 0
    ? item.runtimeItem.iconKey
    : item?.itemId === HERB_ITEM_ID
      ? "herb"
      : "";

  return {
    id: item.id,
    sourceChestId: item.sourceChestId ?? null,
    sourceType:
      typeof item?.sourceType === "string" && item.sourceType.length > 0
        ? item.sourceType
        : item?.sourceChestId
          ? "chest_drop"
          : "unknown",
    itemId: item.itemId,
    iconKey,
    count: Math.max(1, Math.floor(Number(item.count) || 1)),
    tileX: item.tileX,
    tileY: item.tileY,
    xPx: round2(item.xPx),
    yPx: round2(item.yPx),
  };
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

function buildWeaponTextState(weapon) {
  const hitbox = getWeaponHitbox(weapon);

  return {
    id: weapon.id,
    weaponDefId: weapon.weaponDefId,
    formationId: weapon.formationId,
    x: round2(weapon.x),
    y: round2(weapon.y),
    width: weapon.width,
    height: weapon.height,
    attackSeq: weapon.attackSeq,
    rotationDeg: round2(weapon.rotationDeg ?? 0),
    cooldownRemainingSec: round2(weapon.cooldownRemainingSec ?? 0),
    hitTargetCount: weapon.hitSet instanceof Set ? weapon.hitSet.size : 0,
    hitbox: {
      x: round2(hitbox.x),
      y: round2(hitbox.y),
      width: hitbox.width,
      height: hitbox.height,
    },
  };
}

function buildPlayerTextState(player, weapons) {
  return {
    x: round2(player.x),
    y: round2(player.y),
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    hp: round2(player.hp ?? 0),
    maxHp: round2(player.maxHp ?? 0),
    hitFlashAlpha: round2(getPlayerHitFlashAlpha(player)),
    feetHitbox: getPlayerFeetHitbox(player),
    facing: player.facing,
    isMoving: player.isMoving,
    target: player.target
      ? {
          x: round2(player.target.x),
          y: round2(player.target.y),
        }
      : null,
    weapons: (weapons ?? []).map((weapon) => buildWeaponTextState(weapon)),
  };
}

function buildEnemyWeaponTextState(weapon) {
  return {
    id: weapon.id,
    weaponDefId: weapon.weaponDefId,
    formationId: weapon.formationId,
    x: round2(weapon.x ?? 0),
    y: round2(weapon.y ?? 0),
    width: weapon.width ?? 0,
    height: weapon.height ?? 0,
    rotationDeg: round2(weapon.rotationDeg ?? 0),
    visible: weapon.visible === true,
  };
}

function buildEnemyTextState(enemy) {
  return {
    id: enemy.id,
    type: enemy.type,
    x: round2(enemy.x),
    y: round2(enemy.y),
    width: enemy.width,
    height: enemy.height,
    wallHitbox: getEnemyWallHitbox(enemy),
    facing: enemy.facing,
    isMoving: enemy.isMoving,
    behaviorMode: enemy.behaviorMode,
    noticeRadiusPx: round2(enemy.noticeRadiusPx ?? 0),
    giveupRadiusPx: round2(enemy.giveupRadiusPx ?? 0),
    distanceToPlayerPx: round2(enemy.distanceToPlayerPx ?? 0),
    preferredRangePx: round2(enemy.preferredRangePx ?? 0),
    engageRangePx: round2(enemy.engageRangePx ?? 0),
    retreatRangePx: round2(enemy.retreatRangePx ?? 0),
    rangeMoveTargetPx: round2(enemy.rangeMoveTargetPx ?? 0),
    rangeIntent: enemy.rangeIntent ?? "legacy_chase",
    isChasing: enemy.isChasing === true,
    hp: round2(enemy.hp ?? 0),
    maxHp: round2(enemy.maxHp ?? 0),
    isDead: enemy.isDead === true,
    attackDamage: round2(enemy.attackDamage ?? 0),
    moveSpeed: round2(enemy.moveSpeed ?? 0),
    hitFlashAlpha: round2(getEnemyHitFlashAlpha(enemy)),
    attackPhase: enemy.attack?.phase ?? "none",
    telegraphAlpha: round2(getEnemyTelegraphAlpha(enemy)),
    weapons: getEnemyWeaponRuntimes(enemy).map((weapon) => buildEnemyWeaponTextState(weapon)),
  };
}

function buildDamagePopupTextState(popup) {
  return {
    value: Math.max(0, Math.round(Number(popup?.value) || 0)),
    text: typeof popup?.text === "string" ? popup.text : "",
    textKey: typeof popup?.textKey === "string" ? popup.textKey : "",
    x: round2(popup?.x ?? 0),
    y: round2(popup?.y ?? 0),
    alpha: round2(popup?.alpha ?? 0),
    targetType: popup?.targetType === "player" ? "player" : "enemy",
    fillStyle: typeof popup?.fillStyle === "string" ? popup.fillStyle : "",
    strokeStyle: typeof popup?.strokeStyle === "string" ? popup.strokeStyle : "",
  };
}

function toTextState() {
  const hudState = buildHudTextState();
  const inventoryState = buildInventoryTextState();
  const treasureChests = Array.isArray(appState.treasureChests) ? appState.treasureChests : [];
  const groundItems = Array.isArray(appState.groundItems) ? appState.groundItems : [];

  if (appState.error) {
    return JSON.stringify(
      {
        mode: "error",
        seed: appState.seed,
        error: appState.error,
        playerState: appState.playerState,
        hud: hudState,
        inventory: inventoryState,
        treasureChests: treasureChests.map((chest) => buildTreasureChestTextState(chest)),
        groundItems: groundItems.map((item) => buildGroundItemTextState(item)),
      },
      null,
      2
    );
  }

  if (!appState.dungeon || !appState.player) {
    return JSON.stringify(
      {
        mode: "loading",
        seed: appState.seed,
        playerState: appState.playerState,
        hud: hudState,
        inventory: inventoryState,
        treasureChests: treasureChests.map((chest) => buildTreasureChestTextState(chest)),
        groundItems: groundItems.map((item) => buildGroundItemTextState(item)),
      },
      null,
      2
    );
  }

  const dungeon = appState.dungeon;
  const startRoom = findRoomById(dungeon, dungeon.startRoomId);
  const stairsRoom = findRoomById(dungeon, dungeon.stairsRoomId);

  return JSON.stringify(
    {
      mode: "dungeon",
      seed: dungeon.seed,
      isPaused: appState.isPaused === true,
      debug: {
        playerDamagePreviewOnly: appState.debugPlayerDamagePreviewOnly === true,
      },
      coordinateSystem: {
        origin: "top-left",
        xAxis: "right-positive",
        yAxis: "down-positive",
        unit: "tile (32px)",
      },
      grid: {
        width: dungeon.gridWidth,
        height: dungeon.gridHeight,
      },
      stats: dungeon.stats,
      player: buildPlayerTextState(appState.player, appState.weapons),
      playerState: appState.playerState,
      hud: hudState,
      inventory: inventoryState,
      treasureChests: treasureChests.map((chest) => buildTreasureChestTextState(chest)),
      groundItems: groundItems.map((item) => buildGroundItemTextState(item)),
      enemies: appState.enemies.map((enemy) => buildEnemyTextState(enemy)),
      damagePopups: appState.damagePopups.map((popup) => buildDamagePopupTextState(popup)),
      startRoom: startRoom
        ? {
            id: startRoom.id,
            x: startRoom.x,
            y: startRoom.y,
            w: startRoom.w,
            h: startRoom.h,
            centerX: startRoom.centerX,
            centerY: startRoom.centerY,
          }
        : null,
      stairsRoom: stairsRoom
        ? {
            id: stairsRoom.id,
            x: stairsRoom.x,
            y: stairsRoom.y,
            w: stairsRoom.w,
            h: stairsRoom.h,
            centerX: stairsRoom.centerX,
            centerY: stairsRoom.centerY,
          }
        : null,
      rooms: dungeon.rooms.map((room) => ({
        id: room.id,
        type: room.type,
        x: room.x,
        y: room.y,
        w: room.w,
        h: room.h,
      })),
    },
    null,
    2
  );
}

function renderErrorScreen(message) {
  const ctx = canvas.getContext("2d");
  canvas.width = 960;
  canvas.height = 540;
  ctx.fillStyle = "#090b12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffb3b3";
  ctx.font = "16px monospace";
  ctx.fillText(`Generation failed: ${message}`, 20, 40);
}

function followPlayerInView() {
  if (!appState.player || !appState.backdrop) {
    return;
  }

  const viewWidth = canvasScroll.clientWidth;
  const viewHeight = canvasScroll.clientHeight;
  if (viewWidth <= 0 || viewHeight <= 0) {
    return;
  }

  const feetCenterX = appState.player.x + PLAYER_WIDTH / 2;
  const feetCenterY = appState.player.y + PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2;
  const maxLeft = Math.max(0, appState.backdrop.widthPx - viewWidth);
  const maxTop = Math.max(0, appState.backdrop.heightPx - viewHeight);

  canvasScroll.scrollLeft = clamp(feetCenterX - viewWidth / 2, 0, maxLeft);
  canvasScroll.scrollTop = clamp(feetCenterY - viewHeight / 2, 0, maxTop);
}

const [tileAssets, playerAsset] = await Promise.all([loadTileAssets(), loadPlayerAsset()]);
let enemyDefinitions = [];
let enemyAssets = {};
let enemyAiProfilesById = {};
let enemyWeaponLoadoutsById = {};
let enemyAttackProfilesByDbId = {};
let weaponDefinitions = [];
let weaponDefinitionsById = {};
let formationDefinitionsById = {};
let weaponAssets = {};
let itemDefinitions = [];
let itemDefinitionsById = {};
let itemAssetsById = {};
let treasureChestAssets = {};
let damagePopupSeq = 0;

function resolveStarterWeaponDefId() {
  if (weaponDefinitionsById?.[INITIAL_WEAPON_ID]) {
    return INITIAL_WEAPON_ID;
  }

  const loadedWeaponIds = Object.keys(weaponDefinitionsById ?? {});
  return loadedWeaponIds.length > 0 ? loadedWeaponIds[0] : null;
}

function resolveFormationIdForEnemyWeapon(weaponInstance, weaponDefinition, formationMap) {
  if (weaponInstance?.formationId && formationMap?.[weaponInstance.formationId]) {
    return weaponInstance.formationId;
  }

  if (weaponDefinition?.formationId && formationMap?.[weaponDefinition.formationId]) {
    return weaponDefinition.formationId;
  }

  const fallbackFormationId = Object.keys(formationMap ?? {})[0];
  return fallbackFormationId ?? null;
}

function buildEnemyAttackProfilesByDbId() {
  const nextProfiles = {};

  for (const enemyDefinition of enemyDefinitions) {
    const aiProfile = enemyAiProfilesById?.[enemyDefinition.aiProfileId];
    const loadout = enemyWeaponLoadoutsById?.[enemyDefinition.weaponLoadoutId];
    if (!aiProfile || !loadout || !Array.isArray(loadout.weapons) || loadout.weapons.length === 0) {
      nextProfiles[enemyDefinition.id] = null;
      continue;
    }

    const attackCycles = Math.max(1, Math.floor(Number(aiProfile.weaponAttackCycles) || 1));
    const cooldownMul = Math.max(0.0001, Number(aiProfile.weaponCooldownMul) || 1);
    const resolvedWeapons = [];
    const executeDurationsSec = [];
    const periodsSec = [];

    for (const weaponInstance of loadout.weapons) {
      const weaponDefinition = weaponDefinitionsById?.[weaponInstance.weaponDefId];
      if (!weaponDefinition) {
        continue;
      }

      const formationId = resolveFormationIdForEnemyWeapon(weaponInstance, weaponDefinition, formationDefinitionsById);
      if (!formationId) {
        continue;
      }

      const formationDefinition = formationDefinitionsById?.[formationId];
      if (!formationDefinition || formationDefinition.type !== "circle") {
        continue;
      }

      const angularSpeed = Number(formationDefinition.angularSpeedBase) || 0;
      const executeDurationSec =
        Math.abs(angularSpeed) <= 0.0001 ? 0 : (Math.PI * 2 * attackCycles) / Math.abs(angularSpeed);

      resolvedWeapons.push({
        weaponDefId: weaponDefinition.id,
        formationId,
        width: weaponDefinition.width,
        height: weaponDefinition.height,
        radiusPx: (Number(formationDefinition.radiusBase) || 0) * TILE_SIZE,
        angularSpeed,
        centerMode: formationDefinition?.params?.centerMode ?? formationDefinition?.params?.center_mode ?? "player",
        biasStrengthMul: Number(formationDefinition.biasStrengthMul) || 0,
        biasResponseMul: Number(formationDefinition.biasResponseMul) || 0,
        biasOffsetRatioMax: Number(formationDefinition?.clamp?.biasOffsetRatioMax),
        executeDurationSec,
        supported: true,
      });

      executeDurationsSec.push(executeDurationSec);
      periodsSec.push(Math.max(MIN_ENEMY_ATTACK_COOLDOWN_SEC, (Number(weaponDefinition.attackCooldownSec) || 0) * cooldownMul));
    }

    if (resolvedWeapons.length === 0) {
      nextProfiles[enemyDefinition.id] = null;
      continue;
    }

    const windupSec = Math.max(0, Number(aiProfile.attackWindupSec) || 0);
    const recoverSec = Math.max(0, Number(aiProfile.recoverSec) || 0);
    const executeSec = Math.max(0.0001, ...executeDurationsSec);
    const periodSec = Math.max(MIN_ENEMY_ATTACK_COOLDOWN_SEC, ...periodsSec);
    const cooldownAfterRecoverSec = Math.max(0, periodSec - (windupSec + executeSec + recoverSec));

    nextProfiles[enemyDefinition.id] = {
      windupSec,
      recoverSec,
      executeSec,
      cooldownAfterRecoverSec,
      preferredRangePx: Math.max(0, (Number(aiProfile.preferredRangeTiles) || 0) * TILE_SIZE),
      engageRangePx: Math.max(0, (Number(aiProfile.engageRangeTiles) || 0) * TILE_SIZE),
      retreatRangePx: Math.max(0, (Number(aiProfile.retreatRangeTiles) || 0) * TILE_SIZE),
      attackRangePx: (Number(aiProfile.weaponActiveRangeTiles) || 0) * TILE_SIZE,
      losRequired: aiProfile.losRequired === true,
      weaponAimMode: aiProfile.weaponAimMode,
      weaponVisibilityMode: aiProfile.weaponVisibilityMode,
      attackLinked: loadout.attackLinked !== false,
      weapons: resolvedWeapons,
    };
  }

  enemyAttackProfilesByDbId = nextProfiles;
}

async function refreshEnemyResources() {
  const [definitions, aiProfiles, loadouts] = await Promise.all([
    loadEnemyDefinitions(),
    loadEnemyAiProfiles(),
    loadEnemyWeaponLoadouts(),
  ]);
  const assets = await loadEnemyAssets(definitions);
  enemyDefinitions = definitions;
  enemyAssets = assets;
  enemyAiProfilesById = Object.fromEntries(aiProfiles.map((profile) => [profile.id, profile]));
  enemyWeaponLoadoutsById = Object.fromEntries(loadouts.map((loadout) => [loadout.id, loadout]));
}

async function refreshWeaponResources() {
  const [definitions, formations] = await Promise.all([loadWeaponDefinitions(), loadFormationDefinitions()]);
  const assets = await loadWeaponAssets(definitions);

  weaponDefinitions = definitions;
  weaponDefinitionsById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
  formationDefinitionsById = Object.fromEntries(formations.map((formation) => [formation.id, formation]));
  weaponAssets = assets;
}

async function refreshItemResources() {
  const [definitions, chestAssets] = await Promise.all([loadItemDefinitions(), loadTreasureChestAssets()]);
  const assets = await loadItemAssets(definitions);

  itemDefinitions = definitions;
  itemDefinitionsById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
  itemAssetsById = assets;
  treasureChestAssets = chestAssets;
}

function ensurePlayerStateLoaded() {
  if (appState.playerState) {
    return;
  }
  const starterWeaponDefId = resolveStarterWeaponDefId();
  if (starterWeaponDefId) {
    appState.playerState = loadPlayerStateFromStorage(
      appStorage,
      PLAYER_STATE_STORAGE_KEY,
      weaponDefinitionsById,
      starterWeaponDefId,
      nowUnixSec()
    );
    return;
  }
  appState.playerState = createDefaultPlayerState(null, nowUnixSec());
}

function persistPlayerState() {
  if (!appState.playerState) {
    return;
  }

  if (appState.player && !appState.error) {
    syncPlayerStateFromRuntime(appState.playerState, appState.player, appState.weapons, nowUnixSec());
  } else {
    appState.playerState.saved_at = nowUnixSec();
  }
  savePlayerStateToStorage(appStorage, PLAYER_STATE_STORAGE_KEY, appState.playerState);
}

function resetStorageAndReload() {
  if (!appStorage) {
    debugPanel.setStorageDump("localStorage is unavailable.");
    return;
  }

  try {
    if (typeof appStorage.clear === "function") {
      appStorage.clear();
    } else if (typeof appStorage.removeItem === "function") {
      appStorage.removeItem(PLAYER_STATE_STORAGE_KEY);
    }
  } catch (error) {
    debugPanel.setStorageDump(
      `Failed to reset localStorage: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }

  appState.playerState = null;
  debugPanel.setStorageDump(buildLocalStorageDump(appStorage));
  void regenerate(appState.seed);
}

function syncPauseUi() {
  debugPanel.setPaused(appState.isPaused);
}

function syncDamagePreviewUi() {
  debugPanel.setDamagePreviewOnly(appState.debugPlayerDamagePreviewOnly === true);
}

let lastStatsDigest = "";
let lastSystemUiDigest = "";
let pointerDownFeetTileSnapshot = null;

function applySystemUiState(nextSystemUiState) {
  appState.systemUi = nextSystemUiState;
  lastSystemUiDigest = "";
  syncSystemHud();
}

function getInventoryItemCount(systemUi, itemId) {
  const items = Array.isArray(systemUi?.inventory?.items) ? systemUi.inventory.items : [];
  const found = items.find((item) => item.id === itemId);
  return Math.max(0, Math.floor(Number(found?.count) || 0));
}

function getQuickSlotItemId(systemUi, slotIndex) {
  const items = Array.isArray(systemUi?.inventory?.items) ? systemUi.inventory.items : [];
  const found = items.find((item) => item.quickSlot === slotIndex);
  return typeof found?.id === "string" ? found.id : null;
}

function applyHerbHealIfConsumed(beforeSystemUi, afterSystemUi, consumedItemId) {
  if (!appState.player || consumedItemId !== HERB_ITEM_ID) {
    return;
  }

  const beforeCount = getInventoryItemCount(beforeSystemUi, HERB_ITEM_ID);
  const afterCount = getInventoryItemCount(afterSystemUi, HERB_ITEM_ID);
  if (afterCount >= beforeCount) {
    return;
  }

  const currentHp = Number(appState.player.hp) || 0;
  const maxHp = Number(appState.player.maxHp) || 0;
  const nextHp = clamp(currentHp + HERB_HEAL_AMOUNT, 0, maxHp);
  const healedAmount = Math.max(0, Math.round(nextHp - currentHp));
  appState.player.hp = nextHp;

  if (healedAmount > 0) {
    pushFloatingHealPopup(healedAmount, appState.player.x + PLAYER_WIDTH / 2, appState.player.y - 16);
  }
}

function pushFloatingPickupPopup(textKey, x, y) {
  const text = tJa(textKey, textKey);
  appState.damagePopups = [
    ...appState.damagePopups,
    createFloatingTextPopup({
      id: `pickup-text-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      text,
      textKey,
      x,
      y,
      lifetimeSec: 0.75,
      riseSpeedPxPerSec: 22,
      fillStyle: "#ffffff",
      strokeStyle: "#000000",
    }),
  ];
}

function pushFloatingHealPopup(amount, x, y) {
  const healValue = Math.max(0, Math.floor(Number(amount) || 0));
  if (healValue <= 0) {
    return;
  }

  appState.damagePopups = [
    ...appState.damagePopups,
    createFloatingTextPopup({
      id: `heal-text-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      text: `+${healValue}`,
      x,
      y,
      lifetimeSec: 0.7,
      riseSpeedPxPerSec: 24,
      fillStyle: "#94ff87",
      strokeStyle: "#000000",
    }),
  ];
}

function toRuntimeInventoryItem(itemDefinition, itemAsset, count = 1) {
  if (!itemDefinition) {
    return null;
  }

  return {
    id: itemDefinition.id,
    type: itemDefinition.category === "consumable" ? "consumable" : "equipment",
    count: Math.max(1, Math.floor(Number(count) || 1)),
    quickSlot: null,
    iconKey: itemDefinition.id === HERB_ITEM_ID ? "herb" : "item",
    nameKey: itemDefinition.nameKey,
    descriptionKey: itemDefinition.descriptionKey,
    effectKey: itemDefinition.id === HERB_ITEM_ID ? "item_effect_herb_01" : "ui_label_inventory_effect_placeholder",
    iconImageSrc: itemAsset?.src ?? "",
  };
}

function syncGroundItemPickup() {
  if (!appState.player || !Array.isArray(appState.groundItems) || appState.groundItems.length <= 0) {
    return;
  }

  const feetTile = getPlayerFeetTile(appState.player);
  if (!feetTile) {
    return;
  }

  const keptGroundItems = [];
  let systemUi = getSystemUiState();
  let systemUiChanged = false;
  let groundChanged = false;

  for (const groundItem of appState.groundItems) {
    const touched =
      Number.isFinite(groundItem?.tileX) &&
      Number.isFinite(groundItem?.tileY) &&
      Math.floor(groundItem.tileX) === feetTile.tileX &&
      Math.floor(groundItem.tileY) === feetTile.tileY;
    if (!touched) {
      keptGroundItems.push(groundItem);
      continue;
    }

    const runtimeGroundItem = groundItem?.runtimeItem;
    const runtimeItemFromGround =
      runtimeGroundItem &&
      typeof runtimeGroundItem === "object" &&
      typeof runtimeGroundItem.id === "string" &&
      runtimeGroundItem.id.length > 0
        ? {
            id: runtimeGroundItem.id,
            type: typeof runtimeGroundItem.type === "string" ? runtimeGroundItem.type : "consumable",
            count: Math.max(1, Math.floor(Number(groundItem.count) || Number(runtimeGroundItem.count) || 1)),
            quickSlot: null,
            iconKey: typeof runtimeGroundItem.iconKey === "string" ? runtimeGroundItem.iconKey : "item",
            nameKey:
              typeof runtimeGroundItem.nameKey === "string" && runtimeGroundItem.nameKey.length > 0
                ? runtimeGroundItem.nameKey
                : "ui_label_inventory_empty",
            descriptionKey:
              typeof runtimeGroundItem.descriptionKey === "string" && runtimeGroundItem.descriptionKey.length > 0
                ? runtimeGroundItem.descriptionKey
                : "ui_label_inventory_placeholder",
            effectKey:
              typeof runtimeGroundItem.effectKey === "string" && runtimeGroundItem.effectKey.length > 0
                ? runtimeGroundItem.effectKey
                : "ui_label_inventory_effect_placeholder",
            iconImageSrc:
              typeof runtimeGroundItem.iconImageSrc === "string" ? runtimeGroundItem.iconImageSrc : "",
          }
        : null;
    const itemDefinition = itemDefinitionsById?.[groundItem.itemId] ?? null;
    const runtimeItemFromDefinition = itemDefinition
      ? toRuntimeInventoryItem(
          itemDefinition,
          itemAssetsById?.[itemDefinition.id],
          groundItem.count
        )
      : null;
    const runtimeItem = runtimeItemFromGround ?? runtimeItemFromDefinition;
    if (!runtimeItem) {
      keptGroundItems.push(groundItem);
      continue;
    }

    const addResult = tryAddInventoryItem(systemUi, runtimeItem, {
      maxStack: itemDefinition?.maxStack ?? Number.MAX_SAFE_INTEGER,
      successMessageKey: "",
      fullMessageKey: "ui_hint_inventory_full",
    });

    systemUi = addResult.systemUi;
    systemUiChanged = true;
    if (addResult.success) {
      const pickupNameKey =
        typeof runtimeItem.nameKey === "string" && runtimeItem.nameKey.length > 0
          ? runtimeItem.nameKey
          : typeof itemDefinition?.nameKey === "string"
            ? itemDefinition.nameKey
            : "";
      if (pickupNameKey.length > 0) {
        pushFloatingPickupPopup(
          pickupNameKey,
          appState.player.x + PLAYER_WIDTH / 2,
          appState.player.y - 10
        );
      }
      groundChanged = true;
      continue;
    }

    keptGroundItems.push(groundItem);
  }

  if (groundChanged) {
    appState.groundItems = keptGroundItems;
  }

  if (systemUiChanged) {
    applySystemUiState(systemUi);
  }
}

const systemHud = systemUiRoot
  ? createSystemHud(systemUiRoot, {
      onUseQuickSlot: (slotIndex) => {
        const beforeSystemUi = getSystemUiState();
        const quickSlotItemId = getQuickSlotItemId(beforeSystemUi, slotIndex);
        const afterSystemUi = useQuickSlotItem(beforeSystemUi, slotIndex);
        applySystemUiState(afterSystemUi);
        applyHerbHealIfConsumed(beforeSystemUi, afterSystemUi, quickSlotItemId);
      },
      onOpenInventoryWindow: () => {
        applySystemUiState(setInventoryWindowOpen(getSystemUiState(), true));
      },
      onCloseInventoryWindow: () => {
        applySystemUiState(setInventoryWindowOpen(getSystemUiState(), false));
      },
      onSelectInventoryItem: (itemId) => {
        applySystemUiState(selectInventoryItem(getSystemUiState(), itemId));
      },
      onUseSelectedItem: () => {
        const beforeSystemUi = getSystemUiState();
        const selectedItemId = beforeSystemUi.inventory?.selectedItemId;
        const afterSystemUi = useInventoryItem(beforeSystemUi, selectedItemId);
        applySystemUiState(afterSystemUi);
        applyHerbHealIfConsumed(beforeSystemUi, afterSystemUi, selectedItemId);
      },
      onDropSelectedItem: () => {
        if (!appState.dungeon || !appState.player) {
          return;
        }

        const dropResult = dropSelectedInventoryItemToGround(
          getSystemUiState(),
          appState.dungeon,
          appState.player,
          appState.groundItems,
          Date.now()
        );
        applySystemUiState(dropResult.systemUi);
        if (!dropResult.success || !dropResult.droppedGroundItem) {
          return;
        }

        const currentGroundItems = Array.isArray(appState.groundItems) ? appState.groundItems : [];
        appState.groundItems = [...currentGroundItems, dropResult.droppedGroundItem];
      },
    })
  : null;

function buildSystemUiDigest() {
  const inventory = buildInventoryTextState();
  const hud = buildHudTextState();

  return JSON.stringify({
    hpCurrent: hud.hp.current,
    hpMax: hud.hp.max,
    runLevel: hud.runLevel,
    gold: hud.gold,
    buffs: hud.buffs,
    debuffs: hud.debuffs,
    toastMessage: getSystemUiState().toastMessage,
    inventory,
  });
}

function syncSystemHud() {
  if (!systemHud) {
    return;
  }

  const digest = buildSystemUiDigest();
  if (digest === lastSystemUiDigest) {
    return;
  }

  const hud = buildHudTextState();
  const inventory = buildInventoryTextState();
  systemHud.setHud({
    hpCurrent: hud.hp.current,
    hpMax: hud.hp.max,
    runLevel: hud.runLevel,
    gold: hud.gold,
    buffs: hud.buffs,
    debuffs: hud.debuffs,
  });
  systemHud.setInventory({
    capacity: inventory.capacity,
    items: inventory.items,
    selectedItemId: inventory.selectedItemId,
    quickSlots: inventory.quickSlots,
    isWindowOpen: inventory.isWindowOpen,
    toastMessage: getSystemUiState().toastMessage,
  });

  lastSystemUiDigest = digest;
}

function setPaused(paused) {
  appState.isPaused = paused === true;
  syncPauseUi();
}

function togglePause() {
  if (!appState.dungeon || !appState.player || appState.error) {
    return;
  }
  setPaused(!appState.isPaused);
}

function toggleDamagePreview() {
  appState.debugPlayerDamagePreviewOnly = appState.debugPlayerDamagePreviewOnly !== true;
  syncDamagePreviewUi();
  lastStatsDigest = "";
  syncStatsPanel();
}

const debugPanel = createDebugPanel(debugPanelRoot, {
  onApplySeed: (seedInputValue) => {
    const nextSeed = seedInputValue.trim() || appState.seed;
    void regenerate(nextSeed);
  },
  onRegenerate: () => {
    const nextSeed = makeRandomSeed();
    void regenerate(nextSeed);
  },
  onTogglePause: () => {
    togglePause();
  },
  onShowStorage: () => {
    debugPanel.setStorageDump(buildLocalStorageDump(appStorage));
  },
  onResetStorage: () => {
    resetStorageAndReload();
  },
  onToggleDamagePreview: () => {
    toggleDamagePreview();
  },
});
syncPauseUi();
syncDamagePreviewUi();
syncSystemHud();

function buildStatsDigest(dungeon, player, debugPlayerDamagePreviewOnly) {
  if (!dungeon) {
    return "";
  }

  return [
    dungeon.seed,
    dungeon.stats?.roomCount ?? 0,
    dungeon.stats?.mainPathCount ?? 0,
    dungeon.stats?.branchCount ?? 0,
    dungeon.stats?.hasLoop ? 1 : 0,
    Math.round(Number(player?.hp) || 0),
    Math.round(Number(player?.maxHp) || 0),
    debugPlayerDamagePreviewOnly ? 1 : 0,
  ].join("|");
}

function syncStatsPanel() {
  if (!appState.dungeon) {
    return;
  }

  const digest = buildStatsDigest(appState.dungeon, appState.player, appState.debugPlayerDamagePreviewOnly);
  if (digest === lastStatsDigest) {
    return;
  }

  debugPanel.setStats(buildStatsRows(appState.dungeon, appState.player, appState.debugPlayerDamagePreviewOnly));
  lastStatsDigest = digest;
}

createPointerController(canvas, {
  onPointerTarget: (active, worldX, worldY) => {
    if (active !== true) {
      pointerDownFeetTileSnapshot = null;
    }

    if (!appState.player || appState.error) {
      return;
    }

    if (active === true && pointerDownFeetTileSnapshot === null) {
      pointerDownFeetTileSnapshot = getPlayerFeetTile(appState.player);
    }

    if (appState.isPaused && active) {
      return;
    }
    setPointerTarget(appState.player, active, worldX, worldY);
  },
  onPointerClick: (worldX, worldY) => {
    if (!appState.player || !appState.dungeon || appState.error) {
      return;
    }

    const openResult = tryOpenChestByClick(
      appState.treasureChests,
      appState.groundItems,
      appState.player,
      worldX,
      worldY,
      {
        dropItemId: HERB_ITEM_ID,
        interactRangeTiles: 1,
        playerFeetTileOverride: pointerDownFeetTileSnapshot,
        dungeon: appState.dungeon,
      }
    );
    if (!openResult.opened) {
      return;
    }

    appState.treasureChests = openResult.treasureChests;
    appState.groundItems = openResult.groundItems;
  },
});

function renderCurrentFrame() {
  if (appState.error) {
    renderErrorScreen(appState.error);
    return;
  }

  if (!appState.backdrop || !appState.player) {
    return;
  }

  const enemyDrawables = appState.enemies.map((enemy) => ({
    enemy,
    asset: enemyAssets[enemy.dbId] ?? null,
    frame: getEnemyFrame(enemy),
    flashAlpha: getEnemyHitFlashAlpha(enemy),
    telegraphAlpha: getEnemyTelegraphAlpha(enemy),
  }));
  const weaponDrawables = appState.weapons.map((weapon) => ({
    weapon,
    asset: weaponAssets[weapon.weaponDefId] ?? null,
    frame: { row: 0, col: 0 },
    rotationRad: weapon.rotationRad ?? 0,
  }));
  const enemyWeaponDrawables = appState.enemies.flatMap((enemy) =>
    getEnemyWeaponRuntimes(enemy)
      .filter((weapon) => weapon.visible === true)
      .map((weapon) => ({
        weapon,
        asset: weaponAssets[weapon.weaponDefId] ?? null,
        frame: { row: 0, col: 0 },
        rotationRad: weapon.rotationRad ?? 0,
      }))
  );
  const treasureChestDrawables = (appState.treasureChests ?? []).map((chest) => ({
    chest,
    asset: treasureChestAssets[chest.tier] ?? null,
    frameWidth: TREASURE_CHEST_RENDER_FRAME_SIZE,
    frameHeight: TREASURE_CHEST_RENDER_FRAME_SIZE,
    frameRow: chest.isOpened === true ? 1 : 0,
  }));
  const groundItemDrawables = (appState.groundItems ?? []).map((groundItem) => ({
    groundItem,
    asset: itemAssetsById[groundItem.itemId] ?? null,
    label: getIconLabelForKey(groundItem?.runtimeItem?.iconKey ?? groundItem?.itemId ?? "empty"),
    drawSize: TILE_SIZE,
  }));

  renderFrame(
    canvas,
    appState.backdrop,
    playerAsset,
    getPlayerFrame(appState.player),
    appState.player,
    getPlayerHitFlashAlpha(appState.player),
    enemyDrawables,
    weaponDrawables,
    enemyWeaponDrawables,
    treasureChestDrawables,
    groundItemDrawables,
    appState.damagePopups
  );
}

function stepSimulation(dt) {
  if (!appState.dungeon || !appState.player || appState.error || appState.isPaused) {
    return;
  }

  updatePlayer(appState.player, appState.dungeon, dt);
  syncGroundItemPickup();
  updateEnemies(appState.enemies, appState.dungeon, dt, appState.player);
  const playerCombatEvents = updateWeaponsAndCombat(
    appState.weapons,
    appState.player,
    appState.enemies,
    weaponDefinitionsById,
    formationDefinitionsById,
    dt
  );
  const enemyCombatEvents = updateEnemyAttacks(appState.enemies, appState.player, appState.dungeon, dt, {
    applyPlayerHpDamage: appState.debugPlayerDamagePreviewOnly !== true,
  });
  const combatEvents = [...playerCombatEvents, ...enemyCombatEvents];
  const spawnedPopups = spawnDamagePopupsFromEvents(combatEvents, damagePopupSeq);
  damagePopupSeq += 1;
  appState.damagePopups = updateDamagePopups(
    [...appState.damagePopups, ...spawnedPopups],
    dt
  );
  appState.enemies = removeDefeatedEnemies(appState.enemies);
  syncPlayerStateFromRuntime(appState.playerState, appState.player, appState.weapons, nowUnixSec());
  syncStatsPanel();
  syncSystemHud();
  followPlayerInView();
}

let accumulator = 0;
let lastTimestamp = performance.now();

function resetLoopClock() {
  accumulator = 0;
  lastTimestamp = performance.now();
}

function runFrame(timestamp) {
  const elapsed = Math.min(0.25, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;
  accumulator += elapsed;

  while (accumulator >= FIXED_DT) {
    stepSimulation(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  renderCurrentFrame();
  requestAnimationFrame(runFrame);
}

let regenerateRequestId = 0;

async function regenerate(seed) {
  const normalizedSeed = String(seed);
  const requestId = (regenerateRequestId += 1);

  try {
    await Promise.all([refreshEnemyResources(), refreshWeaponResources(), refreshItemResources()]);
    if (requestId !== regenerateRequestId) {
      return;
    }
    buildEnemyAttackProfilesByDbId();
    ensurePlayerStateLoaded();

    const dungeon = generateDungeon({ seed: normalizedSeed });
    const validation = validateDungeon(dungeon);
    dungeon.symbolGrid = resolveWallSymbols(dungeon.floorGrid);
    dungeon.walkableGrid = buildWalkableGrid(dungeon.floorGrid, dungeon.symbolGrid);

    const player = createPlayerState(dungeon);
    if (appState.playerState?.run?.pos) {
      tryRestorePlayerPosition(player, dungeon, appState.playerState.run.pos);
    }
    if (Number.isFinite(appState.playerState?.run?.hp)) {
      player.hp = clamp(appState.playerState.run.hp, 0, player.maxHp);
    }
    const herbDefinition = itemDefinitionsById?.[HERB_ITEM_ID];
    if (!herbDefinition) {
      throw new Error(`Item DB is missing required herb item: ${HERB_ITEM_ID}`);
    }
    const commonTreasureChest = createCommonTreasureChest(dungeon, normalizedSeed);
    const treasureChests = commonTreasureChest ? [commonTreasureChest] : [];
    dungeon.walkableGrid = applyChestBlockingToWalkableGrid(dungeon.walkableGrid, treasureChests);
    const blockedEnemyTiles = buildBlockedTileSetFromChests(treasureChests);
    const enemies = createEnemies(
      dungeon,
      enemyDefinitions,
      normalizedSeed,
      enemyAttackProfilesByDbId,
      blockedEnemyTiles
    );
    const groundItems = [];
    const starterWeaponDefId = resolveStarterWeaponDefId();
    if (!starterWeaponDefId) {
      throw new Error("Weapon DB is empty.");
    }
    const restoredWeaponDefinitions = buildWeaponDefinitionsFromPlayerState(
      appState.playerState,
      weaponDefinitionsById,
      starterWeaponDefId
    );
    const fallbackFormationId = Object.keys(formationDefinitionsById)[0] ?? null;
    const weaponDefinitionsForRun = restoredWeaponDefinitions.map((definition) => {
      if (formationDefinitionsById?.[definition.formationId]) {
        return definition;
      }

      const defaultFormationId = weaponDefinitionsById?.[definition.id]?.formationId;
      if (defaultFormationId && formationDefinitionsById?.[defaultFormationId]) {
        return {
          ...definition,
          formationId: defaultFormationId,
        };
      }

      if (fallbackFormationId) {
        return {
          ...definition,
          formationId: fallbackFormationId,
        };
      }

      return definition;
    });
    if (weaponDefinitionsForRun.length === 0) {
      throw new Error(`Initial weapon is missing in DB: ${starterWeaponDefId}`);
    }

    const weapons = createPlayerWeapons(weaponDefinitionsForRun, formationDefinitionsById, player);
    applySavedWeaponRuntime(appState.playerState, weapons);
    const backdrop = buildDungeonBackdrop(tileAssets, dungeon);
    damagePopupSeq = 0;
    syncPlayerStateFromRuntime(appState.playerState, player, weapons, nowUnixSec());
    const systemUi = createInitialSystemUiState();

    setDungeonState(appState, {
      seed: normalizedSeed,
      dungeon,
      validation,
      playerState: appState.playerState,
      player,
      enemies,
      weapons,
      damagePopups: [],
      treasureChests,
      groundItems,
      systemUi,
      backdrop,
    });

    debugPanel.setSeed(normalizedSeed);
    lastStatsDigest = "";
    lastSystemUiDigest = "";
    syncStatsPanel();
    syncSystemHud();
    debugPanel.setError(validation.ok ? "" : validation.errors.join(" | "));
    syncPauseUi();
    syncDamagePreviewUi();

    if (requestId !== regenerateRequestId) {
      return;
    }

    renderCurrentFrame();
    followPlayerInView();
    persistPlayerState();
    resetLoopClock();
  } catch (error) {
    if (requestId !== regenerateRequestId) {
      return;
    }

    setErrorState(appState, normalizedSeed, error);
    debugPanel.setSeed(normalizedSeed);
    lastStatsDigest = "";
    lastSystemUiDigest = "";
    debugPanel.setStats([]);
    debugPanel.setError(appState.error);
    syncPauseUi();
    syncDamagePreviewUi();
    syncSystemHud();
    renderCurrentFrame();
    persistPlayerState();
    resetLoopClock();
  }
}

window.render_game_to_text = toTextState;
window.advanceTime = (ms = 0) => {
  const duration = Number(ms);
  const requestedMs = Number.isFinite(duration) && duration > 0 ? duration : FRAME_MS;
  const frames = Math.max(1, Math.round(requestedMs / FRAME_MS));

  if (!appState.isPaused) {
    for (let index = 0; index < frames; index += 1) {
      stepSimulation(FIXED_DT);
    }
  }

  renderCurrentFrame();
  return Promise.resolve();
};

window.__regenDungeon = (seed) => {
  if (seed === undefined || seed === null || seed === "") {
    void regenerate(makeRandomSeed());
    return;
  }

  void regenerate(String(seed));
};

setInterval(() => {
  persistPlayerState();
}, PLAYER_STATE_SAVE_INTERVAL_MS);
window.addEventListener("beforeunload", () => {
  persistPlayerState();
});

void regenerate(INITIAL_SEED);
requestAnimationFrame(runFrame);
