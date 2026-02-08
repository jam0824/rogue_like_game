import { INITIAL_SEED } from "./config/constants.js";
import { generateDungeon } from "./generation/dungeonGenerator.js";
import { validateDungeon } from "./generation/layoutValidator.js";
import { renderDungeon } from "./render/canvasRenderer.js";
import { createAppState, setDungeonState, setErrorState } from "./state/appState.js";
import { loadTileAssets } from "./tiles/tileCatalog.js";
import { resolveWallSymbols } from "./tiles/wallSymbolResolver.js";
import { createDebugPanel } from "./ui/debugPanel.js";

const appState = createAppState(INITIAL_SEED);
const canvas = document.querySelector("#dungeon-canvas");
const debugPanelRoot = document.querySelector("#debug-panel");

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

  if (!appState.dungeon) {
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

const assets = await loadTileAssets();

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

function regenerate(seed) {
  const normalizedSeed = String(seed);

  try {
    const dungeon = generateDungeon({ seed: normalizedSeed });
    const validation = validateDungeon(dungeon);
    dungeon.symbolGrid = resolveWallSymbols(dungeon.floorGrid);

    setDungeonState(appState, {
      seed: normalizedSeed,
      dungeon,
      validation,
    });

    renderDungeon(canvas, assets, dungeon, {});
    debugPanel.setSeed(normalizedSeed);
    debugPanel.setStats(buildStatsRows(dungeon));
    debugPanel.setError(validation.ok ? "" : validation.errors.join(" | "));
  } catch (error) {
    setErrorState(appState, normalizedSeed, error);
    debugPanel.setSeed(normalizedSeed);
    debugPanel.setStats([]);
    debugPanel.setError(appState.error);

    const ctx = canvas.getContext("2d");
    canvas.width = 960;
    canvas.height = 540;
    ctx.fillStyle = "#090b12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffb3b3";
    ctx.font = "16px monospace";
    ctx.fillText(`Generation failed: ${appState.error}`, 20, 40);
  }
}

window.render_game_to_text = toTextState;
window.advanceTime = (ms = 0) => {
  const frameMs = 1000 / 60;
  const frames = Math.max(1, Math.round(Number(ms) / frameMs));

  return new Promise((resolve) => {
    let remaining = frames;

    function step() {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
};

window.__regenDungeon = (seed) => {
  if (seed === undefined || seed === null || seed === "") {
    regenerate(makeRandomSeed());
    return;
  }

  regenerate(String(seed));
};

regenerate(INITIAL_SEED);
