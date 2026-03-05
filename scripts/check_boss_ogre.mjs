import { clampFloor, resolveDungeonIdForFloor } from "../src/dungeon/floorProgression.js";
import { createEnemies, getEnemyTelegraphPrimitives, updateEnemyAttacks } from "../src/enemy/enemySystem.js";
import { generateDungeon } from "../src/generation/dungeonGenerator.js";
import { validateDungeon } from "../src/generation/layoutValidator.js";

const BOSS_START_MIN_DISTANCE_TILES = 10;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createBossDefinition() {
  return {
    id: "Ogre",
    type: "walk",
    width: 32,
    height: 64,
    fps: 12,
    pngFacingDirection: "right",
    imageMagnification: 1,
    noticeDistance: 8,
    giveupDistance: 999,
    rank: "boss",
    role: "boss",
    vit: 18,
    for: 12,
    agi: 1,
    pow: 18,
    tec: 1,
    arc: 1,
    tags: ["boss", "heavy"],
  };
}

function createBossAttackProfile() {
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
      summon: { weaponIndex: 2, cooldownSec: 0.2, minionCountLt: 3, windupSec: 0.02, recoverSec: 0.01 },
      charge: {
        weaponIndex: 0,
        cooldownSec: 0.2,
        targetDistanceGte: 2,
        windupSec: 0.05,
        recoverSec: 0.01,
      },
      press: {
        weaponIndex: 1,
        cooldownSec: 0.2,
        targetDistanceLte: 2,
        windupSec: 0.05,
        recoverSec: 0.01,
      },
      chase: { repathIntervalSec: 0.2 },
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
  };
}

function main() {
  assert(clampFloor(99) === 10, "clampFloor(99) must be 10");
  assert(resolveDungeonIdForFloor(10) === "dungeon_id_10", "floor 10 must resolve to dungeon_id_10");

  const dungeon = generateDungeon({
    seed: "check-boss-ogre",
    wallHeightTiles: 3,
    bossFloor: true,
  });
  const validation = validateDungeon(dungeon);
  assert(validation.ok === true, `boss dungeon validation failed: ${validation.errors.join(", ")}`);
  assert(dungeon.isBossFloor === true, "dungeon must be boss floor");
  assert(dungeon.bossArena && dungeon.bossArena.pillars.length >= 2, "boss arena pillars must exist");
  const startBossDistance =
    Math.abs(Math.floor(dungeon.bossArena.startTile.tileX) - Math.floor(dungeon.bossArena.bossTile.tileX)) +
    Math.abs(Math.floor(dungeon.bossArena.startTile.tileY) - Math.floor(dungeon.bossArena.bossTile.tileY));
  assert(
    startBossDistance >= BOSS_START_MIN_DISTANCE_TILES,
    `boss start-to-boss distance must be >= ${BOSS_START_MIN_DISTANCE_TILES}, got ${startBossDistance}`
  );

  const bossDefinition = createBossDefinition();
  const enemies = createEnemies(
    dungeon,
    [bossDefinition],
    "check-boss-ogre-spawn",
    {
      [bossDefinition.id]: createBossAttackProfile(),
    },
    {
      fixedSpawns: [
        {
          enemyDbId: bossDefinition.id,
          tileX: dungeon.bossArena.bossTile.tileX,
          tileY: dungeon.bossArena.bossTile.tileY,
        },
      ],
      useFixedSpawnsOnly: true,
    }
  );
  assert(enemies.length === 1, "boss must spawn exactly once");
  const [boss] = enemies;
  boss.behaviorMode = "chase";
  boss.isChasing = true;

  const player = {
    x: boss.x + 64,
    y: boss.y + 64,
    width: 32,
    height: 64,
    footHitboxHeight: 32,
    hp: 100,
    maxHp: 100,
    hitFlashTimerSec: 0,
    hitFlashDurationSec: 0.12,
    facing: "down",
    isDead: false,
  };

  let telegraphSeen = false;
  let summonSeen = false;
  updateEnemyAttacks(enemies, player, dungeon, 0.005);
  telegraphSeen = getEnemyTelegraphPrimitives(boss).some(
    (telegraph) => telegraph.kind === "line" || telegraph.kind === "circle"
  );
  for (let i = 0; i < 30; i += 1) {
    const events = updateEnemyAttacks(enemies, player, dungeon, 0.02);
    if (getEnemyTelegraphPrimitives(boss).some((telegraph) => telegraph.kind === "line" || telegraph.kind === "circle")) {
      telegraphSeen = true;
    }
    if (events.some((event) => event.kind === "summon_request")) {
      summonSeen = true;
      break;
    }
  }

  assert(telegraphSeen === true, "boss telegraph must be emitted");
  assert(summonSeen === true, "boss summon_request must be emitted");

  console.log("[check_boss_ogre] PASS");
}

main();
