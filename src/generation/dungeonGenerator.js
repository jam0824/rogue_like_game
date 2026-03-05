import {
  BRANCH_COUNT_MAX,
  BRANCH_COUNT_MIN,
  BRANCH_LENGTH_MAX,
  BRANCH_LENGTH_MIN,
  CORRIDOR_WALKABLE_HEIGHT,
  GRID_HEIGHT,
  GRID_WIDTH,
  INITIAL_SEED,
  MAIN_PATH_MAX,
  MAIN_PATH_MIN,
  MAX_GENERATION_ATTEMPTS,
  ROOM_COUNT_MAX,
  ROOM_COUNT_MIN,
  ROOM_SIZE_MAX,
  ROOM_SIZE_MIN,
  ROOM_TYPE,
  TALL_WALL_TILE_HEIGHT,
  VERTICAL_CORRIDOR_WIDTH,
} from "../config/constants.js";
import { createBooleanGrid, fillRect, setCell } from "../core/grid.js";
import { createRng, deriveSeed, normalizeSeed } from "../core/rng.js";

const BOSS_ARENA_WIDTH_MIN = 26;
const BOSS_ARENA_WIDTH_MAX = 32;
const BOSS_ARENA_HEIGHT_MIN = 24;
const BOSS_ARENA_HEIGHT_MAX = 28;
const BOSS_START_MIN_DISTANCE_TILES = 10;

/**
 * @typedef {Object} DungeonRoom
 * @property {number} id
 * @property {string} type
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} centerX
 * @property {number} centerY
 * @property {boolean} isSafe
 */

/**
 * @typedef {Object} DungeonGraph
 * @property {number[]} nodes
 * @property {{from:number,to:number,kind:string,branchIndex?:number}[]} edges
 * @property {number[]} mainPathRoomIds
 * @property {number[][]} branchPaths
 * @property {{from:number,to:number,kind:string}|null} loopEdge
 */

/**
 * @typedef {Object} DungeonStats
 * @property {number} roomCount
 * @property {number} mainPathCount
 * @property {number} branchCount
 * @property {boolean} hasLoop
 * @property {number} attempts
 */

/**
 * @typedef {Object} DungeonResult
 * @property {string} seed
 * @property {number} gridWidth
 * @property {number} gridHeight
 * @property {boolean[][]} floorGrid
 * @property {DungeonRoom[]} rooms
 * @property {DungeonGraph} graph
 * @property {number} startRoomId
 * @property {number} stairsRoomId
 * @property {number} wallHeightTiles
 * @property {boolean} isBossFloor
 * @property {{roomId:number,startTile:{tileX:number,tileY:number},bossTile:{tileX:number,tileY:number},pillars:{tileX:number,tileY:number}[]}|null} bossArena
 * @property {DungeonStats} stats
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWallHeightTiles(value) {
  if (!Number.isFinite(value)) {
    return TALL_WALL_TILE_HEIGHT;
  }
  return Math.max(1, Math.floor(Number(value)));
}

function buildGenerationMetrics(wallHeightTiles) {
  const normalizedWallHeight = normalizeWallHeightTiles(wallHeightTiles);
  return {
    wallHeightTiles: normalizedWallHeight,
    horizontalCorridorHeight: normalizedWallHeight + CORRIDOR_WALKABLE_HEIGHT,
    minRoomGap: normalizedWallHeight,
  };
}

function computeCenter(x, y, w, h) {
  return {
    centerX: Math.floor(x + w / 2),
    centerY: Math.floor(y + h / 2),
  };
}

function buildRoomPlan(rng) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const mainPathCount = rng.int(MAIN_PATH_MIN, MAIN_PATH_MAX);
    const branchCount = rng.int(BRANCH_COUNT_MIN, BRANCH_COUNT_MAX);
    const branchLengths = [];
    for (let i = 0; i < branchCount; i += 1) {
      branchLengths.push(rng.int(BRANCH_LENGTH_MIN, BRANCH_LENGTH_MAX));
    }

    const roomCount = mainPathCount + branchLengths.reduce((sum, length) => sum + length, 0);
    if (roomCount >= ROOM_COUNT_MIN && roomCount <= ROOM_COUNT_MAX) {
      return { mainPathCount, branchCount, branchLengths, roomCount };
    }
  }

  throw new Error("Failed to roll valid room plan in expected range.");
}

function hasUndirectedEdge(edges, from, to) {
  return edges.some((edge) => {
    return (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from);
  });
}

function buildGraph(plan, rng) {
  let nextRoomId = 0;
  const nodes = [];
  const edges = [];
  const mainPathRoomIds = [];
  const branchPaths = [];
  const branchAttachIndexes = [];

  for (let i = 0; i < plan.mainPathCount; i += 1) {
    const id = nextRoomId;
    nextRoomId += 1;
    nodes.push(id);
    mainPathRoomIds.push(id);

    if (i > 0) {
      edges.push({ from: mainPathRoomIds[i - 1], to: id, kind: "main" });
    }
  }

  for (let branchIndex = 0; branchIndex < plan.branchCount; branchIndex += 1) {
    const length = plan.branchLengths[branchIndex];
    const attachIndex = rng.int(1, mainPathRoomIds.length - 2);
    branchAttachIndexes.push(attachIndex);

    let previous = mainPathRoomIds[attachIndex];
    const branchRoomIds = [];

    for (let i = 0; i < length; i += 1) {
      const roomId = nextRoomId;
      nextRoomId += 1;
      nodes.push(roomId);
      branchRoomIds.push(roomId);
      edges.push({ from: previous, to: roomId, kind: "branch", branchIndex });
      previous = roomId;
    }

    branchPaths.push(branchRoomIds);
  }

  const loopCandidates = [];
  for (let i = 1; i < mainPathRoomIds.length - 1; i += 1) {
    for (let j = i + 2; j <= Math.min(mainPathRoomIds.length - 1, i + 3); j += 1) {
      const from = mainPathRoomIds[i];
      const to = mainPathRoomIds[j];
      if (!hasUndirectedEdge(edges, from, to)) {
        loopCandidates.push({ from, to, kind: "loop" });
      }
    }
  }

  if (!loopCandidates.length && branchPaths.length) {
    const branchIndex = rng.int(0, branchPaths.length - 1);
    const tipId = branchPaths[branchIndex][branchPaths[branchIndex].length - 1];
    const attachIndex = branchAttachIndexes[branchIndex];
    const targetIndex = Math.min(mainPathRoomIds.length - 1, attachIndex + 1);
    const to = mainPathRoomIds[targetIndex];

    if (!hasUndirectedEdge(edges, tipId, to)) {
      loopCandidates.push({ from: tipId, to, kind: "loop" });
    }
  }

  if (!loopCandidates.length) {
    const fallbackFrom = mainPathRoomIds[1];
    const fallbackTo = mainPathRoomIds[mainPathRoomIds.length - 1];
    loopCandidates.push({ from: fallbackFrom, to: fallbackTo, kind: "loop" });
  }

  const loopEdge = rng.pick(loopCandidates) ?? loopCandidates[0];
  edges.push(loopEdge);

  return {
    nodes,
    edges,
    mainPathRoomIds,
    branchPaths,
    loopEdge,
  };
}

function roomsOverlapWithGap(a, b, gap) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function pickDirection(rng, edgeKind) {
  if (edgeKind === "main") {
    return rng.weighted([
      { value: "right", weight: 0.6 },
      { value: "down", weight: 0.15 },
      { value: "up", weight: 0.15 },
      { value: "left", weight: 0.1 },
    ]);
  }

  return rng.weighted([
    { value: "up", weight: 0.35 },
    { value: "down", weight: 0.35 },
    { value: "right", weight: 0.2 },
    { value: "left", weight: 0.1 },
  ]);
}

function placeRoomNearParent(parent, width, height, edgeKind, placedRooms, rng, metrics) {
  for (let attempt = 0; attempt < 96; attempt += 1) {
    const direction = pickDirection(rng, edgeKind);
    const horizontalGap = rng.int(3, 8);
    const verticalGap = rng.int(metrics.horizontalCorridorHeight, metrics.horizontalCorridorHeight + 4);
    const jitter = rng.int(-2, 2);

    let x = parent.x;
    let y = parent.y;

    if (direction === "right") {
      x = parent.x + parent.w + horizontalGap;
      y = parent.y + jitter;
    } else if (direction === "left") {
      x = parent.x - width - horizontalGap;
      y = parent.y + jitter;
    } else if (direction === "down") {
      x = parent.x + jitter;
      y = parent.y + parent.h + verticalGap;
    } else if (direction === "up") {
      x = parent.x + jitter;
      y = parent.y - height - verticalGap;
    }

    if (x < 2 || y < 2 || x + width >= GRID_WIDTH - 2 || y + height >= GRID_HEIGHT - 2) {
      continue;
    }

    const candidate = { x, y, w: width, h: height };
    const overlaps = placedRooms.some((room) => roomsOverlapWithGap(candidate, room, metrics.minRoomGap));
    if (overlaps) {
      continue;
    }

    return candidate;
  }

  return null;
}

function placeRooms(graph, rng, metrics) {
  const treeEdges = graph.edges.filter((edge) => edge.kind !== "loop");
  const parentByRoom = new Map(treeEdges.map((edge) => [edge.to, edge.from]));
  const kindByRoom = new Map(treeEdges.map((edge) => [edge.to, edge.kind]));

  const placedRooms = [];
  const roomsById = new Map();

  const rootId = graph.mainPathRoomIds[0];
  for (const roomId of graph.nodes) {
    const w = rng.int(ROOM_SIZE_MIN, ROOM_SIZE_MAX);
    const h = rng.int(ROOM_SIZE_MIN, ROOM_SIZE_MAX);

    let roomPosition = null;
    if (roomId === rootId) {
      const x = 8 + rng.int(0, 3);
      const y = clamp(Math.floor(GRID_HEIGHT / 2 - h / 2 + rng.int(-5, 5)), 3, GRID_HEIGHT - h - 3);
      roomPosition = { x, y, w, h };
    } else {
      const parentId = parentByRoom.get(roomId);
      const parentRoom = roomsById.get(parentId);
      const edgeKind = kindByRoom.get(roomId) ?? "branch";
      roomPosition = placeRoomNearParent(parentRoom, w, h, edgeKind, placedRooms, rng, metrics);
    }

    if (!roomPosition) {
      return null;
    }

    const center = computeCenter(roomPosition.x, roomPosition.y, roomPosition.w, roomPosition.h);
    const room = {
      id: roomId,
      type: ROOM_TYPE.NORMAL,
      x: roomPosition.x,
      y: roomPosition.y,
      w: roomPosition.w,
      h: roomPosition.h,
      centerX: center.centerX,
      centerY: center.centerY,
      isSafe: false,
    };

    roomsById.set(roomId, room);
    placedRooms.push(room);
  }

  return roomsById;
}

function carveHorizontal(grid, x1, x2, y, width) {
  const from = Math.min(x1, x2);
  const to = Math.max(x1, x2);
  const topY = y - width + 1;
  for (let x = from; x <= to; x += 1) {
    for (let offset = 0; offset < width; offset += 1) {
      setCell(grid, x, topY + offset, true);
    }
  }
}

function carveVertical(grid, y1, y2, x, width) {
  const from = Math.min(y1, y2);
  const to = Math.max(y1, y2);
  const leftX = x - Math.floor((width - 1) / 2);
  for (let y = from; y <= to; y += 1) {
    for (let offset = 0; offset < width; offset += 1) {
      setCell(grid, leftX + offset, y, true);
    }
  }
}

function getCorridorWalkY(room, wallHeightTiles) {
  return clamp(room.centerY, room.y + wallHeightTiles, room.y + room.h - 1);
}

function carveCorridor(grid, fromRoom, toRoom, horizontalFirst, metrics) {
  const startX = fromRoom.centerX;
  const endX = toRoom.centerX;
  const startY = getCorridorWalkY(fromRoom, metrics.wallHeightTiles);
  const endY = getCorridorWalkY(toRoom, metrics.wallHeightTiles);

  if (horizontalFirst) {
    carveHorizontal(grid, startX, endX, startY, metrics.horizontalCorridorHeight);
    carveVertical(grid, startY, endY, endX, VERTICAL_CORRIDOR_WIDTH);
    return;
  }

  carveVertical(grid, startY, endY, startX, VERTICAL_CORRIDOR_WIDTH);
  carveHorizontal(grid, startX, endX, endY, metrics.horizontalCorridorHeight);
}

/**
 * @param {{ seed?: string|number, maxAttempts?: number, wallHeightTiles?: number, bossFloor?: boolean }} [options]
 * @returns {DungeonResult}
 */
export function generateDungeon(options = {}) {
  const seed = normalizeSeed(options.seed ?? INITIAL_SEED);
  const maxAttempts = options.maxAttempts ?? MAX_GENERATION_ATTEMPTS;
  const metrics = buildGenerationMetrics(options.wallHeightTiles);
  const isBossFloor = options.bossFloor === true;

  if (isBossFloor) {
    return generateBossArenaDungeon(seed, metrics.wallHeightTiles);
  }

  for (let generationAttempt = 1; generationAttempt <= maxAttempts; generationAttempt += 1) {
    const rng = createRng(deriveSeed(seed, generationAttempt));

    const plan = buildRoomPlan(rng);
    const graph = buildGraph(plan, rng);
    const roomsById = placeRooms(graph, rng, metrics);

    if (!roomsById) {
      continue;
    }

    const floorGrid = createBooleanGrid(GRID_WIDTH, GRID_HEIGHT, false);
    const rooms = graph.nodes.map((roomId) => roomsById.get(roomId));

    for (const room of rooms) {
      fillRect(floorGrid, room.x, room.y, room.w, room.h, true);
    }

    graph.edges.forEach((edge, index) => {
      const fromRoom = roomsById.get(edge.from);
      const toRoom = roomsById.get(edge.to);
      carveCorridor(floorGrid, fromRoom, toRoom, index % 2 === 0, metrics);
    });

    const startRoomId = graph.mainPathRoomIds[0];
    const stairsRoomId = graph.mainPathRoomIds[graph.mainPathRoomIds.length - 1];

    for (const room of rooms) {
      if (room.id === startRoomId) {
        room.type = ROOM_TYPE.START;
        room.isSafe = true;
      } else if (room.id === stairsRoomId) {
        room.type = ROOM_TYPE.STAIRS;
      }
    }

    return {
      seed,
      gridWidth: GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
      floorGrid,
      rooms,
      graph,
      startRoomId,
      stairsRoomId,
      wallHeightTiles: metrics.wallHeightTiles,
      isBossFloor: false,
      bossArena: null,
      stats: {
        roomCount: rooms.length,
        mainPathCount: graph.mainPathRoomIds.length,
        branchCount: graph.branchPaths.length,
        hasLoop: Boolean(graph.loopEdge),
        attempts: generationAttempt,
      },
    };
  }

  throw new Error(`Failed to generate dungeon within ${maxAttempts} attempts.`);
}

function isValidPillarTile(tileX, tileY, arena) {
  return (
    tileX > arena.x + 1 &&
    tileX < arena.x + arena.w - 2 &&
    tileY > arena.y + 1 &&
    tileY < arena.y + arena.h - 2
  );
}

function getTileManhattanDistance(fromTile, toTile) {
  return Math.abs(Math.floor(fromTile.tileX) - Math.floor(toTile.tileX)) +
    Math.abs(Math.floor(fromTile.tileY) - Math.floor(toTile.tileY));
}

function placeBossArenaPillars(arena, rng, startTile, bossTile) {
  const centerX = Math.floor(arena.x + arena.w / 2);
  const centerY = Math.floor(arena.y + arena.h / 2);
  const candidates = [
    { tileX: centerX - 6, tileY: centerY - 4 },
    { tileX: centerX + 6, tileY: centerY - 4 },
    { tileX: centerX - 6, tileY: centerY + 4 },
    { tileX: centerX + 6, tileY: centerY + 4 },
    { tileX: centerX - 7, tileY: centerY },
    { tileX: centerX + 7, tileY: centerY },
    { tileX: centerX - 4, tileY: centerY - 2 },
    { tileX: centerX + 4, tileY: centerY - 2 },
    { tileX: centerX - 4, tileY: centerY + 2 },
    { tileX: centerX + 4, tileY: centerY + 2 },
  ].filter((candidate) => {
    if (!isValidPillarTile(candidate.tileX, candidate.tileY, arena)) {
      return false;
    }

    const distToBoss = Math.abs(candidate.tileX - bossTile.tileX) + Math.abs(candidate.tileY - bossTile.tileY);
    if (distToBoss < 4) {
      return false;
    }

    if (candidate.tileX === startTile.tileX && candidate.tileY === startTile.tileY) {
      return false;
    }

    return true;
  });

  const targetCount = rng.int(2, 4);
  const selected = [];
  for (const candidate of rng.shuffle(candidates)) {
    const tooClose = selected.some((picked) => {
      const distance = Math.abs(picked.tileX - candidate.tileX) + Math.abs(picked.tileY - candidate.tileY);
      return distance < 4;
    });
    if (tooClose) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= targetCount) {
      break;
    }
  }

  if (selected.length >= 2) {
    return selected;
  }

  const fallback = [
    { tileX: centerX - 5, tileY: centerY - 2 },
    { tileX: centerX + 5, tileY: centerY + 2 },
  ].filter((candidate) => isValidPillarTile(candidate.tileX, candidate.tileY, arena));
  return fallback.length >= 2 ? fallback : selected;
}

function generateBossArenaDungeon(seed, wallHeightTiles) {
  const rng = createRng(deriveSeed(seed, "boss-floor"));
  const arenaWidth = rng.int(BOSS_ARENA_WIDTH_MIN, BOSS_ARENA_WIDTH_MAX);
  const arenaHeight = rng.int(BOSS_ARENA_HEIGHT_MIN, BOSS_ARENA_HEIGHT_MAX);
  const arenaX = clamp(Math.floor((GRID_WIDTH - arenaWidth) / 2 + rng.int(-2, 2)), 3, GRID_WIDTH - arenaWidth - 3);
  const arenaY = clamp(Math.floor((GRID_HEIGHT - arenaHeight) / 2 + rng.int(-2, 2)), 3, GRID_HEIGHT - arenaHeight - 3);
  const centerX = Math.floor(arenaX + arenaWidth / 2);
  const centerY = Math.floor(arenaY + arenaHeight / 2);

  const bossTile = {
    tileX: centerX,
    tileY: centerY,
  };
  const startTile = {
    tileX: centerX,
    tileY: arenaY + arenaHeight - 2,
  };
  const startBossDistance = getTileManhattanDistance(startTile, bossTile);
  if (startBossDistance < BOSS_START_MIN_DISTANCE_TILES) {
    throw new Error(
      `Boss arena start distance must be >= ${BOSS_START_MIN_DISTANCE_TILES}, got ${startBossDistance}`
    );
  }
  const arena = {
    x: arenaX,
    y: arenaY,
    w: arenaWidth,
    h: arenaHeight,
  };
  const pillars = placeBossArenaPillars(arena, rng, startTile, bossTile);

  const floorGrid = createBooleanGrid(GRID_WIDTH, GRID_HEIGHT, false);
  fillRect(floorGrid, arenaX, arenaY, arenaWidth, arenaHeight, true);
  for (const pillar of pillars) {
    setCell(floorGrid, pillar.tileX, pillar.tileY, false);
  }

  const room = {
    id: 0,
    type: ROOM_TYPE.START,
    x: arenaX,
    y: arenaY,
    w: arenaWidth,
    h: arenaHeight,
    centerX,
    centerY,
    isSafe: true,
  };
  const graph = {
    nodes: [room.id],
    edges: [],
    mainPathRoomIds: [room.id],
    branchPaths: [],
    loopEdge: null,
  };

  return {
    seed,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    floorGrid,
    rooms: [room],
    graph,
    startRoomId: room.id,
    stairsRoomId: room.id,
    wallHeightTiles,
    isBossFloor: true,
    bossArena: {
      roomId: room.id,
      startTile,
      bossTile,
      pillars,
    },
    stats: {
      roomCount: 1,
      mainPathCount: 1,
      branchCount: 0,
      hasLoop: false,
      attempts: 1,
    },
  };
}
