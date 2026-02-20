import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TILE_SIZE } from "../src/config/constants.js";
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

function resolveImageMagnification(value) {
  const magnification = Number(value);
  if (!Number.isFinite(magnification) || magnification <= 0) {
    return 1;
  }
  return magnification;
}

function assertClose(actual, expected, message) {
  if (Math.abs(actual - expected) > 0.0001) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
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
        walkPngFilePath: raw.walk_png_file_path,
        idlePngFilePath: raw.idle_png_file_path,
        deathPngFilePath: raw.death_png_file_path,
        width: raw.width,
        height: raw.height,
        fps: raw.fps,
        pngFacingDirection: raw.png_facing_direction,
        imageMagnification: raw.image_magnification,
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

  const minimumMovedCount = Math.min(2, enemies.length);
  assert(movedEnemyCount >= minimumMovedCount, `not enough enemies moved: ${movedEnemyCount}`);
}

function checkHeightCollisionBehavior(dungeon, walkEnemyDefinitions) {
  assert(walkEnemyDefinitions.length > 0, "missing walk enemy definition");

  for (const definition of walkEnemyDefinitions) {
    const enemies = createWalkEnemies(dungeon, [definition], `${CHECK_SEED}-${definition.id}`);
    const enemy = enemies[0];
    const hitbox = getEnemyWallHitbox(enemy);

    const magnification = resolveImageMagnification(definition.imageMagnification);
    const baseWidth = definition.height >= 64 ? 32 : definition.width;
    const baseHeight = definition.height >= 64 ? 32 : definition.height;
    const expectedWidth = baseWidth * magnification;
    const expectedHeight = baseHeight * magnification;
    const expectedX = enemy.x + (enemy.width - expectedWidth) / 2;
    const expectedY = enemy.y + (enemy.height - expectedHeight);

    assertClose(hitbox.width, expectedWidth, "wall hitbox width mismatch");
    assertClose(hitbox.height, expectedHeight, "wall hitbox height mismatch");
    assertClose(hitbox.x, expectedX, "wall hitbox x mismatch");
    assertClose(hitbox.y, expectedY, "wall hitbox y mismatch");
  }
}

function checkAnimationSequence() {
  const enemyAsset = {
    walk: { frameCount: 6 },
    idle: { frameCount: 4 },
    death: { frameCount: 6 },
    fps: 12,
    defaultFacing: "right",
  };
  const enemyBase = {
    isDead: false,
    isMoving: true,
    animTime: 0,
    deathAnimTime: 0,
    spriteFacing: "right",
    defaultSpriteFacing: "right",
  };

  const walkFrameCols = [0, 1, 2, 3].map((index) => {
    const time = index / enemyAsset.fps;
    return getEnemyFrame({ ...enemyBase, animTime: time, isMoving: true }, enemyAsset).col;
  });
  assert(
    JSON.stringify(walkFrameCols) === JSON.stringify([0, 1, 2, 3]),
    `walk animation sequence mismatch: ${walkFrameCols.join(",")}`
  );

  const idleFrameCols = [0, 1, 2, 3].map((index) => {
    const time = index / enemyAsset.fps;
    return getEnemyFrame({ ...enemyBase, animTime: time, isMoving: false }, enemyAsset).col;
  });
  assert(
    JSON.stringify(idleFrameCols) === JSON.stringify([0, 1, 2, 3]),
    `idle animation sequence mismatch: ${idleFrameCols.join(",")}`
  );

  const deathFrame = getEnemyFrame({ ...enemyBase, isDead: true, deathAnimTime: 99 }, enemyAsset);
  assert(deathFrame.animation === "death", "dead enemy should use death animation");
  assert(deathFrame.col === 5, `death frame should clamp to last frame: ${deathFrame.col}`);

  const flipFrame = getEnemyFrame({ ...enemyBase, spriteFacing: "left" }, enemyAsset);
  assert(flipFrame.flipX === true, "left spriteFacing should set flipX=true");
}

function main() {
  const walkEnemyDefinitions = loadWalkEnemyDefinitionsFromFs();
  assert(walkEnemyDefinitions.length >= 1, "at least one walk enemy is required for this check");

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
