import { describe, expect, it } from "vitest";
import {
  MAX_CHAIN_SPAWN,
  resolveWeaponSkillPlan,
  updateSkillChainCombat,
} from "../../src/combat/skillChainSystem.js";

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
});
