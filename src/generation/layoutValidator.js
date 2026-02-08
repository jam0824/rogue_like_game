import {
  BRANCH_COUNT_MAX,
  BRANCH_COUNT_MIN,
  BRANCH_LENGTH_MAX,
  BRANCH_LENGTH_MIN,
  MAIN_PATH_MAX,
  MAIN_PATH_MIN,
  ROOM_COUNT_MAX,
  ROOM_COUNT_MIN,
} from "../config/constants.js";

function buildAdjacency(graph) {
  const adjacency = new Map();
  for (const node of graph.nodes) {
    adjacency.set(node, []);
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from).push(edge.to);
    adjacency.get(edge.to).push(edge.from);
  }
  return adjacency;
}

function hasPath(graph, start, goal) {
  const adjacency = buildAdjacency(graph);
  const queue = [start];
  const visited = new Set([start]);

  while (queue.length) {
    const current = queue.shift();
    if (current === goal) {
      return true;
    }

    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) {
        continue;
      }
      visited.add(next);
      queue.push(next);
    }
  }

  return false;
}

/**
 * @param {import("./dungeonGenerator.js").DungeonResult} dungeon
 */
export function validateDungeon(dungeon) {
  const errors = [];

  const roomCount = dungeon.rooms.length;
  if (roomCount < ROOM_COUNT_MIN || roomCount > ROOM_COUNT_MAX) {
    errors.push(`roomCount out of range: ${roomCount}`);
  }

  const mainPathCount = dungeon.graph.mainPathRoomIds.length;
  if (mainPathCount < MAIN_PATH_MIN || mainPathCount > MAIN_PATH_MAX) {
    errors.push(`mainPathCount out of range: ${mainPathCount}`);
  }

  const branchCount = dungeon.graph.branchPaths.length;
  if (branchCount < BRANCH_COUNT_MIN || branchCount > BRANCH_COUNT_MAX) {
    errors.push(`branchCount out of range: ${branchCount}`);
  }

  for (const branchPath of dungeon.graph.branchPaths) {
    const branchLength = branchPath.length;
    if (branchLength < BRANCH_LENGTH_MIN || branchLength > BRANCH_LENGTH_MAX) {
      errors.push(`branchLength out of range: ${branchLength}`);
    }
  }

  const loopEdges = dungeon.graph.edges.filter((edge) => edge.kind === "loop");
  if (loopEdges.length !== 1) {
    errors.push(`loop edge count must be 1, got ${loopEdges.length}`);
  }

  if (!hasPath(dungeon.graph, dungeon.startRoomId, dungeon.stairsRoomId)) {
    errors.push("no path from start room to stairs room");
  }

  const startRoom = dungeon.rooms.find((room) => room.id === dungeon.startRoomId);
  if (!startRoom || !startRoom.isSafe) {
    errors.push("start room must exist and be marked safe");
  }

  return {
    ok: errors.length === 0,
    errors,
    metrics: {
      roomCount,
      mainPathCount,
      branchCount,
      loopEdgeCount: loopEdges.length,
      hasStartToStairsPath: errors.every((error) => !error.includes("path from start room to stairs room")),
    },
  };
}
