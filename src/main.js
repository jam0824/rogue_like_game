import {
  GAME_VIEW_SCALE,
  INITIAL_SEED,
  PLAYER_SPEED_PX_PER_SEC,
  TILE_SIZE,
} from "./config/constants.js";
import { deriveSeed } from "./core/rng.js";
import { loadEnemyAssets } from "./enemy/enemyAsset.js";
import { loadEnemyAiProfiles } from "./enemy/enemyAiProfileDb.js";
import { loadEnemyDefinitions } from "./enemy/enemyDb.js";
import { loadEnemyWeaponLoadouts } from "./enemy/enemyWeaponLoadoutDb.js";
import {
  createEnemies,
  getEnemyTelegraphAlpha,
  isEnemyDeathAnimationFinished,
  getEnemyFrame,
  getEnemyHitFlashAlpha,
  getEnemyWeaponRuntimes,
  getEnemyWallHitbox,
  updateEnemyAttacks,
  updateEnemies,
} from "./enemy/enemySystem.js";
import {
  resolveDungeonBgmSourceOrThrow,
  resolveDungeonEnemyDefinitionsOrThrow,
} from "./dungeon/dungeonRuntimeConfig.js";
import {
  buildFloorSeed,
  clampFloor,
  MAX_FLOOR,
  MIN_FLOOR,
  resolveDungeonIdForFloor,
  resolveFloorFromDungeonId,
} from "./dungeon/floorProgression.js";
import { isPlayerTouchingDownStair, placeDownStairSymbols } from "./dungeon/downStairSystem.js";
import {
  buildFloorTransitionTextState,
  createFloorTransitionState,
  isFloorTransitionBlocking,
  stepFloorTransition,
  startFloorTransition,
  markFloorTransitionDungeonReady,
  isFloorTransitionActive,
  FLOOR_TRANSITION_PHASE,
} from "./dungeon/floorTransitionState.js";
import { generateDungeon } from "./generation/dungeonGenerator.js";
import { validateDungeon } from "./generation/layoutValidator.js";
import { createPointerController } from "./input/pointerController.js";
import { loadItemAssets } from "./item/itemAsset.js";
import { loadItemDefinitions } from "./item/itemDb.js";
import {
  applyChestBlockingToWalkableGrid,
  buildBlockedTileSetFromChests,
  createTreasureChests,
  loadTreasureChestAssets,
  TREASURE_CHEST_RENDER_FRAME_SIZE,
  tryOpenChestByClick,
} from "./item/treasureSystem.js";
import {
  createPlayerState,
  getPlayerFeetHitbox,
  getPlayerFrame,
  getPlayerHitFlashAlpha,
  isPlayerDeathAnimationFinished,
  setPointerTarget,
  tryRestorePlayerPosition,
  updatePlayer,
} from "./player/playerSystem.js";
import {
  applySavedWeaponRuntime,
  beginNewRun,
  buildWeaponDefinitionsFromPlayerState,
  loadPlayerStateFromStorage,
  markRunLostByDeath,
  PLAYER_STATE_LEGACY_STORAGE_KEYS,
  PLAYER_STATE_STORAGE_KEY,
  savePlayerStateToStorage,
  syncPlayerStateFromRuntime,
} from "./player/playerStateStore.js";
import { buildDungeonBackdrop, renderFrame } from "./render/canvasRenderer.js";
import { resolveOverlayCenterWorld } from "./render/floorTransitionOverlayPosition.js";
import { computeCameraScroll, resolveGameViewScale } from "./render/gameViewScale.js";
import { createAppState, setDungeonState, setErrorState } from "./state/appState.js";
import { derivePlayerCombatStats } from "./status/derivedStats.js";
import { loadTileAssets } from "./tiles/tileCatalog.js";
import { loadDungeonDefinitions } from "./tiles/dungeonTileDb.js";
import { buildWalkableGrid } from "./tiles/walkableGrid.js";
import { resolveWallSymbols } from "./tiles/wallSymbolResolver.js";
import {
  buildSceneTransitionTextState,
  createSceneTransitionState,
  isSceneTransitionActive,
  markSceneTransitionReady,
  SCENE_TRANSITION_PHASE,
  startSceneTransition,
  stepSceneTransition,
} from "./scene/sceneTransitionState.js";
import {
  autoArrangeStorage,
  buildStorageFacilityViewModel,
  createStorageFacilityUiState,
  purchaseStorageUpgrade,
  sellSelectedStorageEntries,
  transferStorageEntry,
} from "./surface/storageFacilityState.js";
import { createDebugPanel } from "./ui/debugPanel.js";
import {
  createDebugPerfMetricsTracker,
  getDebugPerfSnapshot,
  recordDebugPerfSample,
  resetDebugPerfMetricsTracker,
} from "./ui/debugPerfMetrics.js";
import { buildPlayerStatusDigest, buildPlayerStatusRows } from "./ui/debugPlayerStatsViewModel.js";
import {
  clearToastMessage,
  buildQuickSlots,
  createInitialSystemUiState,
  closeWeaponSkillEditor,
  dropSelectedInventoryItemToGround,
  openWeaponSkillEditor,
  QUICK_SLOT_COUNT,
  selectChipEntry,
  selectWeaponSlot,
  selectInventoryItem,
  setHeldSkillSource,
  setInventoryWindowOpen,
  setInventoryTab,
  setWeaponSwapTargetSlot,
  tryAddInventoryItem,
  useInventoryItem,
  useQuickSlotItem,
} from "./ui/systemUiState.js";
import { createSystemHud } from "./ui/systemHud.js";
import { createSurfaceStorageHud } from "./ui/surfaceStorageHud.js";
import { getIconLabelForKey, tJa } from "./ui/uiTextJa.js";
import { loadPlayerAsset } from "./player/playerAsset.js";
import { loadDefaultPlayerDefinition } from "./player/playerDb.js";
import { createFloatingTextPopup, spawnDamagePopupsFromEvents, updateDamagePopups } from "./combat/combatFeedbackSystem.js";
import {
  applyHitFlashColorsFromDamageEvents,
  normalizeHitFlashColor,
} from "./combat/hitFlashSystem.js";
import { updateEnemySkillChainCombat, updateSkillChainCombat } from "./combat/skillChainSystem.js";
import { loadEffectDefinitions } from "./effect/effectDb.js";
import { loadEffectAssets } from "./effect/effectAsset.js";
import { createEffectRuntime, updateEffects } from "./effect/effectSystem.js";
import { loadSkillDefinitions } from "./skill/skillDb.js";
import { loadWeaponDefinitions } from "./weapon/weaponDb.js";
import { loadFormationDefinitions } from "./weapon/formationDb.js";
import { loadWeaponAssets } from "./weapon/weaponAsset.js";
import {
  createPlayerWeapons,
  getWeaponHitbox,
  updateWeaponsAndCombat,
} from "./weapon/weaponSystem.js";
import { buildSkillEditorLayout, flattenSkillEditorLayout, swapSkillSlots } from "./ui/weaponSkillLayout.js";
import { createDungeonBgmPlayer } from "./audio/dungeonBgmPlayer.js";
import { createSoundEffectPlayer } from "./audio/soundEffectPlayer.js";
import { loadSoundEffectMap } from "./audio/soundDb.js";

const FIXED_DT = 1 / 60;
const FRAME_MS = 1000 / 60;
const INITIAL_WEAPON_ID = "weapon_sword_01";
const DEFAULT_DUNGEON_ID = resolveDungeonIdForFloor(MIN_FLOOR);
const HERB_ITEM_ID = "item_herb_01";
const HERB_HEAL_AMOUNT = 50;
const SYSTEM_UI_TOAST_DURATION_MS = 1800;
const PLAYER_STATE_SAVE_INTERVAL_MS = 1000;
const MIN_ENEMY_ATTACK_COOLDOWN_SEC = 0.05;
const WEAPON_SLOT_UI_COUNT = 8;
const SE_KEY_OPEN_CHEST = "se_key_open_chest";
const SE_KEY_GET_ITEM = "se_key_get_item";
const SE_KEY_PUT_ITEM = "se_key_put_item";
const SE_KEY_PLAYER_GET_DAMAGE = "se_key_player_get_damage";
const SE_KEY_ENEMY_DEATH = "se_key_enemy_death";
const PLAYER_RENDER_SCALE = 32 / 24;
const FLOOR_TRANSITION_FADE_OUT_SEC = 0.35;
const FLOOR_TRANSITION_TITLE_HOLD_SEC = 1;
const FLOOR_TRANSITION_FADE_IN_SEC = 0.35;
const SCENE_TRANSITION_FADE_IN_SEC = 0.35;
const SCENE_TRANSITION_TITLE_HOLD_SEC = 1;
const SCENE_TRANSITION_FADE_OUT_SEC = 0.35;
const STORAGE_SCENE_TRANSITION_TITLE_HOLD_SEC = 0;
const SCENE_TRANSITION_DEATH_FADE_SEC = 0.75;
const SCENE_TRANSITION_DEATH_TITLE_HOLD_SEC = 1.2;
const PLAYER_DEATH_POST_ANIM_DELAY_SEC = 1.0;
const VIEW_MODE = {
  SURFACE: "surface",
  DUNGEON: "dungeon",
};
const SURFACE_SCREEN = {
  HUB: "hub",
  STORAGE: "storage",
};
const SCENE_TRANSITION_KIND = {
  SURFACE_TO_DUNGEON: "surface_to_dungeon",
  SURFACE_HUB_TO_STORAGE: "surface_hub_to_storage",
  SURFACE_STORAGE_TO_HUB: "surface_storage_to_hub",
  PLAYER_DEATH: "player_death",
};

const appState = createAppState(INITIAL_SEED);
const dungeonBgmPlayer = createDungeonBgmPlayer();
const soundEffectPlayer = createSoundEffectPlayer();
const floorTransitionState = createFloorTransitionState({
  fadeOutSec: FLOOR_TRANSITION_FADE_OUT_SEC,
  titleHoldSec: FLOOR_TRANSITION_TITLE_HOLD_SEC,
  fadeInSec: FLOOR_TRANSITION_FADE_IN_SEC,
});
const sceneTransitionState = createSceneTransitionState({
  fadeInSec: SCENE_TRANSITION_FADE_IN_SEC,
  titleHoldSec: SCENE_TRANSITION_TITLE_HOLD_SEC,
  fadeOutSec: SCENE_TRANSITION_FADE_OUT_SEC,
});
let floorTransitionLoadPromise = null;
let sceneTransitionLoadPromise = null;
let viewMode = VIEW_MODE.SURFACE;
let surfaceScreen = SURFACE_SCREEN.HUB;
const storageFacilityUiState = createStorageFacilityUiState();
let surfaceStorageHud = null;
const debugPerfMetricsTracker = createDebugPerfMetricsTracker({
  windowMs: 1000,
  publishIntervalMs: 250,
  slowFrameThresholdMs: FRAME_MS,
});
const canvas = document.querySelector("#dungeon-canvas");
const canvasScroll = document.querySelector("#canvas-scroll");
const surfaceLayer = document.querySelector("#surface-layer");
const surfaceStorageRoot = document.querySelector("#surface-storage-root");
const surfaceFacilityButtons = Array.from(document.querySelectorAll("[data-surface-facility]"));
const sceneTransitionOverlay = document.querySelector("#scene-transition-overlay");
const sceneTransitionTitle = document.querySelector("#scene-transition-title");
const debugPanelRoot = document.querySelector("#debug-panel");
const systemUiRoot = document.querySelector("#system-ui-layer");
const gameViewScale = resolveGameViewScale(GAME_VIEW_SCALE);

function applyCanvasDisplayScale() {
  canvas.style.width = `${canvas.width * gameViewScale}px`;
  canvas.style.height = `${canvas.height * gameViewScale}px`;
}

applyCanvasDisplayScale();

function syncSurfaceScreenUi() {
  if (!surfaceLayer) {
    return;
  }
  const nextScreen = surfaceScreen === SURFACE_SCREEN.STORAGE ? SURFACE_SCREEN.STORAGE : SURFACE_SCREEN.HUB;
  surfaceLayer.dataset.surfaceScreen = nextScreen;
  if (surfaceStorageRoot) {
    surfaceStorageRoot.hidden = !(viewMode === VIEW_MODE.SURFACE && nextScreen === SURFACE_SCREEN.STORAGE);
  }
}

function syncViewModeUi() {
  const isSurface = viewMode === VIEW_MODE.SURFACE;
  if (surfaceLayer) {
    surfaceLayer.hidden = !isSurface;
  }
  if (systemUiRoot) {
    systemUiRoot.hidden = isSurface;
  }
  syncSurfaceScreenUi();
  syncStorageFacilityHud();
}

function setSurfaceScreen(screen) {
  surfaceScreen = screen === SURFACE_SCREEN.STORAGE ? SURFACE_SCREEN.STORAGE : SURFACE_SCREEN.HUB;
  syncSurfaceScreenUi();
}

function setViewMode(mode) {
  viewMode = mode === VIEW_MODE.DUNGEON ? VIEW_MODE.DUNGEON : VIEW_MODE.SURFACE;
  if (viewMode !== VIEW_MODE.SURFACE) {
    surfaceScreen = SURFACE_SCREEN.HUB;
    storageFacilityUiState.open = false;
  }
  syncViewModeUi();
}

function renderSceneTransitionOverlay() {
  if (!sceneTransitionOverlay || !sceneTransitionTitle) {
    return;
  }

  if (!isSceneTransitionActive(sceneTransitionState)) {
    sceneTransitionOverlay.hidden = true;
    sceneTransitionOverlay.style.pointerEvents = "none";
    sceneTransitionOverlay.style.backgroundColor = "rgba(0, 0, 0, 0)";
    sceneTransitionTitle.hidden = true;
    sceneTransitionTitle.textContent = "";
    sceneTransitionTitle.style.color = "";
    sceneTransitionTitle.style.fontSize = "";
    return;
  }

  const alpha = clamp(Number(sceneTransitionState.alpha) || 0, 0, 1);
  if (alpha <= 0) {
    sceneTransitionOverlay.hidden = true;
    sceneTransitionOverlay.style.pointerEvents = "none";
    sceneTransitionOverlay.style.backgroundColor = "rgba(0, 0, 0, 0)";
    sceneTransitionTitle.hidden = true;
    return;
  }

  sceneTransitionOverlay.hidden = false;
  sceneTransitionOverlay.style.pointerEvents = "auto";
  sceneTransitionOverlay.style.backgroundColor = `rgba(0, 0, 0, ${alpha})`;

  if (sceneTransitionState.phase !== SCENE_TRANSITION_PHASE.TITLE_HOLD) {
    sceneTransitionTitle.hidden = true;
    sceneTransitionTitle.textContent = "";
    return;
  }

  const isDeath = sceneTransitionState.kind === SCENE_TRANSITION_KIND.PLAYER_DEATH;
  sceneTransitionTitle.hidden = false;
  sceneTransitionTitle.textContent = sceneTransitionState.titleText || "";
  sceneTransitionTitle.style.color = sceneTransitionState.titleColor || "#f4f4f4";
  sceneTransitionTitle.style.fontSize = isDeath ? "clamp(78px, 12vw, 140px)" : "clamp(64px, 10vw, 120px)";
}

setViewMode(VIEW_MODE.SURFACE);

function retryAudioPlayback() {
  void dungeonBgmPlayer.retryPending();
  void soundEffectPlayer.retryPending();
}

window.addEventListener("pointerdown", retryAudioPlayback);
window.addEventListener("keydown", retryAudioPlayback);

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const appStorage = getStorage();

function purgeLegacyPlayerStateStorage(storage) {
  if (!storage || typeof storage.removeItem !== "function") {
    return;
  }

  for (const legacyKey of PLAYER_STATE_LEGACY_STORAGE_KEYS) {
    if (typeof legacyKey !== "string" || legacyKey.length <= 0 || legacyKey === PLAYER_STATE_STORAGE_KEY) {
      continue;
    }
    try {
      storage.removeItem(legacyKey);
    } catch {
      // noop: storage can throw in restricted/private mode
    }
  }
}

purgeLegacyPlayerStateStorage(appStorage);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function hasPerfSamples(perfSnapshot) {
  return Number(perfSnapshot?.sampleCount) > 0;
}

function formatPerfFps(perfSnapshot) {
  if (!hasPerfSamples(perfSnapshot)) {
    return "-";
  }

  const fps = Number(perfSnapshot.fps);
  if (!Number.isFinite(fps)) {
    return "-";
  }

  return fps.toFixed(1);
}

function formatPerfAvgMs(perfSnapshot, key) {
  if (!hasPerfSamples(perfSnapshot)) {
    return "-";
  }

  const value = Number(perfSnapshot?.[key]);
  if (!Number.isFinite(value)) {
    return "-";
  }

  return value.toFixed(2);
}

function formatSlowFrameCount(perfSnapshot) {
  if (!hasPerfSamples(perfSnapshot)) {
    return "-";
  }

  const slowFrames = Number(perfSnapshot.slowFrames);
  if (!Number.isFinite(slowFrames)) {
    return "-";
  }

  return String(Math.max(0, Math.round(slowFrames)));
}

function getPlayerDimensions(player) {
  const width = Number.isFinite(player?.width) && player.width > 0 ? player.width : 24;
  const height = Number.isFinite(player?.height) && player.height > 0 ? player.height : 24;
  const requestedFootHitboxHeight =
    Number.isFinite(player?.footHitboxHeight) && player.footHitboxHeight > 0
      ? player.footHitboxHeight
      : height;
  const footHitboxHeight = clamp(requestedFootHitboxHeight, 1, height);

  return {
    width,
    height,
    footHitboxHeight,
  };
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

function buildStatsRows(dungeon, player = null, debugPlayerDamagePreviewOnly = false, perfSnapshot = null) {
  const hpValue =
    player && Number.isFinite(player.hp) && Number.isFinite(player.maxHp)
      ? `${Math.max(0, Math.round(player.hp))} / ${Math.max(0, Math.round(player.maxHp))}`
      : "-";
  const damageMode = debugPlayerDamagePreviewOnly ? "演出のみ（HP減少なし）" : "通常";
  const perf = hasPerfSamples(perfSnapshot) ? perfSnapshot : null;

  return [
    { label: "seed", value: dungeon.seed },
    { label: "dungeon_id", value: dungeon.dungeonId ?? "-" },
    { label: "floor", value: Number.isFinite(dungeon.floor) ? Math.floor(dungeon.floor) : "-" },
    { label: "wall_height", value: dungeon.wallHeightTiles ?? "-" },
    { label: "HP", value: hpValue },
    { label: "被ダメ設定", value: damageMode },
    { label: "fps(avg1s)", value: formatPerfFps(perf) },
    { label: "frame_ms(avg1s)", value: formatPerfAvgMs(perf, "frameMsAvg") },
    { label: "update_ms(avg1s)", value: formatPerfAvgMs(perf, "updateMsAvg") },
    { label: "render_ms(avg1s)", value: formatPerfAvgMs(perf, "renderMsAvg") },
    { label: "slow_frames(>16.7ms/1s)", value: formatSlowFrameCount(perf) },
  ];
}

function getRunLevel(playerState) {
  const runLevel = Number(playerState?.run?.run_level);
  if (!Number.isFinite(runLevel)) {
    return 1;
  }
  return Math.max(1, Math.round(runLevel));
}

function getRunFloor(playerState) {
  return clampFloor(playerState?.run?.floor ?? MIN_FLOOR);
}

function setRunFloor(playerState, floor) {
  if (!playerState || typeof playerState !== "object") {
    return;
  }

  if (!playerState.run || typeof playerState.run !== "object") {
    playerState.run = {};
  }
  playerState.run.floor = clampFloor(floor);
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

function toStorageSelectionKey(pane, index) {
  const normalizedPane = pane === "stash" ? "stash" : "run";
  const normalizedIndex = Math.max(0, Math.floor(Number(index) || 0));
  return `${normalizedPane}:${normalizedIndex}`;
}

function parseStorageSelectionKey(rawKey) {
  if (typeof rawKey !== "string") {
    return null;
  }
  const [paneText, indexText] = rawKey.split(":");
  const pane = paneText === "stash" ? "stash" : paneText === "run" ? "run" : "";
  const index = Number(indexText);
  if (!pane || !Number.isFinite(index)) {
    return null;
  }
  return {
    pane,
    index: Math.max(0, Math.floor(index)),
  };
}

function resolveStoragePaneEntries(playerState, pane) {
  if (pane === "stash") {
    const stash = Array.isArray(playerState?.base?.stash?.items) ? playerState.base.stash.items : [];
    return stash;
  }
  return Array.isArray(playerState?.run?.inventory) ? playerState.run.inventory : [];
}

function isValidStorageSelectionKey(playerState, rawKey) {
  const parsed = parseStorageSelectionKey(rawKey);
  if (!parsed) {
    return false;
  }
  const entries = resolveStoragePaneEntries(playerState, parsed.pane);
  return parsed.index >= 0 && parsed.index < entries.length;
}

function sanitizeStorageSelectionState(playerState) {
  if (!playerState || typeof playerState !== "object") {
    storageFacilityUiState.selectedPane = "run";
    storageFacilityUiState.selectedIndex = -1;
    storageFacilityUiState.sellSelection = [];
    return;
  }

  const selectedPane = storageFacilityUiState.selectedPane === "stash" ? "stash" : "run";
  const selectedIndex = Number.isInteger(storageFacilityUiState.selectedIndex)
    ? storageFacilityUiState.selectedIndex
    : -1;
  const selectedEntries = resolveStoragePaneEntries(playerState, selectedPane);
  if (selectedIndex < 0 || selectedIndex >= selectedEntries.length) {
    storageFacilityUiState.selectedPane = "run";
    storageFacilityUiState.selectedIndex = -1;
  } else {
    storageFacilityUiState.selectedPane = selectedPane;
    storageFacilityUiState.selectedIndex = selectedIndex;
  }

  const nextSellSelection = [];
  for (const rawKey of Array.isArray(storageFacilityUiState.sellSelection) ? storageFacilityUiState.sellSelection : []) {
    if (!isValidStorageSelectionKey(playerState, rawKey)) {
      continue;
    }
    nextSellSelection.push(rawKey);
  }
  storageFacilityUiState.sellSelection = Array.from(new Set(nextSellSelection));
}

function buildStorageFacilityVm(playerState) {
  const targetPlayerState = playerState && typeof playerState === "object" ? playerState : appState.playerState;
  if (!targetPlayerState) {
    return null;
  }

  sanitizeStorageSelectionState(targetPlayerState);
  return buildStorageFacilityViewModel({
    playerState: targetPlayerState,
    uiState: storageFacilityUiState,
    itemDefinitionsById,
    weaponDefinitionsById,
    resolveEntryIconSrc: resolveStorageEntryIconSrc,
    t: tJa,
  });
}

function setStorageFacilityToast(message) {
  storageFacilityUiState.toastMessage = typeof message === "string" ? message : "";
}

function clearStorageFacilityToast() {
  storageFacilityUiState.toastMessage = "";
}

function resolveGraphicAssetSrc(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length <= 0) {
    return "";
  }

  const normalized = relativePath.replace(/^\/+/, "");
  const resolvedPath = normalized.startsWith("graphic/") ? normalized : `graphic/${normalized}`;
  try {
    return new URL(`../${resolvedPath}`, import.meta.url).href;
  } catch {
    return "";
  }
}

function resolveStorageEntryIconSrc(entry) {
  const type = typeof entry?.type === "string" ? entry.type : "";
  if (type === "item") {
    const itemDefId = typeof entry?.item_def_id === "string" ? entry.item_def_id : "";
    const iconFileName = typeof itemDefinitionsById?.[itemDefId]?.iconFileName === "string"
      ? itemDefinitionsById[itemDefId].iconFileName.trim()
      : "";
    if (!iconFileName) {
      return "";
    }
    if (iconFileName.includes("/") || iconFileName.startsWith("graphic/")) {
      return resolveGraphicAssetSrc(iconFileName);
    }
    return resolveGraphicAssetSrc(`item/${iconFileName}`);
  }

  if (type === "weapon") {
    const weaponDefId = typeof entry?.weapon_def_id === "string" ? entry.weapon_def_id : "";
    const iconFileName = typeof weaponDefinitionsById?.[weaponDefId]?.iconFileName === "string"
      ? weaponDefinitionsById[weaponDefId].iconFileName.trim()
      : "";
    return resolveGraphicAssetSrc(iconFileName);
  }

  return "";
}

function getSkillTypeLabel(skillType) {
  if (skillType === "attack") {
    return tJa("ui_label_skill_type_attack");
  }
  if (skillType === "modifier") {
    return tJa("ui_label_skill_type_modifier");
  }
  if (skillType === "passive") {
    return tJa("ui_label_skill_type_passive");
  }
  if (skillType === "orbit") {
    return tJa("ui_label_skill_type_orbit");
  }
  if (skillType === "replicate") {
    return tJa("ui_label_skill_type_replicate");
  }
  if (skillType === "reaction_boost") {
    return tJa("ui_label_skill_type_reaction_boost");
  }
  return skillType ?? "";
}

function getEquippedWeaponEntriesSorted(playerState) {
  const entries = Array.isArray(playerState?.run?.equipped_weapons) ? playerState.run.equipped_weapons : [];
  return entries
    .filter((entry) => entry && typeof entry === "object" && entry.weapon && typeof entry.weapon === "object")
    .slice()
    .sort((a, b) => (Number(a?.slot) || 0) - (Number(b?.slot) || 0));
}

function buildEquippedWeaponSlotsView() {
  const slots = Array.from({ length: WEAPON_SLOT_UI_COUNT }, (_, slot) => ({
    slot,
    entry: null,
    weaponInstance: null,
    runtimeWeapon: null,
    weaponDefinition: null,
  }));
  const sortedEntries = getEquippedWeaponEntriesSorted(appState.playerState);
  for (const entry of sortedEntries) {
    const slot = Math.max(0, Math.floor(Number(entry?.slot) || 0));
    if (slot >= WEAPON_SLOT_UI_COUNT) {
      continue;
    }
    slots[slot].entry = entry;
    slots[slot].weaponInstance = entry.weapon;
    slots[slot].weaponDefinition = weaponDefinitionsById?.[entry.weapon.weapon_def_id] ?? null;
  }

  for (let index = 0; index < sortedEntries.length; index += 1) {
    const slot = Math.max(0, Math.floor(Number(sortedEntries[index]?.slot) || 0));
    if (slot < 0 || slot >= WEAPON_SLOT_UI_COUNT) {
      continue;
    }
    slots[slot].runtimeWeapon = appState.weapons[index] ?? null;
  }

  return slots;
}

function normalizeWeaponSlotForUi(slot, fallback = 0) {
  const normalized = Math.max(0, Math.floor(Number(slot) || 0));
  if (normalized >= WEAPON_SLOT_UI_COUNT) {
    return fallback;
  }
  return normalized;
}

function resolveFormationIdFromSlotView(slotView) {
  const candidates = [
    slotView?.weaponInstance?.formation_id,
    slotView?.runtimeWeapon?.formationId,
    slotView?.weaponDefinition?.formationId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return Object.keys(formationDefinitionsById ?? {})[0] ?? "";
}

function isEnemyOnlyFormation(definition) {
  return Array.isArray(definition?.tags) && definition.tags.includes("enemy_only");
}

function getFormationSortOrder(definition) {
  const sortOrder = Number(definition?.ui?.sortOrder ?? definition?.ui?.sort_order ?? 0);
  if (!Number.isFinite(sortOrder)) {
    return 0;
  }
  return Math.floor(sortOrder);
}

function buildFormationSlotView(slotView) {
  if (!slotView?.weaponInstance) {
    return null;
  }

  const formationId = resolveFormationIdFromSlotView(slotView);
  if (typeof formationId !== "string" || formationId.length <= 0) {
    return null;
  }

  const definition = formationDefinitionsById?.[formationId] ?? null;
  const nameKey = typeof definition?.nameKey === "string" ? definition.nameKey : "";
  const descriptionKey = typeof definition?.descriptionKey === "string" ? definition.descriptionKey : "";
  const name = tJa(nameKey, formationId);
  const description = descriptionKey ? tJa(descriptionKey, descriptionKey) : "";
  return {
    formationId,
    nameKey,
    name,
    descriptionKey,
    description,
    iconImageSrc: resolveGraphicAssetSrc(definition?.ui?.iconFileName ?? definition?.ui?.icon_file_name ?? ""),
  };
}

function buildFormationOptionsForSlotView(slotView) {
  if (!slotView?.weaponInstance) {
    return [];
  }

  const selectedFormationId = resolveFormationIdFromSlotView(slotView);
  const definitions = Object.values(formationDefinitionsById ?? {})
    .filter((definition) => definition && typeof definition.id === "string" && definition.id.length > 0)
    .filter((definition) => !isEnemyOnlyFormation(definition))
    .sort((a, b) => {
      const orderDiff = getFormationSortOrder(a) - getFormationSortOrder(b);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return a.id.localeCompare(b.id);
    });

  return definitions.map((definition) => {
    const nameKey = typeof definition?.nameKey === "string" ? definition.nameKey : "";
    const descriptionKey = typeof definition?.descriptionKey === "string" ? definition.descriptionKey : "";
    return {
      formationId: definition.id,
      nameKey,
      name: tJa(nameKey, definition.id),
      descriptionKey,
      description: descriptionKey ? tJa(descriptionKey, descriptionKey) : "",
      iconImageSrc: resolveGraphicAssetSrc(definition?.ui?.iconFileName ?? definition?.ui?.icon_file_name ?? ""),
      isSelected: definition.id === selectedFormationId,
    };
  });
}

function resolveWeaponDetailFromSlot(slotView) {
  if (!slotView?.weaponInstance) {
    return null;
  }

  const weaponInstance = slotView.weaponInstance;
  const weaponDefinition = slotView.weaponDefinition;
  const weaponNameKey =
    typeof weaponDefinition?.nameKey === "string" && weaponDefinition.nameKey.length > 0
      ? weaponDefinition.nameKey
      : "";
  const rarity =
    typeof weaponInstance.rarity === "string" && weaponInstance.rarity.length > 0
      ? weaponInstance.rarity
      : typeof weaponDefinition?.rarity === "string"
        ? weaponDefinition.rarity
        : "-";

  const skills = Array.isArray(weaponInstance.skills) ? weaponInstance.skills : [];
  const formationSlot = buildFormationSlotView(slotView);
  const formationName = formationSlot ? tJa(formationSlot.nameKey, formationSlot.name ?? formationSlot.formationId) : "-";
  const skillNames = skills.map((skill) => {
    const skillDefinition = skillDefinitionsById?.[skill?.id];
    const skillNameKey =
      typeof skillDefinition?.nameKey === "string" && skillDefinition.nameKey.length > 0
        ? skillDefinition.nameKey
        : skill?.id ?? "";
    const plus = Math.max(0, Math.floor(Number(skill?.plus) || 0));
    return plus > 0 ? `${tJa(skillNameKey, skillNameKey)} +${plus}` : tJa(skillNameKey, skillNameKey);
  });

  return {
    hasWeapon: true,
    weaponDefId: weaponInstance.weapon_def_id,
    nameKey: weaponNameKey,
    name: tJa(weaponNameKey, weaponNameKey || weaponInstance.weapon_def_id),
    rarity,
    rarityText: rarity,
    iconImageSrc: resolveGraphicAssetSrc(weaponDefinition?.iconFileName ?? ""),
    stats: [
      {
        label: tJa("ui_label_weapon_stat_formation", "Formation"),
        value: formationName,
      },
      {
        label: tJa("ui_label_weapon_stat_damage", "Base DMG"),
        value: Math.max(0, Math.floor(Number(weaponDefinition?.baseDamage) || 0)),
      },
      {
        label: tJa("ui_label_weapon_stat_cooldown", "Cooldown"),
        value: `${Math.max(0, Number(weaponDefinition?.attackCooldownSec) || 0).toFixed(2)}s`,
      },
      {
        label: tJa("ui_label_weapon_stat_pierce", "Pierce"),
        value: Math.max(0, Math.floor(Number(weaponDefinition?.pierceCount) || 0)),
      },
      {
        label: tJa("ui_label_weapon_stat_chip_slots", "Chip Slots"),
        value: Math.max(0, Math.floor(Number(weaponDefinition?.chipSlotCount) || skills.length)),
      },
    ],
    skillNames: skillNames.length > 0 ? skillNames : [tJa("ui_label_weapon_skill_list_empty", "No Skills")],
  };
}

function buildWeaponUiViewModel(systemUiState) {
  const inventory = systemUiState?.inventory ?? {};
  const weaponUi = inventory.weaponUi && typeof inventory.weaponUi === "object" ? inventory.weaponUi : {};
  const selectedSlot = normalizeWeaponSlotForUi(weaponUi.selectedSlot, 0);
  const swapTargetSlot = Number.isInteger(weaponUi.swapTargetSlot)
    ? normalizeWeaponSlotForUi(weaponUi.swapTargetSlot, selectedSlot)
    : null;
  const slots = buildEquippedWeaponSlotsView();
  const slotView = slots[selectedSlot] ?? null;

  const skillEditorState = weaponUi.skillEditor && typeof weaponUi.skillEditor === "object" ? weaponUi.skillEditor : {};
  const skillEditorSlot = Number.isInteger(skillEditorState.weaponSlot)
    ? normalizeWeaponSlotForUi(skillEditorState.weaponSlot, selectedSlot)
    : selectedSlot;
  const skillEditorSlotView = slots[skillEditorSlot] ?? null;
  const chipSlotCount = Math.max(
    0,
    Math.floor(Number(skillEditorSlotView?.weaponDefinition?.chipSlotCount) || Number(skillEditorSlotView?.weaponInstance?.skills?.length) || 0)
  );
  const skillLayout = buildSkillEditorLayout(skillEditorSlotView?.weaponInstance?.skills, chipSlotCount, skillDefinitionsById);
  const heldSource = skillEditorState.heldSource ?? null;
  const heldSkill =
    heldSource && heldSource.row === "chain" ? skillLayout.chainSlots[heldSource.index] ?? null : null;
  const heldName = heldSkill ? tJa(skillDefinitionsById?.[heldSkill.id]?.nameKey, heldSkill.id) : "-";

  const chainSlots = skillLayout.chainSlots.map((skill, index) => {
    const skillDefinition = skillDefinitionsById?.[skill?.id] ?? null;
    return {
      index,
      skillId: skill?.id ?? "",
      name: skill ? tJa(skillDefinition?.nameKey, skill.id) : "",
      plus: Math.max(0, Math.floor(Number(skill?.plus) || 0)),
      skillType: skillDefinition?.skillType ?? "",
      iconImageSrc: resolveGraphicAssetSrc(skillDefinition?.ui?.iconFileName ?? ""),
    };
  });

  const formationSlot = buildFormationSlotView(skillEditorSlotView);
  const formationOptions = buildFormationOptionsForSlotView(skillEditorSlotView);

  return {
    selectedSlot,
    swapTargetSlot,
    canEquipSwap: Number.isInteger(swapTargetSlot),
    slots: slots.map((slotEntry, slot) => ({
      slot,
      hasWeapon: !!slotEntry.weaponInstance,
      weaponDefId: slotEntry.weaponInstance?.weapon_def_id ?? "",
      nameKey: slotEntry.weaponDefinition?.nameKey ?? "",
      name: slotEntry.weaponDefinition?.nameKey ? tJa(slotEntry.weaponDefinition.nameKey) : "",
      rarity: slotEntry.weaponInstance?.rarity ?? slotEntry.weaponDefinition?.rarity ?? "",
      iconImageSrc: resolveGraphicAssetSrc(slotEntry.weaponDefinition?.iconFileName ?? ""),
    })),
    details: resolveWeaponDetailFromSlot(slotView),
    skillEditor: {
      isOpen: skillEditorState.isOpen === true,
      weaponSlot: skillEditorSlot,
      weaponNameKey: skillEditorSlotView?.weaponDefinition?.nameKey ?? "",
      weaponName: skillEditorSlotView?.weaponDefinition?.nameKey
        ? tJa(skillEditorSlotView.weaponDefinition.nameKey)
        : tJa("ui_label_weapon_none"),
      weaponIconImageSrc: resolveGraphicAssetSrc(skillEditorSlotView?.weaponDefinition?.iconFileName ?? ""),
      heldSource,
      heldLabel: `${tJa("ui_label_skill_editor_holding_prefix", "Selected Skill")}: ${heldName}`,
      chainSlots,
      formationSlot,
      formationOptions,
    },
  };
}

function buildChipUiViewModel(systemUiState) {
  const inventory = systemUiState?.inventory ?? {};
  const selectedChipKey =
    typeof inventory?.chipUi?.selectedChipKey === "string" && inventory.chipUi.selectedChipKey.length > 0
      ? inventory.chipUi.selectedChipKey
      : null;
  const slots = buildEquippedWeaponSlotsView();
  const entries = [];

  for (const slot of slots) {
    if (!slot.weaponInstance || !Array.isArray(slot.weaponInstance.skills)) {
      continue;
    }
    for (let index = 0; index < slot.weaponInstance.skills.length; index += 1) {
      const skillInstance = slot.weaponInstance.skills[index];
      const skillDefinition = skillDefinitionsById?.[skillInstance?.id] ?? null;
      const key = `${slot.slot}:${index}:${skillInstance?.id ?? ""}`;
      entries.push({
        key,
        slot: slot.slot,
        index,
        skillId: skillInstance?.id ?? "",
        plus: Math.max(0, Math.floor(Number(skillInstance?.plus) || 0)),
        nameKey: skillDefinition?.nameKey ?? "",
        name: tJa(skillDefinition?.nameKey, skillInstance?.id ?? ""),
        descriptionKey: skillDefinition?.descriptionKey ?? "",
        description: tJa(skillDefinition?.descriptionKey, skillDefinition?.descriptionKey ?? ""),
        skillType: skillDefinition?.skillType ?? "",
        skillTypeText: getSkillTypeLabel(skillDefinition?.skillType ?? ""),
        iconImageSrc: resolveGraphicAssetSrc(skillDefinition?.ui?.iconFileName ?? ""),
      });
    }
  }

  const fallbackSelected = selectedChipKey && entries.some((entry) => entry.key === selectedChipKey)
    ? selectedChipKey
    : entries[0]?.key ?? null;
  const selected = entries.find((entry) => entry.key === fallbackSelected) ?? null;

  return {
    selectedChipKey: fallbackSelected,
    entries,
    details: selected
      ? {
          ...selected,
        }
      : null,
  };
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
  const activeTab = systemUi.inventory?.activeTab === "weapon" || systemUi.inventory?.activeTab === "chip"
    ? systemUi.inventory.activeTab
    : "item";
  const selectedSlot = normalizeWeaponSlotForUi(systemUi.inventory?.weaponUi?.selectedSlot, 0);
  const swapTargetSlot = Number.isInteger(systemUi.inventory?.weaponUi?.swapTargetSlot)
    ? normalizeWeaponSlotForUi(systemUi.inventory.weaponUi.swapTargetSlot, selectedSlot)
    : null;
  const skillEditor = systemUi.inventory?.weaponUi?.skillEditor ?? {};

  return {
    capacity: Number(systemUi.inventory?.capacity) || 10,
    isWindowOpen: systemUi.inventory?.isWindowOpen === true,
    selectedItemId: typeof systemUi.inventory?.selectedItemId === "string" ? systemUi.inventory.selectedItemId : null,
    activeTab,
    weaponUi: {
      selectedSlot,
      swapTargetSlot,
      skillEditor: {
        isOpen: skillEditor.isOpen === true,
        weaponSlot: Number.isInteger(skillEditor.weaponSlot) ? normalizeWeaponSlotForUi(skillEditor.weaponSlot, selectedSlot) : null,
        heldSource:
          skillEditor.heldSource &&
          typeof skillEditor.heldSource === "object" &&
          skillEditor.heldSource.row === "chain" &&
          Number.isFinite(skillEditor.heldSource.index)
            ? {
                row: "chain",
                index: Math.max(0, Math.floor(Number(skillEditor.heldSource.index))),
              }
            : null,
      },
    },
    chipUi: {
      selectedChipKey:
        typeof systemUi.inventory?.chipUi?.selectedChipKey === "string" &&
        systemUi.inventory.chipUi.selectedChipKey.length > 0
          ? systemUi.inventory.chipUi.selectedChipKey
          : null,
    },
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

  const dimensions = getPlayerDimensions(player);
  const feetX = player.x + dimensions.width / 2;
  const feetY = player.y + dimensions.height - dimensions.footHitboxHeight / 2;
  return {
    tileX: Math.floor(feetX / TILE_SIZE),
    tileY: Math.floor(feetY / TILE_SIZE),
  };
}

function buildWeaponTextState(weapon) {
  const hitbox = getWeaponHitbox(weapon);
  const attackMotionPhase =
    typeof weapon?.attackMotionPhase === "string" && weapon.attackMotionPhase.length > 0
      ? weapon.attackMotionPhase
      : "idle";

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
    attackMotionPhase,
    isAttackActive: attackMotionPhase === "burst",
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
  const dimensions = getPlayerDimensions(player);
  const poison = player?.ailments?.poison;

  return {
    x: round2(player.x),
    y: round2(player.y),
    width: dimensions.width,
    height: dimensions.height,
    hp: round2(player.hp ?? 0),
    maxHp: round2(player.maxHp ?? 0),
    hitFlashAlpha: round2(getPlayerHitFlashAlpha(player)),
    hitFlashColor: normalizeHitFlashColor(player?.hitFlashColor),
    feetHitbox: getPlayerFeetHitbox(player),
    facing: player.facing,
    isMoving: player.isMoving,
    target: player.target
      ? {
          x: round2(player.target.x),
          y: round2(player.target.y),
        }
      : null,
    ailments: {
      poison: {
        stacks: Math.max(0, Math.floor(Number(poison?.stacks) || 0)),
        decayTimerSec: round2(poison?.decayTimerSec ?? 0),
        dotTimerSec: round2(poison?.dotTimerSec ?? 0),
        dotPerStack: round2(poison?.dotPerStack ?? 0),
      },
    },
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

function buildEnemyAilmentsTextState(enemy) {
  const poison = enemy?.ailments?.poison;

  return {
    poison: {
      stacks: Math.max(0, Math.floor(Number(poison?.stacks) || 0)),
      decayTimerSec: round2(poison?.decayTimerSec ?? 0),
      dotTimerSec: round2(poison?.dotTimerSec ?? 0),
      dotPerStack: round2(poison?.dotPerStack ?? 0),
    },
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
    hitFlashColor: normalizeHitFlashColor(enemy?.hitFlashColor),
    ailments: buildEnemyAilmentsTextState(enemy),
    attackPhase: enemy.attack?.phase ?? "none",
    telegraphAlpha: round2(getEnemyTelegraphAlpha(enemy)),
    weapons: getEnemyWeaponRuntimes(enemy).map((weapon) => buildEnemyWeaponTextState(weapon)),
  };
}

function buildDamagePopupTextState(popup) {
  return {
    value: Math.max(0, Math.round(Number(popup?.value) || 0)),
    isCritical: popup?.isCritical === true,
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

function buildEffectTextState(effect) {
  const rotationRad = Number(effect?.rotationRad) || 0;
  return {
    id: typeof effect?.id === "string" ? effect.id : "",
    effectId: typeof effect?.effectId === "string" ? effect.effectId : "",
    x: round2(effect?.x ?? 0),
    y: round2(effect?.y ?? 0),
    frameIndex: Math.max(0, Math.floor(Number(effect?.frameIndex) || 0)),
    blendMode: effect?.blendMode === "add" ? "add" : "normal",
    scale: round2(effect?.scale ?? 1),
    rotationDeg: round2(rotationRad * 180 / Math.PI),
    loop: effect?.loop === true,
  };
}

function buildDownStairTextState(downStair) {
  if (!downStair || typeof downStair !== "object") {
    return null;
  }

  const triggerTiles = Array.isArray(downStair.triggerTiles) ? downStair.triggerTiles : [];
  return {
    anchorTileX: Number.isFinite(downStair.anchorTileX) ? Math.floor(downStair.anchorTileX) : null,
    anchorTileY: Number.isFinite(downStair.anchorTileY) ? Math.floor(downStair.anchorTileY) : null,
    widthTiles: Number.isFinite(downStair.widthTiles) ? Math.max(1, Math.floor(downStair.widthTiles)) : 2,
    heightTiles: Number.isFinite(downStair.heightTiles) ? Math.max(1, Math.floor(downStair.heightTiles)) : 1,
    isEnabled: downStair.isEnabled === true,
    triggerTiles: triggerTiles
      .filter((tile) => Number.isFinite(tile?.tileX) && Number.isFinite(tile?.tileY))
      .map((tile) => ({
        tileX: Math.floor(tile.tileX),
        tileY: Math.floor(tile.tileY),
      })),
  };
}

function buildStorageFacilityTextState() {
  if (!appState.playerState) {
    return null;
  }
  const vm = buildStorageFacilityVm(appState.playerState);
  if (!vm) {
    return null;
  }
  return vm.snapshot;
}

function toTextState() {
  const hudState = buildHudTextState();
  const inventoryState = buildInventoryTextState();
  const treasureChests = Array.isArray(appState.treasureChests) ? appState.treasureChests : [];
  const groundItems = Array.isArray(appState.groundItems) ? appState.groundItems : [];
  const effects = Array.isArray(appState.effects) ? appState.effects : [];
  const floorTransitionTextState = buildFloorTransitionTextState(floorTransitionState);
  const sceneTransitionTextState = buildSceneTransitionTextState(sceneTransitionState);

  if (appState.error) {
    return JSON.stringify(
      {
        mode: "error",
        seed: appState.seed,
        dungeonId: selectedDungeonId || null,
        error: appState.error,
        playerState: appState.playerState,
        hud: hudState,
        inventory: inventoryState,
        treasureChests: treasureChests.map((chest) => buildTreasureChestTextState(chest)),
        groundItems: groundItems.map((item) => buildGroundItemTextState(item)),
        effects: effects.map((effect) => buildEffectTextState(effect)),
        floorTransition: floorTransitionTextState,
        sceneTransition: sceneTransitionTextState,
      },
      null,
      2
    );
  }

  if (viewMode === VIEW_MODE.SURFACE) {
    return JSON.stringify(
      {
        mode: "surface",
        surfaceScreen,
        seed: appState.seed,
        dungeonId: selectedDungeonId || null,
        playerState: appState.playerState,
        hud: hudState,
        inventory: inventoryState,
        storageFacility: buildStorageFacilityTextState(),
        floorTransition: floorTransitionTextState,
        sceneTransition: sceneTransitionTextState,
        facilities: [
          "ダンジョン",
          "保管庫",
          "ショップ",
          "鑑定屋",
          "冒険者ギルド",
          "精錬所",
          "分解屋",
          "仕立て屋",
        ],
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
        dungeonId: selectedDungeonId || null,
        playerState: appState.playerState,
        hud: hudState,
        inventory: inventoryState,
        treasureChests: treasureChests.map((chest) => buildTreasureChestTextState(chest)),
        groundItems: groundItems.map((item) => buildGroundItemTextState(item)),
        effects: effects.map((effect) => buildEffectTextState(effect)),
        floorTransition: floorTransitionTextState,
        sceneTransition: sceneTransitionTextState,
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
      dungeonId: dungeon.dungeonId ?? null,
      floor: Number.isFinite(dungeon.floor) ? Math.floor(dungeon.floor) : null,
      wallHeightTiles: dungeon.wallHeightTiles ?? null,
      isPaused: appState.isPaused === true,
      debug: {
        playerDamagePreviewOnly: appState.debugPlayerDamagePreviewOnly === true,
      },
      floorTransition: floorTransitionTextState,
      sceneTransition: sceneTransitionTextState,
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
      effects: effects.map((effect) => buildEffectTextState(effect)),
      damagePopups: appState.damagePopups.map((popup) => buildDamagePopupTextState(popup)),
      downStairs: buildDownStairTextState(dungeon.downStair),
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
  applyCanvasDisplayScale();
  ctx.fillStyle = "#090b12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffb3b3";
  ctx.font = "16px monospace";
  ctx.fillText(`Generation failed: ${message}`, 20, 40);
}

function renderFloorTransitionOverlay() {
  if (!isFloorTransitionActive(floorTransitionState)) {
    return;
  }

  const alpha = clamp(Number(floorTransitionState.alpha) || 0, 0, 1);
  if (alpha <= 0) {
    return;
  }

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (floorTransitionState.phase === FLOOR_TRANSITION_PHASE.TITLE_HOLD) {
    const titleText =
      typeof floorTransitionState.titleText === "string" && floorTransitionState.titleText.length > 0
        ? floorTransitionState.titleText
        : `地下${Math.max(MIN_FLOOR, Math.floor(Number(floorTransitionState.targetFloor) || MIN_FLOOR))}階`;
    const overlayCenter = resolveOverlayCenterWorld({
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      scrollLeft: canvasScroll?.scrollLeft,
      scrollTop: canvasScroll?.scrollTop,
      viewportWidth: canvasScroll?.clientWidth,
      viewportHeight: canvasScroll?.clientHeight,
      scale: gameViewScale,
    });
    ctx.globalAlpha = 1;
    ctx.font = "bold 72px monospace";
    ctx.fillStyle = "#f4f4f4";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(titleText, overlayCenter.x, overlayCenter.y);
  }

  ctx.restore();
}

function followPlayerInView() {
  if (!appState.player || !appState.backdrop) {
    return;
  }

  const viewportWidthPx = canvasScroll.clientWidth;
  const viewportHeightPx = canvasScroll.clientHeight;
  if (viewportWidthPx <= 0 || viewportHeightPx <= 0) {
    return;
  }

  const dimensions = getPlayerDimensions(appState.player);
  const feetCenterX = appState.player.x + dimensions.width / 2;
  const feetCenterY = appState.player.y + dimensions.height - dimensions.footHitboxHeight / 2;
  const nextScroll = computeCameraScroll({
    centerX: feetCenterX,
    centerY: feetCenterY,
    worldWidthPx: appState.backdrop.widthPx,
    worldHeightPx: appState.backdrop.heightPx,
    viewportWidthPx,
    viewportHeightPx,
    scale: gameViewScale,
  });

  canvasScroll.scrollLeft = nextScroll.left;
  canvasScroll.scrollTop = nextScroll.top;
}

const playerDefinition = await loadDefaultPlayerDefinition();
const playerAssets = await loadPlayerAsset(playerDefinition);
let enemyDefinitions = [];
let enemyDefinitionsById = {};
let enemyAssets = {};
let enemyAiProfilesById = {};
let enemyWeaponLoadoutsById = {};
let enemyAttackProfilesByDbId = {};
let skillDefinitionsById = {};
let weaponDefinitions = [];
let weaponDefinitionsById = {};
let formationDefinitionsById = {};
let weaponAssets = {};
let effectDefinitionsById = {};
let effectAssets = {};
let itemDefinitions = [];
let itemDefinitionsById = {};
let itemAssetsById = {};
let treasureChestAssets = {};
let soundEffectMap = {};
let storageReferenceDataLoadPromise = null;
let damagePopupSeq = 0;
let effectSeq = 0;
let dungeonDefinitions = [];
let dungeonDefinitionsById = {};
let selectedDungeonId = DEFAULT_DUNGEON_ID;
let runBaseSeed = String(INITIAL_SEED);
const tileAssetsByDungeonId = new Map();

function getSelectedDungeonDefinition(floorOverride = null) {
  if (Number.isFinite(floorOverride)) {
    const byFloor = dungeonDefinitionsById[resolveDungeonIdForFloor(clampFloor(floorOverride))];
    if (byFloor) {
      return byFloor;
    }
  }

  if (dungeonDefinitionsById[selectedDungeonId]) {
    return dungeonDefinitionsById[selectedDungeonId];
  }
  return dungeonDefinitions[0] ?? null;
}

function normalizeSelectedDungeonId() {
  const currentFloor = clampFloor(appState.playerState?.run?.floor ?? MIN_FLOOR);
  const preferredDungeonId = resolveDungeonIdForFloor(currentFloor);
  if (dungeonDefinitionsById[preferredDungeonId]) {
    selectedDungeonId = preferredDungeonId;
    return;
  }

  if (dungeonDefinitionsById[selectedDungeonId]) {
    return;
  }

  if (dungeonDefinitionsById[DEFAULT_DUNGEON_ID]) {
    selectedDungeonId = DEFAULT_DUNGEON_ID;
    return;
  }

  selectedDungeonId = dungeonDefinitions[0]?.id ?? "";
}

async function refreshDungeonResources() {
  const definitions = await loadDungeonDefinitions();
  dungeonDefinitions = definitions;
  dungeonDefinitionsById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
  normalizeSelectedDungeonId();
}

async function ensureTileAssetsForDungeon(dungeonDefinition) {
  if (!dungeonDefinition || typeof dungeonDefinition.id !== "string" || dungeonDefinition.id.length <= 0) {
    throw new Error("Failed to resolve dungeon tile assets: dungeon definition is invalid.");
  }

  const cached = tileAssetsByDungeonId.get(dungeonDefinition.id);
  if (cached) {
    return cached;
  }

  const assets = await loadTileAssets(dungeonDefinition);
  tileAssetsByDungeonId.set(dungeonDefinition.id, assets);
  return assets;
}

await refreshDungeonResources();

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
      if (!formationDefinition) {
        continue;
      }

      const formationType = formationDefinition.type;
      const isCircleFormation = formationType === "circle";
      const isStopFormation = formationType === "stop";
      if (!isCircleFormation && !isStopFormation) {
        continue;
      }

      const angularSpeed = isCircleFormation ? Number(formationDefinition.angularSpeedBase) || 0 : 0;
      const executeDurationSec =
        Math.abs(angularSpeed) <= 0.0001 ? 0 : (Math.PI * 2 * attackCycles) / Math.abs(angularSpeed);
      const weaponVisibleParam =
        formationDefinition?.params?.weaponVisible ?? formationDefinition?.params?.weapon_visible;
      const forceHidden = isStopFormation ? weaponVisibleParam !== true : false;

      resolvedWeapons.push({
        weaponDefId: weaponDefinition.id,
        formationId,
        formationType,
        baseDamage: Number(weaponDefinition.baseDamage) || 0,
        skills: Array.isArray(weaponInstance.skills)
          ? weaponInstance.skills
              .filter((skill) => skill && typeof skill.id === "string" && skill.id.length > 0)
              .map((skill) => ({
                id: skill.id,
                plus: Number.isFinite(skill.plus) ? Math.max(0, Math.floor(Number(skill.plus))) : 0,
              }))
          : [],
        width: weaponDefinition.width,
        height: weaponDefinition.height,
        radiusPx: isCircleFormation ? (Number(formationDefinition.radiusBase) || 0) * TILE_SIZE : 0,
        angularSpeed,
        centerMode: isCircleFormation
          ? formationDefinition?.params?.centerMode ?? formationDefinition?.params?.center_mode ?? "player"
          : "player",
        biasStrengthMul: isCircleFormation ? Number(formationDefinition.biasStrengthMul) || 0 : 0,
        biasResponseMul: isCircleFormation ? Number(formationDefinition.biasResponseMul) || 0 : 0,
        biasOffsetRatioMax: isCircleFormation ? Number(formationDefinition?.clamp?.biasOffsetRatioMax) : 0,
        executeDurationSec,
        supported: isCircleFormation,
        forceHidden,
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
  enemyDefinitionsById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
  enemyAssets = assets;
  enemyAiProfilesById = Object.fromEntries(aiProfiles.map((profile) => [profile.id, profile]));
  enemyWeaponLoadoutsById = Object.fromEntries(loadouts.map((loadout) => [loadout.id, loadout]));
}

async function refreshSkillResources() {
  try {
    const definitions = await loadSkillDefinitions();
    skillDefinitionsById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
  } catch (error) {
    skillDefinitionsById = {};
    console.warn(`[Skill] Failed to load skill DB: ${error instanceof Error ? error.message : String(error)}`);
  }
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

async function refreshEffectResources() {
  try {
    const definitions = await loadEffectDefinitions();
    const assets = await loadEffectAssets(definitions);
    effectDefinitionsById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
    effectAssets = assets;
  } catch (error) {
    effectDefinitionsById = {};
    effectAssets = {};
    console.warn(`[Effect] Failed to load effect resources: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function refreshSoundResources() {
  soundEffectMap = await loadSoundEffectMap();
  soundEffectPlayer.setSoundEffectMap(soundEffectMap);
}

function hasDefinitionMapEntries(definitionsById) {
  return definitionsById && typeof definitionsById === "object" && Object.keys(definitionsById).length > 0;
}

async function ensureStorageReferenceDataLoaded() {
  const needsItemDefinitions = !hasDefinitionMapEntries(itemDefinitionsById);
  const needsWeaponDefinitions = !hasDefinitionMapEntries(weaponDefinitionsById);
  if (!needsItemDefinitions && !needsWeaponDefinitions) {
    return;
  }

  if (storageReferenceDataLoadPromise) {
    await storageReferenceDataLoadPromise;
    return;
  }

  storageReferenceDataLoadPromise = (async () => {
    if (needsItemDefinitions) {
      try {
        const definitions = await loadItemDefinitions();
        itemDefinitions = definitions;
        itemDefinitionsById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
      } catch (error) {
        console.warn(
          `[Storage] Failed to load item definitions: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (needsWeaponDefinitions) {
      try {
        const definitions = await loadWeaponDefinitions();
        weaponDefinitions = definitions;
        weaponDefinitionsById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
      } catch (error) {
        console.warn(
          `[Storage] Failed to load weapon definitions: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  })().finally(() => {
    storageReferenceDataLoadPromise = null;
  });

  await storageReferenceDataLoadPromise;
}

function ensurePlayerStateLoaded() {
  if (appState.playerState) {
    return;
  }
  const starterWeaponDefId = resolveStarterWeaponDefId();
  appState.playerState = loadPlayerStateFromStorage(
    appStorage,
    PLAYER_STATE_STORAGE_KEY,
    weaponDefinitionsById,
    starterWeaponDefId,
    nowUnixSec()
  );
}

function savePlayerStateImmediatelyWithoutRuntimeSync() {
  if (!appState.playerState) {
    return;
  }
  appState.playerState.saved_at = nowUnixSec();
  savePlayerStateToStorage(appStorage, PLAYER_STATE_STORAGE_KEY, appState.playerState);
}

function syncStorageFacilityHud() {
  if (!surfaceStorageHud) {
    return;
  }
  ensurePlayerStateLoaded();
  const vm = buildStorageFacilityVm(appState.playerState);
  if (!vm) {
    surfaceStorageHud.setOpen(false);
    return;
  }
  surfaceStorageHud.setOpen(
    viewMode === VIEW_MODE.SURFACE &&
      surfaceScreen === SURFACE_SCREEN.STORAGE &&
      storageFacilityUiState.open === true
  );
  surfaceStorageHud.setViewModel({
    ...vm,
    sortKey: storageFacilityUiState.sortKey,
  });
  surfaceStorageHud.setToast(storageFacilityUiState.toastMessage);
}

function persistPlayerState() {
  if (!appState.playerState) {
    return;
  }

  if (viewMode === VIEW_MODE.DUNGEON && appState.player && !appState.error && appState.playerState.in_run !== false) {
    syncPlayerStateFromRuntime(
      appState.playerState,
      appState.player,
      appState.weapons,
      getSystemUiState(),
      nowUnixSec()
    );
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
      const keysToRemove = new Set([PLAYER_STATE_STORAGE_KEY, ...PLAYER_STATE_LEGACY_STORAGE_KEYS]);
      for (const key of keysToRemove) {
        appStorage.removeItem(key);
      }
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
let lastPlayerStatsDigest = "";
let lastSystemUiDigest = "";
let pointerDownFeetTileSnapshot = null;
const playerDeathSequence = {
  active: false,
  postAnimDelaySec: 0,
};
let toastAutoClearTimerId = null;
let isPlayerStatsWindowOpen = false;

function syncPlayerStatsWindowVisibility() {
  debugPanel.setPlayerStatsWindowOpen(isPlayerStatsWindowOpen);
}

function syncPlayerStatsWindow() {
  if (!isPlayerStatsWindowOpen) {
    return;
  }

  const rows = buildPlayerStatusRows(appState.playerState, appState.player, PLAYER_SPEED_PX_PER_SEC);
  const digest = buildPlayerStatusDigest(rows);
  if (digest === lastPlayerStatsDigest) {
    return;
  }

  debugPanel.setPlayerStats(rows);
  lastPlayerStatsDigest = digest;
}

function clearToastAutoClearTimer() {
  if (toastAutoClearTimerId === null) {
    return;
  }
  window.clearTimeout(toastAutoClearTimerId);
  toastAutoClearTimerId = null;
}

function scheduleToastAutoClear(systemUiState) {
  clearToastAutoClearTimer();
  const nextToast = typeof systemUiState?.toastMessage === "string" ? systemUiState.toastMessage.trim() : "";
  if (nextToast.length <= 0) {
    return;
  }

  toastAutoClearTimerId = window.setTimeout(() => {
    toastAutoClearTimerId = null;
    const currentSystemUi = getSystemUiState();
    const currentToast =
      typeof currentSystemUi?.toastMessage === "string" ? currentSystemUi.toastMessage.trim() : "";
    if (currentToast.length <= 0 || currentToast !== nextToast) {
      return;
    }
    applySystemUiState(clearToastMessage(currentSystemUi));
  }, SYSTEM_UI_TOAST_DURATION_MS);
}

function applySystemUiState(nextSystemUiState) {
  appState.systemUi = nextSystemUiState;
  lastSystemUiDigest = "";
  syncSystemHud();
  scheduleToastAutoClear(nextSystemUiState);
}

function normalizeSkillInstancesForSave(skills) {
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills
    .filter((skill) => skill && typeof skill.id === "string" && skill.id.length > 0)
    .map((skill) => ({
      id: skill.id,
      plus: Math.max(0, Math.floor(Number(skill.plus) || 0)),
    }));
}

function swapEquippedWeaponSlots(slotA, slotB) {
  if (!appState.playerState?.run || !Array.isArray(appState.playerState.run.equipped_weapons)) {
    return false;
  }

  const resolvedSlotA = normalizeWeaponSlotForUi(slotA, 0);
  const resolvedSlotB = normalizeWeaponSlotForUi(slotB, 0);
  if (resolvedSlotA === resolvedSlotB) {
    return false;
  }

  const entryBySlot = Array.from({ length: WEAPON_SLOT_UI_COUNT }, () => null);
  const runtimeBySlot = Array.from({ length: WEAPON_SLOT_UI_COUNT }, () => null);
  const sortedEntries = getEquippedWeaponEntriesSorted(appState.playerState);

  for (const entry of sortedEntries) {
    const slot = normalizeWeaponSlotForUi(entry.slot, 0);
    entryBySlot[slot] = entry;
  }
  for (let index = 0; index < sortedEntries.length; index += 1) {
    const slot = normalizeWeaponSlotForUi(sortedEntries[index].slot, 0);
    runtimeBySlot[slot] = appState.weapons[index] ?? null;
  }

  const entryA = entryBySlot[resolvedSlotA];
  const entryB = entryBySlot[resolvedSlotB];
  const runtimeA = runtimeBySlot[resolvedSlotA];
  const runtimeB = runtimeBySlot[resolvedSlotB];

  if (!entryA && !entryB) {
    return false;
  }

  entryBySlot[resolvedSlotA] = entryB;
  entryBySlot[resolvedSlotB] = entryA;
  runtimeBySlot[resolvedSlotA] = runtimeB;
  runtimeBySlot[resolvedSlotB] = runtimeA;

  const rebuiltEntries = [];
  for (let slot = 0; slot < entryBySlot.length; slot += 1) {
    const entry = entryBySlot[slot];
    if (!entry) {
      continue;
    }
    entry.slot = slot;
    rebuiltEntries.push(entry);
  }
  appState.playerState.run.equipped_weapons = rebuiltEntries;

  appState.weapons = runtimeBySlot.filter((weaponRuntime) => weaponRuntime !== null);
  return true;
}

function updateWeaponSkillsAtSlot(slot, nextSkills) {
  const slots = buildEquippedWeaponSlotsView();
  const slotView = slots[normalizeWeaponSlotForUi(slot, 0)];
  if (!slotView?.weaponInstance) {
    return false;
  }

  const normalizedSkills = normalizeSkillInstancesForSave(nextSkills);
  slotView.weaponInstance.skills = normalizedSkills.map((skill) => ({ ...skill }));
  if (slotView.runtimeWeapon) {
    slotView.runtimeWeapon.skillInstances = normalizedSkills.map((skill) => ({ ...skill }));
  }
  return true;
}

function updateWeaponFormationAtSlot(slot, nextFormationId) {
  if (typeof nextFormationId !== "string" || nextFormationId.length <= 0) {
    return false;
  }

  const formationDefinition = formationDefinitionsById?.[nextFormationId];
  if (!formationDefinition || isEnemyOnlyFormation(formationDefinition)) {
    return false;
  }

  const slotView = buildEquippedWeaponSlotsView()[normalizeWeaponSlotForUi(slot, 0)];
  if (!slotView?.weaponInstance) {
    return false;
  }

  if (slotView.weaponInstance.formation_id === nextFormationId) {
    return false;
  }

  slotView.weaponInstance.formation_id = nextFormationId;
  if (slotView.runtimeWeapon) {
    slotView.runtimeWeapon.formationId = nextFormationId;
    slotView.runtimeWeapon.angleRad = 0;
    slotView.runtimeWeapon.biasDirX = Number.isFinite(slotView.runtimeWeapon.biasDirX) ? slotView.runtimeWeapon.biasDirX : 1;
    slotView.runtimeWeapon.biasDirY = Number.isFinite(slotView.runtimeWeapon.biasDirY) ? slotView.runtimeWeapon.biasDirY : 0;
    slotView.runtimeWeapon.attackMotionPhase = "idle";
    slotView.runtimeWeapon.attackMotionTimerSec = 0;
    slotView.runtimeWeapon.attackMotionDurationSec = 0;
    slotView.runtimeWeapon.lockedAimDirX = slotView.runtimeWeapon.biasDirX;
    slotView.runtimeWeapon.lockedAimDirY = slotView.runtimeWeapon.biasDirY;
    if (slotView.runtimeWeapon.hitSet instanceof Set) {
      slotView.runtimeWeapon.hitSet.clear();
    }
  }

  return true;
}

function getSkillAtEditorSlot(layout, row, index) {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  if (row !== "chain") {
    return null;
  }
  return layout.chainSlots[safeIndex] ?? null;
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

function playSeByKey(soundKey, repeat = 1) {
  void soundEffectPlayer.playByKey(soundKey, repeat);
}

function playItemUseSeIfConsumed(beforeSystemUi, afterSystemUi, consumedItemId) {
  if (typeof consumedItemId !== "string" || consumedItemId.length <= 0) {
    return;
  }

  const beforeCount = getInventoryItemCount(beforeSystemUi, consumedItemId);
  const afterCount = getInventoryItemCount(afterSystemUi, consumedItemId);
  if (afterCount >= beforeCount) {
    return;
  }

  const consumedCount = Math.max(1, beforeCount - afterCount);
  const itemDefinition = itemDefinitionsById?.[consumedItemId];
  const seKeyUseItem = typeof itemDefinition?.seKeyUseItem === "string" ? itemDefinition.seKeyUseItem : "";
  playSeByKey(seKeyUseItem, consumedCount);
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
    const dimensions = getPlayerDimensions(appState.player);
    pushFloatingHealPopup(healedAmount, appState.player.x + dimensions.width / 2, appState.player.y - 16);
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

function toRuntimeInventoryItemFromSavedState(itemDefId, count = 1) {
  const normalizedItemDefId = typeof itemDefId === "string" ? itemDefId.trim() : "";
  if (normalizedItemDefId.length <= 0) {
    return null;
  }

  const itemDefinition = itemDefinitionsById?.[normalizedItemDefId];
  const fromDefinition = toRuntimeInventoryItem(itemDefinition, itemAssetsById?.[normalizedItemDefId], count);
  if (fromDefinition) {
    return fromDefinition;
  }

  return {
    id: normalizedItemDefId,
    type: "consumable",
    count: Math.max(1, Math.floor(Number(count) || 1)),
    quickSlot: null,
    iconKey: normalizedItemDefId === HERB_ITEM_ID ? "herb" : "item",
    nameKey: normalizedItemDefId,
    descriptionKey: "ui_label_inventory_placeholder",
    effectKey: "ui_label_inventory_effect_placeholder",
    iconImageSrc: "",
  };
}

function buildSystemUiStateFromPlayerState(playerState) {
  const systemUi = createInitialSystemUiState();
  const savedInventoryEntries = Array.isArray(playerState?.run?.inventory) ? playerState.run.inventory : [];
  const runtimeItems = savedInventoryEntries
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        entry.type === "item" &&
        typeof entry.item_def_id === "string" &&
        entry.item_def_id.length > 0 &&
        Number.isFinite(entry.count) &&
        Number(entry.count) > 0
    )
    .map((entry) => toRuntimeInventoryItemFromSavedState(entry.item_def_id, entry.count))
    .filter((entry) => entry !== null);

  const savedQuickslots = Array.isArray(playerState?.run?.quickslots) ? playerState.run.quickslots : [];
  for (let slot = 0; slot < QUICK_SLOT_COUNT; slot += 1) {
    const itemDefId = typeof savedQuickslots[slot] === "string" ? savedQuickslots[slot] : "";
    if (itemDefId.length <= 0) {
      continue;
    }

    const target = runtimeItems.find((item) => item.id === itemDefId && !Number.isInteger(item.quickSlot));
    if (target) {
      target.quickSlot = slot;
    }
  }

  const inventorySlotMax = Math.max(1, Math.floor(Number(playerState?.base?.unlocks?.inventory_slot_max) || 10));
  systemUi.inventory.capacity = inventorySlotMax;
  systemUi.inventory.items = runtimeItems;
  systemUi.inventory.selectedItemId = runtimeItems[0]?.id ?? null;
  return systemUi;
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
      playSeByKey(SE_KEY_GET_ITEM, 1);
      const pickupNameKey =
        typeof runtimeItem.nameKey === "string" && runtimeItem.nameKey.length > 0
          ? runtimeItem.nameKey
          : typeof itemDefinition?.nameKey === "string"
            ? itemDefinition.nameKey
            : "";
      if (pickupNameKey.length > 0) {
        const dimensions = getPlayerDimensions(appState.player);
        pushFloatingPickupPopup(
          pickupNameKey,
          appState.player.x + dimensions.width / 2,
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

function resolveSkillEditorContext(systemUiState) {
  const skillEditor = systemUiState?.inventory?.weaponUi?.skillEditor ?? {};
  if (skillEditor.isOpen !== true) {
    return null;
  }

  const slot = Number.isInteger(skillEditor.weaponSlot)
    ? normalizeWeaponSlotForUi(skillEditor.weaponSlot, 0)
    : normalizeWeaponSlotForUi(systemUiState?.inventory?.weaponUi?.selectedSlot, 0);
  const slotView = buildEquippedWeaponSlotsView()[slot];
  if (!slotView?.weaponInstance) {
    return null;
  }

  const chipSlotCount = Math.max(
    0,
    Math.floor(Number(slotView.weaponDefinition?.chipSlotCount) || Number(slotView.weaponInstance.skills?.length) || 0)
  );
  const layout = buildSkillEditorLayout(slotView.weaponInstance.skills, chipSlotCount, skillDefinitionsById);
  return {
    slot,
    layout,
  };
}

function handleSkillSlotClick(payload) {
  const beforeSystemUi = getSystemUiState();
  const context = resolveSkillEditorContext(beforeSystemUi);
  if (!context) {
    return;
  }

  const heldSource = beforeSystemUi.inventory?.weaponUi?.skillEditor?.heldSource ?? null;
  if (!heldSource) {
    const targetSkill = getSkillAtEditorSlot(context.layout, payload?.row, payload?.index);
    if (!targetSkill) {
      return;
    }
    applySystemUiState(setHeldSkillSource(beforeSystemUi, payload));
    return;
  }

  const swapResult = swapSkillSlots(context.layout, heldSource, payload, skillDefinitionsById);
  if (!swapResult.changed) {
    return;
  }

  const nextSkills = flattenSkillEditorLayout(swapResult.layout);
  if (!updateWeaponSkillsAtSlot(context.slot, nextSkills)) {
    return;
  }
  applySystemUiState(setHeldSkillSource(beforeSystemUi, null));
}

function handleSkillSlotDrop(payload) {
  const beforeSystemUi = getSystemUiState();
  const context = resolveSkillEditorContext(beforeSystemUi);
  if (!context) {
    return;
  }

  const source = payload?.source;
  const target = payload?.target;
  const swapResult = swapSkillSlots(context.layout, source, target, skillDefinitionsById);
  if (!swapResult.changed) {
    return;
  }

  const nextSkills = flattenSkillEditorLayout(swapResult.layout);
  if (!updateWeaponSkillsAtSlot(context.slot, nextSkills)) {
    return;
  }
  applySystemUiState(setHeldSkillSource(beforeSystemUi, null));
}

function resetStorageFacilitySelectionAndSellMode() {
  storageFacilityUiState.selectedPane = "run";
  storageFacilityUiState.selectedIndex = -1;
  storageFacilityUiState.sellMode = false;
  storageFacilityUiState.sellSelection = [];
  storageFacilityUiState.transferAmount = 1;
}

function startSurfaceStorageSceneTransition(targetScreen) {
  if (
    viewMode !== VIEW_MODE.SURFACE ||
    isSceneTransitionActive(sceneTransitionState) ||
    isFloorTransitionActive(floorTransitionState)
  ) {
    return false;
  }

  const normalizedTargetScreen = targetScreen === SURFACE_SCREEN.STORAGE ? SURFACE_SCREEN.STORAGE : SURFACE_SCREEN.HUB;
  sceneTransitionState.config.fadeInSec = SCENE_TRANSITION_FADE_IN_SEC;
  sceneTransitionState.config.titleHoldSec = STORAGE_SCENE_TRANSITION_TITLE_HOLD_SEC;
  sceneTransitionState.config.fadeOutSec = SCENE_TRANSITION_FADE_OUT_SEC;
  sceneTransitionLoadPromise = null;
  sceneTransitionState.loadToken = null;
  startSceneTransition(sceneTransitionState, {
    kind:
      normalizedTargetScreen === SURFACE_SCREEN.STORAGE
        ? SCENE_TRANSITION_KIND.SURFACE_HUB_TO_STORAGE
        : SCENE_TRANSITION_KIND.SURFACE_STORAGE_TO_HUB,
    targetMode: VIEW_MODE.SURFACE,
    targetFloor: null,
    titleText: "",
    titleColor: "#f4f4f4",
    ready: true,
  });
  return true;
}

function openStorageFacility() {
  if (viewMode !== VIEW_MODE.SURFACE || isSceneTransitionActive(sceneTransitionState) || isFloorTransitionActive(floorTransitionState)) {
    return;
  }
  ensurePlayerStateLoaded();
  clearStorageFacilityToast();
  resetStorageFacilitySelectionAndSellMode();
  if (!startSurfaceStorageSceneTransition(SURFACE_SCREEN.STORAGE)) {
    return;
  }
  void ensureStorageReferenceDataLoaded().then(() => {
    if (
      viewMode === VIEW_MODE.SURFACE &&
      surfaceScreen === SURFACE_SCREEN.STORAGE &&
      storageFacilityUiState.open === true
    ) {
      syncStorageFacilityHud();
    }
  });
}

function closeStorageFacility() {
  void startSurfaceStorageSceneTransition(SURFACE_SCREEN.HUB);
}

function ensureRunStartedForStorageWithdraw() {
  if (!appState.playerState || appState.playerState.in_run !== false) {
    return false;
  }
  const starterWeaponDefId = resolveStarterWeaponDefId();
  beginNewRun(appState.playerState, weaponDefinitionsById, starterWeaponDefId, nowUnixSec());
  return true;
}

function handleStorageTransfer(direction, amount) {
  ensurePlayerStateLoaded();
  if (!appState.playerState) {
    return;
  }
  sanitizeStorageSelectionState(appState.playerState);

  const selectedPane = storageFacilityUiState.selectedPane === "stash" ? "stash" : "run";
  const selectedIndex = Number.isInteger(storageFacilityUiState.selectedIndex) ? storageFacilityUiState.selectedIndex : -1;
  if (selectedIndex < 0) {
    setStorageFacilityToast("移動対象を選択してください。");
    syncStorageFacilityHud();
    return;
  }

  const normalizedDirection = direction === "withdraw" ? "withdraw" : "deposit";
  if (normalizedDirection === "deposit") {
    if (selectedPane !== "run") {
      setStorageFacilityToast("手持ち側のアイテムを選択してください。");
      syncStorageFacilityHud();
      return;
    }
    if (appState.playerState.in_run === false) {
      setStorageFacilityToast("run未開始のため預け入れできません。");
      syncStorageFacilityHud();
      return;
    }
  } else {
    if (selectedPane !== "stash") {
      setStorageFacilityToast("保管庫側のアイテムを選択してください。");
      syncStorageFacilityHud();
      return;
    }
    ensureRunStartedForStorageWithdraw();
  }

  const fromPane = normalizedDirection === "withdraw" ? "stash" : "run";
  const transferResult = transferStorageEntry(appState.playerState, {
    fromPane,
    entryIndex: selectedIndex,
    amount,
    itemDefinitionsById,
  });
  if (!transferResult.ok) {
    if (transferResult.reason === "target_full") {
      setStorageFacilityToast("容量不足のため移動できません。");
    } else {
      setStorageFacilityToast("移動に失敗しました。");
    }
    syncStorageFacilityHud();
    return;
  }

  setStorageFacilityToast(normalizedDirection === "withdraw" ? "引き出しました。" : "預けました。");
  sanitizeStorageSelectionState(appState.playerState);
  savePlayerStateImmediatelyWithoutRuntimeSync();
  syncStorageFacilityHud();
}

function toggleStorageSellSelection(payload) {
  ensurePlayerStateLoaded();
  if (!appState.playerState) {
    return;
  }
  const pane = payload?.pane === "stash" ? "stash" : "run";
  const index = Math.max(0, Math.floor(Number(payload?.index) || 0));
  const key = toStorageSelectionKey(pane, index);
  const current = Array.isArray(storageFacilityUiState.sellSelection) ? storageFacilityUiState.sellSelection : [];
  const set = new Set(current);
  if (set.has(key)) {
    set.delete(key);
  } else {
    set.add(key);
  }
  storageFacilityUiState.sellSelection = Array.from(set);
}

function handleStorageSell() {
  ensurePlayerStateLoaded();
  if (!appState.playerState) {
    return;
  }
  sanitizeStorageSelectionState(appState.playerState);

  const selectedEntries = Array.isArray(storageFacilityUiState.sellSelection) ? storageFacilityUiState.sellSelection : [];
  let sellResult = sellSelectedStorageEntries(appState.playerState, {
    selectedEntries,
    itemDefinitionsById,
    confirmHighValue: false,
  });
  if (sellResult.reason === "confirm_required" && sellResult.requiresConfirm === true) {
    const shouldSell =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(`高価値アイテムを含みます。売却しますか？\n合計: ${sellResult.totalPrice}G`)
        : false;
    if (!shouldSell) {
      setStorageFacilityToast("売却をキャンセルしました。");
      syncStorageFacilityHud();
      return;
    }
    sellResult = sellSelectedStorageEntries(appState.playerState, {
      selectedEntries,
      itemDefinitionsById,
      confirmHighValue: true,
    });
  }

  if (!sellResult.ok) {
    setStorageFacilityToast("売却できる対象がありません。");
    syncStorageFacilityHud();
    return;
  }

  storageFacilityUiState.sellSelection = [];
  setStorageFacilityToast(`${sellResult.soldCount}件を売却しました。（+${sellResult.totalPrice}G）`);
  sanitizeStorageSelectionState(appState.playerState);
  savePlayerStateImmediatelyWithoutRuntimeSync();
  syncStorageFacilityHud();
}

function handleStorageUpgrade(kind) {
  ensurePlayerStateLoaded();
  if (!appState.playerState) {
    return;
  }
  const result = purchaseStorageUpgrade(appState.playerState, kind);
  if (!result.ok) {
    if (result.reason === "not_enough_gold") {
      setStorageFacilityToast("所持金が不足しています。");
    } else {
      setStorageFacilityToast("拡張に失敗しました。");
    }
    syncStorageFacilityHud();
    return;
  }

  if (result.kind === "stash") {
    setStorageFacilityToast(`保管庫容量を拡張しました。（${result.newCapacity}）`);
  } else {
    setStorageFacilityToast(`手持ち容量を拡張しました。（${result.newCapacity}）`);
  }
  savePlayerStateImmediatelyWithoutRuntimeSync();
  syncStorageFacilityHud();
}

function handleStorageAutoArrange(pane, sortKey) {
  ensurePlayerStateLoaded();
  if (!appState.playerState) {
    return;
  }
  const result = autoArrangeStorage(appState.playerState, pane, sortKey, {
    itemDefinitionsById,
    weaponDefinitionsById,
  });
  if (!result.ok) {
    setStorageFacilityToast("整頓に失敗しました。");
    syncStorageFacilityHud();
    return;
  }
  setStorageFacilityToast("整頓しました。");
  savePlayerStateImmediatelyWithoutRuntimeSync();
  syncStorageFacilityHud();
}

surfaceStorageHud = surfaceStorageRoot
  ? createSurfaceStorageHud(surfaceStorageRoot, {
      onClose: () => {
        closeStorageFacility();
      },
      onSelectTab: (tab) => {
        storageFacilityUiState.activeTab = tab;
        syncStorageFacilityHud();
      },
      onSelectEntry: ({ pane, index }) => {
        storageFacilityUiState.selectedPane = pane === "stash" ? "stash" : "run";
        storageFacilityUiState.selectedIndex = Math.max(0, Math.floor(Number(index) || 0));
        syncStorageFacilityHud();
      },
      onChangeTransferAmount: (amount) => {
        storageFacilityUiState.transferAmount = Math.max(1, Math.floor(Number(amount) || 1));
      },
      onTransfer: ({ direction, amount }) => {
        handleStorageTransfer(direction, amount);
      },
      onToggleSellMode: () => {
        storageFacilityUiState.sellMode = storageFacilityUiState.sellMode !== true;
        if (!storageFacilityUiState.sellMode) {
          storageFacilityUiState.sellSelection = [];
        }
        syncStorageFacilityHud();
      },
      onToggleSellEntry: (payload) => {
        if (storageFacilityUiState.sellMode !== true) {
          return;
        }
        toggleStorageSellSelection(payload);
        syncStorageFacilityHud();
      },
      onExecuteSell: () => {
        handleStorageSell();
      },
      onChangeSortKey: (sortKey) => {
        storageFacilityUiState.sortKey = sortKey === "name" || sortKey === "rarity" ? sortKey : "type";
      },
      onAutoArrange: ({ pane, sortKey }) => {
        handleStorageAutoArrange(pane, sortKey);
      },
      onPurchaseUpgrade: (kind) => {
        handleStorageUpgrade(kind);
      },
    })
  : null;

const systemHud = systemUiRoot
  ? createSystemHud(systemUiRoot, {
      onUseQuickSlot: (slotIndex) => {
        const beforeSystemUi = getSystemUiState();
        const quickSlotItemId = getQuickSlotItemId(beforeSystemUi, slotIndex);
        const afterSystemUi = useQuickSlotItem(beforeSystemUi, slotIndex);
        applySystemUiState(afterSystemUi);
        playItemUseSeIfConsumed(beforeSystemUi, afterSystemUi, quickSlotItemId);
        applyHerbHealIfConsumed(beforeSystemUi, afterSystemUi, quickSlotItemId);
      },
      onOpenInventoryWindow: () => {
        applySystemUiState(setInventoryWindowOpen(getSystemUiState(), true));
      },
      onCloseInventoryWindow: () => {
        applySystemUiState(setInventoryWindowOpen(getSystemUiState(), false));
      },
      onSelectInventoryTab: (tab) => {
        applySystemUiState(setInventoryTab(getSystemUiState(), tab));
      },
      onSelectInventoryItem: (itemId) => {
        applySystemUiState(selectInventoryItem(getSystemUiState(), itemId));
      },
      onSelectChipEntry: (chipKey) => {
        applySystemUiState(selectChipEntry(getSystemUiState(), chipKey));
      },
      onSelectWeaponSlot: (slot) => {
        const beforeSystemUi = getSystemUiState();
        const selectedSlot = normalizeWeaponSlotForUi(beforeSystemUi.inventory?.weaponUi?.selectedSlot, 0);
        if (slot === selectedSlot) {
          applySystemUiState(setWeaponSwapTargetSlot(beforeSystemUi, null));
          return;
        }

        let nextSystemUi = selectWeaponSlot(beforeSystemUi, slot);
        nextSystemUi = setWeaponSwapTargetSlot(nextSystemUi, selectedSlot);
        applySystemUiState(nextSystemUi);
      },
      onEquipWeaponSwap: () => {
        const beforeSystemUi = getSystemUiState();
        const selectedSlot = normalizeWeaponSlotForUi(beforeSystemUi.inventory?.weaponUi?.selectedSlot, 0);
        const swapTargetSlot = Number.isInteger(beforeSystemUi.inventory?.weaponUi?.swapTargetSlot)
          ? normalizeWeaponSlotForUi(beforeSystemUi.inventory.weaponUi.swapTargetSlot, selectedSlot)
          : null;
        if (!Number.isInteger(swapTargetSlot)) {
          return;
        }

        if (!swapEquippedWeaponSlots(selectedSlot, swapTargetSlot)) {
          return;
        }

        applySystemUiState(setWeaponSwapTargetSlot(beforeSystemUi, null));
      },
      onOpenWeaponSkillEditor: (slot) => {
        const beforeSystemUi = getSystemUiState();
        if (Number.isInteger(beforeSystemUi.inventory?.weaponUi?.swapTargetSlot)) {
          return;
        }
        const resolvedSlot = normalizeWeaponSlotForUi(slot, 0);
        const slotView = buildEquippedWeaponSlotsView()[resolvedSlot];
        if (!slotView?.weaponInstance) {
          return;
        }
        applySystemUiState(openWeaponSkillEditor(beforeSystemUi, resolvedSlot));
      },
      onCloseWeaponSkillEditor: () => {
        applySystemUiState(closeWeaponSkillEditor(getSystemUiState()));
      },
      onSkillSlotClick: (payload) => {
        handleSkillSlotClick(payload);
      },
      onSkillSlotDrop: (payload) => {
        handleSkillSlotDrop(payload);
      },
      onClearHeldSkill: () => {
        applySystemUiState(setHeldSkillSource(getSystemUiState(), null));
      },
      onSelectFormation: (formationId) => {
        const beforeSystemUi = getSystemUiState();
        const context = resolveSkillEditorContext(beforeSystemUi);
        if (!context) {
          return;
        }
        if (!updateWeaponFormationAtSlot(context.slot, formationId)) {
          return;
        }
        applySystemUiState(setHeldSkillSource(beforeSystemUi, null));
      },
      onUseSelectedItem: () => {
        const beforeSystemUi = getSystemUiState();
        const selectedItemId = beforeSystemUi.inventory?.selectedItemId;
        const afterSystemUi = useInventoryItem(beforeSystemUi, selectedItemId);
        applySystemUiState(afterSystemUi);
        playItemUseSeIfConsumed(beforeSystemUi, afterSystemUi, selectedItemId);
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

        playSeByKey(SE_KEY_PUT_ITEM, 1);
        const currentGroundItems = Array.isArray(appState.groundItems) ? appState.groundItems : [];
        appState.groundItems = [...currentGroundItems, dropResult.droppedGroundItem];
      },
    })
  : null;

function buildSystemUiDigest() {
  const inventory = buildInventoryTextState();
  const hud = buildHudTextState();
  const weapon = buildWeaponUiViewModel(getSystemUiState());
  const chip = buildChipUiViewModel(getSystemUiState());

  return JSON.stringify({
    hpCurrent: hud.hp.current,
    hpMax: hud.hp.max,
    runLevel: hud.runLevel,
    gold: hud.gold,
    buffs: hud.buffs,
    debuffs: hud.debuffs,
    toastMessage: getSystemUiState().toastMessage,
    inventory,
    weapon,
    chip,
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
  const weapon = buildWeaponUiViewModel(getSystemUiState());
  const chip = buildChipUiViewModel(getSystemUiState());
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
    activeTab: inventory.activeTab,
    weapon,
    chip,
    toastMessage: getSystemUiState().toastMessage,
  });

  lastSystemUiDigest = digest;
}

function setPaused(paused) {
  appState.isPaused = paused === true;
  syncPauseUi();
}

function togglePause() {
  if (viewMode !== VIEW_MODE.DUNGEON || !appState.dungeon || !appState.player || appState.error) {
    return;
  }
  if (
    isFloorTransitionActive(floorTransitionState) ||
    isSceneTransitionActive(sceneTransitionState) ||
    playerDeathSequence.active ||
    isRuntimePlayerDead(appState.player)
  ) {
    return;
  }
  setPaused(!appState.isPaused);
}

function moveToSurfaceFromDebug() {
  if (viewMode !== VIEW_MODE.DUNGEON || appState.error) {
    return;
  }
  if (isFloorTransitionActive(floorTransitionState) || isSceneTransitionActive(sceneTransitionState)) {
    return;
  }

  resetPlayerDeathSequence();
  if (appState.player) {
    setPointerTarget(appState.player, false, 0, 0);
  }
  pointerDownFeetTileSnapshot = null;
  setPaused(false);
  storageFacilityUiState.open = false;
  clearStorageFacilityToast();
  resetStorageFacilitySelectionAndSellMode();
  setSurfaceScreen(SURFACE_SCREEN.HUB);
  setViewMode(VIEW_MODE.SURFACE);
  syncStorageFacilityHud();
  dungeonBgmPlayer.stop();
}

function toggleDamagePreview() {
  appState.debugPlayerDamagePreviewOnly = appState.debugPlayerDamagePreviewOnly !== true;
  syncDamagePreviewUi();
  lastStatsDigest = "";
  lastPlayerStatsDigest = "";
  syncStatsPanel();
  syncPlayerStatsWindow();
}

function openPlayerStatsWindow() {
  isPlayerStatsWindowOpen = true;
  syncPlayerStatsWindowVisibility();
  lastPlayerStatsDigest = "";
  syncPlayerStatsWindow();
}

function closeDetailWindow() {
  isPlayerStatsWindowOpen = false;
  syncPlayerStatsWindowVisibility();
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
  onDungeonIdChange: (dungeonId) => {
    if (!dungeonDefinitionsById[dungeonId]) {
      return;
    }
    const nextFloor = resolveFloorFromDungeonId(dungeonId, getRunFloor(appState.playerState));
    setRunFloor(appState.playerState, nextFloor);
    selectedDungeonId = resolveDungeonIdForFloor(nextFloor);
    debugPanel.setDungeonId(selectedDungeonId);
    void regenerate(runBaseSeed, {
      overrideFloor: nextFloor,
      preserveBaseSeed: true,
      skipRestorePlayerPosition: true,
    });
  },
  onTogglePause: () => {
    togglePause();
  },
  onGoSurface: () => {
    moveToSurfaceFromDebug();
  },
  onShowStorage: () => {
    isPlayerStatsWindowOpen = false;
    debugPanel.setPlayerStatsWindowOpen(false);
    debugPanel.setStorageDump(buildLocalStorageDump(appStorage));
  },
  onResetStorage: () => {
    resetStorageAndReload();
  },
  onToggleDamagePreview: () => {
    toggleDamagePreview();
  },
  onShowPlayerStats: () => {
    openPlayerStatsWindow();
  },
  onCloseDetailWindow: () => {
    closeDetailWindow();
  },
});
debugPanel.setDungeonOptions(
  dungeonDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.id,
  })),
  selectedDungeonId
);
syncPauseUi();
syncDamagePreviewUi();
syncPlayerStatsWindowVisibility();
syncSystemHud();
syncStorageFacilityHud();

for (const surfaceFacilityButton of surfaceFacilityButtons) {
  surfaceFacilityButton.addEventListener("click", () => {
    if (isSceneTransitionActive(sceneTransitionState) || isFloorTransitionActive(floorTransitionState)) {
      return;
    }

    const facility = surfaceFacilityButton.dataset.surfaceFacility;
    if (facility === "dungeon") {
      startSurfaceToDungeonTransition();
      return;
    }
    if (facility === "storage") {
      openStorageFacility();
    }
  });
}

function buildStatsDigest(dungeon, player, debugPlayerDamagePreviewOnly, perfSnapshot = null) {
  if (!dungeon) {
    return "";
  }

  const hasPerf = hasPerfSamples(perfSnapshot);
  const perfFpsDigest = hasPerf ? round1(Number(perfSnapshot.fps) || 0) : "-";
  const perfFrameMsDigest = hasPerf ? round2(Number(perfSnapshot.frameMsAvg) || 0) : "-";
  const perfUpdateMsDigest = hasPerf ? round2(Number(perfSnapshot.updateMsAvg) || 0) : "-";
  const perfRenderMsDigest = hasPerf ? round2(Number(perfSnapshot.renderMsAvg) || 0) : "-";
  const perfSlowFramesDigest = hasPerf ? Math.max(0, Math.round(Number(perfSnapshot.slowFrames) || 0)) : "-";

  return [
    dungeon.seed,
    dungeon.dungeonId ?? "",
    dungeon.wallHeightTiles ?? 0,
    Math.round(Number(player?.hp) || 0),
    Math.round(Number(player?.maxHp) || 0),
    debugPlayerDamagePreviewOnly ? 1 : 0,
    perfFpsDigest,
    perfFrameMsDigest,
    perfUpdateMsDigest,
    perfRenderMsDigest,
    perfSlowFramesDigest,
  ].join("|");
}

function syncStatsPanel() {
  if (!appState.dungeon) {
    return;
  }

  const perfSnapshot = getDebugPerfSnapshot(debugPerfMetricsTracker);
  const digest = buildStatsDigest(appState.dungeon, appState.player, appState.debugPlayerDamagePreviewOnly, perfSnapshot);
  if (digest === lastStatsDigest) {
    return;
  }

  debugPanel.setStats(buildStatsRows(appState.dungeon, appState.player, appState.debugPlayerDamagePreviewOnly, perfSnapshot));
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

    if (
      viewMode !== VIEW_MODE.DUNGEON ||
      isFloorTransitionActive(floorTransitionState) ||
      isSceneTransitionActive(sceneTransitionState) ||
      playerDeathSequence.active
    ) {
      setPointerTarget(appState.player, false, 0, 0);
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
    if (viewMode !== VIEW_MODE.DUNGEON || !appState.player || !appState.dungeon || appState.error) {
      return;
    }
    if (isFloorTransitionActive(floorTransitionState) || isSceneTransitionActive(sceneTransitionState) || playerDeathSequence.active) {
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

    playSeByKey(SE_KEY_OPEN_CHEST, 1);
    appState.treasureChests = openResult.treasureChests;
    appState.groundItems = openResult.groundItems;
  },
});

function getWeaponHitTargetCount(weapon) {
  if (weapon?.hitSet instanceof Set) {
    return weapon.hitSet.size;
  }

  if (Array.isArray(weapon?.hitSet)) {
    return weapon.hitSet.length;
  }

  return 0;
}

function createWeaponCombatSnapshot(weapons) {
  const snapshot = new Map();

  for (const weapon of Array.isArray(weapons) ? weapons : []) {
    if (!weapon || typeof weapon.id !== "string") {
      continue;
    }

    snapshot.set(weapon.id, {
      attackSeq: Math.max(0, Math.floor(Number(weapon.attackSeq) || 0)),
      hitCount: Math.max(0, Math.floor(Number(getWeaponHitTargetCount(weapon)) || 0)),
    });
  }

  return snapshot;
}

function createEnemyWeaponCombatSnapshot(enemies) {
  const snapshot = new Map();

  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }

    const attackCycle = Math.max(0, Math.floor(Number(enemy?.attack?.attackCycle) || 0));
    for (const weapon of getEnemyWeaponRuntimes(enemy)) {
      if (!weapon || typeof weapon.id !== "string") {
        continue;
      }

      snapshot.set(weapon.id, {
        attackCycle,
      });
    }
  }

  return snapshot;
}

function getWeaponCenter(weapon) {
  return {
    x: (Number(weapon?.x) || 0) + (Number(weapon?.width) || 0) / 2,
    y: (Number(weapon?.y) || 0) + (Number(weapon?.height) || 0) / 2,
  };
}

function buildEffectRuntime(effectId, x, y) {
  if (typeof effectId !== "string" || effectId.length <= 0) {
    return null;
  }

  const effectDefinition = effectDefinitionsById?.[effectId];
  const effectAsset = effectAssets?.[effectId];
  if (!effectDefinition || !effectAsset) {
    return null;
  }

  const runtimeId = `effect-${effectSeq}`;
  effectSeq += 1;
  return createEffectRuntime(effectDefinition, {
    id: runtimeId,
    x,
    y,
    frameCount: effectAsset.frameCount,
  });
}

function spawnEffectsByCount(effectId, x, y, count = 1) {
  const spawnCount = Math.max(0, Math.floor(Number(count) || 0));
  if (spawnCount <= 0) {
    return [];
  }

  const spawned = [];
  for (let index = 0; index < spawnCount; index += 1) {
    const runtime = buildEffectRuntime(effectId, x, y);
    if (runtime) {
      spawned.push(runtime);
    }
  }
  return spawned;
}

function playWeaponCombatSe(weapons, beforeSnapshot) {
  for (const weapon of Array.isArray(weapons) ? weapons : []) {
    if (!weapon || typeof weapon.id !== "string") {
      continue;
    }

    const weaponDefinition = weaponDefinitionsById?.[weapon.weaponDefId];
    if (!weaponDefinition) {
      continue;
    }

    const before = beforeSnapshot.get(weapon.id) ?? { attackSeq: 0, hitCount: 0 };
    const afterAttackSeq = Math.max(0, Math.floor(Number(weapon.attackSeq) || 0));
    const afterHitCount = Math.max(0, Math.floor(Number(getWeaponHitTargetCount(weapon)) || 0));

    const startAttackCount = afterAttackSeq > before.attackSeq ? afterAttackSeq - before.attackSeq : 0;
    let hitAttackCount = 0;
    if (afterAttackSeq > before.attackSeq) {
      hitAttackCount = afterHitCount;
    } else if (afterAttackSeq === before.attackSeq && afterHitCount > before.hitCount) {
      hitAttackCount = afterHitCount - before.hitCount;
    }

    if (startAttackCount > 0) {
      playSeByKey(weaponDefinition.seKeyStartAttack, startAttackCount);
    }

    if (hitAttackCount > 0) {
      playSeByKey(weaponDefinition.seKeyHitAttack, hitAttackCount);
    }
  }
}

function buildWeaponStartEvents(weapons, beforeSnapshot) {
  const events = [];

  for (const weapon of Array.isArray(weapons) ? weapons : []) {
    if (!weapon || typeof weapon.id !== "string") {
      continue;
    }

    const before = beforeSnapshot.get(weapon.id) ?? { attackSeq: 0 };
    const beforeAttackSeq = Math.max(0, Math.floor(Number(before.attackSeq) || 0));
    const afterAttackSeq = Math.max(0, Math.floor(Number(weapon.attackSeq) || 0));
    if (afterAttackSeq <= beforeAttackSeq) {
      continue;
    }

    const center = getWeaponCenter(weapon);
    for (let attackSeq = beforeAttackSeq + 1; attackSeq <= afterAttackSeq; attackSeq += 1) {
      events.push({
        weaponId: weapon.id,
        weaponDefId: weapon.weaponDefId,
        attackSeq,
        worldX: center.x,
        worldY: center.y,
      });
    }
  }

  return events;
}

function buildWeaponHitEvents(events, weapons) {
  const weaponAttackSeqById = new Map();
  for (const weapon of Array.isArray(weapons) ? weapons : []) {
    if (!weapon || typeof weapon.id !== "string") {
      continue;
    }
    weaponAttackSeqById.set(weapon.id, Math.max(0, Math.floor(Number(weapon.attackSeq) || 0)));
  }

  const hitEvents = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.kind !== "damage" || event?.targetType !== "enemy") {
      continue;
    }

    const weaponId = typeof event.weaponId === "string" ? event.weaponId : "";
    const enemyId = typeof event.enemyId === "string" ? event.enemyId : "";
    if (weaponId.length <= 0 || enemyId.length <= 0) {
      continue;
    }

    const runtimeAttackSeq = weaponAttackSeqById.get(weaponId);
    const resolvedAttackSeq = Number.isFinite(runtimeAttackSeq)
      ? Math.max(0, Math.floor(Number(runtimeAttackSeq) || 0))
      : Math.max(0, Math.floor(Number(event.attackSeq) || 0));

    hitEvents.push({
      weaponId,
      attackSeq: resolvedAttackSeq,
      enemyId,
      worldX: Number(event.worldX) || 0,
      worldY: Number(event.worldY) || 0,
    });
  }

  return hitEvents;
}

function getPlayerSkillTargetId(player) {
  if (typeof player?.id === "string" && player.id.length > 0) {
    return player.id;
  }
  return "player";
}

function buildEnemyWeaponStartEvents(enemies, beforeSnapshot) {
  const events = [];

  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }

    const attackCycle = Math.max(0, Math.floor(Number(enemy?.attack?.attackCycle) || 0));
    for (const weapon of getEnemyWeaponRuntimes(enemy)) {
      if (!weapon || typeof weapon.id !== "string") {
        continue;
      }

      const before = beforeSnapshot.get(weapon.id) ?? { attackCycle: 0 };
      const beforeAttackCycle = Math.max(0, Math.floor(Number(before.attackCycle) || 0));
      if (attackCycle <= beforeAttackCycle) {
        continue;
      }

      const center = getWeaponCenter(weapon);
      for (let cycle = beforeAttackCycle + 1; cycle <= attackCycle; cycle += 1) {
        events.push({
          weaponId: weapon.id,
          weaponDefId: weapon.weaponDefId,
          attackSeq: cycle,
          worldX: center.x,
          worldY: center.y,
        });
      }
    }
  }

  return events;
}

function buildEnemyWeaponHitEvents(events, enemies, player) {
  const weaponAttackSeqById = new Map();

  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }

    const attackCycle = Math.max(0, Math.floor(Number(enemy?.attack?.attackCycle) || 0));
    for (const weapon of getEnemyWeaponRuntimes(enemy)) {
      if (!weapon || typeof weapon.id !== "string") {
        continue;
      }
      weaponAttackSeqById.set(weapon.id, attackCycle);
    }
  }

  const hitEvents = [];
  const playerTargetId = getPlayerSkillTargetId(player);
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.kind !== "damage" || event?.targetType !== "player") {
      continue;
    }

    const weaponId = typeof event.weaponId === "string" ? event.weaponId : "";
    if (weaponId.length <= 0) {
      continue;
    }

    const runtimeAttackSeq = weaponAttackSeqById.get(weaponId);
    const resolvedAttackSeq = Number.isFinite(runtimeAttackSeq)
      ? Math.max(0, Math.floor(Number(runtimeAttackSeq) || 0))
      : Math.max(0, Math.floor(Number(event.attackSeq) || 0));

    hitEvents.push({
      weaponId,
      attackSeq: resolvedAttackSeq,
      targetId: playerTargetId,
      worldX: Number(event.worldX) || 0,
      worldY: Number(event.worldY) || 0,
    });
  }

  return hitEvents;
}

function spawnWeaponStartEffects(weapons, beforeSnapshot) {
  const spawned = [];

  for (const weapon of Array.isArray(weapons) ? weapons : []) {
    if (!weapon || typeof weapon.id !== "string") {
      continue;
    }

    const weaponDefinition = weaponDefinitionsById?.[weapon.weaponDefId];
    if (!weaponDefinition) {
      continue;
    }

    const before = beforeSnapshot.get(weapon.id) ?? { attackSeq: 0 };
    const afterAttackSeq = Math.max(0, Math.floor(Number(weapon.attackSeq) || 0));
    const startAttackCount = afterAttackSeq > before.attackSeq ? afterAttackSeq - before.attackSeq : 0;
    if (startAttackCount <= 0) {
      continue;
    }

    const center = getWeaponCenter(weapon);
    spawned.push(
      ...spawnEffectsByCount(
        weaponDefinition.effectIdStartAttack,
        center.x,
        center.y,
        startAttackCount
      )
    );
  }

  return spawned;
}

function spawnEnemyWeaponStartEffects(enemies, beforeSnapshot) {
  const spawned = [];

  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }

    const attackCycle = Math.max(0, Math.floor(Number(enemy?.attack?.attackCycle) || 0));
    for (const weapon of getEnemyWeaponRuntimes(enemy)) {
      if (!weapon || typeof weapon.id !== "string") {
        continue;
      }

      const weaponDefinition = weaponDefinitionsById?.[weapon.weaponDefId];
      if (!weaponDefinition) {
        continue;
      }

      const before = beforeSnapshot.get(weapon.id) ?? { attackCycle: 0 };
      const startAttackCount = attackCycle > before.attackCycle ? attackCycle - before.attackCycle : 0;
      if (startAttackCount <= 0) {
        continue;
      }

      const center = getWeaponCenter(weapon);
      spawned.push(
        ...spawnEffectsByCount(
          weaponDefinition.effectIdStartAttack,
          center.x,
          center.y,
          startAttackCount
        )
      );
    }
  }

  return spawned;
}

function spawnWeaponHitEffectsFromEvents(events) {
  const spawned = [];

  for (const event of Array.isArray(events) ? events : []) {
    if (event?.suppressWeaponHitEffect === true) {
      continue;
    }

    if (event?.kind !== "damage" || typeof event?.weaponDefId !== "string" || event.weaponDefId.length <= 0) {
      continue;
    }

    const weaponDefinition = weaponDefinitionsById?.[event.weaponDefId];
    if (!weaponDefinition) {
      continue;
    }

    const runtime = buildEffectRuntime(
      weaponDefinition.effectIdHitAttack,
      Number(event.worldX) || 0,
      Number(event.worldY) || 0
    );
    if (runtime) {
      spawned.push(runtime);
    }
  }

  return spawned;
}

function createAliveEnemyIdSet(enemies) {
  const aliveEnemyIds = new Set();

  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true || typeof enemy.id !== "string") {
      continue;
    }
    aliveEnemyIds.add(enemy.id);
  }

  return aliveEnemyIds;
}

function countNewlyDefeatedEnemies(enemies, beforeAliveEnemyIds) {
  let defeatedCount = 0;
  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead !== true || typeof enemy.id !== "string") {
      continue;
    }
    if (beforeAliveEnemyIds.has(enemy.id)) {
      defeatedCount += 1;
    }
  }
  return defeatedCount;
}

function removeEnemiesAfterDeathAnimation(enemies, enemyAssetsByDbId) {
  if (!Array.isArray(enemies) || enemies.length <= 0) {
    return [];
  }

  return enemies.filter((enemy) => {
    if (!enemy) {
      return false;
    }

    if (enemy.isDead !== true) {
      return true;
    }

    const enemyAsset = enemyAssetsByDbId?.[enemy.dbId] ?? null;
    return !isEnemyDeathAnimationFinished(enemy, enemyAsset);
  });
}

function countPlayerDamageEvents(events) {
  if (!Array.isArray(events) || events.length <= 0) {
    return 0;
  }

  return events.reduce((count, event) => {
    if (event?.kind !== "damage" || event?.targetType !== "player") {
      return count;
    }
    return count + 1;
  }, 0);
}

function renderCurrentFrame() {
  if (appState.error) {
    renderErrorScreen(appState.error);
    renderSceneTransitionOverlay();
    return;
  }

  if (viewMode !== VIEW_MODE.DUNGEON) {
    renderSceneTransitionOverlay();
    return;
  }

  if (!appState.backdrop || !appState.player) {
    renderSceneTransitionOverlay();
    return;
  }

  const enemyDrawables = appState.enemies.map((enemy) => {
    const enemyAssetPack = enemyAssets[enemy.dbId] ?? null;
    const frame = getEnemyFrame(enemy, enemyAssetPack);
    const asset = enemyAssetPack?.[frame.animation] ?? null;
    const drawScale = Number(enemyAssetPack?.drawScale ?? enemy?.imageMagnification);

    return {
      enemy,
      asset,
      frame: {
        ...frame,
        drawScale: Number.isFinite(drawScale) && drawScale > 0 ? drawScale : 1,
      },
      flashAlpha: getEnemyHitFlashAlpha(enemy),
      flashColor: normalizeHitFlashColor(enemy?.hitFlashColor),
      telegraphAlpha: getEnemyTelegraphAlpha(enemy),
    };
  });
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
  const effectDrawables = (appState.effects ?? []).map((effect) => ({
    effect,
    asset: effectAssets[effect.effectId] ?? null,
  }));
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
  const basePlayerFrame = getPlayerFrame(appState.player, playerAssets);
  const playerFrame = basePlayerFrame
    ? {
        ...basePlayerFrame,
        drawScale: PLAYER_RENDER_SCALE,
        anchorFeet: true,
      }
    : null;
  const playerDrawableAsset =
    playerFrame && playerAssets
      ? playerAssets[playerFrame.animation] ?? playerAssets.idle ?? null
      : null;

  renderFrame(
    canvas,
    appState.backdrop,
    playerDrawableAsset,
    playerFrame,
    appState.player,
    getPlayerHitFlashAlpha(appState.player),
    normalizeHitFlashColor(appState.player?.hitFlashColor),
    enemyDrawables,
    weaponDrawables,
    enemyWeaponDrawables,
    effectDrawables,
    treasureChestDrawables,
    groundItemDrawables,
    appState.damagePopups
  );
  renderFloorTransitionOverlay();
  applyCanvasDisplayScale();
  renderSceneTransitionOverlay();
}

function isPlayerTouchingDownStairTrigger(dungeon, player) {
  if (!dungeon?.downStair || dungeon.downStair.isEnabled !== true) {
    return false;
  }

  const feetTile = getPlayerFeetTile(player);
  return isPlayerTouchingDownStair(feetTile, dungeon.downStair);
}

function startDownStairFloorTransition() {
  if (
    viewMode !== VIEW_MODE.DUNGEON ||
    !appState.dungeon ||
    !appState.player ||
    !appState.playerState ||
    isFloorTransitionActive(floorTransitionState) ||
    isSceneTransitionActive(sceneTransitionState)
  ) {
    return;
  }

  const currentFloor = getRunFloor(appState.playerState);
  if (currentFloor >= MAX_FLOOR) {
    return;
  }

  const nextFloor = currentFloor + 1;
  setPointerTarget(appState.player, false, 0, 0);
  pointerDownFeetTileSnapshot = null;
  floorTransitionLoadPromise = null;
  floorTransitionState.loadToken = null;
  startFloorTransition(floorTransitionState, {
    targetFloor: nextFloor,
    titleText: `地下${nextFloor}階`,
  });
}

function requestFloorTransitionLoadIfNeeded() {
  if (!isFloorTransitionActive(floorTransitionState)) {
    return;
  }

  if (floorTransitionState.phase !== FLOOR_TRANSITION_PHASE.TITLE_HOLD || floorTransitionState.didRequestLoad === true) {
    return;
  }

  floorTransitionState.didRequestLoad = true;
  const targetFloor = clampFloor(floorTransitionState.targetFloor ?? MIN_FLOOR);
  const nextSeed = buildFloorSeed(runBaseSeed, targetFloor);
  const loadToken = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  floorTransitionState.loadToken = loadToken;

  floorTransitionLoadPromise = regenerate(nextSeed, {
    overrideFloor: targetFloor,
    preserveBaseSeed: true,
    skipRestorePlayerPosition: true,
  })
    .catch(() => {
      // regenerate handles error state update itself.
    })
    .finally(() => {
      if (floorTransitionState.loadToken === loadToken) {
        markFloorTransitionDungeonReady(floorTransitionState);
        floorTransitionLoadPromise = null;
      }
    });
}

function updateFloorTransition(dt) {
  if (!isFloorTransitionActive(floorTransitionState)) {
    return;
  }

  stepFloorTransition(floorTransitionState, dt);
  requestFloorTransitionLoadIfNeeded();
}

function isRuntimePlayerDead(player) {
  return Number.isFinite(player?.hp) && player.hp <= 0;
}

function resetPlayerDeathSequence() {
  playerDeathSequence.active = false;
  playerDeathSequence.postAnimDelaySec = 0;
}

function startPlayerDeathSequenceIfNeeded() {
  if (
    playerDeathSequence.active ||
    viewMode !== VIEW_MODE.DUNGEON ||
    isSceneTransitionActive(sceneTransitionState) ||
    !appState.player
  ) {
    return false;
  }

  if (!isRuntimePlayerDead(appState.player)) {
    return false;
  }

  playerDeathSequence.active = true;
  playerDeathSequence.postAnimDelaySec = 0;
  if (appState.isPaused) {
    setPaused(false);
  }
  setPointerTarget(appState.player, false, 0, 0);
  pointerDownFeetTileSnapshot = null;
  return true;
}

function stepPlayerDeathSequence(dt, { updateAnimation = true } = {}) {
  if (!playerDeathSequence.active || !appState.player || !appState.dungeon) {
    return false;
  }

  if (updateAnimation) {
    updatePlayer(appState.player, appState.dungeon, dt);
  }

  if (!isRuntimePlayerDead(appState.player)) {
    resetPlayerDeathSequence();
    return false;
  }

  if (isPlayerDeathAnimationFinished(appState.player, playerAssets)) {
    playerDeathSequence.postAnimDelaySec += dt;
    if (playerDeathSequence.postAnimDelaySec >= PLAYER_DEATH_POST_ANIM_DELAY_SEC) {
      startPlayerDeathSceneTransition();
      updateSceneTransition(dt);
      return true;
    }
  } else {
    playerDeathSequence.postAnimDelaySec = 0;
  }

  syncStatsPanel();
  syncPlayerStatsWindow();
  syncSystemHud();
  followPlayerInView();
  return true;
}

function startSurfaceToDungeonTransition() {
  if (viewMode !== VIEW_MODE.SURFACE || isSceneTransitionActive(sceneTransitionState)) {
    return;
  }

  storageFacilityUiState.open = false;
  clearStorageFacilityToast();
  resetStorageFacilitySelectionAndSellMode();
  setSurfaceScreen(SURFACE_SCREEN.HUB);
  resetPlayerDeathSequence();
  sceneTransitionState.config.fadeInSec = FLOOR_TRANSITION_FADE_OUT_SEC;
  sceneTransitionState.config.titleHoldSec = FLOOR_TRANSITION_TITLE_HOLD_SEC;
  sceneTransitionState.config.fadeOutSec = FLOOR_TRANSITION_FADE_IN_SEC;
  ensurePlayerStateLoaded();
  const starterWeaponDefId = resolveStarterWeaponDefId();
  if (appState.playerState?.in_run === false) {
    beginNewRun(appState.playerState, weaponDefinitionsById, starterWeaponDefId, nowUnixSec());
  }
  const targetFloor = getRunFloor(appState.playerState);
  setRunFloor(appState.playerState, targetFloor);
  sceneTransitionLoadPromise = null;
  sceneTransitionState.loadToken = null;
  startSceneTransition(sceneTransitionState, {
    kind: SCENE_TRANSITION_KIND.SURFACE_TO_DUNGEON,
    targetMode: VIEW_MODE.DUNGEON,
    targetFloor,
    titleText: `地下${targetFloor}階`,
    titleColor: "#f4f4f4",
    ready: false,
  });
}

function startPlayerDeathSceneTransition() {
  if (
    viewMode !== VIEW_MODE.DUNGEON ||
    !appState.player ||
    !appState.playerState ||
    isSceneTransitionActive(sceneTransitionState)
  ) {
    return;
  }

  setPointerTarget(appState.player, false, 0, 0);
  pointerDownFeetTileSnapshot = null;
  markRunLostByDeath(appState.playerState, nowUnixSec());

  sceneTransitionState.config.fadeInSec = SCENE_TRANSITION_DEATH_FADE_SEC;
  sceneTransitionState.config.titleHoldSec = SCENE_TRANSITION_DEATH_TITLE_HOLD_SEC;
  sceneTransitionState.config.fadeOutSec = SCENE_TRANSITION_DEATH_FADE_SEC;
  startSceneTransition(sceneTransitionState, {
    kind: SCENE_TRANSITION_KIND.PLAYER_DEATH,
    targetMode: VIEW_MODE.SURFACE,
    targetFloor: MIN_FLOOR,
    titleText: "YOU DIED",
    titleColor: "#d22c2c",
    ready: true,
  });
  resetPlayerDeathSequence();
  persistPlayerState();
}

function requestSceneTransitionLoadIfNeeded() {
  if (!isSceneTransitionActive(sceneTransitionState)) {
    return;
  }

  if (
    sceneTransitionState.kind !== SCENE_TRANSITION_KIND.SURFACE_TO_DUNGEON ||
    sceneTransitionState.phase !== SCENE_TRANSITION_PHASE.TITLE_HOLD ||
    sceneTransitionState.didRequestLoad === true
  ) {
    return;
  }

  sceneTransitionState.didRequestLoad = true;
  const targetFloor = clampFloor(sceneTransitionState.targetFloor ?? MIN_FLOOR);
  const nextSeed = buildFloorSeed(runBaseSeed, targetFloor);
  const loadToken = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  sceneTransitionState.loadToken = loadToken;

  sceneTransitionLoadPromise = regenerate(nextSeed, {
    overrideFloor: targetFloor,
    preserveBaseSeed: true,
    skipRestorePlayerPosition: true,
    forceFullHp: true,
  })
    .catch(() => {
      // regenerate handles error state update itself.
    })
    .finally(() => {
      if (sceneTransitionState.loadToken === loadToken) {
        markSceneTransitionReady(sceneTransitionState);
        sceneTransitionLoadPromise = null;
      }
    });
}

function applySceneTransitionTargetIfNeeded() {
  if (
    !isSceneTransitionActive(sceneTransitionState) ||
    sceneTransitionState.phase !== SCENE_TRANSITION_PHASE.FADE_OUT ||
    sceneTransitionState.didApplyTarget === true
  ) {
    return;
  }

  sceneTransitionState.didApplyTarget = true;
  if (sceneTransitionState.targetMode === VIEW_MODE.DUNGEON) {
    setViewMode(VIEW_MODE.DUNGEON);
    syncStorageFacilityHud();
    return;
  }

  const kind = sceneTransitionState.kind;
  if (kind === SCENE_TRANSITION_KIND.SURFACE_HUB_TO_STORAGE) {
    setViewMode(VIEW_MODE.SURFACE);
    storageFacilityUiState.open = true;
    setSurfaceScreen(SURFACE_SCREEN.STORAGE);
    syncStorageFacilityHud();
    return;
  }

  if (kind === SCENE_TRANSITION_KIND.SURFACE_STORAGE_TO_HUB) {
    storageFacilityUiState.open = false;
    clearStorageFacilityToast();
    resetStorageFacilitySelectionAndSellMode();
    setSurfaceScreen(SURFACE_SCREEN.HUB);
    setViewMode(VIEW_MODE.SURFACE);
    syncStorageFacilityHud();
    return;
  }

  storageFacilityUiState.open = false;
  clearStorageFacilityToast();
  resetStorageFacilitySelectionAndSellMode();
  setSurfaceScreen(SURFACE_SCREEN.HUB);
  setViewMode(VIEW_MODE.SURFACE);
  appState.isPaused = false;
  syncStorageFacilityHud();
}

function updateSceneTransition(dt) {
  if (!isSceneTransitionActive(sceneTransitionState)) {
    return;
  }

  const wasActive = sceneTransitionState.active === true;
  const transitionKind = sceneTransitionState.kind;
  stepSceneTransition(sceneTransitionState, dt);
  requestSceneTransitionLoadIfNeeded();
  applySceneTransitionTargetIfNeeded();

  if (wasActive && !isSceneTransitionActive(sceneTransitionState) && transitionKind === SCENE_TRANSITION_KIND.PLAYER_DEATH) {
    dungeonBgmPlayer.stop();
  }
}

function stepSimulation(dt) {
  if (isSceneTransitionActive(sceneTransitionState)) {
    updateSceneTransition(dt);
    syncStatsPanel();
    syncPlayerStatsWindow();
    syncSystemHud();
    if (viewMode === VIEW_MODE.DUNGEON) {
      followPlayerInView();
    }
    return;
  }

  if (viewMode !== VIEW_MODE.DUNGEON) {
    syncStatsPanel();
    syncPlayerStatsWindow();
    syncSystemHud();
    return;
  }

  if (isFloorTransitionBlocking(floorTransitionState)) {
    if (!appState.dungeon || !appState.player || appState.error) {
      return;
    }
    updateFloorTransition(dt);
    syncStatsPanel();
    syncPlayerStatsWindow();
    syncSystemHud();
    followPlayerInView();
    return;
  }

  if (!appState.dungeon || !appState.player || appState.error) {
    return;
  }

  if (playerDeathSequence.active) {
    stepPlayerDeathSequence(dt, { updateAnimation: true });
    return;
  }

  if (startPlayerDeathSequenceIfNeeded()) {
    stepPlayerDeathSequence(dt, { updateAnimation: true });
    return;
  }

  if (appState.isPaused) {
    return;
  }

  appState.effects = updateEffects(appState.effects, dt);
  updatePlayer(appState.player, appState.dungeon, dt);
  if (startPlayerDeathSequenceIfNeeded()) {
    stepPlayerDeathSequence(dt, { updateAnimation: false });
    return;
  }

  if (isPlayerTouchingDownStairTrigger(appState.dungeon, appState.player)) {
    startDownStairFloorTransition();
    updateFloorTransition(dt);
    syncStatsPanel();
    syncPlayerStatsWindow();
    syncSystemHud();
    followPlayerInView();
    return;
  }
  syncGroundItemPickup();
  updateEnemies(appState.enemies, appState.dungeon, dt, appState.player);

  const isPlayerDead = Number.isFinite(appState.player.hp) && appState.player.hp <= 0;
  const weaponCombatSnapshot = createWeaponCombatSnapshot(appState.weapons);
  const enemyWeaponCombatSnapshot = createEnemyWeaponCombatSnapshot(appState.enemies);
  const aliveEnemyIdsBeforeCombat = createAliveEnemyIdSet(appState.enemies);
  const playerCombatEvents = isPlayerDead
    ? []
    : updateWeaponsAndCombat(
        appState.weapons,
        appState.player,
        appState.enemies,
        weaponDefinitionsById,
        formationDefinitionsById,
        dt
      );
  const skillChainResult = isPlayerDead
    ? { events: [], effects: appState.effects }
    : updateSkillChainCombat({
        dt,
        dungeon: appState.dungeon,
        player: appState.player,
        enemies: appState.enemies,
        effects: appState.effects,
        weapons: appState.weapons,
        weaponStartEvents: buildWeaponStartEvents(appState.weapons, weaponCombatSnapshot),
        weaponHitEvents: buildWeaponHitEvents(playerCombatEvents, appState.weapons),
        weaponDefinitionsById,
        skillDefinitionsById,
        buildEffectRuntime,
      });
  appState.effects = skillChainResult.effects;
  if (!isPlayerDead) {
    playWeaponCombatSe(appState.weapons, weaponCombatSnapshot);
  }
  const enemyCombatEvents = updateEnemyAttacks(appState.enemies, appState.player, appState.dungeon, dt, {
    applyPlayerHpDamage: appState.debugPlayerDamagePreviewOnly !== true,
  });
  const enemySkillChainResult = updateEnemySkillChainCombat({
    dt,
    dungeon: appState.dungeon,
    player: appState.player,
    enemies: appState.enemies,
    effects: appState.effects,
    weaponStartEvents: buildEnemyWeaponStartEvents(appState.enemies, enemyWeaponCombatSnapshot),
    weaponHitEvents: buildEnemyWeaponHitEvents(enemyCombatEvents, appState.enemies, appState.player),
    weaponDefinitionsById,
    skillDefinitionsById,
    buildEffectRuntime,
    applyPlayerHpDamage: appState.debugPlayerDamagePreviewOnly !== true,
  });
  appState.effects = enemySkillChainResult.effects;
  if (startPlayerDeathSequenceIfNeeded()) {
    stepPlayerDeathSequence(dt, { updateAnimation: false });
    return;
  }

  const playerDamageEventCount = countPlayerDamageEvents([
    ...enemyCombatEvents,
    ...enemySkillChainResult.events,
  ]);
  if (playerDamageEventCount > 0) {
    playSeByKey(SE_KEY_PLAYER_GET_DAMAGE, playerDamageEventCount);
  }
  const defeatedEnemyCount = countNewlyDefeatedEnemies(appState.enemies, aliveEnemyIdsBeforeCombat);
  if (defeatedEnemyCount > 0) {
    playSeByKey(SE_KEY_ENEMY_DEATH, defeatedEnemyCount);
  }
  const combatEvents = [
    ...playerCombatEvents,
    ...skillChainResult.events,
    ...enemyCombatEvents,
    ...enemySkillChainResult.events,
  ];
  applyHitFlashColorsFromDamageEvents({
    events: combatEvents,
    player: appState.player,
    enemies: appState.enemies,
  });
  const spawnedEffects = [
    ...spawnWeaponStartEffects(appState.weapons, weaponCombatSnapshot),
    ...spawnEnemyWeaponStartEffects(appState.enemies, enemyWeaponCombatSnapshot),
    ...spawnWeaponHitEffectsFromEvents(combatEvents),
  ];
  if (spawnedEffects.length > 0) {
    appState.effects = [...appState.effects, ...spawnedEffects];
  }
  const spawnedPopups = spawnDamagePopupsFromEvents(combatEvents, damagePopupSeq);
  damagePopupSeq += 1;
  appState.damagePopups = updateDamagePopups(
    [...appState.damagePopups, ...spawnedPopups],
    dt
  );

  if (startPlayerDeathSequenceIfNeeded()) {
    stepPlayerDeathSequence(dt, { updateAnimation: false });
    return;
  }

  appState.enemies = removeEnemiesAfterDeathAnimation(appState.enemies, enemyAssets);
  syncPlayerStateFromRuntime(
    appState.playerState,
    appState.player,
    appState.weapons,
    getSystemUiState(),
    nowUnixSec()
  );
  syncStatsPanel();
  syncPlayerStatsWindow();
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
  const frameMs = Math.max(0, timestamp - lastTimestamp);
  const elapsed = Math.min(0.25, frameMs / 1000);
  lastTimestamp = timestamp;
  accumulator += elapsed;

  let updateMs = 0;
  if (accumulator >= FIXED_DT) {
    const updateStartMs = performance.now();
    while (accumulator >= FIXED_DT) {
      stepSimulation(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    updateMs = Math.max(0, performance.now() - updateStartMs);
  }

  const renderStartMs = performance.now();
  renderCurrentFrame();
  const renderMs = Math.max(0, performance.now() - renderStartMs);

  const didPublishPerfSnapshot = recordDebugPerfSample(debugPerfMetricsTracker, {
    nowMs: timestamp,
    frameMs,
    updateMs,
    renderMs,
  });
  if (didPublishPerfSnapshot) {
    syncStatsPanel();
  }

  requestAnimationFrame(runFrame);
}

let regenerateRequestId = 0;

async function regenerate(seed, options = {}) {
  const normalizedSeed = String(seed);
  const preserveBaseSeed = options?.preserveBaseSeed === true;
  const overrideFloor = Number.isFinite(options?.overrideFloor) ? clampFloor(options.overrideFloor) : null;
  const skipRestorePlayerPosition = options?.skipRestorePlayerPosition === true;
  const forceFullHp = options?.forceFullHp === true;
  const requestId = (regenerateRequestId += 1);
  resetPlayerDeathSequence();
  if (!preserveBaseSeed) {
    runBaseSeed = normalizedSeed;
    if (isFloorTransitionActive(floorTransitionState)) {
      floorTransitionState.active = false;
      floorTransitionState.phase = FLOOR_TRANSITION_PHASE.IDLE;
      floorTransitionState.timerSec = 0;
      floorTransitionState.alpha = 0;
      floorTransitionState.targetFloor = null;
      floorTransitionState.titleText = "";
      floorTransitionState.isDungeonReady = false;
      floorTransitionState.didRequestLoad = false;
      floorTransitionState.loadToken = null;
      floorTransitionLoadPromise = null;
    }
    if (isSceneTransitionActive(sceneTransitionState)) {
      sceneTransitionState.active = false;
      sceneTransitionState.phase = SCENE_TRANSITION_PHASE.IDLE;
      sceneTransitionState.timerSec = 0;
      sceneTransitionState.alpha = 0;
      sceneTransitionState.titleText = "";
      sceneTransitionState.titleColor = "";
      sceneTransitionState.kind = "";
      sceneTransitionState.targetMode = "";
      sceneTransitionState.targetFloor = null;
      sceneTransitionState.isReady = false;
      sceneTransitionState.didRequestLoad = false;
      sceneTransitionState.loadToken = null;
      sceneTransitionState.didApplyTarget = false;
      sceneTransitionLoadPromise = null;
    }
  }

  try {
    await Promise.all([
      refreshEnemyResources(),
      refreshSkillResources(),
      refreshWeaponResources(),
      refreshItemResources(),
      refreshEffectResources(),
      refreshSoundResources(),
    ]);
    if (requestId !== regenerateRequestId) {
      return;
    }
    buildEnemyAttackProfilesByDbId();
    ensurePlayerStateLoaded();
    const starterWeaponDefId = resolveStarterWeaponDefId();
    if (!starterWeaponDefId) {
      throw new Error("Weapon DB is empty.");
    }
    if (appState.playerState?.in_run === false) {
      beginNewRun(appState.playerState, weaponDefinitionsById, starterWeaponDefId, nowUnixSec());
    }
    const targetFloor = overrideFloor ?? getRunFloor(appState.playerState);
    setRunFloor(appState.playerState, targetFloor);
    const generationSeed = buildFloorSeed(runBaseSeed, targetFloor);
    const dungeonDefinition = getSelectedDungeonDefinition(targetFloor);
    if (!dungeonDefinition) {
      throw new Error("Dungeon DB is empty.");
    }
    const dungeonEnemyDefinitions = resolveDungeonEnemyDefinitionsOrThrow(
      dungeonDefinition,
      enemyDefinitionsById
    );
    const dungeonBgmSource = resolveDungeonBgmSourceOrThrow(dungeonDefinition, soundEffectMap);
    selectedDungeonId = dungeonDefinition.id;
    debugPanel.setDungeonId(selectedDungeonId);
    const tileAssets = await ensureTileAssetsForDungeon(dungeonDefinition);

    const dungeon = generateDungeon({
      seed: generationSeed,
      wallHeightTiles: dungeonDefinition.wallHeightTiles,
    });
    dungeon.dungeonId = dungeonDefinition.id;
    dungeon.wallHeightTiles = dungeonDefinition.wallHeightTiles;
    const validation = validateDungeon(dungeon);
    dungeon.symbolGrid = resolveWallSymbols(dungeon.floorGrid);
    const stairPlacement = placeDownStairSymbols(dungeon.symbolGrid, dungeon, dungeonDefinition.wallHeightTiles);
    dungeon.symbolGrid = stairPlacement.symbolGrid;
    dungeon.downStair = stairPlacement.downStair
      ? {
          ...stairPlacement.downStair,
          isEnabled: targetFloor < MAX_FLOOR,
        }
      : null;
    dungeon.walkableGrid = buildWalkableGrid(dungeon.floorGrid, dungeon.symbolGrid, {
      tallWallTileHeight: dungeonDefinition.wallHeightTiles,
    });
    dungeon.floor = targetFloor;

    const player = createPlayerState(dungeon, playerDefinition);
    const playerDerived = derivePlayerCombatStats(appState.playerState, PLAYER_SPEED_PX_PER_SEC);
    player.statTotals = playerDerived.statTotals;
    player.maxHp = playerDerived.maxHp;
    player.moveSpeedPxPerSec = playerDerived.moveSpeedPxPerSec;
    player.damageMult = playerDerived.damageMult;
    player.critChance = playerDerived.critChance;
    player.critMult = playerDerived.critMult;
    player.ailmentTakenMult = playerDerived.ailmentTakenMult;
    player.durationMult = playerDerived.durationMult;
    player.ccDurationMult = playerDerived.ccDurationMult;
    player.damageSeed = deriveSeed(dungeon.seed, "player-damage");

    if (!skipRestorePlayerPosition && appState.playerState?.run?.pos) {
      tryRestorePlayerPosition(player, dungeon, appState.playerState.run.pos);
    }
    if (forceFullHp) {
      player.hp = player.maxHp;
    } else if (Number.isFinite(appState.playerState?.run?.hp)) {
      player.hp = clamp(appState.playerState.run.hp, 0, player.maxHp);
    } else {
      player.hp = player.maxHp;
    }
    const herbDefinition = itemDefinitionsById?.[HERB_ITEM_ID];
    if (!herbDefinition) {
      throw new Error(`Item DB is missing required herb item: ${HERB_ITEM_ID}`);
    }
    const treasureChests = createTreasureChests(dungeon, generationSeed);
    dungeon.walkableGrid = applyChestBlockingToWalkableGrid(dungeon.walkableGrid, treasureChests);
    const blockedEnemyTiles = buildBlockedTileSetFromChests(treasureChests);
    const enemies = createEnemies(
      dungeon,
      dungeonEnemyDefinitions,
      generationSeed,
      enemyAttackProfilesByDbId,
      blockedEnemyTiles
    );
    const groundItems = [];
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
    for (let index = 0; index < weapons.length; index += 1) {
      const sourceDefinition = weaponDefinitionsForRun[index];
      weapons[index].skillInstances = Array.isArray(sourceDefinition?.skills)
        ? sourceDefinition.skills.map((skill) => ({
            id: skill.id,
            plus: Number.isFinite(skill.plus) ? skill.plus : 0,
          }))
        : [];
    }
    applySavedWeaponRuntime(appState.playerState, weapons);
    const backdrop = buildDungeonBackdrop(tileAssets, dungeon);
    damagePopupSeq = 0;
    effectSeq = 0;
    const systemUi = buildSystemUiStateFromPlayerState(appState.playerState);
    syncPlayerStateFromRuntime(appState.playerState, player, weapons, systemUi, nowUnixSec());

    setDungeonState(appState, {
      seed: runBaseSeed,
      dungeon,
      validation,
      playerState: appState.playerState,
      player,
      enemies,
      weapons,
      effects: [],
      damagePopups: [],
      treasureChests,
      groundItems,
      systemUi,
      backdrop,
    });

    debugPanel.setSeed(runBaseSeed);
    resetDebugPerfMetricsTracker(debugPerfMetricsTracker);
    lastStatsDigest = "";
    lastPlayerStatsDigest = "";
    lastSystemUiDigest = "";
    syncStatsPanel();
    syncPlayerStatsWindow();
    syncSystemHud();
    debugPanel.setError(validation.ok ? "" : validation.errors.join(" | "));
    syncPauseUi();
    syncDamagePreviewUi();

    if (requestId !== regenerateRequestId) {
      return;
    }

    void dungeonBgmPlayer.playLoop(dungeonBgmSource);
    renderCurrentFrame();
    followPlayerInView();
    persistPlayerState();
    resetLoopClock();
  } catch (error) {
    if (requestId !== regenerateRequestId) {
      return;
    }

    if (isFloorTransitionActive(floorTransitionState)) {
      floorTransitionState.active = false;
      floorTransitionState.phase = FLOOR_TRANSITION_PHASE.IDLE;
      floorTransitionState.timerSec = 0;
      floorTransitionState.alpha = 0;
      floorTransitionState.targetFloor = null;
      floorTransitionState.titleText = "";
      floorTransitionState.isDungeonReady = false;
      floorTransitionState.didRequestLoad = false;
      floorTransitionState.loadToken = null;
      floorTransitionLoadPromise = null;
    }

    dungeonBgmPlayer.stop();
    setErrorState(appState, runBaseSeed, error);
    debugPanel.setSeed(runBaseSeed);
    resetDebugPerfMetricsTracker(debugPerfMetricsTracker);
    lastStatsDigest = "";
    lastPlayerStatsDigest = "";
    lastSystemUiDigest = "";
    debugPanel.setStats([]);
    syncPlayerStatsWindow();
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

  const shouldStep =
    !appState.isPaused ||
    playerDeathSequence.active ||
    isFloorTransitionActive(floorTransitionState) ||
    isSceneTransitionActive(sceneTransitionState);
  if (shouldStep) {
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
  window.removeEventListener("pointerdown", retryAudioPlayback);
  window.removeEventListener("keydown", retryAudioPlayback);
  dungeonBgmPlayer.stop();
});

ensurePlayerStateLoaded();
void ensureStorageReferenceDataLoaded();
debugPanel.setSeed(runBaseSeed);
renderCurrentFrame();
requestAnimationFrame(runFrame);
