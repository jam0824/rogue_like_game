import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENEMY_ANIM_FPS, TILE_SIZE } from "../src/config/constants.js";
import { generateDungeon } from "../src/generation/dungeonGenerator.js";
import { resolveWallSymbols } from "../src/tiles/wallSymbolResolver.js";
import { buildWalkableGrid } from "../src/tiles/walkableGrid.js";
import { createWalkEnemies, getEnemyFrame, getEnemyWallHitbox, updateEnemies } from "../src/enemy/enemySystem.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const enemyDbDir = path.join(projectRoot, "db", "enemy_db");
const CHECK_SEED = "enemy-walk-check-seed";
const FRAMES_TO_SIMULATE = 600;
const DT = 1 / 60;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadWalkEnemyDefinitionsFromFs() {
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
    .filter((enemy) => enemy.type === "walk");
}

function isRectWalkable(walkableGrid, rect) {
  const maxY = walkableGrid.length - 1;
  const maxX = walkableGrid[0].length - 1;

  const minTileX = Math.floor(rect.x / TILE_SIZE);
  const maxTileX = Math.floor((rect.x + rect.width - 1) / TILE_SIZE);
  const minTileY = Math.floor(rect.y / TILE_SIZE);
  const maxTileY = Math.floor((rect.y + rect.height - 1) / TILE_SIZE);

  if (minTileX < 0 || minTileY < 0 || maxTileX > maxX || maxTileY > maxY) {
    return false;
  }

  for (let y = minTileY; y <= maxTileY; y += 1) {
    for (let x = minTileX; x <= maxTileX; x += 1) {
      if (!walkableGrid[y][x]) {
        return false;
      }
    }
  }

  return true;
}

function findRoomIdForEnemy(dungeon, enemy) {
  const wallHitbox = getEnemyWallHitbox(enemy);
  const centerTileX = (wallHitbox.x + wallHitbox.width / 2) / TILE_SIZE;
  const centerTileY = (wallHitbox.y + wallHitbox.height / 2) / TILE_SIZE;

  const foundRoom = dungeon.rooms.find((room) => {
    return (
      centerTileX >= room.x &&
      centerTileX < room.x + room.w &&
      centerTileY >= room.y &&
      centerTileY < room.y + room.h
    );
  });

  return foundRoom?.id ?? null;
}

function checkSpawnRules(dungeon, enemies) {
  const expectedEnemyCount = dungeon.rooms.length - 1;
  assert(enemies.length === expectedEnemyCount, `enemy count mismatch: expected ${expectedEnemyCount}, got ${enemies.length}`);

  const nonStartRoomIds = dungeon.rooms.filter((room) => room.id !== dungeon.startRoomId).map((room) => room.id);
  const enemyCountByRoom = new Map(nonStartRoomIds.map((roomId) => [roomId, 0]));

  for (const enemy of enemies) {
    assert(enemy.type === "walk", `unexpected enemy type: ${enemy.type}`);
    const hitbox = getEnemyWallHitbox(enemy);
    assert(isRectWalkable(dungeon.walkableGrid, hitbox), `enemy spawned in blocked tile: ${enemy.id}`);

    const roomId = findRoomIdForEnemy(dungeon, enemy);
    assert(roomId !== null, `enemy is not inside any room: ${enemy.id}`);
    assert(roomId !== dungeon.startRoomId, `enemy spawned in start room: ${enemy.id}`);

    enemyCountByRoom.set(roomId, (enemyCountByRoom.get(roomId) ?? 0) + 1);
  }

  for (const roomId of nonStartRoomIds) {
    assert(enemyCountByRoom.get(roomId) === 1, `room ${roomId} enemy count should be 1`);
  }
}

function checkMovementAndCollision(dungeon, enemies) {
  const startPositions = new Map(enemies.map((enemy) => [enemy.id, { x: enemy.x, y: enemy.y }]));

  for (let frame = 0; frame < FRAMES_TO_SIMULATE; frame += 1) {
    updateEnemies(enemies, dungeon, DT);
    for (const enemy of enemies) {
      const hitbox = getEnemyWallHitbox(enemy);
      assert(isRectWalkable(dungeon.walkableGrid, hitbox), `enemy left walkable area: ${enemy.id}`);
    }
  }

  const movedEnemyCount = enemies.filter((enemy) => {
    const start = startPositions.get(enemy.id);
    return Math.hypot(enemy.x - start.x, enemy.y - start.y) > 0.5;
  }).length;

  assert(movedEnemyCount >= 2, `not enough enemies moved: ${movedEnemyCount}`);
}

function checkHeightCollisionBehavior(dungeon, walkEnemyDefinitions) {
  const tallDefinition = walkEnemyDefinitions.find((enemy) => enemy.height >= 64);
  const shortDefinition = walkEnemyDefinitions.find((enemy) => enemy.height <= 32);

  assert(Boolean(tallDefinition), "missing tall walk enemy definition");
  assert(Boolean(shortDefinition), "missing short walk enemy definition");

  const tallEnemies = createWalkEnemies(dungeon, [tallDefinition], `${CHECK_SEED}-tall`);
  const shortEnemies = createWalkEnemies(dungeon, [shortDefinition], `${CHECK_SEED}-short`);

  const tallEnemy = tallEnemies[0];
  const shortEnemy = shortEnemies[0];
  const tallHitbox = getEnemyWallHitbox(tallEnemy);
  const shortHitbox = getEnemyWallHitbox(shortEnemy);

  assert(tallHitbox.width === 32 && tallHitbox.height === 32, "tall enemy wall hitbox must be 32x32");
  assert(shortHitbox.width === shortEnemy.width && shortHitbox.height === shortEnemy.height, "short enemy wall hitbox must be full body");
}

function checkAnimationSequence() {
  const enemyBase = {
    facing: "down",
    isMoving: true,
    animTime: 0,
  };

  const frameCols = [0, 1, 2, 3].map((index) => {
    const time = index / ENEMY_ANIM_FPS;
    return getEnemyFrame({ ...enemyBase, animTime: time }).col;
  });

  const expected = [0, 1, 2, 1];
  assert(JSON.stringify(frameCols) === JSON.stringify(expected), `animation sequence mismatch: ${frameCols.join(",")}`);

  const idleStepCols = [0, 1, 2, 3].map((index) => {
    const time = index / ENEMY_ANIM_FPS;
    return getEnemyFrame({ ...enemyBase, isMoving: false, animTime: time }).col;
  });
  assert(
    JSON.stringify(idleStepCols) === JSON.stringify(expected),
    `idle-step sequence mismatch: ${idleStepCols.join(",")}`
  );
}

function main() {
  const walkEnemyDefinitions = loadWalkEnemyDefinitionsFromFs();
  assert(walkEnemyDefinitions.length >= 2, "at least two walk enemies are required for this check");

  const dungeon = generateDungeon({ seed: CHECK_SEED });
  dungeon.symbolGrid = resolveWallSymbols(dungeon.floorGrid);
  dungeon.walkableGrid = buildWalkableGrid(dungeon.floorGrid, dungeon.symbolGrid);

  const enemies = createWalkEnemies(dungeon, walkEnemyDefinitions, CHECK_SEED);

  checkSpawnRules(dungeon, enemies);
  checkMovementAndCollision(dungeon, enemies);
  checkHeightCollisionBehavior(dungeon, walkEnemyDefinitions);
  checkAnimationSequence();

  console.log("[check_enemy_walk] PASS");
}

main();
