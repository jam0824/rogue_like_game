import { INITIAL_SEED, PLAYER_FOOT_HITBOX_HEIGHT, PLAYER_HEIGHT, PLAYER_WIDTH } from "./config/constants.js";
import { loadEnemyAssets } from "./enemy/enemyAsset.js";
import { loadEnemyDefinitions } from "./enemy/enemyDb.js";
import {
  createEnemies,
  getEnemyFrame,
  getEnemyHitFlashAlpha,
  getEnemyWallHitbox,
  updateEnemies,
} from "./enemy/enemySystem.js";
import { generateDungeon } from "./generation/dungeonGenerator.js";
import { validateDungeon } from "./generation/layoutValidator.js";
import { createPointerController } from "./input/pointerController.js";
import {
  createPlayerState,
  getPlayerFeetHitbox,
  getPlayerFrame,
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
import { loadPlayerAsset } from "./player/playerAsset.js";
import { spawnDamagePopupsFromEvents, updateDamagePopups } from "./combat/combatFeedbackSystem.js";
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
const PLAYER_STATE_SAVE_INTERVAL_MS = 1000;

const appState = createAppState(INITIAL_SEED);
const canvas = document.querySelector("#dungeon-canvas");
const canvasScroll = document.querySelector("#canvas-scroll");
const debugPanelRoot = document.querySelector("#debug-panel");

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

function findRoomById(dungeon, roomId) {
  return dungeon.rooms.find((room) => room.id === roomId) ?? null;
}

function buildStatsRows(dungeon) {
  const startRoom = findRoomById(dungeon, dungeon.startRoomId);
  const stairsRoom = findRoomById(dungeon, dungeon.stairsRoomId);

  return [
    { label: "seed", value: dungeon.seed },
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
    isChasing: enemy.isChasing === true,
    hp: round2(enemy.hp ?? 0),
    maxHp: round2(enemy.maxHp ?? 0),
    isDead: enemy.isDead === true,
    attackDamage: round2(enemy.attackDamage ?? 0),
    moveSpeed: round2(enemy.moveSpeed ?? 0),
    hitFlashAlpha: round2(getEnemyHitFlashAlpha(enemy)),
  };
}

function buildDamagePopupTextState(popup) {
  return {
    value: Math.max(0, Math.round(Number(popup?.value) || 0)),
    x: round2(popup?.x ?? 0),
    y: round2(popup?.y ?? 0),
    alpha: round2(popup?.alpha ?? 0),
  };
}

function toTextState() {
  if (appState.error) {
    return JSON.stringify(
      {
        mode: "error",
        seed: appState.seed,
        error: appState.error,
        playerState: appState.playerState,
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
let weaponDefinitions = [];
let weaponDefinitionsById = {};
let formationDefinitionsById = {};
let weaponAssets = {};
let damagePopupSeq = 0;

function resolveStarterWeaponDefId() {
  if (weaponDefinitionsById?.[INITIAL_WEAPON_ID]) {
    return INITIAL_WEAPON_ID;
  }

  const loadedWeaponIds = Object.keys(weaponDefinitionsById ?? {});
  return loadedWeaponIds.length > 0 ? loadedWeaponIds[0] : null;
}

async function refreshEnemyResources() {
  const definitions = await loadEnemyDefinitions();
  const assets = await loadEnemyAssets(definitions);
  enemyDefinitions = definitions;
  enemyAssets = assets;
}

async function refreshWeaponResources() {
  const [definitions, formations] = await Promise.all([loadWeaponDefinitions(), loadFormationDefinitions()]);
  const assets = await loadWeaponAssets(definitions);

  weaponDefinitions = definitions;
  weaponDefinitionsById = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
  formationDefinitionsById = Object.fromEntries(formations.map((formation) => [formation.id, formation]));
  weaponAssets = assets;
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

function syncPauseUi() {
  debugPanel.setPaused(appState.isPaused);
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
});
syncPauseUi();

createPointerController(canvas, {
  onPointerTarget: (active, worldX, worldY) => {
    if (!appState.player || appState.error) {
      return;
    }
    if (appState.isPaused && active) {
      return;
    }
    setPointerTarget(appState.player, active, worldX, worldY);
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
  }));
  const weaponDrawables = appState.weapons.map((weapon) => ({
    weapon,
    asset: weaponAssets[weapon.weaponDefId] ?? null,
    frame: { row: 0, col: 0 },
    rotationRad: weapon.rotationRad ?? 0,
  }));

  renderFrame(
    canvas,
    appState.backdrop,
    playerAsset,
    getPlayerFrame(appState.player),
    appState.player,
    enemyDrawables,
    weaponDrawables,
    appState.damagePopups
  );
}

function stepSimulation(dt) {
  if (!appState.dungeon || !appState.player || appState.error || appState.isPaused) {
    return;
  }

  updatePlayer(appState.player, appState.dungeon, dt);
  updateEnemies(appState.enemies, appState.dungeon, dt, appState.player);
  const combatEvents = updateWeaponsAndCombat(
    appState.weapons,
    appState.player,
    appState.enemies,
    weaponDefinitionsById,
    formationDefinitionsById,
    dt
  );
  const spawnedPopups = spawnDamagePopupsFromEvents(combatEvents, damagePopupSeq);
  damagePopupSeq += 1;
  appState.damagePopups = updateDamagePopups(
    [...appState.damagePopups, ...spawnedPopups],
    dt
  );
  appState.enemies = removeDefeatedEnemies(appState.enemies);
  syncPlayerStateFromRuntime(appState.playerState, appState.player, appState.weapons, nowUnixSec());
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
    await Promise.all([refreshEnemyResources(), refreshWeaponResources()]);
    if (requestId !== regenerateRequestId) {
      return;
    }
    ensurePlayerStateLoaded();

    const dungeon = generateDungeon({ seed: normalizedSeed });
    const validation = validateDungeon(dungeon);
    dungeon.symbolGrid = resolveWallSymbols(dungeon.floorGrid);
    dungeon.walkableGrid = buildWalkableGrid(dungeon.floorGrid, dungeon.symbolGrid);

    const player = createPlayerState(dungeon);
    if (appState.playerState?.run?.pos) {
      tryRestorePlayerPosition(player, dungeon, appState.playerState.run.pos);
    }
    const enemies = createEnemies(dungeon, enemyDefinitions, normalizedSeed);
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

    setDungeonState(appState, {
      seed: normalizedSeed,
      dungeon,
      validation,
      playerState: appState.playerState,
      player,
      enemies,
      weapons,
      damagePopups: [],
      backdrop,
    });

    debugPanel.setSeed(normalizedSeed);
    debugPanel.setStats(buildStatsRows(dungeon));
    debugPanel.setError(validation.ok ? "" : validation.errors.join(" | "));
    syncPauseUi();

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
    debugPanel.setStats([]);
    debugPanel.setError(appState.error);
    syncPauseUi();
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
