import { describe, expect, it } from "vitest";
import { rollHitDamage } from "../../src/combat/damageRoll.js";
import { ENEMY_ANIM_FPS, ENEMY_WALK_SPEED_PX_PER_SEC } from "../../src/config/constants.js";
import {
  createEnemies,
  getEnemyCombatHitbox,
  getEnemyWallHitbox,
  isEnemyDeathAnimationFinished,
  getEnemyFrame,
  getEnemyHitFlashAlpha,
  getEnemyTelegraphPrimitives,
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
    fps: 12,
    pngFacingDirection: "right",
    imageMagnification: 1,
    noticeDistance: 8,
    giveupDistance: 16,
    vit: 10,
    for: 10,
    agi: 10,
    pow: 10,
    ...overrides,
  };
}

function createEnemyAsset(overrides = {}) {
  return {
    walk: { frameCount: 6 },
    idle: { frameCount: 4 },
    attack: { frameCount: 3 },
    death: { frameCount: 6 },
    fps: 12,
    defaultFacing: "right",
    drawScale: 1,
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
    preferredRangePx: 0,
    engageRangePx: 0,
    retreatRangePx: 0,
    attackRangePx: 64,
    losRequired: false,
    weaponAimMode: "to_target",
    weaponVisibilityMode: "burst",
    attackLinked: true,
    weapons,
    ...overrides,
  };
}

function createBossAttackProfile(overrides = {}) {
  return {
    role: "boss",
    preferredRangePx: 0,
    engageRangePx: 0,
    retreatRangePx: 0,
    attackRangePx: 999,
    losRequired: false,
    weaponAimMode: "to_target",
    weaponVisibilityMode: "burst",
    attackLinked: true,
    phases: [
      {
        phase: 1,
        hpRatioMin: 0,
        hpRatioMax: 1.01,
        summonCount: { min: 2, max: 2 },
        chargeMicroCorrectDeg: 0,
        pressChainCount: 1,
      },
    ],
    actionPriority: [
      { action: "summon", when: "minion_count_lt && cooldown_ready" },
      { action: "charge", when: "target_distance_gte && cooldown_ready" },
      { action: "press", when: "target_distance_lte && cooldown_ready" },
      { action: "chase", when: "always" },
    ],
    actions: {
      summon: {
        weaponIndex: 2,
        cooldownSec: 0.2,
        minionCountLt: 3,
        windupSec: 0.02,
        recoverSec: 0.01,
      },
      charge: {
        weaponIndex: 0,
        cooldownSec: 0.2,
        targetDistanceGte: 2,
        windupSec: 0.05,
        recoverSec: 0.01,
        recoverOnWallHitSec: 0.03,
      },
      press: {
        weaponIndex: 1,
        cooldownSec: 0.2,
        targetDistanceLte: 2,
        windupSec: 0.05,
        recoverSec: 0.01,
      },
      chase: {
        repathIntervalSec: 0.2,
      },
    },
    summonRules: {
      maxAliveInRoom: 8,
      maxAlivePerSummoner: 6,
      vanishOnSummonerDeath: true,
    },
    weapons: [
      {
        actionKey: "charge",
        weaponDefId: "weapon_ogre_charge_01",
        width: 32,
        height: 32,
        baseDamage: 10,
        supported: false,
        forceHidden: true,
        skillParams: {
          attackKind: "charge",
          charge: {
            dashDistanceTiles: 3,
            speedTilePerSec: 12,
            stopOnPlayerHit: true,
            wallHitRecoverSec: 0.05,
            telegraphStyle: "line_red_translucent",
            telegraphWidthTiles: 1,
          },
        },
      },
      {
        actionKey: "press",
        weaponDefId: "weapon_ogre_hammer_01",
        width: 32,
        height: 32,
        baseDamage: 10,
        supported: false,
        forceHidden: true,
        skillParams: {
          attackKind: "aoe",
          aoe: {
            telegraphStyle: "circle_red_translucent",
            telegraphRadiusTiles: 1.5,
          },
        },
      },
      {
        actionKey: "summon",
        weaponDefId: "weapon_ogre_summon_01",
        width: 32,
        height: 32,
        baseDamage: 0,
        supported: false,
        forceHidden: true,
        skillParams: {
          attackKind: "summon",
          summon: {
            enemyId: "OgreMinion_01",
            count: { min: 2, max: 2 },
            spawnStyle: "boss_ring_outside",
            spawnTelegraphRadiusTiles: 0.5,
            spawnTelegraphStyle: "circle_red_translucent",
            maxAliveInRoom: 8,
            maxAlivePerSummoner: 6,
            vanishOnSummonerDeath: true,
          },
        },
      },
    ],
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
    expect(enemy.hitFlashColor).toBe("#ffffff");
  });

  it("spawn.min/max 指定時は1部屋1スポーンから複数体生成される", () => {
    const dungeon = createDungeon();
    const enemyDefinitions = [createEnemyDefinition({ spawn: { min: 3, max: 3 } })];

    const enemies = createEnemies(dungeon, enemyDefinitions, "enemy-spawn-multi-seed");

    expect(enemies).toHaveLength(3);
    const centerTileKeys = new Set(
      enemies.map((enemy) => {
        const centerTileX = Math.floor((enemy.x + enemy.width / 2) / 32);
        const centerTileY = Math.floor((enemy.y + enemy.height / 2) / 32);
        return `${centerTileX}:${centerTileY}`;
      })
    );
    expect(centerTileKeys.size).toBe(3);
  });

  it("spawn 数を置き切れない場合は置ける数まで生成して続行する", () => {
    const dungeon = createDungeon();
    const enemyDefinitions = [createEnemyDefinition({ spawn: { min: 3, max: 3 } })];
    const blockedTiles = [
      { tileX: 7, tileY: 7 },
      { tileX: 8, tileY: 7 },
      { tileX: 9, tileY: 7 },
      { tileX: 7, tileY: 8 },
      { tileX: 9, tileY: 8 },
      { tileX: 7, tileY: 9 },
      { tileX: 8, tileY: 9 },
      { tileX: 9, tileY: 9 },
    ];

    const enemies = createEnemies(
      dungeon,
      enemyDefinitions,
      "enemy-spawn-reduce-seed",
      null,
      blockedTiles
    );

    expect(enemies).toHaveLength(1);
  });

  it("戦闘当たり判定は imageMagnification=1 では従来サイズを返す", () => {
    const enemy = {
      x: 12.5,
      y: 33.25,
      width: 32,
      height: 64,
      imageMagnification: 1,
    };

    expect(getEnemyCombatHitbox(enemy)).toEqual({
      x: 12.5,
      y: 33.25,
      width: 32,
      height: 64,
    });
  });

  it("戦闘当たり判定は imageMagnification を足元基準で拡大する", () => {
    const enemy = {
      x: 12.5,
      y: 33.25,
      width: 32,
      height: 64,
      imageMagnification: 1.5,
    };

    const hitbox = getEnemyCombatHitbox(enemy);
    expect(hitbox.x).toBeCloseTo(4.5, 6);
    expect(hitbox.y).toBeCloseTo(1.25, 6);
    expect(hitbox.width).toBeCloseTo(48, 6);
    expect(hitbox.height).toBeCloseTo(96, 6);
  });

  it("height>=64 の壁当たり判定は 32x32 基準に imageMagnification を適用する", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({
      id: "enemy-wall-scale-01",
      width: 32,
      height: 64,
      imageMagnification: 1.5,
    });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-wall-scale-seed");
    const [enemy] = enemies;
    const wallHitbox = getEnemyWallHitbox(enemy);

    expect(wallHitbox).not.toBeNull();
    expect(wallHitbox.width).toBeCloseTo(48, 6);
    expect(wallHitbox.height).toBeCloseTo(48, 6);
    expect(wallHitbox.x).toBeCloseTo(enemy.x - 8, 2);
    expect(wallHitbox.y).toBeCloseTo(enemy.y + 16, 2);
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

  it("停止中でも idle フレームが進み、walk/death と flipX を切り替える", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-idle-step-01" });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-idle-step-seed");
    const [enemy] = enemies;
    const enemyAsset = createEnemyAsset();

    enemy.baseSpeedPxPerSec = 0;
    enemy.chaseSpeedPxPerSec = 0;
    enemy.moveSpeed = 0;
    enemy.isMoving = false;
    enemy.animTime = 0;

    const beforeFrame = getEnemyFrame(enemy, enemyAsset);
    updateEnemies(enemies, dungeon, 1 / ENEMY_ANIM_FPS, null);
    const afterFrame = getEnemyFrame(enemy, enemyAsset);

    expect(enemy.isMoving).toBe(false);
    expect(enemy.animTime).toBeCloseTo(1 / ENEMY_ANIM_FPS, 6);
    expect(beforeFrame.animation).toBe("idle");
    expect(afterFrame.animation).toBe("idle");
    expect(afterFrame.col).toBe(1);

    enemy.isMoving = true;
    enemy.animTime = 2 / enemyAsset.fps;
    const walkFrame = getEnemyFrame(enemy, enemyAsset);
    expect(walkFrame.animation).toBe("walk");
    expect(walkFrame.col).toBe(2);

    enemy.spriteFacing = "left";
    const flippedFrame = getEnemyFrame(enemy, enemyAsset);
    expect(flippedFrame.flipX).toBe(true);

    enemy.isDead = true;
    enemy.deathAnimTime = 999;
    const deathFrame = getEnemyFrame(enemy, enemyAsset);
    expect(deathFrame.animation).toBe("death");
    expect(deathFrame.col).toBe(5);
  });

  it("死亡アニメの終了判定は deathAnimTime と death frameCount で決まる", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-death-finish-01" });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-death-finish-seed");
    const [enemy] = enemies;
    const enemyAsset = createEnemyAsset({ death: { frameCount: 6 }, fps: 12 });

    enemy.isDead = true;
    enemy.deathAnimTime = (6 - 0.01) / 12;
    expect(isEnemyDeathAnimationFinished(enemy, enemyAsset)).toBe(false);

    enemy.deathAnimTime = 6 / 12;
    expect(isEnemyDeathAnimationFinished(enemy, enemyAsset)).toBe(true);
  });

  it("chase中は engage/retreat 距離帯で接近・停止・後退を切り替える", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-range-intent-01" });
    const attackProfile = createEnemyAttackProfile({
      preferredRangePx: 96,
      engageRangePx: 64,
      retreatRangePx: 32,
      attackRangePx: 999,
    });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-range-intent-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;
    const player = createPlayer();

    enemy.behaviorMode = "chase";
    enemy.isChasing = true;

    const getDistance = () => {
      const enemyCenterX = enemy.x + enemy.width / 2;
      const enemyCenterY = enemy.y + enemy.height / 2;
      const playerFeetCenterX = player.x + player.width / 2;
      const playerFeetCenterY = player.y + player.height - player.footHitboxHeight / 2;
      return Math.hypot(playerFeetCenterX - enemyCenterX, playerFeetCenterY - enemyCenterY);
    };

    player.x = enemy.x + 256;
    player.y = enemy.y;
    const approachBefore = getDistance();
    updateEnemies(enemies, dungeon, 1 / 60, player);
    const approachAfter = getDistance();
    expect(enemy.rangeIntent).toBe("approach");
    expect(approachAfter).toBeLessThan(approachBefore);

    player.x = enemy.x + 48;
    player.y = enemy.y;
    const holdBefore = getDistance();
    updateEnemies(enemies, dungeon, 1 / 60, player);
    const holdAfter = getDistance();
    expect(enemy.rangeIntent).toBe("hold");
    expect(holdAfter).toBeCloseTo(holdBefore, 5);

    player.x = enemy.x + 4;
    player.y = enemy.y;
    const retreatBefore = getDistance();
    updateEnemies(enemies, dungeon, 1 / 60, player);
    const retreatAfter = getDistance();
    expect(enemy.rangeIntent).toBe("retreat");
    expect(retreatAfter).toBeGreaterThan(retreatBefore);
  });

  it("retreat > engage のときは runtime で engage が補正される", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-range-normalize-01" });
    const attackProfile = createEnemyAttackProfile({
      preferredRangePx: 24,
      engageRangePx: 16,
      retreatRangePx: 48,
      attackRangePx: 999,
    });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-range-normalize-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;

    expect(enemy.retreatRangePx).toBe(48);
    expect(enemy.engageRangePx).toBe(48);
    expect(enemy.rangeMoveTargetPx).toBe(48);
    expect(enemy.attack.engageRangePx).toBe(48);
  });

  it("engage距離外では攻撃開始せず、engage内で windup 開始する", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-engage-gate-01" });
    const attackProfile = createEnemyAttackProfile({
      windupSec: 0.2,
      executeSec: 0.2,
      recoverSec: 0.1,
      cooldownAfterRecoverSec: 0.1,
      engageRangePx: 48,
      attackRangePx: 999,
      losRequired: false,
    });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-engage-gate-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;
    const player = createPlayer({
      x: enemy.x + 220,
      y: enemy.y,
    });

    enemy.behaviorMode = "chase";
    enemy.isChasing = true;

    const farEvents = updateEnemyAttacks(enemies, player, dungeon, 0.01);
    expect(farEvents).toHaveLength(0);
    expect(enemy.attack.phase).toBe("cooldown");

    player.x = enemy.x;
    player.y = enemy.y;
    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    expect(enemy.attack.phase).toBe("windup");
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

  it("windup終了後は attack アニメに入り、1回再生後に通常アニメへ戻る", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-attack-anim-oneshot-01" });
    const attackProfile = createEnemyAttackProfile({
      windupSec: 0.01,
      executeSec: 0.2,
      recoverSec: 0.1,
      cooldownAfterRecoverSec: 0.1,
      attackRangePx: 999,
    });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-attack-anim-oneshot-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;
    const player = createPlayer({ x: enemy.x, y: enemy.y });
    const enemyAsset = createEnemyAsset({ attack: { frameCount: 3 }, idle: { frameCount: 4 }, fps: 12 });

    enemy.behaviorMode = "chase";
    enemy.isChasing = true;

    updateEnemyAttacks(enemies, player, dungeon, 0.005);
    expect(enemy.attack.phase).toBe("windup");

    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    expect(enemy.attack.phase).toBe("attack");

    const attackStartFrame = getEnemyFrame(enemy, enemyAsset);
    expect(attackStartFrame.animation).toBe("attack");
    expect(attackStartFrame.col).toBe(0);

    enemy.attackAnimActive = true;
    enemy.attackAnimTime = (3 - 0.01) / 12;
    const nearEndFrame = getEnemyFrame(enemy, enemyAsset);
    expect(nearEndFrame.animation).toBe("attack");
    expect(nearEndFrame.col).toBe(2);

    enemy.animTime = 0;
    enemy.attackAnimTime = 3 / 12;
    const afterOneShotFrame = getEnemyFrame(enemy, enemyAsset);
    expect(afterOneShotFrame.animation).toBe("idle");
    expect(afterOneShotFrame.col).toBe(0);
  });

  it("attackシート未設定時は idle を代替表示し、1回分の長さ後に通常アニメへ戻る", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-attack-anim-idle-fallback-01" });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-attack-anim-idle-fallback-seed");
    const [enemy] = enemies;
    const enemyAsset = createEnemyAsset({ attack: undefined, idle: { frameCount: 4 }, fps: 12 });

    enemy.isDead = false;
    enemy.isMoving = false;
    enemy.animTime = 0;
    enemy.attackAnimActive = true;
    enemy.attackAnimTime = (4 - 0.01) / 12;

    const fallbackActiveFrame = getEnemyFrame(enemy, enemyAsset);
    expect(fallbackActiveFrame.animation).toBe("idle");
    expect(fallbackActiveFrame.col).toBe(3);

    enemy.attackAnimTime = 4 / 12;
    const fallbackFinishedFrame = getEnemyFrame(enemy, enemyAsset);
    expect(fallbackFinishedFrame.animation).toBe("idle");
    expect(fallbackFinishedFrame.col).toBe(0);
  });

  it("windup終了直後の attack 開始フレームで武器transformが確定している", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-attack-transform-01" });
    const attackProfile = createEnemyAttackProfile({
      windupSec: 0.01,
      executeSec: 0.2,
      recoverSec: 0.1,
      cooldownAfterRecoverSec: 0.1,
      engageRangePx: 64,
      attackRangePx: 999,
      weapons: [
        {
          weaponDefId: "weapon_sword_01",
          width: 32,
          height: 64,
          radiusPx: 24,
          angularSpeed: 0,
          executeDurationSec: 0.2,
        },
      ],
    });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-attack-transform-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;
    const [weapon] = getEnemyWeaponRuntimes(enemy);
    const player = createPlayer({ x: enemy.x, y: enemy.y });

    enemy.behaviorMode = "chase";
    enemy.isChasing = true;

    updateEnemyAttacks(enemies, player, dungeon, 0.005);
    expect(enemy.attack.phase).toBe("windup");
    expect(weapon.visible).toBe(false);

    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    expect(enemy.attack.phase).toBe("attack");
    expect(weapon.visible).toBe(true);

    const enemyCenterX = enemy.x + enemy.width / 2;
    const enemyCenterY = enemy.y + enemy.height / 2;
    const weaponCenterX = weapon.x + weapon.width / 2;
    const weaponCenterY = weapon.y + weapon.height / 2;
    const distanceToCenter = Math.hypot(weaponCenterX - enemyCenterX, weaponCenterY - enemyCenterY);

    expect(distanceToCenter).toBeCloseTo(24, 5);
    expect(weapon.rotationDeg).toBeCloseTo(90, 5);
    expect(weapon.rotationRad).toBeCloseTo(Math.PI / 2, 5);
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
    expect(events[0]).toMatchObject({
      kind: "damage",
      targetType: "player",
      weaponId: expect.any(String),
      weaponDefId: "weapon_sword_01",
      damage: 7,
    });
    expect(events[1]).toMatchObject({
      kind: "damage",
      targetType: "player",
      weaponId: expect.any(String),
      weaponDefId: "weapon_sword_01",
      damage: 7,
    });
    expect(player.hp).toBe(26);
    expect(player.hitFlashTimerSec).toBeGreaterThan(0);

    const noRepeatEvents = updateEnemyAttacks(enemies, player, dungeon, 0.01);
    expect(noRepeatEvents).toHaveLength(0);
    expect(player.hp).toBe(26);
  });

  it("forceHidden + supported=false の敵武器は攻撃中も非表示で直接接触ダメージを出さない", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-skill-only-hidden-01" });
    const attackProfile = createEnemyAttackProfile({
      windupSec: 0,
      executeSec: 0.2,
      recoverSec: 0,
      cooldownAfterRecoverSec: 0.1,
      attackRangePx: 999,
      weapons: [
        {
          weaponDefId: "weapon_enemy_bite_01",
          width: 0,
          height: 0,
          radiusPx: 0,
          angularSpeed: 0,
          executeDurationSec: 0.2,
          supported: false,
          forceHidden: true,
        },
      ],
    });
    const enemies = createEnemies(dungeon, [enemyDef], "enemy-skill-only-hidden-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;
    enemy.behaviorMode = "chase";
    enemy.isChasing = true;

    const player = createPlayer({
      x: enemy.x,
      y: enemy.y,
      hp: 30,
      maxHp: 30,
    });

    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    const [weapon] = getEnemyWeaponRuntimes(enemy);
    expect(enemy.attack.phase).toBe("attack");
    expect(weapon.visible).toBe(false);
    expect(weapon.supported).toBe(false);

    const events = updateEnemyAttacks(enemies, player, dungeon, 0.01);
    expect(events).toHaveLength(0);
    expect(player.hp).toBe(30);
    expect(weapon.visible).toBe(false);
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
    expect(events[0]).toMatchObject({
      kind: "damage",
      targetType: "player",
      weaponId: expect.any(String),
      weaponDefId: "weapon_sword_01",
      damage: 9,
    });
    expect(player.hp).toBe(30);
    expect(player.hitFlashTimerSec).toBeGreaterThan(0);
  });

  it("weapon.baseDamage がある敵攻撃は seed 固定の Rand/Crit ダメージを使う", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "enemy-derived-roll-01" });
    const attackProfile = createEnemyAttackProfile({
      windupSec: 0,
      executeSec: 0.2,
      recoverSec: 0,
      cooldownAfterRecoverSec: 0.1,
      attackRangePx: 999,
      weapons: [
        {
          weaponDefId: "weapon_sword_01",
          width: 32,
          height: 64,
          baseDamage: 10,
          radiusPx: 0,
          angularSpeed: 0,
          executeDurationSec: 0.2,
        },
      ],
    });

    const enemies = createEnemies(dungeon, [enemyDef], "enemy-derived-roll-seed", {
      [enemyDef.id]: attackProfile,
    });
    const [enemy] = enemies;
    enemy.behaviorMode = "chase";
    enemy.isChasing = true;

    const player = createPlayer({
      x: enemy.x,
      y: enemy.y,
      hp: 100,
      maxHp: 100,
    });

    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    const events = updateEnemyAttacks(enemies, player, dungeon, 0.01);
    const [weapon] = getEnemyWeaponRuntimes(enemy);
    const expectedDamage = rollHitDamage({
      baseDamage: 10,
      damageMult: enemy.damageMult,
      attackScale: enemy.attackScale,
      critChance: enemy.critChance,
      critMult: enemy.critMult,
      seedKey: `${enemy.damageSeed}::${enemy.attack.attackCycle}::${weapon.id}::player`,
    }).damage;

    expect(events).toHaveLength(1);
    expect(events[0].damage).toBe(expectedDamage);
    expect(player.hp).toBe(100 - expectedDamage);
  });

  it("fixedSpawns オプションでボスを指定タイルに固定スポーンできる", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "boss-fixed-spawn", rank: "boss", role: "boss" });
    const enemies = createEnemies(
      dungeon,
      [enemyDef],
      "boss-fixed-seed",
      null,
      {
        fixedSpawns: [{ enemyDbId: enemyDef.id, tileX: 5, tileY: 6, enemyId: "boss-001" }],
        useFixedSpawnsOnly: true,
      }
    );

    expect(enemies).toHaveLength(1);
    expect(enemies[0].id).toBe("boss-001");
    const centerTileX = Math.floor((enemies[0].x + enemies[0].width / 2) / 32);
    const centerTileY = Math.floor((enemies[0].y + enemies[0].height / 2) / 32);
    expect(centerTileX).toBe(5);
    expect(centerTileY).toBe(6);
  });

  it("boss 行動優先度で summon を選択し summon_request を発行する", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "boss-summon-01", rank: "boss", role: "boss" });
    const enemies = createEnemies(
      dungeon,
      [enemyDef],
      "boss-summon-seed",
      { [enemyDef.id]: createBossAttackProfile() },
      {
        fixedSpawns: [{ enemyDbId: enemyDef.id, tileX: 8, tileY: 8 }],
        useFixedSpawnsOnly: true,
      }
    );
    const [boss] = enemies;
    const player = createPlayer({ x: boss.x + 64, y: boss.y + 64 });
    boss.behaviorMode = "chase";
    boss.isChasing = true;

    let summonEvents = [];
    for (let i = 0; i < 20; i += 1) {
      const events = updateEnemyAttacks(enemies, player, dungeon, 0.02);
      summonEvents = events.filter((event) => event.kind === "summon_request");
      if (summonEvents.length > 0) {
        break;
      }
    }

    expect(summonEvents.length).toBeGreaterThan(0);
    expect(summonEvents[0]).toMatchObject({
      kind: "summon_request",
      summonerEnemyId: boss.id,
      enemyDbId: "OgreMinion_01",
    });
  });

  it("boss charge は line テレグラフを出し、実行中に前進する", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "boss-charge-01", rank: "boss", role: "boss" });
    const enemies = createEnemies(
      dungeon,
      [enemyDef],
      "boss-charge-seed",
      {
        [enemyDef.id]: createBossAttackProfile({
          actionPriority: [
            { action: "charge", when: "target_distance_gte && cooldown_ready" },
            { action: "chase", when: "always" },
          ],
          actions: {
            charge: {
              weaponIndex: 0,
              cooldownSec: 0.2,
              targetDistanceGte: 1,
              windupSec: 0.05,
              recoverSec: 0.01,
            },
            chase: {
              repathIntervalSec: 0.2,
            },
          },
        }),
      },
      {
        fixedSpawns: [{ enemyDbId: enemyDef.id, tileX: 8, tileY: 8 }],
        useFixedSpawnsOnly: true,
      }
    );
    const [boss] = enemies;
    const player = createPlayer({ x: boss.x + 180, y: boss.y });
    boss.behaviorMode = "chase";
    boss.isChasing = true;

    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    const telegraphs = getEnemyTelegraphPrimitives(boss);
    expect(telegraphs.some((telegraph) => telegraph.kind === "line")).toBe(true);

    const beforeX = boss.x;
    for (let i = 0; i < 10; i += 1) {
      updateEnemyAttacks(enemies, player, dungeon, 0.02);
    }
    expect(boss.x).toBeGreaterThan(beforeX);
  });

  it("boss press は windup開始時の位置で circle テレグラフをロックする", () => {
    const dungeon = createDungeon();
    const enemyDef = createEnemyDefinition({ id: "boss-press-01", rank: "boss", role: "boss" });
    const enemies = createEnemies(
      dungeon,
      [enemyDef],
      "boss-press-seed",
      {
        [enemyDef.id]: createBossAttackProfile({
          actionPriority: [
            { action: "press", when: "target_distance_lte && cooldown_ready" },
            { action: "chase", when: "always" },
          ],
          actions: {
            press: {
              weaponIndex: 1,
              cooldownSec: 0.2,
              targetDistanceLte: 99,
              windupSec: 0.05,
              recoverSec: 0.01,
            },
            chase: {
              repathIntervalSec: 0.2,
            },
          },
        }),
      },
      {
        fixedSpawns: [{ enemyDbId: enemyDef.id, tileX: 8, tileY: 8 }],
        useFixedSpawnsOnly: true,
      }
    );
    const [boss] = enemies;
    const player = createPlayer({ x: boss.x + 16, y: boss.y });
    boss.behaviorMode = "chase";
    boss.isChasing = true;

    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    const circleBeforeMove = getEnemyTelegraphPrimitives(boss).find((telegraph) => telegraph.kind === "circle");
    expect(circleBeforeMove).toBeDefined();

    player.x += 200;
    player.y += 200;
    updateEnemyAttacks(enemies, player, dungeon, 0.01);
    const circleAfterMove = getEnemyTelegraphPrimitives(boss).find((telegraph) => telegraph.kind === "circle");
    expect(circleAfterMove).toBeDefined();
    expect(circleAfterMove.centerX).toBe(circleBeforeMove.centerX);
    expect(circleAfterMove.centerY).toBe(circleBeforeMove.centerY);
  });
});
