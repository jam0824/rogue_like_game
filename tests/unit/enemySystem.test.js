import { describe, expect, it } from "vitest";
import { ENEMY_WALK_SPEED_PX_PER_SEC } from "../../src/config/constants.js";
import {
  createEnemies,
  getEnemyCombatHitbox,
  getEnemyHitFlashAlpha,
  getEnemyTelegraphAlpha,
  getEnemyWeaponRuntimes,
  updateEnemies,
  updateEnemyAttacks,
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
    walkableGrid: floorGrid,
    rooms: [
      { id: 0, x: 1, y: 1, w: 4, h: 4, centerX: 2, centerY: 2 },
      { id: 1, x: 7, y: 7, w: 3, h: 3, centerX: 8, centerY: 8 },
    ],
    startRoomId: 0,
  };
}

function createEnemyDefinition(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function createEnemyAttackProfile(overrides = {}) {
  const weaponBase = {
    weaponDefId: "weapon_sword_01",
    formationId: "formation_id_circle01",
    width: 32,
    height: 64,
    radiusPx: 0,
    angularSpeed: 3,
    centerMode: "player",
    biasStrengthMul: 0,
    biasResponseMul: 0,
    biasOffsetRatioMax: 0,
    executeDurationSec: 0.2,
    supported: true,
  };

  const weapons = Array.isArray(overrides.weapons)
    ? overrides.weapons.map((weapon) => ({ ...weaponBase, ...weapon }))
    : [weaponBase];

  return {
    windupSec: 0.12,
    recoverSec: 0.1,
    executeSec: 0.2,
    cooldownAfterRecoverSec: 0.1,
    attackRangePx: 64,
    losRequired: false,
    weaponAimMode: "to_target",
    weaponVisibilityMode: "burst",
    attackLinked: true,
    weapons,
    ...overrides,
  };
}

function createPlayer(overrides = {}) {
  return {
    x: 224,
    y: 224,
    width: 32,
    height: 64,
    footHitboxHeight: 32,
    facing: "down",
    hp: 100,
    maxHp: 100,
    hitFlashTimerSec: 0,
    hitFlashDurationSec: 0.12,
    ...overrides,
  };
}

describe("enemySystem", () => {
  it("敵生成時に hp/maxHp/攻撃力/移動速度が初期化される", () => {
    const dungeon = createDungeon();
    const enemyDefinitions = [createEnemyDefinition()];

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
    const enemyDefinitions = [createEnemyDefinition({ id: "test-walk-flash" })];
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

  it("windup->attack->recover->cooldown を遷移し、windup中は赤点滅アルファが出る", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-attack-01" });
    const attackProfile = createEnemyAttackProfile();
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-attack-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;
    const player = createPlayer({ x: enemy.x, y: enemy.y });

    enemy.behaviorMode = "chase";
    enemy.isChasing = true;

    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    expect(enemy.attack.phase).toBe("windup");
    expect(getEnemyTelegraphAlpha(enemy)).toBeGreaterThan(0);
    expect(getEnemyWeaponRuntimes(enemy)[0].visible).toBe(false);

    for (let i = 0; i < 40; i += 1) {
      updateEnemyAttacks(enemies, player, dungeon, 0.01);
      if (enemy.attack.phase === "attack") {
        break;
      }
    }

    expect(enemy.attack.phase).toBe("attack");
    expect(getEnemyWeaponRuntimes(enemy)[0].visible).toBe(true);

    for (let i = 0; i < 40; i += 1) {
      updateEnemyAttacks(enemies, player, dungeon, 0.01);
      if (enemy.attack.phase === "recover") {
        break;
      }
    }

    expect(enemy.attack.phase).toBe("recover");

    for (let i = 0; i < 40; i += 1) {
      updateEnemyAttacks(enemies, player, dungeon, 0.01);
      if (enemy.attack.phase === "cooldown") {
        break;
      }
    }

    expect(enemy.attack.phase).toBe("cooldown");
  });

  it("攻撃中に敵武器AABBが重なるとプレイヤー被弾し、武器ごとに1回ヒットする", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-hit-01" });
    const attackProfile = createEnemyAttackProfile({
      windupSec: 0,
      executeSec: 0.25,
      recoverSec: 0,
      cooldownAfterRecoverSec: 0.1,
      attackRangePx: 999,
      weapons: [
        { weaponDefId: "weapon_sword_01", width: 32, height: 64, radiusPx: 0, angularSpeed: 0, executeDurationSec: 0.25 },
        { weaponDefId: "weapon_sword_01", width: 32, height: 64, radiusPx: 0, angularSpeed: 0, executeDurationSec: 0.25 },
      ],
    });

    const enemies = createEnemies(dungeon, [enemyDef], "enemy-hit-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;
    enemy.attackDamage = 7;
    enemy.behaviorMode = "chase";
    enemy.isChasing = true;

    const player = createPlayer({
      x: enemy.x,
      y: enemy.y,
      hp: 40,
      maxHp: 40,
    });

    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    const events = updateEnemyAttacks(enemies, player, dungeon, 0.01);

    expect(enemy.attack.phase).toBe("attack");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "damage", targetType: "player", damage: 7 });
    expect(events[1]).toMatchObject({ kind: "damage", targetType: "player", damage: 7 });
    expect(player.hp).toBe(26);
    expect(player.hitFlashTimerSec).toBeGreaterThan(0);

    const noRepeatEvents = updateEnemyAttacks(enemies, player, dungeon, 0.01);
    expect(noRepeatEvents).toHaveLength(0);
    expect(player.hp).toBe(26);
  });

  it("被ダメ無効オプション時は演出イベントのみ発行しHPは減らない", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-preview-only-01" });
    const attackProfile = createEnemyAttackProfile({
      windupSec: 0,
      executeSec: 0.2,
      recoverSec: 0,
      cooldownAfterRecoverSec: 0.1,
      attackRangePx: 999,
      weapons: [
        { weaponDefId: "weapon_sword_01", width: 32, height: 64, radiusPx: 0, angularSpeed: 0, executeDurationSec: 0.2 },
      ],
    });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-preview-only-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;
    enemy.attackDamage = 9;
    enemy.behaviorMode = "chase";
    enemy.isChasing = true;

    const player = createPlayer({
      x: enemy.x,
      y: enemy.y,
      hp: 30,
      maxHp: 30,
    });

    updateEnemyAttacks(enemies, player, dungeon, 0.01, { applyPlayerHpDamage: false });
    const events = updateEnemyAttacks(enemies, player, dungeon, 0.01, { applyPlayerHpDamage: false });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "damage", targetType: "player", damage: 9 });
    expect(player.hp).toBe(30);
    expect(player.hitFlashTimerSec).toBeGreaterThan(0);
  });
});
