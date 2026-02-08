import { INITIAL_SEED, PLAYER_FOOT_HITBOX_HEIGHT, PLAYER_HEIGHT, PLAYER_WIDTH } from "./config/constants.js";
import { loadEnemyAssets } from "./enemy/enemyAsset.js";
import { loadWalkEnemyDefinitions } from "./enemy/enemyDb.js";
import { createWalkEnemies, getEnemyFrame, getEnemyWallHitbox, updateEnemies } from "./enemy/enemySystem.js";
import { generateDungeon } from "./generation/dungeonGenerator.js";
import { validateDungeon } from "./generation/layoutValidator.js";
import { createPointerController } from "./input/pointerController.js";
import { createPlayerState, getPlayerFeetHitbox, getPlayerFrame, setPointerTarget, updatePlayer } from "./player/playerSystem.js";
import { buildDungeonBackdrop, renderFrame } from "./render/canvasRenderer.js";
import { createAppState, setDungeonState, setErrorState } from "./state/appState.js";
import { loadTileAssets } from "./tiles/tileCatalog.js";
import { buildWalkableGrid } from "./tiles/walkableGrid.js";
import { resolveWallSymbols } from "./tiles/wallSymbolResolver.js";
import { createDebugPanel } from "./ui/debugPanel.js";
import { loadPlayerAsset } from "./player/playerAsset.js";

const FIXED_DT = 1 / 60;
const FRAME_MS = 1000 / 60;

const appState = createAppState(INITIAL_SEED);
const canvas = document.querySelector("#dungeon-canvas");
const canvasScroll = document.querySelector("#canvas-scroll");
const debugPanelRoot = document.querySelector("#debug-panel");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function makeRandomSeed() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
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

function buildPlayerTextState(player) {
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
  };
}

function toTextState() {
  if (appState.error) {
    return JSON.stringify(
      {
        mode: "error",
        seed: appState.seed,
        error: appState.error,
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
      player: buildPlayerTextState(appState.player),
      enemies: appState.enemies.map((enemy) => buildEnemyTextState(enemy)),
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

const walkEnemyDefinitions = await loadWalkEnemyDefinitions();
const [tileAssets, playerAsset, enemyAssets] = await Promise.all([
  loadTileAssets(),
  loadPlayerAsset(),
  loadEnemyAssets(walkEnemyDefinitions),
]);

const debugPanel = createDebugPanel(debugPanelRoot, {
  onApplySeed: (seedInputValue) => {
    const nextSeed = seedInputValue.trim() || appState.seed;
    regenerate(nextSeed);
  },
  onRegenerate: () => {
    const nextSeed = makeRandomSeed();
    regenerate(nextSeed);
  },
});

createPointerController(canvas, {
  onPointerTarget: (active, worldX, worldY) => {
    if (!appState.player || appState.error) {
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
  }));

  renderFrame(canvas, appState.backdrop, playerAsset, getPlayerFrame(appState.player), appState.player, enemyDrawables);
}

function stepSimulation(dt) {
  if (!appState.dungeon || !appState.player || appState.error) {
    return;
  }

  updatePlayer(appState.player, appState.dungeon, dt);
  updateEnemies(appState.enemies, appState.dungeon, dt);
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

function regenerate(seed) {
  const normalizedSeed = String(seed);

  try {
    const dungeon = generateDungeon({ seed: normalizedSeed });
    const validation = validateDungeon(dungeon);
    dungeon.symbolGrid = resolveWallSymbols(dungeon.floorGrid);
    dungeon.walkableGrid = buildWalkableGrid(dungeon.floorGrid, dungeon.symbolGrid);

    const player = createPlayerState(dungeon);
    const enemies = createWalkEnemies(dungeon, walkEnemyDefinitions, normalizedSeed);
    const backdrop = buildDungeonBackdrop(tileAssets, dungeon);

    setDungeonState(appState, {
      seed: normalizedSeed,
      dungeon,
      validation,
      player,
      enemies,
      backdrop,
    });

    debugPanel.setSeed(normalizedSeed);
    debugPanel.setStats(buildStatsRows(dungeon));
    debugPanel.setError(validation.ok ? "" : validation.errors.join(" | "));

    renderCurrentFrame();
    followPlayerInView();
    resetLoopClock();
  } catch (error) {
    setErrorState(appState, normalizedSeed, error);
    debugPanel.setSeed(normalizedSeed);
    debugPanel.setStats([]);
    debugPanel.setError(appState.error);
    renderCurrentFrame();
    resetLoopClock();
  }
}

window.render_game_to_text = toTextState;
window.advanceTime = (ms = 0) => {
  const duration = Number(ms);
  const requestedMs = Number.isFinite(duration) && duration > 0 ? duration : FRAME_MS;
  const frames = Math.max(1, Math.round(requestedMs / FRAME_MS));

  for (let index = 0; index < frames; index += 1) {
    stepSimulation(FIXED_DT);
  }

  renderCurrentFrame();
  return Promise.resolve();
};

window.__regenDungeon = (seed) => {
  if (seed === undefined || seed === null || seed === "") {
    regenerate(makeRandomSeed());
    return;
  }

  regenerate(String(seed));
};

regenerate(INITIAL_SEED);
requestAnimationFrame(runFrame);
