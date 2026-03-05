import { describe, expect, it } from "vitest";
import {
  MAX_CHAIN_SPAWN,
  resolveWeaponSkillPlan,
  updateEnemySkillChainCombat,
  updateSkillChainCombat,
} from "../../src/combat/skillChainSystem.js";
import { updateEffects } from "../../src/effect/effectSystem.js";

function createDungeon() {
  const width = 64;
  const height = 64;
  const walkableGrid = Array.from({ length: height }, () => Array.from({ length: width }, () => true));

  return {
    seed: "skill-chain-unit",
    gridWidth: width,
    gridHeight: height,
    floorGrid: walkableGrid,
    walkableGrid,
  };
}

function createPlayer() {
  return {
    x: 96,
    y: 96,
    width: 32,
    height: 64,
    facing: "right",
    pointerActive: false,
    target: null,
    damageSeed: "player-skill-seed",
    damageMult: 1,
    critChance: 0,
    critMult: 1.5,
    statTotals: {
      arc: 0,
    },
  };
}

function createEnemy(id, x, y, hp = 100) {
  return {
    id,
    x,
    y,
    width: 32,
    height: 32,
    hp,
    maxHp: hp,
    isDead: false,
    hitFlashTimerSec: 0,
    hitFlashDurationSec: 0.12,
    ailmentTakenMult: 1,
  };
}

function createEnemyCaster(id, x, y, skills) {
  return {
    id,
    x,
    y,
    width: 32,
    height: 32,
    facing: "right",
    isDead: false,
    damageSeed: `${id}-skill-seed`,
    damageMult: 1,
    critChance: 0,
    critMult: 1.5,
    attackScale: 1,
    statTotals: {
      arc: 0,
    },
    attack: {
      attackCycle: 1,
      weapons: [
        {
          id: `${id}-weapon-0`,
          weaponDefId: "weapon_sword_01",
          x: x + 16,
          y: y + 16,
          width: 32,
          height: 32,
          skillInstances: Array.isArray(skills) ? skills.map((skill) => ({ ...skill })) : [],
        },
      ],
    },
  };
}

function createSkillDefinitions() {
  return {
    skill_id_projectile_01: {
      id: "skill_id_projectile_01",
      skillType: "attack",
      params: {
        attackKind: "projectile",
        baseDamage: 10,
        damageElement: "physical",
        startSpawnTiming: "start",
        chainTrigger: "on_hit",
        hit: { hitNum: 1, pierceCount: 0 },
        projectile: {
          speedTilePerSec: 10,
          lifeSec: 1.2,
          moveDirection: "to_target",
          spriteEffectId: "effect_id_proj_basic_01",
          disappearHitWall: false,
        },
      },
    },
    skill_id_poison_01: {
      id: "skill_id_poison_01",
      skillType: "modifier",
      params: {
        addTags: ["element:poison", "ailment:poison"],
        applyAilments: [{ ailmentId: "poison", applyBase: 0.6 }],
        addAttackDamagePct: 0,
      },
    },
    skill_id_explosion_01: {
      id: "skill_id_explosion_01",
      skillType: "attack",
      params: {
        attackKind: "aoe",
        baseDamage: 12,
        damageElement: "fire",
        startSpawnTiming: "hit",
        chainTrigger: "on_hit",
        hit: { hitNum: 1, pierceCount: 0 },
        aoe: {
          spriteEffectId: "effect_id_explosion_01",
          hitIntervalSec: 0,
        },
      },
    },
  };
}

function createWeaponDefinition(skills) {
  return {
    id: "weapon_sword_01",
    baseDamage: 12,
    attackCooldownSec: 2,
    hitNum: 1,
    pierceCount: 0,
    formationId: "formation_id_circle01",
    skills,
  };
}

function createBuildEffectRuntime() {
  let seq = 0;
  return (effectId, x, y) => {
    const map = {
      effect_id_proj_basic_01: { width: 16, height: 16, loop: true },
      effect_id_explosion_01: { width: 80, height: 80, loop: false },
      effect_big_aoe: { width: 640, height: 640, loop: false },
    };
    const config = map[effectId];
    if (!config) {
      return null;
    }

    const id = `skill-effect-${seq}`;
    seq += 1;

    return {
      id,
      effectId,
      x,
      y,
      frameIndex: 0,
      frameCount: 1,
      ageSec: 0,
      animationFps: 1,
      width: config.width,
      height: config.height,
      rotationRad: 0,
      animationDirection: "horizontal",
      scale: 1,
      blendMode: "normal",
      loop: config.loop,
    };
  };
}

function runEnemySingleSkillDamage({ attackScale = 1, damageMult = 1 }) {
  const dungeon = createDungeon();
  const player = {
    ...createPlayer(),
    id: "player-main",
    x: 192,
    y: 96,
    hp: 999,
    maxHp: 999,
    hitFlashTimerSec: 0,
    hitFlashDurationSec: 0.12,
    ailmentTakenMult: 1,
  };
  const skillDefinitionsById = {
    skill_id_enemy_power_test: {
      id: "skill_id_enemy_power_test",
      skillType: "attack",
      params: {
        attackKind: "aoe",
        baseDamage: 100,
        damageElement: "fire",
        startSpawnTiming: "hit",
        chainTrigger: "on_hit",
        hit: { hitNum: 1, pierceCount: 0 },
        aoe: {
          spriteEffectId: "effect_id_explosion_01",
          hitIntervalSec: 0,
        },
      },
    },
  };
  const weaponDefinition = createWeaponDefinition([{ id: "skill_id_enemy_power_test", plus: 0 }]);
  const weaponDefinitionsById = {
    weapon_sword_01: weaponDefinition,
  };
  const enemy = createEnemyCaster("enemy-power-test", 96, 96, weaponDefinition.skills);
  enemy.damageSeed = "enemy-power-test-fixed-seed";
  enemy.critChance = 0;
  enemy.damageMult = damageMult;
  enemy.attackScale = attackScale;
  const weapon = enemy.attack.weapons[0];

  const result = updateEnemySkillChainCombat({
    dt: 1 / 60,
    dungeon,
    player,
    enemies: [enemy],
    effects: [],
    weaponStartEvents: [],
    weaponHitEvents: [{
      weaponId: weapon.id,
      attackSeq: 1,
      targetId: player.id,
      worldX: player.x + player.width / 2,
      worldY: player.y + player.height / 2,
    }],
    weaponDefinitionsById,
    skillDefinitionsById,
    buildEffectRuntime: createBuildEffectRuntime(),
    applyPlayerHpDamage: true,
  });

  const damageEvent = result.events.find(
    (event) =>
      event?.kind === "damage" &&
      event?.targetType === "player" &&
      event?.sourceType === "skill" &&
      event?.skillId === "skill_id_enemy_power_test"
  );
  expect(damageEvent).toBeTruthy();
  return Math.max(0, Math.round(damageEvent?.damage ?? 0));
}

describe("skillChainSystem", () => {
  it("resolveWeaponSkillPlan は projectile には毒を乗せず explosion に毒を乗せる", () => {
    const skillDefinitionsById = createSkillDefinitions();
    const weaponDefinition = createWeaponDefinition([
      { id: "skill_id_projectile_01", plus: 0 },
      { id: "skill_id_poison_01", plus: 99 },
      { id: "skill_id_explosion_01", plus: 0 },
    ]);

    const plan = resolveWeaponSkillPlan({
      weaponRuntime: { id: "weapon-0", skillInstances: weaponDefinition.skills },
      weaponDefinition,
      baseWeaponDefinition: weaponDefinition,
      skillDefinitionsById,
    });

    expect(plan.attackSteps).toHaveLength(2);
    expect(plan.attackSteps[0].skillId).toBe("skill_id_projectile_01");
    expect(plan.attackSteps[0].applyAilments).toHaveLength(0);
    expect(plan.attackSteps[1].skillId).toBe("skill_id_explosion_01");
    expect(plan.attackSteps[1].applyAilments).toEqual([
      {
        ailmentId: "poison",
        applyBase: 0.6,
        plus: 99,
      },
    ]);
  });

  it("未解決 skill id だけの runtime は base weapon skills にフォールバックする", () => {
    const skillDefinitionsById = createSkillDefinitions();
    const baseWeaponDefinition = createWeaponDefinition([{ id: "skill_id_projectile_01", plus: 0 }]);

    const plan = resolveWeaponSkillPlan({
      weaponRuntime: { id: "weapon-0", skillInstances: [{ id: "skill_id_legacy_unknown", plus: 0 }] },
      weaponDefinition: baseWeaponDefinition,
      baseWeaponDefinition,
      skillDefinitionsById,
    });

    expect(plan.fallbackApplied).toBe(true);
    expect(plan.attackSteps).toHaveLength(1);
    expect(plan.attackSteps[0].skillId).toBe("skill_id_projectile_01");
  });

  it("projectile の hitBoxPer は player 側の projectile hitbox サイズに反映される", () => {
    const dungeon = createDungeon();
    const player = createPlayer();
    const skillDefinitionsById = createSkillDefinitions();
    skillDefinitionsById.skill_id_projectile_01.params.projectile.hitBoxPer = 0.5;

    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_projectile_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const weaponRuntime = {
      id: "weapon-0",
      weaponDefId: "weapon_sword_01",
      x: 100,
      y: 100,
      width: 32,
      height: 32,
      attackSeq: 1,
      skillInstances: weaponDefinition.skills,
    };

    updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [createEnemy("enemy-a", 300, 300, 100)],
      effects: [],
      weapons: [weaponRuntime],
      weaponStartEvents: [{ weaponId: "weapon-0", weaponDefId: "weapon_sword_01", attackSeq: 1, worldX: 116, worldY: 116 }],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
    });

    const projectile = weaponRuntime?.skillChainRuntime?.projectiles?.[0];
    expect(projectile).toBeTruthy();
    expect(projectile.hitboxWidth).toBeCloseTo(8, 5);
    expect(projectile.hitboxHeight).toBeCloseTo(8, 5);
  });

  it("projectile の hitBoxPer は enemy 側の projectile hitbox サイズに反映される", () => {
    const dungeon = createDungeon();
    const skillDefinitionsById = createSkillDefinitions();
    skillDefinitionsById.skill_id_projectile_01.params.projectile.hitBoxPer = 0.5;

    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_projectile_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 192,
      y: 96,
      hp: 200,
      maxHp: 200,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const enemy = createEnemyCaster("enemy-caster", 96, 96, weaponDefinition.skills);
    const weapon = enemy.attack.weapons[0];

    updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects: [],
      weaponStartEvents: [{ weaponId: weapon.id, attackSeq: 1, worldX: 128, worldY: 128 }],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
      applyPlayerHpDamage: true,
    });

    const projectile = weapon?.skillChainRuntime?.projectiles?.[0];
    expect(projectile).toBeTruthy();
    expect(projectile.hitboxWidth).toBeCloseTo(8, 5);
    expect(projectile.hitboxHeight).toBeCloseTo(8, 5);
  });

  it("aoe の hitBoxPer 縮小で境界上の敵に当たらなくなる", () => {
    function runAoeHitCount(hitBoxPer) {
      const dungeon = createDungeon();
      const player = createPlayer();
      const aoeConfig = {
        spriteEffectId: "effect_id_explosion_01",
        hitIntervalSec: 0,
      };
      if (Number.isFinite(hitBoxPer)) {
        aoeConfig.hitBoxPer = hitBoxPer;
      }

      const skillDefinitionsById = {
        skill_id_aoe_boundary: {
          id: "skill_id_aoe_boundary",
          skillType: "attack",
          params: {
            attackKind: "aoe",
            baseDamage: 10,
            damageElement: "fire",
            startSpawnTiming: "start",
            chainTrigger: "on_hit",
            hit: { hitNum: 1, pierceCount: 0 },
            aoe: aoeConfig,
          },
        },
      };

      const weaponDefinition = createWeaponDefinition([{ id: "skill_id_aoe_boundary", plus: 0 }]);
      const weaponDefinitionsById = {
        weapon_sword_01: weaponDefinition,
      };
      const weaponRuntime = {
        id: "weapon-0",
        weaponDefId: "weapon_sword_01",
        x: 100,
        y: 100,
        width: 32,
        height: 32,
        attackSeq: 1,
        skillInstances: weaponDefinition.skills,
      };
      const enemies = [createEnemy("enemy-edge", 155, 108, 220)];

      const result = updateSkillChainCombat({
        dt: 1 / 60,
        dungeon,
        player,
        enemies,
        effects: [],
        weapons: [weaponRuntime],
        weaponStartEvents: [{ weaponId: "weapon-0", weaponDefId: "weapon_sword_01", attackSeq: 1, worldX: 116, worldY: 116 }],
        weaponHitEvents: [],
        weaponDefinitionsById,
        skillDefinitionsById,
        buildEffectRuntime: createBuildEffectRuntime(),
      });

      return result.events.filter(
        (event) =>
          event?.kind === "damage" &&
          event?.targetType === "enemy" &&
          event?.sourceType === "skill" &&
          event?.skillId === "skill_id_aoe_boundary"
      ).length;
    }

    expect(runAoeHitCount(undefined)).toBe(1);
    expect(runAoeHitCount(0.5)).toBe(0);
  });

  it("projectile -> poison -> explosion が連鎖し、爆発AoEが複数敵に当たり poison DoT が発生する", () => {
    const dungeon = createDungeon();
    const player = createPlayer();
    const skillDefinitionsById = createSkillDefinitions();
    const weaponDefinition = createWeaponDefinition([
      { id: "skill_id_projectile_01", plus: 0 },
      { id: "skill_id_poison_01", plus: 99 },
      { id: "skill_id_explosion_01", plus: 0 },
    ]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };

    const weaponRuntime = {
      id: "weapon-0",
      weaponDefId: "weapon_sword_01",
      x: 100,
      y: 100,
      width: 32,
      height: 32,
      attackSeq: 1,
      skillInstances: weaponDefinition.skills,
    };

    const enemies = [
      createEnemy("enemy-a", 160, 108, 220),
      createEnemy("enemy-b", 188, 108, 220),
    ];

    const buildEffectRuntime = createBuildEffectRuntime();
    let effects = [];
    const allEvents = [];

    const first = updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies,
      effects,
      weapons: [weaponRuntime],
      weaponStartEvents: [{ weaponId: "weapon-0", weaponDefId: "weapon_sword_01", attackSeq: 1, worldX: 116, worldY: 116 }],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
    });
    effects = first.effects;
    allEvents.push(...first.events);

    const projectileEffect = effects.find((effect) => effect?.effectId === "effect_id_proj_basic_01");
    expect(projectileEffect).toBeTruthy();
    const expectedRotationRad = Math.atan2((108 + 16) - 116, (160 + 16) - 116);
    expect(projectileEffect.rotationRad).toBeCloseTo(expectedRotationRad, 5);

    for (let frame = 0; frame < 240; frame += 1) {
      const result = updateSkillChainCombat({
        dt: 1 / 60,
        dungeon,
        player,
        enemies,
        effects,
        weapons: [weaponRuntime],
        weaponStartEvents: [],
        weaponDefinitionsById,
        skillDefinitionsById,
        buildEffectRuntime,
      });
      effects = result.effects;
      allEvents.push(...result.events);
    }

    expect(allEvents.some((event) => event.sourceType === "skill" && event.skillId === "skill_id_projectile_01")).toBe(true);
    const explosionEvents = allEvents.filter(
      (event) => event.sourceType === "skill" && event.skillId === "skill_id_explosion_01"
    );
    expect(explosionEvents.length).toBeGreaterThanOrEqual(2);

    const poisonStacksA = enemies[0]?.ailments?.poison?.stacks ?? 0;
    const poisonStacksB = enemies[1]?.ailments?.poison?.stacks ?? 0;
    expect(poisonStacksA + poisonStacksB).toBeGreaterThan(0);

    const dotEvents = allEvents.filter((event) => event.sourceType === "ailment" && event.ailmentId === "poison");
    expect(dotEvents.length).toBeGreaterThan(0);
  });

  it("player projectile は isRotate=false のとき回転せず固定向きを維持する", () => {
    const dungeon = createDungeon();
    const player = createPlayer();
    const skillDefinitionsById = createSkillDefinitions();
    skillDefinitionsById.skill_id_projectile_01.params.projectile.isRotate = false;

    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_projectile_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const weaponRuntime = {
      id: "weapon-0",
      weaponDefId: "weapon_sword_01",
      x: 100,
      y: 100,
      width: 32,
      height: 32,
      attackSeq: 1,
      skillInstances: weaponDefinition.skills,
    };
    const enemies = [createEnemy("enemy-a", 300, 300, 220)];
    const buildEffectRuntime = createBuildEffectRuntime();

    let effects = [];
    const first = updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies,
      effects,
      weapons: [weaponRuntime],
      weaponStartEvents: [{ weaponId: "weapon-0", weaponDefId: "weapon_sword_01", attackSeq: 1, worldX: 116, worldY: 116 }],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
    });
    effects = first.effects;

    const projectileEffect = effects.find((effect) => effect?.effectId === "effect_id_proj_basic_01");
    expect(projectileEffect).toBeTruthy();
    expect(projectileEffect.rotationRad).toBeCloseTo(0, 5);

    const expectedRotationRad = Math.atan2((300 + 16) - 116, (300 + 16) - 116);
    expect(Math.abs(expectedRotationRad)).toBeGreaterThan(0.1);

    for (let frame = 0; frame < 30; frame += 1) {
      const result = updateSkillChainCombat({
        dt: 1 / 60,
        dungeon,
        player,
        enemies,
        effects,
        weapons: [weaponRuntime],
        weaponStartEvents: [],
        weaponHitEvents: [],
        weaponDefinitionsById,
        skillDefinitionsById,
        buildEffectRuntime,
      });
      effects = result.effects;
    }

    const updatedProjectileEffect = effects.find((effect) => effect?.id === projectileEffect.id);
    expect(updatedProjectileEffect).toBeTruthy();
    expect(updatedProjectileEffect.rotationRad).toBeCloseTo(0, 5);
  });

  it("start_spawn_timing=hit の先頭Attackは weaponHitEvents で開始し、weaponStartEvents では開始しない", () => {
    const dungeon = createDungeon();
    const player = createPlayer();
    const skillDefinitionsById = createSkillDefinitions();
    const weaponDefinition = createWeaponDefinition([
      { id: "skill_id_explosion_01", plus: 0 },
      { id: "skill_id_poison_01", plus: 0 },
      { id: "skill_id_projectile_01", plus: 0 },
    ]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };

    const createWeaponRuntime = () => ({
      id: "weapon-0",
      weaponDefId: "weapon_sword_01",
      x: 100,
      y: 100,
      width: 32,
      height: 32,
      attackSeq: 1,
      skillInstances: weaponDefinition.skills,
    });

    const startOnlyWeapon = createWeaponRuntime();
    const startOnlyEnemies = [createEnemy("enemy-a", 160, 108, 220)];
    const startOnly = updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: startOnlyEnemies,
      effects: [],
      weapons: [startOnlyWeapon],
      weaponStartEvents: [{ weaponId: "weapon-0", weaponDefId: "weapon_sword_01", attackSeq: 1, worldX: 116, worldY: 116 }],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
    });
    const startOnlyExplosionEvents = startOnly.events.filter(
      (event) => event.sourceType === "skill" && event.skillId === "skill_id_explosion_01"
    );
    expect(startOnlyExplosionEvents).toHaveLength(0);

    const hitStartedWeapon = createWeaponRuntime();
    const hitStartedEnemies = [createEnemy("enemy-a", 160, 108, 220)];
    const hitStarted = updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: hitStartedEnemies,
      effects: [],
      weapons: [hitStartedWeapon],
      weaponStartEvents: [],
      weaponHitEvents: [{
        weaponId: "weapon-0",
        attackSeq: 1,
        enemyId: "enemy-a",
        worldX: 176,
        worldY: 124,
      }],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
    });
    const hitStartedExplosionEvents = hitStarted.events.filter(
      (event) => event.sourceType === "skill" && event.skillId === "skill_id_explosion_01"
    );
    expect(hitStartedExplosionEvents.length).toBeGreaterThan(0);
  });

  it("start_spawn_timing=hit は同一 weaponId+attackSeq+enemyId を1回だけ開始する", () => {
    const dungeon = createDungeon();
    const player = createPlayer();
    const skillDefinitionsById = createSkillDefinitions();
    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_explosion_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const weaponRuntime = {
      id: "weapon-0",
      weaponDefId: "weapon_sword_01",
      x: 100,
      y: 100,
      width: 32,
      height: 32,
      attackSeq: 1,
      skillInstances: weaponDefinition.skills,
    };
    const enemies = [createEnemy("enemy-a", 160, 108, 220)];

    const result = updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies,
      effects: [],
      weapons: [weaponRuntime],
      weaponStartEvents: [],
      weaponHitEvents: [
        { weaponId: "weapon-0", attackSeq: 1, enemyId: "enemy-a", worldX: 176, worldY: 124 },
        { weaponId: "weapon-0", attackSeq: 1, enemyId: "enemy-a", worldX: 176, worldY: 124 },
      ],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
    });

    const explosionEvents = result.events.filter(
      (event) => event.sourceType === "skill" && event.skillId === "skill_id_explosion_01"
    );
    expect(explosionEvents).toHaveLength(1);
  });

  it("start_spawn_timing=hit は同一attackSeqでも敵が異なれば開始する", () => {
    const dungeon = createDungeon();
    const player = createPlayer();
    const skillDefinitionsById = createSkillDefinitions();
    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_explosion_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const weaponRuntime = {
      id: "weapon-0",
      weaponDefId: "weapon_sword_01",
      x: 100,
      y: 100,
      width: 32,
      height: 32,
      attackSeq: 1,
      skillInstances: weaponDefinition.skills,
    };
    const enemies = [
      createEnemy("enemy-a", 160, 108, 220),
      createEnemy("enemy-b", 420, 320, 220),
    ];

    const result = updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies,
      effects: [],
      weapons: [weaponRuntime],
      weaponStartEvents: [],
      weaponHitEvents: [
        { weaponId: "weapon-0", attackSeq: 1, enemyId: "enemy-a", worldX: 176, worldY: 124 },
        { weaponId: "weapon-0", attackSeq: 1, enemyId: "enemy-b", worldX: 436, worldY: 336 },
      ],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
    });

    const explosionEvents = result.events.filter(
      (event) => event.sourceType === "skill" && event.skillId === "skill_id_explosion_01"
    );
    expect(explosionEvents).toHaveLength(2);
  });

  it("MAX_CHAIN_SPAWN により連鎖生成数が制限される", () => {
    const dungeon = createDungeon();
    const player = createPlayer();
    const skillDefinitionsById = {
      skill_id_big_aoe_01: {
        id: "skill_id_big_aoe_01",
        skillType: "attack",
        params: {
          attackKind: "aoe",
          baseDamage: 1,
          startSpawnTiming: "start",
          chainTrigger: "on_hit",
          hit: { hitNum: 1, pierceCount: 0 },
          aoe: { spriteEffectId: "effect_big_aoe", hitIntervalSec: 0 },
        },
      },
      skill_id_big_aoe_02: {
        id: "skill_id_big_aoe_02",
        skillType: "attack",
        params: {
          attackKind: "aoe",
          baseDamage: 1,
          startSpawnTiming: "hit",
          chainTrigger: "on_hit",
          hit: { hitNum: 1, pierceCount: 0 },
          aoe: { spriteEffectId: "effect_big_aoe", hitIntervalSec: 0 },
        },
      },
    };

    const weaponDefinition = createWeaponDefinition([
      { id: "skill_id_big_aoe_01", plus: 0 },
      { id: "skill_id_big_aoe_02", plus: 0 },
    ]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };

    const weaponRuntime = {
      id: "weapon-0",
      weaponDefId: "weapon_sword_01",
      x: 100,
      y: 100,
      width: 32,
      height: 32,
      attackSeq: 1,
      skillInstances: weaponDefinition.skills,
    };

    const enemies = [];
    for (let index = 0; index < 40; index += 1) {
      enemies.push(createEnemy(`enemy-${index}`, 128 + (index % 8) * 10, 128 + Math.floor(index / 8) * 10, 20));
    }

    const result = updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies,
      effects: [],
      weapons: [weaponRuntime],
      weaponStartEvents: [{ weaponId: "weapon-0", weaponDefId: "weapon_sword_01", attackSeq: 1, worldX: 116, worldY: 116 }],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
    });

    expect(result.events.length).toBeGreaterThan(0);
    const chainCount = weaponRuntime.skillChainRuntime?.chainSpawnCountByAttackSeq?.["1"] ?? 0;
    expect(chainCount).toBe(MAX_CHAIN_SPAWN);
  });

  it("敵チェーンの projectile(to_target) は player を狙って命中する", () => {
    const dungeon = createDungeon();
    const skillDefinitionsById = createSkillDefinitions();
    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_projectile_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 192,
      y: 96,
      hp: 200,
      maxHp: 200,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const enemy = createEnemyCaster("enemy-caster", 96, 96, weaponDefinition.skills);
    const weapon = enemy.attack.weapons[0];
    const buildEffectRuntime = createBuildEffectRuntime();

    let effects = [];
    const allEvents = [];
    const first = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects,
      weaponStartEvents: [{ weaponId: weapon.id, attackSeq: 1, worldX: 128, worldY: 128 }],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
      applyPlayerHpDamage: true,
    });

    effects = first.effects;
    allEvents.push(...first.events);

    const projectileEffect = effects.find((effect) => effect?.effectId === "effect_id_proj_basic_01");
    expect(projectileEffect).toBeTruthy();
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const expectedRotation = Math.atan2(playerCenterY - 128, playerCenterX - 128);
    expect(projectileEffect.rotationRad).toBeCloseTo(expectedRotation, 5);

    for (let frame = 0; frame < 240; frame += 1) {
      const result = updateEnemySkillChainCombat({
        dt: 1 / 60,
        dungeon,
        player,
        enemies: [enemy],
        effects,
        weaponStartEvents: [],
        weaponHitEvents: [],
        weaponDefinitionsById,
        skillDefinitionsById,
        buildEffectRuntime,
        applyPlayerHpDamage: true,
      });
      effects = result.effects;
      allEvents.push(...result.events);
    }

    expect(
      allEvents.some(
        (event) =>
          event?.kind === "damage" &&
          event?.targetType === "player" &&
          event?.sourceType === "skill" &&
          event?.skillId === "skill_id_projectile_01"
      )
    ).toBe(true);
    expect(player.hp).toBeLessThan(200);
  });

  it("enemy projectile は isRotate=false のとき回転せず固定向きを維持する", () => {
    const dungeon = createDungeon();
    const skillDefinitionsById = createSkillDefinitions();
    skillDefinitionsById.skill_id_projectile_01.params.projectile.isRotate = false;

    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_projectile_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 640,
      y: 640,
      hp: 200,
      maxHp: 200,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const enemy = createEnemyCaster("enemy-caster", 96, 96, weaponDefinition.skills);
    const weapon = enemy.attack.weapons[0];
    const buildEffectRuntime = createBuildEffectRuntime();

    let effects = [];
    const first = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects,
      weaponStartEvents: [{ weaponId: weapon.id, attackSeq: 1, worldX: 128, worldY: 128 }],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
      applyPlayerHpDamage: true,
    });
    effects = first.effects;

    const projectileEffect = effects.find((effect) => effect?.effectId === "effect_id_proj_basic_01");
    expect(projectileEffect).toBeTruthy();
    expect(projectileEffect.rotationRad).toBeCloseTo(0, 5);

    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const expectedRotation = Math.atan2(playerCenterY - 128, playerCenterX - 128);
    expect(Math.abs(expectedRotation)).toBeGreaterThan(0.1);

    for (let frame = 0; frame < 30; frame += 1) {
      const result = updateEnemySkillChainCombat({
        dt: 1 / 60,
        dungeon,
        player,
        enemies: [enemy],
        effects,
        weaponStartEvents: [],
        weaponHitEvents: [],
        weaponDefinitionsById,
        skillDefinitionsById,
        buildEffectRuntime,
        applyPlayerHpDamage: true,
      });
      effects = result.effects;
    }

    const updatedProjectileEffect = effects.find((effect) => effect?.id === projectileEffect.id);
    expect(updatedProjectileEffect).toBeTruthy();
    expect(updatedProjectileEffect.rotationRad).toBeCloseTo(0, 5);
  });

  it("不可視 skill専用敵武器（stop想定）でも start event から projectile を発射して player に命中する", () => {
    const dungeon = createDungeon();
    const skillDefinitionsById = {
      skill_id_bite_01: {
        id: "skill_id_bite_01",
        skillType: "attack",
        params: {
          attackKind: "projectile",
          baseDamage: 15,
          damageElement: "physical",
          startSpawnTiming: "start",
          chainTrigger: "on_hit",
          hit: { hitNum: 1, pierceCount: 0 },
          projectile: {
            speedTilePerSec: 10,
            lifeSec: 1.2,
            moveDirection: "to_target",
            spriteEffectId: "effect_id_proj_basic_01",
            disappearHitWall: false,
          },
        },
      },
    };
    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_bite_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_enemy_bite_01: {
        ...weaponDefinition,
        id: "weapon_enemy_bite_01",
      },
    };
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 192,
      y: 96,
      hp: 180,
      maxHp: 180,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const enemy = createEnemyCaster("enemy-stop-hidden", 96, 96, [{ id: "skill_id_bite_01", plus: 0 }]);
    const weapon = enemy.attack.weapons[0];
    weapon.weaponDefId = "weapon_enemy_bite_01";
    weapon.visible = false;
    weapon.supported = false;
    weapon.forceHidden = true;
    weapon.width = 1;
    weapon.height = 1;
    const buildEffectRuntime = createBuildEffectRuntime();

    let effects = [];
    const allEvents = [];
    const first = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects,
      weaponStartEvents: [{ weaponId: weapon.id, attackSeq: 1, worldX: 112, worldY: 112 }],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
      applyPlayerHpDamage: true,
    });
    effects = first.effects;
    allEvents.push(...first.events);

    for (let frame = 0; frame < 240; frame += 1) {
      const result = updateEnemySkillChainCombat({
        dt: 1 / 60,
        dungeon,
        player,
        enemies: [enemy],
        effects,
        weaponStartEvents: [],
        weaponHitEvents: [],
        weaponDefinitionsById,
        skillDefinitionsById,
        buildEffectRuntime,
        applyPlayerHpDamage: true,
      });
      effects = result.effects;
      allEvents.push(...result.events);
    }

    expect(
      allEvents.some(
        (event) =>
          event?.kind === "damage" &&
          event?.targetType === "player" &&
          event?.sourceType === "skill" &&
          event?.skillId === "skill_id_bite_01"
      )
    ).toBe(true);
    expect(player.hp).toBeLessThan(180);
  });

  it("敵スキルダメージは enemy.attackScale を反映して増加する", () => {
    const lowDamage = runEnemySingleSkillDamage({ attackScale: 1, damageMult: 1 });
    const highDamage = runEnemySingleSkillDamage({ attackScale: 2, damageMult: 1 });

    expect(highDamage).toBeGreaterThan(lowDamage);
    expect(highDamage / lowDamage).toBeCloseTo(2, 1);
  });

  it("敵スキルダメージは enemy.damageMult を反映して増加する", () => {
    const lowDamage = runEnemySingleSkillDamage({ attackScale: 1, damageMult: 1 });
    const highDamage = runEnemySingleSkillDamage({ attackScale: 1, damageMult: 2 });

    expect(highDamage).toBeGreaterThan(lowDamage);
    expect(highDamage / lowDamage).toBeCloseTo(2, 1);
  });

  it("敵チェーン start_spawn_timing=hit は targetId と legacy enemyId を受理し、重複を抑止する", () => {
    const dungeon = createDungeon();
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 192,
      y: 96,
      hp: 200,
      maxHp: 200,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const skillDefinitionsById = {
      skill_id_explosion_01: createSkillDefinitions().skill_id_explosion_01,
    };
    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_explosion_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const enemy = createEnemyCaster("enemy-hit", 96, 96, weaponDefinition.skills);
    const weapon = enemy.attack.weapons[0];
    const buildEffectRuntime = createBuildEffectRuntime();

    const result = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects: [],
      weaponStartEvents: [],
      weaponHitEvents: [
        { weaponId: weapon.id, attackSeq: 1, targetId: player.id, worldX: 208, worldY: 128 },
        { weaponId: weapon.id, attackSeq: 1, targetId: player.id, worldX: 208, worldY: 128 },
        { weaponId: weapon.id, attackSeq: 2, enemyId: player.id, worldX: 208, worldY: 128 },
      ],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
      applyPlayerHpDamage: true,
    });

    const explosionEvents = result.events.filter(
      (event) => event?.sourceType === "skill" && event?.skillId === "skill_id_explosion_01"
    );
    expect(explosionEvents).toHaveLength(2);
  });

  it("敵チェーンで poison が player に適用され DoT ダメージイベントが出る", () => {
    const dungeon = createDungeon();
    const skillDefinitionsById = createSkillDefinitions();
    const weaponDefinition = createWeaponDefinition([
      { id: "skill_id_projectile_01", plus: 0 },
      { id: "skill_id_poison_01", plus: 99 },
      { id: "skill_id_explosion_01", plus: 0 },
    ]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 192,
      y: 96,
      hp: 240,
      maxHp: 240,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const enemy = createEnemyCaster("enemy-poison", 96, 96, weaponDefinition.skills);
    const weapon = enemy.attack.weapons[0];
    const buildEffectRuntime = createBuildEffectRuntime();

    let effects = [];
    const allEvents = [];
    const first = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects,
      weaponStartEvents: [{ weaponId: weapon.id, attackSeq: 1, worldX: 128, worldY: 128 }],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
      applyPlayerHpDamage: true,
    });
    effects = first.effects;
    allEvents.push(...first.events);

    for (let frame = 0; frame < 240; frame += 1) {
      const result = updateEnemySkillChainCombat({
        dt: 1 / 60,
        dungeon,
        player,
        enemies: [enemy],
        effects,
        weaponStartEvents: [],
        weaponHitEvents: [],
        weaponDefinitionsById,
        skillDefinitionsById,
        buildEffectRuntime,
        applyPlayerHpDamage: true,
      });
      effects = result.effects;
      allEvents.push(...result.events);
    }

    expect((player?.ailments?.poison?.stacks ?? 0)).toBeGreaterThan(0);
    expect(
      allEvents.some(
        (event) =>
          event?.kind === "damage" &&
          event?.targetType === "player" &&
          event?.sourceType === "ailment" &&
          event?.ailmentId === "poison"
      )
    ).toBe(true);
  });

  it("敵チェーン applyPlayerHpDamage=false では HP と poison 状態を変えない", () => {
    const dungeon = createDungeon();
    const skillDefinitionsById = {
      skill_id_explosion_01: createSkillDefinitions().skill_id_explosion_01,
    };
    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_explosion_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 192,
      y: 96,
      hp: 180,
      maxHp: 180,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const enemy = createEnemyCaster("enemy-preview", 96, 96, weaponDefinition.skills);
    const weapon = enemy.attack.weapons[0];
    const buildEffectRuntime = createBuildEffectRuntime();

    const result = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects: [],
      weaponStartEvents: [],
      weaponHitEvents: [{ weaponId: weapon.id, attackSeq: 1, targetId: player.id, worldX: 208, worldY: 128 }],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
      applyPlayerHpDamage: false,
    });

    expect(
      result.events.some((event) => event?.kind === "damage" && event?.targetType === "player")
    ).toBe(true);
    expect(player.hp).toBe(180);
    expect((player?.ailments?.poison?.stacks ?? 0)).toBe(0);
  });

  it("非loop effect が消えたフレームで player チェーン projectile の当たり判定も消える", () => {
    const dungeon = createDungeon();
    const player = createPlayer();
    const skillDefinitionsById = createSkillDefinitions();
    skillDefinitionsById.skill_id_projectile_01.params.projectile.spriteEffectId = "effect_id_explosion_01";
    skillDefinitionsById.skill_id_projectile_01.params.projectile.lifeSec = 10;

    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_projectile_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const weaponRuntime = {
      id: "weapon-0",
      weaponDefId: "weapon_sword_01",
      x: 100,
      y: 100,
      width: 32,
      height: 32,
      attackSeq: 1,
      skillInstances: weaponDefinition.skills,
    };
    const enemies = [createEnemy("enemy-far", 768, 768, 220)];

    let effects = [];
    const buildEffectRuntime = createBuildEffectRuntime();
    const first = updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies,
      effects,
      weapons: [weaponRuntime],
      weaponStartEvents: [{ weaponId: "weapon-0", weaponDefId: "weapon_sword_01", attackSeq: 1, worldX: 116, worldY: 116 }],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
    });

    effects = first.effects;
    expect((weaponRuntime?.skillChainRuntime?.projectiles ?? [])).toHaveLength(1);
    expect(effects.some((effect) => effect?.effectId === "effect_id_explosion_01")).toBe(true);

    effects = updateEffects(effects, 2);
    expect(effects.some((effect) => effect?.effectId === "effect_id_explosion_01")).toBe(false);

    const second = updateSkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies,
      effects,
      weapons: [weaponRuntime],
      weaponStartEvents: [],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
    });

    expect((weaponRuntime?.skillChainRuntime?.projectiles ?? [])).toHaveLength(0);
    expect(
      second.events.some(
        (event) => event?.kind === "damage" && event?.sourceType === "skill" && event?.skillId === "skill_id_projectile_01"
      )
    ).toBe(false);
  });

  it("非loop effect が消えたフレームで enemy チェーン projectile の当たり判定も消える", () => {
    const dungeon = createDungeon();
    const skillDefinitionsById = createSkillDefinitions();
    skillDefinitionsById.skill_id_projectile_01.params.projectile.spriteEffectId = "effect_id_explosion_01";
    skillDefinitionsById.skill_id_projectile_01.params.projectile.lifeSec = 10;

    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_projectile_01", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 192,
      y: 96,
      hp: 180,
      maxHp: 180,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const enemy = createEnemyCaster("enemy-despawn", 96, 96, weaponDefinition.skills);
    const weapon = enemy.attack.weapons[0];

    let effects = [];
    const buildEffectRuntime = createBuildEffectRuntime();
    const first = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects,
      weaponStartEvents: [{ weaponId: weapon.id, attackSeq: 1, worldX: 128, worldY: 128 }],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
      applyPlayerHpDamage: true,
    });

    effects = first.effects;
    expect((weapon?.skillChainRuntime?.projectiles ?? [])).toHaveLength(1);
    expect(effects.some((effect) => effect?.effectId === "effect_id_explosion_01")).toBe(true);

    effects = updateEffects(effects, 2);
    expect(effects.some((effect) => effect?.effectId === "effect_id_explosion_01")).toBe(false);

    const hpBefore = player.hp;
    const second = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects,
      weaponStartEvents: [],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime,
      applyPlayerHpDamage: true,
    });

    expect((weapon?.skillChainRuntime?.projectiles ?? [])).toHaveLength(0);
    expect(
      second.events.some(
        (event) =>
          event?.kind === "damage" &&
          event?.targetType === "player" &&
          event?.sourceType === "skill" &&
          event?.skillId === "skill_id_projectile_01"
      )
    ).toBe(false);
    expect(player.hp).toBe(hpBefore);
  });

  it("enemy target_locked on_windup_start AoE spawns effect at locked target center", () => {
    const dungeon = createDungeon();
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 448,
      y: 448,
      hp: 200,
      maxHp: 200,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const skillDefinitionsById = {
      skill_id_target_locked_windup: {
        id: "skill_id_target_locked_windup",
        skillType: "attack",
        params: {
          attackKind: "aoe",
          baseDamage: 12,
          damageElement: "physical",
          startSpawnTiming: "start",
          chainTrigger: "on_hit",
          hit: { hitNum: 1, pierceCount: 0 },
          aoe: {
            spriteEffectId: "effect_id_explosion_01",
            hitIntervalSec: 0,
            targetPosition: "target_locked",
            positionLockTiming: "on_windup_start",
          },
        },
      },
    };
    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_target_locked_windup", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const enemy = createEnemyCaster("enemy-target-locked-start", 96, 96, weaponDefinition.skills);
    enemy.attack.lockedTargetX = 120;
    enemy.attack.lockedTargetY = 120;
    const weapon = enemy.attack.weapons[0];

    const result = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects: [],
      weaponStartEvents: [{ weaponId: weapon.id, attackSeq: 1, worldX: 888, worldY: 777 }],
      weaponHitEvents: [],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
      applyPlayerHpDamage: true,
    });

    const spawnedEffect = result.effects.find((effect) => effect?.effectId === "effect_id_explosion_01");
    expect(spawnedEffect).toBeTruthy();
    expect(spawnedEffect.x).toBe(120);
    expect(spawnedEffect.y).toBe(120);
    expect(result.events.some((event) => event?.kind === "damage" && event?.targetType === "player")).toBe(false);
    expect(player.hp).toBe(200);
  });

  it("enemy target_locked on_fire AoE uses player center even on hit-triggered entry", () => {
    const dungeon = createDungeon();
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: 192,
      y: 96,
      hp: 180,
      maxHp: 180,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const skillDefinitionsById = {
      skill_id_target_locked_fire: {
        id: "skill_id_target_locked_fire",
        skillType: "attack",
        params: {
          attackKind: "aoe",
          baseDamage: 12,
          damageElement: "physical",
          startSpawnTiming: "hit",
          chainTrigger: "on_hit",
          hit: { hitNum: 1, pierceCount: 0 },
          aoe: {
            spriteEffectId: "effect_id_explosion_01",
            hitIntervalSec: 0,
            targetPosition: "target_locked",
            positionLockTiming: "on_fire",
          },
        },
      },
    };
    const weaponDefinition = createWeaponDefinition([{ id: "skill_id_target_locked_fire", plus: 0 }]);
    const weaponDefinitionsById = {
      weapon_sword_01: weaponDefinition,
    };
    const enemy = createEnemyCaster("enemy-target-locked-hit", 96, 96, weaponDefinition.skills);
    enemy.attack.lockedTargetX = 120;
    enemy.attack.lockedTargetY = 120;
    const weapon = enemy.attack.weapons[0];

    const result = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon,
      player,
      enemies: [enemy],
      effects: [],
      weaponStartEvents: [],
      weaponHitEvents: [{ weaponId: weapon.id, attackSeq: 1, targetId: player.id, worldX: 888, worldY: 777 }],
      weaponDefinitionsById,
      skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
      applyPlayerHpDamage: true,
    });

    const spawnedEffect = result.effects.find((effect) => effect?.effectId === "effect_id_explosion_01");
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    expect(spawnedEffect).toBeTruthy();
    expect(spawnedEffect.x).toBe(playerCenterX);
    expect(spawnedEffect.y).toBe(playerCenterY);
  });

  function createBossActionIsolationScenario(
    activeActionWeaponId,
    { includeChargeProjectileSkill = false, playerX = 192, playerY = 96, startEventWorldX, startEventWorldY } = {}
  ) {
    const dungeon = createDungeon();
    const player = {
      ...createPlayer(),
      id: "player-main",
      x: playerX,
      y: playerY,
      hp: 200,
      maxHp: 200,
      hitFlashTimerSec: 0,
      hitFlashDurationSec: 0.12,
      ailmentTakenMult: 1,
    };
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;

    const skillDefinitionsById = {
      skill_id_boss_press_aoe: {
        id: "skill_id_boss_press_aoe",
        skillType: "attack",
        params: {
          attackKind: "aoe",
          baseDamage: 20,
          damageElement: "physical",
          startSpawnTiming: "start",
          chainTrigger: "on_hit",
          hit: { hitNum: 1, pierceCount: 0 },
          aoe: {
            spriteEffectId: "effect_id_explosion_01",
            hitIntervalSec: 0,
          },
        },
      },
    };
    if (includeChargeProjectileSkill) {
      skillDefinitionsById.skill_id_boss_charge_projectile = {
        id: "skill_id_boss_charge_projectile",
        skillType: "attack",
        params: {
          attackKind: "projectile",
          baseDamage: 8,
          damageElement: "physical",
          startSpawnTiming: "start",
          chainTrigger: "on_hit",
          hit: { hitNum: 1, pierceCount: 0 },
          projectile: {
            speedTilePerSec: 4,
            lifeSec: 2,
            moveDirection: "to_target",
            spriteEffectId: "effect_id_proj_basic_01",
            disappearHitWall: false,
          },
        },
      };
    }

    const chargeSkills = includeChargeProjectileSkill ? [{ id: "skill_id_boss_charge_projectile", plus: 0 }] : [];
    const pressSkills = [{ id: "skill_id_boss_press_aoe", plus: 0 }];
    const summonSkills = [];
    const weaponDefinitionsById = {
      weapon_boss_charge: { ...createWeaponDefinition(chargeSkills), id: "weapon_boss_charge" },
      weapon_boss_press: { ...createWeaponDefinition(pressSkills), id: "weapon_boss_press" },
      weapon_boss_summon: { ...createWeaponDefinition(summonSkills), id: "weapon_boss_summon" },
    };

    const enemy = createEnemyCaster("boss-action-isolation", 96, 96, []);
    enemy.attack.isBoss = true;
    enemy.attack.attackCycle = 1;
    enemy.attack.activeActionWeaponId = activeActionWeaponId;
    enemy.attack.weapons = [
      {
        id: "boss-weapon-charge",
        weaponDefId: "weapon_boss_charge",
        x: 112,
        y: 112,
        width: 32,
        height: 32,
        skillInstances: chargeSkills.map((skill) => ({ ...skill })),
      },
      {
        id: "boss-weapon-press",
        weaponDefId: "weapon_boss_press",
        x: 112,
        y: 112,
        width: 32,
        height: 32,
        skillInstances: pressSkills.map((skill) => ({ ...skill })),
      },
      {
        id: "boss-weapon-summon",
        weaponDefId: "weapon_boss_summon",
        x: 112,
        y: 112,
        width: 32,
        height: 32,
        skillInstances: summonSkills.map((skill) => ({ ...skill })),
      },
    ];

    const worldX = Number.isFinite(startEventWorldX) ? startEventWorldX : playerCenterX;
    const worldY = Number.isFinite(startEventWorldY) ? startEventWorldY : playerCenterY;
    const startEvents = enemy.attack.weapons.map((weapon) => ({
      weaponId: weapon.id,
      attackSeq: 1,
      worldX,
      worldY,
    }));

    return {
      dungeon,
      player,
      enemy,
      weaponDefinitionsById,
      skillDefinitionsById,
      startEvents,
    };
  }

  it("boss activeActionWeaponId=summon では全武器start eventが来ても press AoE が発火しない", () => {
    const scenario = createBossActionIsolationScenario("boss-weapon-summon");
    const result = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon: scenario.dungeon,
      player: scenario.player,
      enemies: [scenario.enemy],
      effects: [],
      weaponStartEvents: scenario.startEvents,
      weaponHitEvents: [],
      weaponDefinitionsById: scenario.weaponDefinitionsById,
      skillDefinitionsById: scenario.skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
      applyPlayerHpDamage: true,
    });

    const pressDamageEvents = result.events.filter(
      (event) => event?.kind === "damage" && event?.targetType === "player" && event?.skillId === "skill_id_boss_press_aoe"
    );
    expect(pressDamageEvents).toHaveLength(0);
    expect(result.effects.some((effect) => effect?.effectId === "effect_id_explosion_01")).toBe(false);
    expect(scenario.player.hp).toBe(200);
  });

  it("boss activeActionWeaponId=charge では全武器start eventが来ても press AoE が発火しない", () => {
    const scenario = createBossActionIsolationScenario("boss-weapon-charge");
    const result = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon: scenario.dungeon,
      player: scenario.player,
      enemies: [scenario.enemy],
      effects: [],
      weaponStartEvents: scenario.startEvents,
      weaponHitEvents: [],
      weaponDefinitionsById: scenario.weaponDefinitionsById,
      skillDefinitionsById: scenario.skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
      applyPlayerHpDamage: true,
    });

    const pressDamageEvents = result.events.filter(
      (event) => event?.kind === "damage" && event?.targetType === "player" && event?.skillId === "skill_id_boss_press_aoe"
    );
    expect(pressDamageEvents).toHaveLength(0);
    expect(result.effects.some((effect) => effect?.effectId === "effect_id_explosion_01")).toBe(false);
    expect(scenario.player.hp).toBe(200);
  });

  it("boss activeActionWeaponId=press のときは従来どおり press AoE が発火する", () => {
    const scenario = createBossActionIsolationScenario("boss-weapon-press");
    const result = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon: scenario.dungeon,
      player: scenario.player,
      enemies: [scenario.enemy],
      effects: [],
      weaponStartEvents: scenario.startEvents,
      weaponHitEvents: [],
      weaponDefinitionsById: scenario.weaponDefinitionsById,
      skillDefinitionsById: scenario.skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
      applyPlayerHpDamage: true,
    });

    const pressDamageEvents = result.events.filter(
      (event) => event?.kind === "damage" && event?.targetType === "player" && event?.skillId === "skill_id_boss_press_aoe"
    );
    expect(pressDamageEvents.length).toBeGreaterThan(0);
    expect(result.effects.some((effect) => effect?.effectId === "effect_id_explosion_01")).toBe(true);
    expect(scenario.player.hp).toBeLessThan(200);
  });

  it("boss 非アクティブ武器でも進行中projectileは継続更新される", () => {
    const scenario = createBossActionIsolationScenario("boss-weapon-charge", {
      includeChargeProjectileSkill: true,
      playerX: 480,
      playerY: 480,
      startEventWorldX: 112,
      startEventWorldY: 112,
    });
    const first = updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon: scenario.dungeon,
      player: scenario.player,
      enemies: [scenario.enemy],
      effects: [],
      weaponStartEvents: [scenario.startEvents[0]],
      weaponHitEvents: [],
      weaponDefinitionsById: scenario.weaponDefinitionsById,
      skillDefinitionsById: scenario.skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
      applyPlayerHpDamage: true,
    });

    const chargeWeapon = scenario.enemy.attack.weapons[0];
    const firstProjectile = chargeWeapon?.skillChainRuntime?.projectiles?.[0];
    expect(firstProjectile).toBeTruthy();
    const xBefore = firstProjectile.x;

    scenario.enemy.attack.activeActionWeaponId = "boss-weapon-summon";
    updateEnemySkillChainCombat({
      dt: 1 / 60,
      dungeon: scenario.dungeon,
      player: scenario.player,
      enemies: [scenario.enemy],
      effects: first.effects,
      weaponStartEvents: [],
      weaponHitEvents: [],
      weaponDefinitionsById: scenario.weaponDefinitionsById,
      skillDefinitionsById: scenario.skillDefinitionsById,
      buildEffectRuntime: createBuildEffectRuntime(),
      applyPlayerHpDamage: true,
    });

    const continuedProjectile = chargeWeapon?.skillChainRuntime?.projectiles?.[0];
    expect(continuedProjectile).toBeTruthy();
    expect(continuedProjectile.x).toBeGreaterThan(xBefore);
  });
});
