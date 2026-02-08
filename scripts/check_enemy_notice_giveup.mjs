import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENEMY_CHASE_SPEED_MULTIPLIER,
  PLAYER_FOOT_HITBOX_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE_SIZE,
} from "../src/config/constants.js";
import { createEnemies, updateEnemies } from "../src/enemy/enemySystem.js";
import { generateDungeon } from "../src/generation/dungeonGenerator.js";
import { resolveWallSymbols } from "../src/tiles/wallSymbolResolver.js";
import { buildWalkableGrid } from "../src/tiles/walkableGrid.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const enemyDbDir = path.join(projectRoot, "db", "enemy_db");

const CHECK_SEED = "enemy-notice-giveup-check-seed";
const DT = 1 / 60;

const BEHAVIOR_MODE = {
  RANDOM_WALK: "random_walk",
  CHASE: "chase",
};

const CARDINAL_DIRECTIONS = [
  { dx: 1, dy: 0, facing: "right" },
  { dx: -1, dy: 0, facing: "left" },
  { dx: 0, dy: 1, facing: "down" },
  { dx: 0, dy: -1, facing: "up" },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadEnemyDefinitionsFromFs() {
  const fileNames = fs
    .readdirSync(enemyDbDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  return fileNames.map((fileName) => {
    const raw = JSON.parse(fs.readFileSync(path.join(enemyDbDir, fileName), "utf-8"));
    return {
      id: fileName.replace(/\.json$/, ""),
      type: raw.type,
      tipFileName: raw.tip_file_name,
      width: raw.width,
      height: raw.height,
      noticeDistance: raw.notice_distance,
      giveupDistance: raw.giveup_distance,
    };
  });
}

function buildDungeon(seed) {
  const dungeon = generateDungeon({ seed });
  dungeon.symbolGrid = resolveWallSymbols(dungeon.floorGrid);
  dungeon.walkableGrid = buildWalkableGrid(dungeon.floorGrid, dungeon.symbolGrid);
  return dungeon;
}

function inBounds(grid, x, y) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

function isWalkableTile(dungeon, x, y) {
  return inBounds(dungeon.walkableGrid, x, y) && dungeon.walkableGrid[y][x] === true;
}

function buildFlyPassableGrid(dungeon) {
  return dungeon.floorGrid.map((row, y) =>
    row.map((isFloor, x) => isFloor === true || dungeon.symbolGrid[y][x] !== null)
  );
}

function tileCenter(tileX, tileY) {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    y: tileY * TILE_SIZE + TILE_SIZE / 2,
  };
}

function createPlayerAtTile(tileX, tileY) {
  const center = tileCenter(tileX, tileY);
  return {
    x: center.x - PLAYER_WIDTH / 2,
    y: center.y - (PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2),
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    footHitboxHeight: PLAYER_FOOT_HITBOX_HEIGHT,
  };
}

function resetEnemyToTile(enemy, tileX, tileY) {
  const center = tileCenter(tileX, tileY);
  enemy.x = center.x - enemy.width / 2;
  enemy.y = center.y - enemy.height / 2;
  enemy.walkDirection = null;
  enemy.directionTimer = 0;
  enemy.facing = "down";
  enemy.isMoving = false;
  enemy.animTime = 0;
  enemy.behaviorMode = BEHAVIOR_MODE.RANDOM_WALK;
  enemy.isChasing = false;
}

function pathHasBlockedTile(dungeon, tileX, tileY, direction, distanceTiles) {
  let foundBlocked = false;

  for (let step = 1; step < distanceTiles; step += 1) {
    const x = tileX + direction.dx * step;
    const y = tileY + direction.dy * step;

    if (!inBounds(dungeon.walkableGrid, x, y) || dungeon.walkableGrid[y][x] === false) {
      foundBlocked = true;
      break;
    }
  }

  return foundBlocked;
}

function pathAllWalkable(dungeon, tileX, tileY, direction, distanceTiles) {
  for (let step = 1; step < distanceTiles; step += 1) {
    const x = tileX + direction.dx * step;
    const y = tileY + direction.dy * step;

    if (!isWalkableTile(dungeon, x, y)) {
      return false;
    }
  }

  return true;
}

function findClearLineScenario(dungeon, maxDistanceTiles) {
  const height = dungeon.walkableGrid.length;
  const width = dungeon.walkableGrid[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWalkableTile(dungeon, x, y)) {
        continue;
      }

      for (const direction of CARDINAL_DIRECTIONS) {
        for (let distance = 2; distance <= maxDistanceTiles; distance += 1) {
          const endX = x + direction.dx * distance;
          const endY = y + direction.dy * distance;

          if (!isWalkableTile(dungeon, endX, endY)) {
            continue;
          }

          if (pathAllWalkable(dungeon, x, y, direction, distance)) {
            return {
              start: { x, y },
              end: { x: endX, y: endY },
              direction,
              distance,
            };
          }
        }
      }
    }
  }

  return null;
}

function findBlockedLineScenario(dungeon, maxDistanceTiles) {
  const height = dungeon.walkableGrid.length;
  const width = dungeon.walkableGrid[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWalkableTile(dungeon, x, y)) {
        continue;
      }

      for (const direction of CARDINAL_DIRECTIONS) {
        for (let distance = 2; distance <= maxDistanceTiles; distance += 1) {
          const endX = x + direction.dx * distance;
          const endY = y + direction.dy * distance;

          if (!inBounds(dungeon.walkableGrid, endX, endY)) {
            continue;
          }

          if (pathHasBlockedTile(dungeon, x, y, direction, distance)) {
            return {
              start: { x, y },
              end: { x: endX, y: endY },
              direction,
              distance,
            };
          }
        }
      }
    }
  }

  return null;
}

function findFarWalkableTile(dungeon, fromTile, minDistanceTiles) {
  let best = null;

  for (let y = 0; y < dungeon.walkableGrid.length; y += 1) {
    for (let x = 0; x < dungeon.walkableGrid[0].length; x += 1) {
      if (!isWalkableTile(dungeon, x, y)) {
        continue;
      }

      const distance = Math.hypot(x - fromTile.x, y - fromTile.y);
      if (distance <= minDistanceTiles) {
        continue;
      }

      if (!best || distance > best.distance) {
        best = { x, y, distance };
      }
    }
  }

  return best ? { x: best.x, y: best.y } : null;
}

function getMovementDistance(enemy, before) {
  return Math.hypot(enemy.x - before.x, enemy.y - before.y);
}

function main() {
  const enemyDefinitions = loadEnemyDefinitionsFromFs();
  const walkDefinition = enemyDefinitions.find((enemy) => enemy.type === "walk");
  const flyDefinition = enemyDefinitions.find((enemy) => enemy.type === "fly");

  assert(Boolean(walkDefinition), "missing walk enemy definition");
  assert(Boolean(flyDefinition), "missing fly enemy definition");

  const dungeon = buildDungeon(CHECK_SEED);
  const walkEnemy = createEnemies(dungeon, [walkDefinition], `${CHECK_SEED}-walk`)[0];
  const flyEnemy = createEnemies(dungeon, [flyDefinition], `${CHECK_SEED}-fly`)[0];

  const noticeTileRange = Math.max(
    2,
    Math.floor(Math.min(walkDefinition.noticeDistance, flyDefinition.noticeDistance))
  );
  const giveupTileRange = Math.max(
    noticeTileRange,
    Math.floor(Math.max(walkDefinition.giveupDistance, flyDefinition.giveupDistance))
  );

  const clearScenario = findClearLineScenario(dungeon, noticeTileRange);
  assert(Boolean(clearScenario), "failed to find clear-line scenario");

  const blockedScenario = findBlockedLineScenario(dungeon, noticeTileRange);
  assert(Boolean(blockedScenario), "failed to find blocked-line scenario");

  const playerClear = createPlayerAtTile(clearScenario.end.x, clearScenario.end.y);
  const playerBlocked = createPlayerAtTile(blockedScenario.end.x, blockedScenario.end.y);

  resetEnemyToTile(walkEnemy, clearScenario.start.x, clearScenario.start.y);
  updateEnemies([walkEnemy], dungeon, DT, playerClear);
  assert(walkEnemy.behaviorMode === BEHAVIOR_MODE.CHASE, "walk enemy should enter chase when clear LOS and inside notice");

  resetEnemyToTile(walkEnemy, blockedScenario.start.x, blockedScenario.start.y);
  updateEnemies([walkEnemy], dungeon, DT, playerBlocked);
  assert(
    walkEnemy.behaviorMode === BEHAVIOR_MODE.RANDOM_WALK,
    "walk enemy should stay random_walk when blocked LOS even inside notice"
  );

  resetEnemyToTile(flyEnemy, blockedScenario.start.x, blockedScenario.start.y);
  updateEnemies([flyEnemy], dungeon, DT, playerBlocked);
  assert(flyEnemy.behaviorMode === BEHAVIOR_MODE.CHASE, "fly enemy should chase by distance even through walls");

  resetEnemyToTile(walkEnemy, blockedScenario.start.x, blockedScenario.start.y);
  const playerSameTile = createPlayerAtTile(blockedScenario.start.x, blockedScenario.start.y);
  updateEnemies([walkEnemy], dungeon, DT, playerSameTile);
  assert(walkEnemy.behaviorMode === BEHAVIOR_MODE.CHASE, "walk enemy should enter chase at same tile distance");
  updateEnemies([walkEnemy], dungeon, DT, playerBlocked);
  assert(
    walkEnemy.behaviorMode === BEHAVIOR_MODE.CHASE,
    "walk enemy should keep chase when LOS is lost but still inside giveup"
  );

  const farTile = findFarWalkableTile(dungeon, blockedScenario.start, giveupTileRange + 2);
  assert(Boolean(farTile), "failed to find far walkable tile for giveup test");
  const playerFar = createPlayerAtTile(farTile.x, farTile.y);

  resetEnemyToTile(walkEnemy, blockedScenario.start.x, blockedScenario.start.y);
  resetEnemyToTile(flyEnemy, blockedScenario.start.x, blockedScenario.start.y);
  walkEnemy.behaviorMode = BEHAVIOR_MODE.CHASE;
  walkEnemy.isChasing = true;
  flyEnemy.behaviorMode = BEHAVIOR_MODE.CHASE;
  flyEnemy.isChasing = true;

  updateEnemies([walkEnemy, flyEnemy], dungeon, DT, playerFar);
  assert(walkEnemy.behaviorMode === BEHAVIOR_MODE.RANDOM_WALK, "walk enemy should give up when outside giveup radius");
  assert(flyEnemy.behaviorMode === BEHAVIOR_MODE.RANDOM_WALK, "fly enemy should give up when outside giveup radius");

  const flyPassableGrid = buildFlyPassableGrid(dungeon);
  const speedScenario = clearScenario;

  for (let step = 0; step <= speedScenario.distance; step += 1) {
    const x = speedScenario.start.x + speedScenario.direction.dx * step;
    const y = speedScenario.start.y + speedScenario.direction.dy * step;
    assert(inBounds(flyPassableGrid, x, y) && flyPassableGrid[y][x], "speed scenario path must be fly-passable");
  }

  resetEnemyToTile(flyEnemy, speedScenario.start.x, speedScenario.start.y);
  flyEnemy.walkDirection = {
    dx: speedScenario.direction.dx,
    dy: speedScenario.direction.dy,
    facing: speedScenario.direction.facing,
  };
  flyEnemy.directionTimer = 10;

  const randomBefore = { x: flyEnemy.x, y: flyEnemy.y };
  updateEnemies([flyEnemy], dungeon, DT, null);
  const randomDistance = getMovementDistance(flyEnemy, randomBefore);
  assert(randomDistance > 0, "random-walk speed probe must move");

  resetEnemyToTile(flyEnemy, speedScenario.start.x, speedScenario.start.y);
  flyEnemy.behaviorMode = BEHAVIOR_MODE.CHASE;
  flyEnemy.isChasing = true;

  const chaseBefore = { x: flyEnemy.x, y: flyEnemy.y };
  const playerForSpeed = createPlayerAtTile(speedScenario.end.x, speedScenario.end.y);
  updateEnemies([flyEnemy], dungeon, DT, playerForSpeed);
  const chaseDistance = getMovementDistance(flyEnemy, chaseBefore);
  assert(chaseDistance > randomDistance, "chase speed should be faster than random-walk speed");

  const ratio = chaseDistance / randomDistance;
  const ratioTolerance = 0.08;
  assert(
    Math.abs(ratio - ENEMY_CHASE_SPEED_MULTIPLIER) <= ratioTolerance,
    `chase speed ratio mismatch: got ${ratio.toFixed(3)}, expected ${ENEMY_CHASE_SPEED_MULTIPLIER}`
  );

  console.log("[check_enemy_notice_giveup] PASS");
}

main();
