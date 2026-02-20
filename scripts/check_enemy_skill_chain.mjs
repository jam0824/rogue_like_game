import { updateEnemySkillChainCombat } from "../src/combat/skillChainSystem.js";
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
    seed: "check-enemy-skill-chain-dungeon",
    gridWidth: width,
    gridHeight: height,
    floorGrid: walkableGrid,
    walkableGrid,
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

    const id = `check-enemy-skill-chain-effect-${seq}`;
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

function createPlayer(overrides = {}) {
  return {
    id: "player-main",
    x: 192,
    y: 96,
    width: 32,
    height: 64,
    hp: 220,
    maxHp: 220,
    facing: "left",
    pointerActive: false,
    target: null,
    hitFlashTimerSec: 0,
    hitFlashDurationSec: 0.12,
    ailmentTakenMult: 1,
    ...overrides,
  };
}

function createEnemyWithWeapon(skills) {
  const weapon = {
    id: "enemy-0-weapon-0",
    weaponDefId: "weapon_sword_01",
    x: 112,
    y: 112,
    width: 32,
    height: 32,
    skillInstances: skills,
  };

  const enemy = {
    id: "enemy-0",
    x: 96,
    y: 96,
    width: 32,
    height: 32,
    facing: "right",
    isDead: false,
    damageSeed: "enemy-skill-seed",
    damageMult: 1,
    critChance: 0,
    critMult: 1.5,
    attackScale: 1,
    statTotals: { arc: 0 },
    attack: {
      attackCycle: 1,
      weapons: [weapon],
    },
  };

  return { enemy, weapon };
}

function runPrimaryScenario() {
  const dungeon = createDungeon();
  const player = createPlayer();
  const skillDefinitionsById = createSkillDefinitions();
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

  const { enemy, weapon } = createEnemyWithWeapon(weaponDefinitionsById.weapon_sword_01.skills);
  const enemies = [enemy];

  const buildEffectRuntime = createBuildEffectRuntime();
  let effects = [];
  const allEvents = [];

  const first = updateEnemySkillChainCombat({
    dt: DT,
    dungeon,
    player,
    enemies,
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
  assert(projectileEffect, "projectile effect runtime was not spawned for enemy chain");
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const expectedRotation = Math.atan2(playerCenterY - 128, playerCenterX - 128);
  assert(
    Math.abs(projectileEffect.rotationRad - expectedRotation) < 0.001,
    "enemy projectile rotation did not point to player target"
  );

  for (let frame = 0; frame < 240; frame += 1) {
    const result = updateEnemySkillChainCombat({
      dt: DT,
      dungeon,
      player,
      enemies,
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

  const hasSkillDamageToPlayer = allEvents.some(
    (event) => event?.kind === "damage" && event?.targetType === "player" && event?.sourceType === "skill" && event?.damage > 0
  );
  const hasPoisonDotToPlayer = allEvents.some(
    (event) => event?.kind === "damage" && event?.targetType === "player" && event?.sourceType === "ailment" && event?.ailmentId === "poison" && event?.damage > 0
  );

  assert(hasSkillDamageToPlayer, "enemy skill-chain did not emit player skill damage events");
  assert(hasPoisonDotToPlayer, "enemy skill-chain did not emit player poison DoT events");
  assert(player.hp < player.maxHp, "enemy skill-chain did not reduce player HP");
  assert((player?.ailments?.poison?.stacks ?? 0) > 0, "enemy skill-chain did not apply poison stacks to player");
}

function runPreviewScenario() {
  const dungeon = createDungeon();
  const player = createPlayer({
    id: "player-preview",
    hp: 100,
    maxHp: 100,
  });
  const skillDefinitionsById = {
    skill_id_explosion_01: {
      id: "skill_id_explosion_01",
      skillType: "attack",
      params: {
        attackKind: "aoe",
        baseDamage: 20,
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
      skills: [{ id: "skill_id_explosion_01", plus: 0 }],
    },
  };
  const { enemy, weapon } = createEnemyWithWeapon(weaponDefinitionsById.weapon_sword_01.skills);
  const enemies = [enemy];

  const result = updateEnemySkillChainCombat({
    dt: DT,
    dungeon,
    player,
    enemies,
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
    applyPlayerHpDamage: false,
  });

  const hasPreviewDamageEvent = result.events.some(
    (event) => event?.kind === "damage" && event?.targetType === "player" && event?.sourceType === "skill"
  );

  assert(hasPreviewDamageEvent, "preview mode did not emit enemy skill-chain damage event");
  assert(player.hp === 100, "preview mode should not reduce player HP");
  assert((player?.ailments?.poison?.stacks ?? 0) === 0, "preview mode should not apply poison stacks");
}

function main() {
  runPrimaryScenario();
  runPreviewScenario();
  runNonLoopEffectDespawnScenario();
  console.log("[check_enemy_skill_chain] PASS");
}

function runNonLoopEffectDespawnScenario() {
  const dungeon = createDungeon();
  const player = createPlayer({
    id: "player-non-loop",
    x: 192,
    y: 96,
    hp: 150,
    maxHp: 150,
  });
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
  const { enemy, weapon } = createEnemyWithWeapon(weaponDefinitionsById.weapon_sword_01.skills);
  const enemies = [enemy];
  const buildEffectRuntime = createBuildEffectRuntime();

  let effects = [];
  const first = updateEnemySkillChainCombat({
    dt: DT,
    dungeon,
    player,
    enemies,
    effects,
    weaponStartEvents: [{ weaponId: weapon.id, attackSeq: 1, worldX: 128, worldY: 128 }],
    weaponHitEvents: [],
    weaponDefinitionsById,
    skillDefinitionsById,
    buildEffectRuntime,
    applyPlayerHpDamage: true,
  });
  effects = first.effects;
  assert((weapon?.skillChainRuntime?.projectiles?.length ?? 0) === 1, "non-loop enemy projectile was not spawned");

  effects = updateEffects(effects, 2);
  assert(
    !effects.some((effect) => effect?.effectId === "effect_id_explosion_01"),
    "non-loop enemy projectile effect should disappear before linkage check"
  );

  const hpBefore = player.hp;
  const second = updateEnemySkillChainCombat({
    dt: DT,
    dungeon,
    player,
    enemies,
    effects,
    weaponStartEvents: [],
    weaponHitEvents: [],
    weaponDefinitionsById,
    skillDefinitionsById,
    buildEffectRuntime,
    applyPlayerHpDamage: true,
  });

  const hasProjectileDamage = second.events.some(
    (event) =>
      event?.kind === "damage" &&
      event?.targetType === "player" &&
      event?.sourceType === "skill" &&
      event?.skillId === "skill_id_projectile_non_loop"
  );
  assert(!hasProjectileDamage, "enemy projectile should not deal damage after linked non-loop effect ended");
  assert((weapon?.skillChainRuntime?.projectiles?.length ?? 0) === 0, "enemy projectile hitbox was not despawned immediately");
  assert(player.hp === hpBefore, "player HP changed even though projectile should have despawned");
}

main();
