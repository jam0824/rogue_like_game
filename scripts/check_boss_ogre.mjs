import { deriveSeed } from "../src/core/rng.js";
import { clampFloor, resolveDungeonIdForFloor } from "../src/dungeon/floorProgression.js";
import { createEnemies, getEnemyTelegraphPrimitives, updateEnemyAttacks } from "../src/enemy/enemySystem.js";
import { generateDungeon } from "../src/generation/dungeonGenerator.js";
import { validateDungeon } from "../src/generation/layoutValidator.js";

const TILE_SIZE = 32;
const BOSS_START_MIN_DISTANCE_TILES = 10;
const CHECK_STEP_DT = 0.005;

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

function createMinionDefinition() {
  return {
    id: "OgreMinion_01",
    type: "walk",
    width: 32,
    height: 32,
    fps: 12,
    pngFacingDirection: "right",
    imageMagnification: 1.5,
    noticeDistance: 6,
    giveupDistance: 999,
    rank: "normal",
    role: "swarm",
    spawn: { min: 1, max: 1 },
    vit: 6,
    for: 4,
    agi: 3,
    pow: 8,
    tec: 1,
    arc: 1,
    tags: ["summoned", "minion"],
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

function buildBlockedEnemyTilesFromRuntime(enemies) {
  const blocked = new Set();
  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || enemy.isDead === true) {
      continue;
    }
    const centerX = Number(enemy.x) + Number(enemy.width) / 2;
    const centerY = Number(enemy.y) + Number(enemy.height) / 2;
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      continue;
    }
    blocked.add(`${Math.floor(centerX / TILE_SIZE)}:${Math.floor(centerY / TILE_SIZE)}`);
  }
  return blocked;
}

function createExistingEnemyIdSet(enemies) {
  const ids = new Set();
  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || typeof enemy.id !== "string" || enemy.id.length <= 0) {
      continue;
    }
    ids.add(enemy.id);
  }
  return ids;
}

function resolveSummonIdentity(event, fallbackIndex, existingEnemyIds) {
  const fallback = Math.max(0, Math.floor(Number(fallbackIndex) || 0));
  const summonerEnemyId =
    typeof event?.summonerEnemyId === "string" && event.summonerEnemyId.length > 0
      ? event.summonerEnemyId
      : "summoner";
  const hasSummonCastSeq = Number.isFinite(event?.summonCastSeq);
  const hasSummonSpawnIndex = Number.isFinite(event?.summonSpawnIndex);
  const summonCastSeq = hasSummonCastSeq ? Math.max(0, Math.floor(Number(event.summonCastSeq))) : null;
  const summonSpawnIndex = hasSummonSpawnIndex ? Math.max(0, Math.floor(Number(event.summonSpawnIndex))) : fallback;
  const baseId =
    summonCastSeq !== null
      ? `${summonerEnemyId}-summon-c${summonCastSeq}-s${summonSpawnIndex}`
      : `${summonerEnemyId}-summon-${summonSpawnIndex}`;
  const baseSeedKey =
    summonCastSeq !== null
      ? `summon:${summonerEnemyId}:cast:${summonCastSeq}:spawn:${summonSpawnIndex}`
      : `summon:${summonerEnemyId}:${summonSpawnIndex}`;

  let enemyId = baseId;
  let revision = 0;
  while (existingEnemyIds.has(enemyId)) {
    revision += 1;
    enemyId = `${baseId}-r${revision}`;
  }
  existingEnemyIds.add(enemyId);

  return {
    enemyId,
    summonSeedKey: revision > 0 ? `${baseSeedKey}:rev:${revision}` : baseSeedKey,
  };
}

function countSummonTelegraphs(enemy) {
  return getEnemyTelegraphPrimitives(enemy).filter((telegraph) => telegraph.kind === "circle").length;
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
  const minionDefinition = createMinionDefinition();
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

  const seenSummonedEnemyIds = new Set();
  const summonCycleChecks = [];
  let pendingSummonTelegraphCount = 0;

  for (let step = 0; step < 1200; step += 1) {
    const events = updateEnemyAttacks(enemies, player, dungeon, CHECK_STEP_DT);
    if (boss.attack?.activeActionKey === "summon" && boss.attack?.actionState === "windup") {
      pendingSummonTelegraphCount = countSummonTelegraphs(boss);
    }

    const summonEvents = events.filter((event) => event.kind === "summon_request");
    if (summonEvents.length <= 0) {
      continue;
    }

    assert(pendingSummonTelegraphCount > 0, "summon telegraph count must be captured before summon_request");
    assert(
      pendingSummonTelegraphCount === summonEvents.length,
      `summon telegraph count (${pendingSummonTelegraphCount}) must equal summon_request count (${summonEvents.length})`
    );

    const seenSpawnIndexByCast = new Set();
    const existingEnemyIds = createExistingEnemyIdSet(enemies);
    for (const [index, event] of summonEvents.entries()) {
      assert(Number.isFinite(event.summonCastSeq), "summon_request must include summonCastSeq");
      assert(Number.isFinite(event.summonSpawnIndex), "summon_request must include summonSpawnIndex");
      const castSpawnKey = `${event.summonCastSeq}:${event.summonSpawnIndex}`;
      assert(
        !seenSpawnIndexByCast.has(castSpawnKey),
        `duplicate summonSpawnIndex in same summon cast: ${castSpawnKey}`
      );
      seenSpawnIndexByCast.add(castSpawnKey);

      const summonIdentity = resolveSummonIdentity(event, index, existingEnemyIds);
      assert(
        !seenSummonedEnemyIds.has(summonIdentity.enemyId),
        `summoned enemy id must be unique across cycles: ${summonIdentity.enemyId}`
      );
      seenSummonedEnemyIds.add(summonIdentity.enemyId);

      const blockedTiles = buildBlockedEnemyTilesFromRuntime(enemies);
      const spawnedEnemies = createEnemies(
        dungeon,
        [minionDefinition],
        deriveSeed(dungeon.seed, summonIdentity.summonSeedKey),
        null,
        {
          blockedTiles,
          fixedSpawns: [
            {
              enemyDbId: minionDefinition.id,
              tileX: event.tileX,
              tileY: event.tileY,
              enemyId: summonIdentity.enemyId,
              spawnedByEnemyId: event.summonerEnemyId,
              isSummoned: true,
            },
          ],
          useFixedSpawnsOnly: true,
        }
      );
      enemies.push(...spawnedEnemies);
    }

    summonCycleChecks.push({
      cycle: summonCycleChecks.length + 1,
      telegraphCount: pendingSummonTelegraphCount,
      summonRequestCount: summonEvents.length,
    });
    pendingSummonTelegraphCount = 0;
    if (summonCycleChecks.length >= 2) {
      break;
    }
  }

  assert(summonCycleChecks.length >= 2, "boss summon must run for at least 2 cycles");
  assert(seenSummonedEnemyIds.size >= 4, "summoned enemy ids must accumulate uniquely across cycles");

  console.log("[check_boss_ogre] PASS");
}

main();
