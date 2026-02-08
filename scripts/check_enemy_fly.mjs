import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TILE_SIZE } from "../src/config/constants.js";
import { createEnemies, getEnemyWallHitbox, updateEnemies } from "../src/enemy/enemySystem.js";
import { generateDungeon } from "../src/generation/dungeonGenerator.js";
import { resolveWallSymbols } from "../src/tiles/wallSymbolResolver.js";
import { buildWalkableGrid } from "../src/tiles/walkableGrid.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const enemyDbDir = path.join(projectRoot, "db", "enemy_db");
const CHECK_SEED = "enemy-fly-check-seed";
const DT = 1 / 60;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadFlyEnemyDefinitionsFromFs() {
  const fileNames = fs
    .readdirSync(enemyDbDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  return fileNames
    .map((fileName) => {
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
    })
    .filter((enemy) => enemy.type === "fly");
}

function enemyCenterTile(enemy) {
  const centerX = enemy.x + enemy.width / 2;
  const centerY = enemy.y + enemy.height / 2;

  return {
    tileX: Math.floor(centerX / TILE_SIZE),
    tileY: Math.floor(centerY / TILE_SIZE),
  };
}

function findWallLane(dungeon) {
  const height = dungeon.walkableGrid.length;
  const width = dungeon.walkableGrid[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isWallCell = !dungeon.walkableGrid[y][x] && dungeon.symbolGrid[y][x] !== null;
      if (!isWallCell) {
        continue;
      }

      if (x > 0 && dungeon.walkableGrid[y][x - 1]) {
        return { fromX: x - 1, wallX: x, y, dirX: 1 };
      }
      if (x < width - 1 && dungeon.walkableGrid[y][x + 1]) {
        return { fromX: x + 1, wallX: x, y, dirX: -1 };
      }
    }
  }

  return null;
}

function placeEnemyOnTileCenter(enemy, tileX, tileY) {
  const centerX = tileX * TILE_SIZE + TILE_SIZE / 2;
  const centerY = tileY * TILE_SIZE + TILE_SIZE / 2;
  enemy.x = centerX - enemy.width / 2;
  enemy.y = centerY - enemy.height / 2;
}

function checkSpawnRulesForFly(dungeon, enemies) {
  const expectedEnemyCount = dungeon.rooms.length - 1;
  assert(enemies.length === expectedEnemyCount, `enemy count mismatch: expected ${expectedEnemyCount}, got ${enemies.length}`);
  assert(enemies.every((enemy) => enemy.type === "fly"), "all spawned enemies must be type=fly");
}

function checkFlyIgnoresWallCollision(dungeon, flyEnemy) {
  const lane = findWallLane(dungeon);
  assert(Boolean(lane), "failed to find wall lane for fly collision test");

  placeEnemyOnTileCenter(flyEnemy, lane.fromX, lane.y);
  flyEnemy.walkDirection = {
    dx: lane.dirX,
    dy: 0,
    facing: lane.dirX > 0 ? "right" : "left",
  };
  flyEnemy.directionTimer = 5;

  let touchedNonWalkableTile = false;
  for (let frame = 0; frame < 120; frame += 1) {
    updateEnemies([flyEnemy], dungeon, DT);
    const center = enemyCenterTile(flyEnemy);
    const inBounds =
      center.tileX >= 0 &&
      center.tileY >= 0 &&
      center.tileY < dungeon.walkableGrid.length &&
      center.tileX < dungeon.walkableGrid[0].length;

    if (inBounds && !dungeon.walkableGrid[center.tileY][center.tileX]) {
      touchedNonWalkableTile = true;
      break;
    }
  }

  assert(touchedNonWalkableTile, "fly enemy should be able to enter wall (non-walkable) tile");
}

function checkFlyMovement(dungeon, enemies) {
  const startPositions = new Map(enemies.map((enemy) => [enemy.id, { x: enemy.x, y: enemy.y }]));

  for (let frame = 0; frame < 300; frame += 1) {
    updateEnemies(enemies, dungeon, DT);
  }

  const movedEnemyCount = enemies.filter((enemy) => {
    const start = startPositions.get(enemy.id);
    return Math.hypot(enemy.x - start.x, enemy.y - start.y) > 0.5;
  }).length;

  assert(movedEnemyCount >= 2, `not enough fly enemies moved: ${movedEnemyCount}`);
}

function main() {
  const flyEnemyDefinitions = loadFlyEnemyDefinitionsFromFs();
  assert(flyEnemyDefinitions.length >= 1, "at least one fly enemy definition is required");

  const dungeon = generateDungeon({ seed: CHECK_SEED });
  dungeon.symbolGrid = resolveWallSymbols(dungeon.floorGrid);
  dungeon.walkableGrid = buildWalkableGrid(dungeon.floorGrid, dungeon.symbolGrid);

  const enemies = createEnemies(dungeon, flyEnemyDefinitions, CHECK_SEED);

  checkSpawnRulesForFly(dungeon, enemies);
  checkFlyMovement(dungeon, enemies);
  checkFlyIgnoresWallCollision(dungeon, enemies[0]);
  assert(getEnemyWallHitbox(enemies[0]) === null, "fly enemy wall hitbox should be null");

  console.log("[check_enemy_fly] PASS");
}

main();
