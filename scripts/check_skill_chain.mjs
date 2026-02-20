import { applyHitFlashColorsFromDamageEvents, POISON_HIT_FLASH_COLOR } from "../src/combat/hitFlashSystem.js";
import { updateSkillChainCombat } from "../src/combat/skillChainSystem.js";
import { updateEffects } from "../src/effect/effectSystem.js";

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
  let observedPoisonGreenFlash = false;

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
  applyHitFlashColorsFromDamageEvents({ events: first.events, player, enemies });
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
    applyHitFlashColorsFromDamageEvents({ events: result.events, player, enemies });

    const poisonEvents = result.events.filter(
      (event) => event?.kind === "damage" && event?.targetType === "enemy" && event?.ailmentId === "poison"
    );
    if (poisonEvents.length > 0) {
      for (const event of poisonEvents) {
        const enemy = enemies.find((item) => item?.id === event.enemyId);
        if (enemy?.hitFlashColor === POISON_HIT_FLASH_COLOR) {
          observedPoisonGreenFlash = true;
          break;
        }
      }
    }
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
  assert(observedPoisonGreenFlash, "poison dot did not switch hit flash color to green");
  runNonLoopEffectDespawnScenario();

  console.log("[check_skill_chain] PASS");
}

function runNonLoopEffectDespawnScenario() {
  const dungeon = createDungeon();
  const player = createPlayer();
  const skillDefinitionsById = {
    skill_id_projectile_non_loop: {
      id: "skill_id_projectile_non_loop",
      skillType: "attack",
      params: {
        attackKind: "projectile",
        baseDamage: 10,
        damageElement: "physical",
        startSpawnTiming: "start",
        chainTrigger: "on_hit",
        hit: { hitNum: 1, pierceCount: 0 },
        projectile: {
          speedTilePerSec: 8,
          lifeSec: 5,
          moveDirection: "to_target",
          spriteEffectId: "effect_id_explosion_01",
          disappearHitWall: false,
        },
      },
    },
  };
  const weaponDefinitionsById = {
    weapon_sword_01: {
      id: "weapon_sword_01",
      skills: [{ id: "skill_id_projectile_non_loop", plus: 0 }],
    },
  };
  const weaponRuntime = {
    id: "weapon-non-loop",
    weaponDefId: "weapon_sword_01",
    x: 100,
    y: 100,
    width: 32,
    height: 32,
    attackSeq: 1,
    skillInstances: weaponDefinitionsById.weapon_sword_01.skills,
  };
  const enemies = [createEnemy("enemy-far", 768, 768)];
  const buildEffectRuntime = createBuildEffectRuntime();

  let effects = [];
  const first = updateSkillChainCombat({
    dt: DT,
    dungeon,
    player,
    enemies,
    effects,
    weapons: [weaponRuntime],
    weaponStartEvents: [{ weaponId: weaponRuntime.id, attackSeq: 1, worldX: 116, worldY: 116 }],
    weaponDefinitionsById,
    skillDefinitionsById,
    buildEffectRuntime,
  });
  effects = first.effects;
  assert((weaponRuntime?.skillChainRuntime?.projectiles?.length ?? 0) === 1, "non-loop projectile was not spawned");

  effects = updateEffects(effects, 2);
  assert(
    !effects.some((effect) => effect?.effectId === "effect_id_explosion_01"),
    "non-loop projectile effect should disappear before linkage check"
  );

  const second = updateSkillChainCombat({
    dt: DT,
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

  const hasProjectileDamage = second.events.some(
    (event) =>
      event?.kind === "damage" &&
      event?.sourceType === "skill" &&
      event?.skillId === "skill_id_projectile_non_loop" &&
      event?.targetType === "enemy"
  );
  assert(!hasProjectileDamage, "projectile should not deal damage after linked non-loop effect ended");
  assert((weaponRuntime?.skillChainRuntime?.projectiles?.length ?? 0) === 0, "projectile hitbox was not despawned immediately");
}

main();
