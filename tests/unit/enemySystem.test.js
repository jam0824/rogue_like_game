import { describe, expect, it } from "vitest";
import { ENEMY_WALK_SPEED_PX_PER_SEC } from "../../src/config/constants.js";
import {
  createEnemies,
  getEnemyCombatHitbox,
  getEnemyHitFlashAlpha,
  updateEnemies,
} from "../../src/enemy/enemySystem.js";

function createGrid(width, height, initial = true) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => initial));
}

function createDungeon() {
  const floorGrid = createGrid(12, 12, true);

  return {
    seed: "enemy-system-unit",
    gridWidth: 12,
    gridHeight: 12,
    floorGrid,
    rooms: [
      { id: 0, x: 1, y: 1, w: 4, h: 4, centerX: 2, centerY: 2 },
      { id: 1, x: 7, y: 7, w: 3, h: 3, centerX: 8, centerY: 8 },
    ],
    startRoomId: 0,
  };
}

describe("enemySystem", () => {
  it("敵生成時に hp/maxHp/攻撃力/移動速度が初期化される", () => {
    const dungeon = createDungeon();
    const enemyDefinitions = [
      {
        id: "test-walk",
        type: "walk",
        width: 32,
        height: 64,
        noticeDistance: 8,
        giveupDistance: 16,
        vit: 10,
        for: 10,
        agi: 10,
        pow: 10,
      },
    ];

    const enemies = createEnemies(dungeon, enemyDefinitions, "enemy-seed");

    expect(enemies).toHaveLength(1);

    const enemy = enemies[0];
    expect(enemy.maxHp).toBe(173);
    expect(enemy.hp).toBe(173);
    expect(enemy.isDead).toBe(false);
    expect(enemy.attackDamage).toBe(26);
    expect(enemy.moveSpeed).toBeCloseTo(ENEMY_WALK_SPEED_PX_PER_SEC * 1.1, 5);
    expect(enemy.baseSpeedPxPerSec).toBeCloseTo(enemy.moveSpeed, 5);
    expect(enemy.chaseSpeedPxPerSec).toBeCloseTo(enemy.moveSpeed * 1.3, 5);
  });

  it("戦闘当たり判定は敵画像全体の AABB を返す", () => {
    const enemy = {
      x: 12.5,
      y: 33.25,
      width: 32,
      height: 64,
    };

    expect(getEnemyCombatHitbox(enemy)).toEqual({
      x: 12.5,
      y: 33.25,
      width: 32,
      height: 64,
    });
  });

  it("hitFlashTimerSec が減衰し hitFlashAlpha が 0..1 で返る", () => {
    const dungeon = createDungeon();
    const enemyDefinitions = [
      {
        id: "test-walk-flash",
        type: "walk",
        width: 32,
        height: 64,
        noticeDistance: 8,
        giveupDistance: 16,
      },
    ];
    const enemies = createEnemies(dungeon, enemyDefinitions, "enemy-flash-seed");
    const [enemy] = enemies;

    enemy.hitFlashDurationSec = 0.12;
    enemy.hitFlashTimerSec = 0.12;

    expect(getEnemyHitFlashAlpha(enemy)).toBe(1);

    updateEnemies(enemies, dungeon, 0.03, null);
    expect(enemy.hitFlashTimerSec).toBeCloseTo(0.09, 5);
    expect(getEnemyHitFlashAlpha(enemy)).toBeCloseTo(0.75, 5);

    updateEnemies(enemies, dungeon, 0.2, null);
    expect(enemy.hitFlashTimerSec).toBe(0);
    expect(getEnemyHitFlashAlpha(enemy)).toBe(0);
  });
});
