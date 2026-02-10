import { createEnemies, getEnemyTelegraphAlpha, getEnemyWeaponRuntimes, updateEnemyAttacks } from "../src/enemy/enemySystem.js";
import { spawnDamagePopupsFromEvents, updateDamagePopups } from "../src/combat/combatFeedbackSystem.js";
import { getPlayerHitFlashAlpha, updatePlayer } from "../src/player/playerSystem.js";

const DT = 1 / 60;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createGrid(width, height, initial = true) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => initial));
}

function createDungeon() {
  const floorGrid = createGrid(16, 16, true);

  return {
    seed: "check-enemy-attack-dungeon",
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

function createEnemyDefinition() {
  return {
    id: "check_enemy_attack_01",
    type: "walk",
    width: 32,
    height: 64,
    noticeDistance: 8,
    giveupDistance: 16,
    vit: 10,
    for: 10,
    agi: 10,
    pow: 10,
  };
}

function createEnemyAttackProfile() {
  return {
    windupSec: 0.1,
    recoverSec: 0.08,
    executeSec: 0.2,
    cooldownAfterRecoverSec: 0.1,
    preferredRangePx: 0,
    engageRangePx: 48,
    retreatRangePx: 0,
    attackRangePx: 96,
    losRequired: false,
    weaponAimMode: "to_target",
    weaponVisibilityMode: "burst",
    attackLinked: true,
    weapons: [
      {
        weaponDefId: "weapon_sword_01",
        formationId: "formation_id_circle01",
        width: 32,
        height: 64,
        radiusPx: 0,
        angularSpeed: 0,
        centerMode: "player",
        biasStrengthMul: 0,
        biasResponseMul: 0,
        biasOffsetRatioMax: 0,
        executeDurationSec: 0.2,
        supported: true,
      },
      {
        weaponDefId: "weapon_sword_01",
        formationId: "formation_id_circle01",
        width: 32,
        height: 64,
        radiusPx: 0,
        angularSpeed: 0,
        centerMode: "player",
        biasStrengthMul: 0,
        biasResponseMul: 0,
        biasOffsetRatioMax: 0,
        executeDurationSec: 0.2,
        supported: true,
      },
    ],
  };
}

function main() {
  const dungeon = createDungeon();
  const enemyDefinition = createEnemyDefinition();
  const enemies = createEnemies(dungeon, [enemyDefinition], "check-enemy-attack-seed", {
    [enemyDefinition.id]: createEnemyAttackProfile(),
  });
  assert(enemies.length === 1, "expected one enemy");

  const enemy = enemies[0];
  enemy.behaviorMode = "chase";
  enemy.isChasing = true;
  enemy.attackDamage = 9;

  const player = {
    x: enemy.x + 64,
    y: enemy.y,
    width: 32,
    height: 64,
    footHitboxHeight: 32,
    facing: "down",
    pointerActive: false,
    target: null,
    isMoving: false,
    animTime: 0,
    hp: 40,
    maxHp: 40,
    hitFlashTimerSec: 0,
    hitFlashDurationSec: 0.12,
  };

  const engageBlockedEvents = updateEnemyAttacks(enemies, player, dungeon, DT);
  assert(engageBlockedEvents.length === 0, "engage-range gate should not emit events outside engage range");
  assert(enemy.attack.phase === "cooldown", "enemy should stay in cooldown outside engage range");

  player.x = enemy.x;
  player.y = enemy.y;

  const windupEvents = updateEnemyAttacks(enemies, player, dungeon, DT);
  assert(windupEvents.length === 0, "windup should not emit damage events");
  assert(enemy.attack.phase === "windup", "enemy should enter windup inside engage range");
  assert(getEnemyTelegraphAlpha(enemy) > 0, "windup should expose telegraph alpha");

  const windupWeaponVisibility = getEnemyWeaponRuntimes(enemy).every((weapon) => weapon.visible === false);
  assert(windupWeaponVisibility, "burst weapons should be hidden in windup");

  let damageEvents = [];
  for (let i = 0; i < 120; i += 1) {
    const events = updateEnemyAttacks(enemies, player, dungeon, DT);
    if (events.length > 0) {
      damageEvents = events;
      break;
    }
  }

  assert(enemy.attack.phase === "attack", "enemy should reach attack phase");
  assert(damageEvents.length === 2, "two enemy weapons should emit two damage events");
  assert(damageEvents.every((event) => event.targetType === "player"), "player damage events must set targetType=player");
  assert(player.hp === 22, "player hp should be reduced by both weapon hits");
  assert(getPlayerHitFlashAlpha(player) > 0, "player hit flash should trigger");

  const popups = spawnDamagePopupsFromEvents(damageEvents, 0);
  assert(popups.length === 2, "damage events should spawn two popups");
  assert(popups.every((popup) => popup.targetType === "player"), "player popup should keep targetType=player");

  const fadedPopups = updateDamagePopups(popups, DT);
  assert(fadedPopups.length === 2, "popups should still exist shortly after spawn");
  assert(fadedPopups[0].alpha < popups[0].alpha, "popup alpha should decay");

  updatePlayer(player, dungeon, 0.2);
  assert(getPlayerHitFlashAlpha(player) === 0, "player flash should decay to zero");

  console.log("[check_enemy_attack] PASS");
}

main();
