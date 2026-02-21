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
  setPointerTarget,
  tryRestorePlayerPosition,
  updatePlayer,
} from "./player/playerSystem.js";
import {
  applySavedWeaponRuntime,
  buildWeaponDefinitionsFromPlayerState,
  createDefaultPlayerState,
  loadPlayerStateFromStorage,
  PLAYER_STATE_LEGACY_STORAGE_KEYS,
  PLAYER_STATE_STORAGE_KEY,
  savePlayerStateToStorage,
  syncPlayerStateFromRuntime,
} from "./player/playerStateStore.js";
import { buildDungeonBackdrop, renderFrame } from "./render/canvasRenderer.js";
import { computeCameraScroll, resolveGameViewScale } from "./render/gameViewScale.js";
import { createAppState, setDungeonState, setErrorState } from "./state/appState.js";
import { derivePlayerCombatStats } from "./status/derivedStats.js";
import { loadTileAssets } from "./tiles/tileCatalog.js";
import { loadDungeonDefinitions } from "./tiles/dungeonTileDb.js";
import { buildWalkableGrid } from "./tiles/walkableGrid.js";
import { resolveWallSymbols } from "./tiles/wallSymbolResolver.js";
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
const DEFAULT_DUNGEON_ID = "dungeon_id_02";
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

const appState = createAppState(INITIAL_SEED);
const dungeonBgmPlayer = createDungeonBgmPlayer();
const soundEffectPlayer = createSoundEffectPlayer();
const debugPerfMetricsTracker = createDebugPerfMetricsTracker({
  windowMs: 1000,
  publishIntervalMs: 250,
  slowFrameThresholdMs: FRAME_MS,
});
const canvas = document.querySelector("#dungeon-canvas");
const canvasScroll = document.querySelector("#canvas-scroll");
const debugPanelRoot = document.querySelector("#debug-panel");
const systemUiRoot = document.querySelector("#system-ui-layer");
const gameViewScale = resolveGameViewScale(GAME_VIEW_SCALE);

function applyCanvasDisplayScale() {
  canvas.style.width = `${canvas.width * gameViewScale}px`;
  canvas.style.height = `${canvas.height * gameViewScale}px`;
}

applyCanvasDisplayScale();

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

function toTextState() {
  const hudState = buildHudTextState();
  const inventoryState = buildInventoryTextState();
  const treasureChests = Array.isArray(appState.treasureChests) ? appState.treasureChests : [];
  const groundItems = Array.isArray(appState.groundItems) ? appState.groundItems : [];
  const effects = Array.isArray(appState.effects) ? appState.effects : [];

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
      wallHeightTiles: dungeon.wallHeightTiles ?? null,
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
      effects: effects.map((effect) => buildEffectTextState(effect)),
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
  applyCanvasDisplayScale();
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
let damagePopupSeq = 0;
let effectSeq = 0;
let dungeonDefinitions = [];
let dungeonDefinitionsById = {};
let selectedDungeonId = DEFAULT_DUNGEON_ID;
const tileAssetsByDungeonId = new Map();

function getSelectedDungeonDefinition() {
  if (dungeonDefinitionsById[selectedDungeonId]) {
    return dungeonDefinitionsById[selectedDungeonId];
  }
  return dungeonDefinitions[0] ?? null;
}

function normalizeSelectedDungeonId() {
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
  try {
    soundEffectMap = await loadSoundEffectMap();
    soundEffectPlayer.setSoundEffectMap(soundEffectMap);
  } catch (error) {
    soundEffectMap = {};
    soundEffectPlayer.setSoundEffectMap(soundEffectMap);
    console.warn(`[SE] Failed to load sound DB: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  if (!appState.dungeon || !appState.player || appState.error) {
    return;
  }
  setPaused(!appState.isPaused);
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
    selectedDungeonId = dungeonId;
    debugPanel.setDungeonId(selectedDungeonId);
    void regenerate(appState.seed);
  },
  onTogglePause: () => {
    togglePause();
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
    return;
  }

  if (!appState.backdrop || !appState.player) {
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
  applyCanvasDisplayScale();
}

function stepSimulation(dt) {
  if (!appState.dungeon || !appState.player || appState.error || appState.isPaused) {
    return;
  }

  appState.effects = updateEffects(appState.effects, dt);
  updatePlayer(appState.player, appState.dungeon, dt);
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
  appState.enemies = removeEnemiesAfterDeathAnimation(appState.enemies, enemyAssets);
  syncPlayerStateFromRuntime(appState.playerState, appState.player, appState.weapons, nowUnixSec());
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

async function regenerate(seed) {
  const normalizedSeed = String(seed);
  const requestId = (regenerateRequestId += 1);

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
    const dungeonDefinition = getSelectedDungeonDefinition();
    if (!dungeonDefinition) {
      throw new Error("Dungeon DB is empty.");
    }
    selectedDungeonId = dungeonDefinition.id;
    debugPanel.setDungeonId(selectedDungeonId);
    const tileAssets = await ensureTileAssetsForDungeon(dungeonDefinition);

    const dungeon = generateDungeon({
      seed: normalizedSeed,
      wallHeightTiles: dungeonDefinition.wallHeightTiles,
    });
    dungeon.dungeonId = dungeonDefinition.id;
    dungeon.wallHeightTiles = dungeonDefinition.wallHeightTiles;
    const validation = validateDungeon(dungeon);
    dungeon.symbolGrid = resolveWallSymbols(dungeon.floorGrid);
    dungeon.walkableGrid = buildWalkableGrid(dungeon.floorGrid, dungeon.symbolGrid, {
      tallWallTileHeight: dungeonDefinition.wallHeightTiles,
    });
    dungeon.floor = Math.max(1, Math.floor(Number(appState.playerState?.run?.floor) || 1));

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

    if (appState.playerState?.run?.pos) {
      tryRestorePlayerPosition(player, dungeon, appState.playerState.run.pos);
    }
    if (Number.isFinite(appState.playerState?.run?.hp)) {
      player.hp = clamp(appState.playerState.run.hp, 0, player.maxHp);
    } else {
      player.hp = player.maxHp;
    }
    const herbDefinition = itemDefinitionsById?.[HERB_ITEM_ID];
    if (!herbDefinition) {
      throw new Error(`Item DB is missing required herb item: ${HERB_ITEM_ID}`);
    }
    const treasureChests = createTreasureChests(dungeon, normalizedSeed);
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
      effects: [],
      damagePopups: [],
      treasureChests,
      groundItems,
      systemUi,
      backdrop,
    });

    debugPanel.setSeed(normalizedSeed);
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

    void dungeonBgmPlayer.playLoop(dungeonDefinition.bgmPath);
    renderCurrentFrame();
    followPlayerInView();
    persistPlayerState();
    resetLoopClock();
  } catch (error) {
    if (requestId !== regenerateRequestId) {
      return;
    }

    dungeonBgmPlayer.stop();
    setErrorState(appState, normalizedSeed, error);
    debugPanel.setSeed(normalizedSeed);
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
  window.removeEventListener("pointerdown", retryAudioPlayback);
  window.removeEventListener("keydown", retryAudioPlayback);
  dungeonBgmPlayer.stop();
});

void regenerate(INITIAL_SEED);
requestAnimationFrame(runFrame);
