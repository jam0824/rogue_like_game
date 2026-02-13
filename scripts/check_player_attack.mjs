import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEnemies,
  getEnemyHitFlashAlpha,
  updateEnemies,
} from "../src/enemy/enemySystem.js";
import { spawnDamagePopupsFromEvents, updateDamagePopups } from "../src/combat/combatFeedbackSystem.js";
import {
  createPlayerWeapons,
  removeDefeatedEnemies,
  updateWeaponsAndCombat,
} from "../src/weapon/weaponSystem.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const weaponDbFile = path.join(projectRoot, "db", "weapon_db", "weapon_sword_01.json");
const formationDbFile = path.join(projectRoot, "db", "formation_db", "formation_circle_01.json");
const DT = 1 / 60;
const HIT_DT = 1e-6;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadInitialWeaponDefinitionFromFs() {
  const raw = JSON.parse(fs.readFileSync(weaponDbFile, "utf-8"));
  return {
    id: "weapon_sword_01",
    weaponFileName: raw.weapon_file_name,
    width: raw.width,
    height: raw.height,
    baseDamage: raw.base_damage,
    attackCooldownSec: raw.attack_cooldown_sec,
    hitNum: raw.hit_num,
    pierceCount: raw.pierce_count,
    formationId: raw.formation_id,
  };
}

function loadCircleFormationFromFs() {
  const raw = JSON.parse(fs.readFileSync(formationDbFile, "utf-8"));
  return {
    id: raw.id,
    type: raw.type,
    radiusBase: raw.radius_base,
    angularSpeedBase: raw.angular_speed_base,
    biasStrengthMul: raw.bias_strength_mul,
    biasResponseMul: raw.bias_response_mul,
    clamp: {
      radiusMin: raw.clamp?.radius_min,
      radiusMax: raw.clamp?.radius_max,
      speedMin: raw.clamp?.speed_min,
      speedMax: raw.clamp?.speed_max,
      biasOffsetRatioMax: raw.clamp?.bias_offset_ratio_max,
    },
    params: {
      centerMode: raw.params?.center_mode,
    },
  };
}

function alignEnemyToWeapon(enemy, weapon) {
  enemy.x = weapon.x;
  enemy.y = weapon.y;
}

function createGrid(width, height, initial = true) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => initial));
}

function createDungeonForChecks() {
  const floorGrid = createGrid(16, 16, true);

  return {
    seed: "check-player-attack-dungeon",
    gridWidth: 16,
    gridHeight: 16,
    floorGrid,
    walkableGrid: floorGrid,
    rooms: [
      { id: 0, x: 1, y: 1, w: 4, h: 4, centerX: 2, centerY: 2 },
      { id: 1, x: 9, y: 9, w: 4, h: 4, centerX: 10, centerY: 10 },
    ],
    startRoomId: 0,
  };
}

function createEnemyDefinitionsForChecks() {
  return [
    {
      id: "check_enemy_walk_01",
      type: "walk",
      width: 32,
      height: 64,
      noticeDistance: 6,
      giveupDistance: 10,
      vit: 10,
      for: 10,
      agi: 10,
      pow: 10,
    },
  ];
}

function advanceUntilNextAttackSeq(weapons, player, enemies, weaponDefinitionsById, formationsById) {
  const beforeSeq = weapons[0].attackSeq;

  for (let i = 0; i < 600; i += 1) {
    updateWeaponsAndCombat(weapons, player, enemies, weaponDefinitionsById, formationsById, DT);
    if (weapons[0].attackSeq !== beforeSeq) {
      return;
    }
  }

  throw new Error("attack_seq did not advance within expected frames");
}

function main() {
  const weaponDefinition = loadInitialWeaponDefinitionFromFs();
  const formationDefinition = loadCircleFormationFromFs();

  const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
  const formationsById = { [formationDefinition.id]: formationDefinition };

  const player = {
    x: 100,
    y: 100,
    width: 32,
    height: 64,
    facing: "right",
    pointerActive: true,
    target: { x: 900, y: 132 },
    damageSeed: "check-player-damage-seed",
    damageMult: 1.2,
    critChance: 0.12,
    critMult: 1.6,
  };

  const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
  assert(weapons.length === 1, "expected exactly one weapon runtime");
  const dungeon = createDungeonForChecks();
  const enemies = createEnemies(dungeon, createEnemyDefinitionsForChecks(), "check-player-attack-seed");
  assert(enemies.length === 1, "expected exactly one spawned enemy");
  const enemy = enemies[0];
  enemy.maxHp = 200;
  enemy.hp = 200;
  enemy.isDead = false;

  const bootstrapEvents = updateWeaponsAndCombat(weapons, player, [], weaponDefinitionsById, formationsById, DT);
  assert(bootstrapEvents.length === 0, "initial bootstrap should not produce damage events without enemies");
  assert(weapons[0].attackSeq === 1, "initial attack should start immediately");

  alignEnemyToWeapon(enemy, weapons[0]);
  const firstEvents = updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, HIT_DT);
  const hpAfterFirstHit = enemy.hp;
  assert(firstEvents.length === 1, "a damage event should be emitted on first hit");
  assert(firstEvents[0].kind === "damage", "event kind should be damage");
  assert(firstEvents[0].damage > 0, "damage event should include positive damage");
  assert(enemy.hitFlashTimerSec > 0, "enemy flash timer should start on hit");
  assert(getEnemyHitFlashAlpha(enemy) > 0, "enemy flash alpha should be positive right after hit");
  assert(hpAfterFirstHit < 200, "enemy HP should decrease on first hit");

  const initialPopups = spawnDamagePopupsFromEvents(firstEvents, 0);
  assert(initialPopups.length === 1, "one popup should be spawned per damage event");
  assert(initialPopups[0].value === firstEvents[0].damage, "popup value should match event damage");

  const fadedPopups = updateDamagePopups(initialPopups, DT);
  assert(fadedPopups.length === 1, "popup should still exist shortly after spawn");
  assert(fadedPopups[0].alpha < 1, "popup alpha should decay over time");
  assert(fadedPopups[0].y < initialPopups[0].y, "popup should rise upward");

  alignEnemyToWeapon(enemy, weapons[0]);
  const noRepeatEvents = updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, HIT_DT);
  assert(noRepeatEvents.length === 0, "enemy should not be re-hit in the same attack_seq");
  assert(enemy.hp === hpAfterFirstHit, "enemy should not be re-hit in the same attack_seq");

  advanceUntilNextAttackSeq(weapons, player, [], weaponDefinitionsById, formationsById);
  alignEnemyToWeapon(enemy, weapons[0]);
  const secondEvents = updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, HIT_DT);
  assert(secondEvents.length === 1, "next attack sequence should emit damage event again");
  assert(enemy.hp < hpAfterFirstHit, "enemy should take damage again after attack_seq changes");

  const flashDuration = enemy.hitFlashDurationSec;
  updateEnemies([enemy], dungeon, flashDuration + DT, player);
  assert(enemy.hitFlashTimerSec === 0, "enemy flash timer should decay to zero");
  assert(getEnemyHitFlashAlpha(enemy) === 0, "enemy flash alpha should return to zero");

  enemy.hp = Math.max(1, Math.round(weaponDefinition.baseDamage));
  enemy.isDead = false;

  advanceUntilNextAttackSeq(weapons, player, [], weaponDefinitionsById, formationsById);
  alignEnemyToWeapon(enemy, weapons[0]);
  const killEvents = updateWeaponsAndCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById, HIT_DT);
  assert(killEvents.length === 1, "kill hit should also emit a damage event");

  assert(enemy.isDead === true, "enemy should be marked dead when HP reaches 0");

  const survivors = removeDefeatedEnemies([enemy]);
  assert(survivors.length === 0, "dead enemy should be removed by prune step");

  const expiredPopups = updateDamagePopups(initialPopups, 1);
  assert(expiredPopups.length === 0, "popup should disappear after lifetime");

  console.log("[check_player_attack] PASS");
}

main();
