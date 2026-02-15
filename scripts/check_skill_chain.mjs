import { updateSkillChainCombat } from "../src/combat/skillChainSystem.js";

const DT = 1 / 60;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createDungeon() {
  const width = 64;
  const height = 64;
  const walkableGrid = Array.from({ length: height }, () => Array.from({ length: width }, () => true));

  return {
    seed: "check-skill-chain-dungeon",
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
    damageSeed: "check-skill-chain-player-seed",
    damageMult: 1,
    critChance: 0,
    critMult: 1.5,
    statTotals: {
      arc: 0,
    },
  };
}

function createEnemy(id, x, y, hp = 220) {
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

function createBuildEffectRuntime() {
  let seq = 0;
  return (effectId, x, y) => {
    const map = {
      effect_id_proj_basic_01: { width: 16, height: 16, loop: true },
      effect_id_explosion_01: { width: 80, height: 80, loop: false },
    };

    const config = map[effectId];
    if (!config) {
      return null;
    }

    const id = `check-skill-chain-effect-${seq}`;
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
      animationDirection: "horizontal",
      scale: 1,
      blendMode: "normal",
      loop: config.loop,
    };
  };
}

function main() {
  const dungeon = createDungeon();
  const player = createPlayer();

  const skillDefinitionsById = {
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

  const weaponDefinitionsById = {
    weapon_sword_01: {
      id: "weapon_sword_01",
      skills: [
        { id: "skill_id_projectile_01", plus: 0 },
        { id: "skill_id_poison_01", plus: 99 },
        { id: "skill_id_explosion_01", plus: 0 },
      ],
    },
  };

  const weaponRuntime = {
    id: "weapon-0",
    weaponDefId: "weapon_sword_01",
    x: 100,
    y: 100,
    width: 32,
    height: 32,
    attackSeq: 1,
    skillInstances: weaponDefinitionsById.weapon_sword_01.skills,
  };

  const enemies = [
    createEnemy("enemy-a", 160, 108),
    createEnemy("enemy-b", 188, 108),
  ];

  const buildEffectRuntime = createBuildEffectRuntime();
  let effects = [];
  const allEvents = [];

  const first = updateSkillChainCombat({
    dt: DT,
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
  assert(projectileEffect, "projectile effect runtime was not spawned");
  assert(
    Number.isFinite(projectileEffect.rotationRad) && Math.abs(projectileEffect.rotationRad) > 0.0001,
    "projectile effect rotation was not set from direction"
  );

  for (let frame = 0; frame < 240; frame += 1) {
    const result = updateSkillChainCombat({
      dt: DT,
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

  const hasProjectileDamage = allEvents.some(
    (event) => event.sourceType === "skill" && event.skillId === "skill_id_projectile_01" && event.damage > 0
  );
  const hasExplosionDamage = allEvents.some(
    (event) => event.sourceType === "skill" && event.skillId === "skill_id_explosion_01" && event.damage > 0
  );
  const hasPoisonDot = allEvents.some(
    (event) => event.sourceType === "ailment" && event.ailmentId === "poison" && event.damage > 0
  );

  assert(hasProjectileDamage, "projectile damage event was not emitted");
  assert(hasExplosionDamage, "explosion damage event was not emitted");
  assert(hasPoisonDot, "poison dot event was not emitted");

  console.log("[check_skill_chain] PASS");
}

main();
