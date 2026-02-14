import { describe, expect, it } from "vitest";
import { rollHitDamage } from "../../src/combat/damageRoll.js";
import { createPlayerWeapons, updateWeaponsAndCombat } from "../../src/weapon/weaponSystem.js";

function createPlayer(overrides = {}) {
  return {
    x: 100,
    y: 100,
    width: 32,
    height: 64,
    facing: "right",
    pointerActive: false,
    target: null,
    ...overrides,
  };
}

function createWeaponDefinition(overrides = {}) {
  return {
    id: "test-weapon",
    weaponFileName: "weapon_sword_01.png",
    width: 32,
    height: 32,
    baseDamage: 10,
    attackCooldownSec: 0.2,
    hitNum: 1,
    pierceCount: 0,
    formationId: "formation_id_circle01",
    ...overrides,
  };
}

function createFormationDefinition(overrides = {}) {
  return {
    id: "formation_id_circle01",
    type: "circle",
    radiusBase: 0.01,
    angularSpeedBase: 0,
    biasStrengthMul: 0,
    biasResponseMul: 1,
    clamp: {
      radiusMin: 0,
      radiusMax: 10,
      speedMin: 0,
      speedMax: 10,
      biasOffsetRatioMax: 1,
    },
    params: {
      centerMode: "player",
    },
    ...overrides,
  };
}

function createEnemy(overrides = {}) {
  return {
    id: "enemy-1",
    x: 100,
    y: 100,
    width: 32,
    height: 64,
    hp: 100,
    maxHp: 100,
    isDead: false,
    hitFlashTimerSec: 0,
    hitFlashDurationSec: 0.12,
    ...overrides,
  };
}

describe("weaponSystem", () => {
  it("初回更新で attackSeq が進み、同一シーケンス中の再ヒットを防ぐ", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition();
    const formationDefinition = createFormationDefinition();
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const enemy = createEnemy({ x: 100, y: 100, hp: 80, maxHp: 80 });

    updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, 0.05);

    expect(weapons[0].attackSeq).toBe(1);
    expect(enemy.hp).toBe(70);

    updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, 0.05);

    expect(weapons[0].attackSeq).toBe(1);
    expect(enemy.hp).toBe(70);
  });

  it("cooldown経過で attackSeq が進み hit_set がリセットされる", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 0.2 });
    const formationDefinition = createFormationDefinition();
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const enemy = createEnemy({ hp: 100, maxHp: 100 });

    updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, 0.05);
    expect(enemy.hp).toBe(90);
    expect(weapons[0].hitSet.size).toBe(1);

    updateWeaponsAndCombat(weapons, player, [], weaponDefinitionsById, formationsById, 0.2);
    expect(weapons[0].attackSeq).toBe(2);
    expect(weapons[0].hitSet.size).toBe(0);

    updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, 0.01);
    expect(enemy.hp).toBe(80);
  });

  it("hit_num を適用し、pierce_count で同時命中数を制限する", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ hitNum: 2, pierceCount: 0, baseDamage: 7 });
    const formationDefinition = createFormationDefinition();
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);

    const enemyA = createEnemy({ id: "enemy-a", hp: 100, maxHp: 100 });
    const enemyB = createEnemy({ id: "enemy-b", hp: 100, maxHp: 100 });

    updateWeaponsAndCombat(weapons, player, [enemyA, enemyB], weaponDefinitionsById, formationsById, 0.05);

    expect(enemyA.hp).toBe(86);
    expect(enemyB.hp).toBe(100);
  });

  it("pierce_count > 0 で複数敵にヒットできる", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ hitNum: 1, pierceCount: 1, baseDamage: 9 });
    const formationDefinition = createFormationDefinition();
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);

    const enemyA = createEnemy({ id: "enemy-a", hp: 50, maxHp: 50 });
    const enemyB = createEnemy({ id: "enemy-b", hp: 50, maxHp: 50 });

    updateWeaponsAndCombat(weapons, player, [enemyA, enemyB], weaponDefinitionsById, formationsById, 0.05);

    expect(enemyA.hp).toBe(41);
    expect(enemyB.hp).toBe(41);
  });

  it("biased_center でクリック方向に軌道中心がオフセットされる", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 800, y: 132 },
      facing: "up",
    });

    const weaponDefinition = createWeaponDefinition({ width: 32, height: 32, attackCooldownSec: 2 });
    const formationDefinition = createFormationDefinition({
      radiusBase: 2,
      angularSpeedBase: 3,
      biasStrengthMul: 1.1,
      biasResponseMul: 1,
      clamp: {
        radiusMin: 1,
        radiusMax: 4.5,
        speedMin: 0.5,
        speedMax: 8,
        biasOffsetRatioMax: 0.6,
      },
      params: {
        centerMode: "biased_center",
      },
    });

    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);

    for (let i = 0; i < 120; i += 1) {
      updateWeaponsAndCombat(weapons, player, [], weaponDefinitionsById, formationsById, 1 / 60);
    }

    expect(weapons[0].biasDirX).toBeGreaterThan(0.95);
    expect(Math.abs(weapons[0].biasDirY)).toBeLessThan(0.1);
    expect(weapons[0].x).toBeGreaterThan(190);
  });

  it("武器回転角が 上0/右90/下180/左270 に対応する", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 10 });
    const formationDefinition = createFormationDefinition({
      radiusBase: 1,
      angularSpeedBase: 0,
      params: { centerMode: "player" },
    });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const [weapon] = weapons;

    const testCases = [
      { angleRad: -Math.PI / 2, expectedDeg: 0 },
      { angleRad: 0, expectedDeg: 90 },
      { angleRad: Math.PI / 2, expectedDeg: 180 },
      { angleRad: Math.PI, expectedDeg: 270 },
    ];

    for (const testCase of testCases) {
      weapon.angleRad = testCase.angleRad;
      updateWeaponsAndCombat(weapons, player, [], weaponDefinitionsById, formationsById, 1 / 60);
      expect(weapon.rotationDeg).toBeCloseTo(testCase.expectedDeg, 5);
    }
  });

  it("命中時に CombatEvent を返し敵フラッシュを発火する", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ hitNum: 2, baseDamage: 6, attackCooldownSec: 0.2 });
    const formationDefinition = createFormationDefinition();
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const enemy = createEnemy({
      id: "enemy-event",
      hp: 100,
      maxHp: 100,
      hitFlashDurationSec: 0.2,
      hitFlashTimerSec: 0,
    });

    const events = updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, 0.05);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      kind: "damage",
      targetType: "enemy",
      enemyId: "enemy-event",
      damage: 12,
      isCritical: false,
      worldX: enemy.x + enemy.width / 2,
      worldY: enemy.y + enemy.height / 2,
    });
    expect(enemy.hp).toBe(88);
    expect(enemy.hitFlashTimerSec).toBeCloseTo(0.2, 5);
  });

  it("player派生ステータスがある場合は seed 固定の Rand/Crit ダメージを使う", () => {
    const player = createPlayer({
      damageSeed: "player-derived-roll-seed",
      damageMult: 1.3,
      critChance: 0.25,
      critMult: 1.7,
    });
    const weaponDefinition = createWeaponDefinition({ baseDamage: 10, hitNum: 2, attackCooldownSec: 0.2 });
    const formationDefinition = createFormationDefinition();
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const enemy = createEnemy({ id: "enemy-roll", hp: 100, maxHp: 100 });

    const events = updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, 0.05);
    const expectedPerHit = rollHitDamage({
      baseDamage: 10,
      damageMult: player.damageMult,
      attackScale: 1,
      critChance: player.critChance,
      critMult: player.critMult,
      seedKey: `${player.damageSeed}::weapon-0::1::enemy-roll`,
    }).damage;

    expect(events).toHaveLength(1);
    expect(events[0].damage).toBe(expectedPerHit * 2);
    expect(enemy.hp).toBe(100 - expectedPerHit * 2);
  });
});
