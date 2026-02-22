import { describe, expect, it } from "vitest";
import { rollHitDamage } from "../../src/combat/damageRoll.js";
import { createPlayerWeapons, updateWeaponsAndCombat } from "../../src/weapon/weaponSystem.js";

const DT = 1 / 60;

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
    radiusBase: 2,
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

function getWeaponCenter(weapon) {
  return {
    x: weapon.x + weapon.width / 2,
    y: weapon.y + weapon.height / 2,
  };
}

function stepCombat(weapons, player, enemies, weaponDefinitionsById, formationsById) {
  return updateWeaponsAndCombat(weapons, player, enemies, weaponDefinitionsById, formationsById, DT);
}

function advanceUntilPhase(
  weapons,
  player,
  enemies,
  weaponDefinitionsById,
  formationsById,
  phase,
  maxFrames = 240
) {
  for (let i = 0; i < maxFrames; i += 1) {
    const events = stepCombat(weapons, player, enemies, weaponDefinitionsById, formationsById);
    if (weapons[0].attackMotionPhase === phase) {
      return { frameIndex: i, events };
    }
  }
  throw new Error(`phase ${phase} was not reached`);
}

function advanceUntilDamageEvent(
  weapons,
  player,
  enemies,
  weaponDefinitionsById,
  formationsById,
  maxFrames = 240
) {
  for (let i = 0; i < maxFrames; i += 1) {
    const events = stepCombat(weapons, player, enemies, weaponDefinitionsById, formationsById);
    if (events.some((event) => event?.kind === "damage" && event?.targetType === "enemy")) {
      return { frameIndex: i, events };
    }
  }
  throw new Error("damage event was not emitted within expected frames");
}

function unwrapAngleDeltaRad(previous, next) {
  let delta = next - previous;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

function collectBurstSamples({
  formationDefinition,
  weaponDefinitionOverrides = {},
  playerOverrides = {},
  maxFrames = 360,
}) {
  const player = createPlayer({
    pointerActive: true,
    target: { x: 800, y: 132 },
    facing: "right",
    ...playerOverrides,
  });
  const weaponDefinition = createWeaponDefinition({
    attackCooldownSec: 2,
    formationId: formationDefinition.id,
    ...weaponDefinitionOverrides,
  });
  const formationsById = { [formationDefinition.id]: formationDefinition };
  const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
  const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
  const samples = [];
  let burstStarted = false;

  for (let i = 0; i < maxFrames; i += 1) {
    stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
    if (weapons[0].attackMotionPhase === "burst") {
      burstStarted = true;
      samples.push(getWeaponCenter(weapons[0]));
      continue;
    }
    if (burstStarted) {
      break;
    }
  }

  expect(burstStarted).toBe(true);
  expect(samples.length).toBeGreaterThan(4);
  return {
    player,
    samples,
    playerCenter: {
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
    },
  };
}

function countBurstFrames(formationDefinition, weaponDefinitionOverrides = {}, playerOverrides = {}) {
  const result = collectBurstSamples({
    formationDefinition,
    weaponDefinitionOverrides,
    playerOverrides,
  });
  return result.samples.length;
}

describe("weaponSystem", () => {
  it("初回更新で idle -> approach へ遷移し attackSeq が進む", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition();
    const formationDefinition = createFormationDefinition();
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);

    expect(weapons[0].attackMotionPhase).toBe("idle");

    stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);

    expect(weapons[0].attackSeq).toBe(1);
    expect(weapons[0].attackMotionPhase).toBe("approach");
  });

  it("approach -> burst -> return -> idle の順で遷移する", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 1.2 });
    const formationDefinition = createFormationDefinition();
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);

    let sawApproach = false;
    let sawBurst = false;
    let sawReturn = false;
    let sawIdleAfterReturn = false;

    for (let i = 0; i < 180; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
      if (weapons[0].attackMotionPhase === "approach") {
        sawApproach = true;
      }
      if (sawApproach && weapons[0].attackMotionPhase === "burst") {
        sawBurst = true;
      }
      if (sawBurst && weapons[0].attackMotionPhase === "return") {
        sawReturn = true;
      }
      if (sawReturn && weapons[0].attackMotionPhase === "idle") {
        sawIdleAfterReturn = true;
        break;
      }
    }

    expect(sawApproach).toBe(true);
    expect(sawBurst).toBe(true);
    expect(sawReturn).toBe(true);
    expect(sawIdleAfterReturn).toBe(true);
  });

  it("次の attackSeq でも再度 burst に入る", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 0.6 });
    const formationDefinition = createFormationDefinition();
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);

    let sawSecondApproach = false;
    let sawSecondBurst = false;

    for (let i = 0; i < 240; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
      if (weapons[0].attackSeq >= 2 && weapons[0].attackMotionPhase === "approach") {
        sawSecondApproach = true;
      }
      if (weapons[0].attackSeq >= 2 && weapons[0].attackMotionPhase === "burst") {
        sawSecondBurst = true;
        break;
      }
    }

    expect(sawSecondApproach).toBe(true);
    expect(sawSecondBurst).toBe(true);
  });

  it("idle 中は接触しても命中しない", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 1.0 });
    const formationDefinition = createFormationDefinition({ radiusBase: 0.1 });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const enemy = createEnemy({ id: "enemy-idle", hp: 50, maxHp: 50, x: 120, y: 120, width: 24, height: 24 });

    weapons[0].attackSeq = 1;
    weapons[0].cooldownRemainingSec = 5;
    weapons[0].attackMotionPhase = "idle";

    const events = stepCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById);

    expect(weapons[0].attackMotionPhase).toBe("idle");
    expect(events).toHaveLength(0);
    expect(enemy.hp).toBe(50);
  });

  it("approach 中は接触しても命中しない", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 1.0 });
    const formationDefinition = createFormationDefinition({ radiusBase: 0.1 });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const enemy = createEnemy({ id: "enemy-approach", hp: 50, maxHp: 50, x: 120, y: 120, width: 24, height: 24 });
    const [weapon] = weapons;

    weapon.attackSeq = 1;
    weapon.cooldownRemainingSec = -0.001;
    weapon.attackMotionPhase = "idle";

    const events = stepCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById);

    expect(weapon.attackMotionPhase).toBe("approach");
    expect(events).toHaveLength(0);
    expect(enemy.hp).toBe(50);
  });

  it("burst 中は命中する（hit_num / pierce_count 維持）", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ hitNum: 2, pierceCount: 1, baseDamage: 7 });
    const formationDefinition = createFormationDefinition({ radiusBase: 0.1 });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);

    const enemyA = createEnemy({ id: "enemy-a", hp: 100, maxHp: 100 });
    const enemyB = createEnemy({ id: "enemy-b", hp: 100, maxHp: 100 });

    const { events } = advanceUntilDamageEvent(
      weapons,
      player,
      [enemyA, enemyB],
      weaponDefinitionsById,
      formationsById
    );

    expect(weapons[0].attackMotionPhase).toBe("burst");
    expect(events).toHaveLength(2);
    expect(enemyA.hp).toBe(86);
    expect(enemyB.hp).toBe(86);
  });

  it("idle から攻撃へ移る初回フレームで位置がワープしない", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 900, y: 132 },
      facing: "right",
    });
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 2 });
    const formationDefinition = createFormationDefinition({ radiusBase: 2, biasResponseMul: 1 });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const [weapon] = weapons;

    weapon.attackSeq = 1;
    weapon.cooldownRemainingSec = 5;
    weapon.attackMotionPhase = "idle";

    for (let i = 0; i < 10; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
    }
    const beforeCenter = getWeaponCenter(weapon);

    weapon.cooldownRemainingSec = -0.001;
    stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
    const afterCenter = getWeaponCenter(weapon);
    const movedDistance = Math.hypot(afterCenter.x - beforeCenter.x, afterCenter.y - beforeCenter.y);

    expect(weapon.attackMotionPhase).toBe("approach");
    expect(movedDistance).toBeLessThan(0.01);
  });

  it("circle は burst 中にほぼ1周する", () => {
    const circleFormation = createFormationDefinition({
      id: "formation_id_circle01",
      type: "circle",
      radiusBase: 2,
    });
    const { samples, playerCenter } = collectBurstSamples({
      formationDefinition: circleFormation,
      playerOverrides: {
        target: { x: 900, y: 132 },
      },
    });

    let totalTurnRad = 0;
    let previousAngleRad = null;
    for (const center of samples) {
      const angleRad = Math.atan2(center.y - playerCenter.y, center.x - playerCenter.x);
      if (previousAngleRad !== null) {
        totalTurnRad += Math.abs(unwrapAngleDeltaRad(previousAngleRad, angleRad));
      }
      previousAngleRad = angleRad;
    }

    expect(totalTurnRad).toBeGreaterThanOrEqual(Math.PI * 2 * 0.89);
  });

  it("figure8 は burst 中に前後・左右とも符号反転して8字軌道になる", () => {
    const figure8Formation = createFormationDefinition({
      id: "formation_id_figure801",
      type: "figure8",
      radiusBase: 2,
      params: {
        a: 1,
        b: 0.5,
        omegaMul: 1,
      },
    });
    const { samples, playerCenter } = collectBurstSamples({
      formationDefinition: figure8Formation,
      playerOverrides: {
        target: { x: 900, y: 132 },
      },
    });

    let minForward = Number.POSITIVE_INFINITY;
    let maxForward = Number.NEGATIVE_INFINITY;
    let minSide = Number.POSITIVE_INFINITY;
    let maxSide = Number.NEGATIVE_INFINITY;

    for (const center of samples) {
      const forward = center.x - playerCenter.x;
      const side = center.y - playerCenter.y;
      minForward = Math.min(minForward, forward);
      maxForward = Math.max(maxForward, forward);
      minSide = Math.min(minSide, side);
      maxSide = Math.max(maxSide, side);
    }

    expect(maxForward).toBeGreaterThan(20);
    expect(minForward).toBeLessThan(-20);
    expect(maxSide).toBeGreaterThan(8);
    expect(minSide).toBeLessThan(-8);
  });

  it("spiral は burst 中に1周以上回転する", () => {
    const spiralFormation = createFormationDefinition({
      id: "formation_id_spiral01",
      type: "spiral",
      radiusBase: 2,
      params: {
        rMin: 1.2,
        rMax: 3.6,
        radialOmega: 1.6,
      },
    });
    const { samples, playerCenter } = collectBurstSamples({
      formationDefinition: spiralFormation,
      playerOverrides: {
        target: { x: 900, y: 132 },
      },
    });

    let totalTurnRad = 0;
    let previousAngleRad = null;
    for (const center of samples) {
      const angleRad = Math.atan2(center.y - playerCenter.y, center.x - playerCenter.x);
      if (previousAngleRad !== null) {
        totalTurnRad += Math.abs(unwrapAngleDeltaRad(previousAngleRad, angleRad));
      }
      previousAngleRad = angleRad;
    }

    expect(totalTurnRad).toBeGreaterThanOrEqual(Math.PI * 2);
  });

  it("figure8 の burst 継続フレームは line より長い", () => {
    const lineFrames = countBurstFrames(
      createFormationDefinition({
        id: "formation_id_line_front01",
        type: "line",
        radiusBase: 2,
        params: { lineLen: 3.2, sideSpacing: 0 },
      })
    );
    const figure8Frames = countBurstFrames(
      createFormationDefinition({
        id: "formation_id_figure801",
        type: "figure8",
        radiusBase: 2,
        params: { a: 1, b: 0.5, omegaMul: 1 },
      })
    );

    expect(figure8Frames).toBeGreaterThan(lineFrames);
  });

  it("idle は前方に滞在しプレイヤー周囲を周回しない", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 900, y: 132 },
      facing: "right",
    });
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 2 });
    const formationDefinition = createFormationDefinition({ radiusBase: 2, biasResponseMul: 1 });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const [weapon] = weapons;
    const playerCenterX = player.x + player.width / 2;

    weapon.attackSeq = 1;
    weapon.cooldownRemainingSec = 30;
    weapon.attackMotionPhase = "idle";
    weapon.biasDirX = 1;
    weapon.biasDirY = 0;

    let minOffsetX = Number.POSITIVE_INFINITY;
    let maxOffsetX = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < 120; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
      const center = getWeaponCenter(weapon);
      const offsetX = center.x - playerCenterX;
      minOffsetX = Math.min(minOffsetX, offsetX);
      maxOffsetX = Math.max(maxOffsetX, offsetX);
    }

    expect(minOffsetX).toBeGreaterThan(10);
    expect(maxOffsetX - minOffsetX).toBeLessThan(0.001);
  });

  it("idle 前方配置が aim_dir 変更に追従する", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 900, y: 132 },
      facing: "right",
    });
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 2 });
    const formationDefinition = createFormationDefinition({ radiusBase: 2, biasResponseMul: 1 });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const [weapon] = weapons;
    const playerCenterX = player.x + player.width / 2;

    weapon.attackSeq = 1;
    weapon.cooldownRemainingSec = 30;
    weapon.attackMotionPhase = "idle";
    weapon.biasDirX = 1;
    weapon.biasDirY = 0;

    for (let i = 0; i < 20; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
    }
    const rightCenter = getWeaponCenter(weapon);

    player.target = { x: -900, y: 132 };
    for (let i = 0; i < 50; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
    }
    const leftCenter = getWeaponCenter(weapon);

    expect(rightCenter.x).toBeGreaterThan(playerCenterX + 10);
    expect(leftCenter.x).toBeLessThan(playerCenterX - 10);
  });

  it("idle は前方を保ったまま上下ボブする", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 900, y: 132 },
      facing: "right",
    });
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 2 });
    const formationDefinition = createFormationDefinition({ radiusBase: 2, biasResponseMul: 1 });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const [weapon] = weapons;
    const playerCenterX = player.x + player.width / 2;

    weapon.attackSeq = 1;
    weapon.cooldownRemainingSec = 30;
    weapon.attackMotionPhase = "idle";
    weapon.biasDirX = 1;
    weapon.biasDirY = 0;

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < 120; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
      const center = getWeaponCenter(weapon);
      minX = Math.min(minX, center.x);
      maxX = Math.max(maxX, center.x);
      minY = Math.min(minY, center.y);
      maxY = Math.max(maxY, center.y);
    }

    expect(minX).toBeGreaterThan(playerCenterX + 10);
    expect(maxX - minX).toBeLessThan(0.001);
    expect(maxY - minY).toBeGreaterThan(6);
  });

  it("複数武器は idle 時に前方扇状へ分散する", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 900, y: 132 },
      facing: "right",
    });
    const formationDefinition = createFormationDefinition({ radiusBase: 2, biasResponseMul: 1 });
    const weaponDefinitions = [
      createWeaponDefinition({ id: "weapon-a", formationId: formationDefinition.id }),
      createWeaponDefinition({ id: "weapon-b", formationId: formationDefinition.id }),
      createWeaponDefinition({ id: "weapon-c", formationId: formationDefinition.id }),
    ];
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = Object.fromEntries(
      weaponDefinitions.map((definition) => [definition.id, definition])
    );
    const weapons = createPlayerWeapons(weaponDefinitions, formationsById, player);
    const playerCenterX = player.x + player.width / 2;

    for (const weapon of weapons) {
      weapon.attackSeq = 1;
      weapon.cooldownRemainingSec = 30;
      weapon.attackMotionPhase = "idle";
      weapon.biasDirX = 1;
      weapon.biasDirY = 0;
    }

    stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
    const centers = weapons.map((weapon) => getWeaponCenter(weapon));
    const yValues = centers.map((center) => center.y);
    const minX = Math.min(...centers.map((center) => center.x));
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const uniqueRoundedY = new Set(yValues.map((value) => Math.round(value)));

    expect(minX).toBeGreaterThan(playerCenterX + 10);
    expect(maxY - minY).toBeGreaterThan(20);
    expect(uniqueRoundedY.size).toBe(3);
  });

  it("arc_front / arc_back は burst 時に照準方向へ前後偏る", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 900, y: 132 },
      facing: "up",
    });
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 2 });
    const playerCenterX = player.x + player.width / 2;

    const frontFormation = createFormationDefinition({
      id: "formation_id_arc_front01",
      type: "arc",
      radiusBase: 2,
      params: {
        arcDir: "front",
        arcDeg: 120,
        centerOffsetEnable: false,
      },
    });
    const frontWeaponDefinition = { ...weaponDefinition, formationId: frontFormation.id };
    const frontWeapons = createPlayerWeapons([frontWeaponDefinition], { [frontFormation.id]: frontFormation }, player);
    advanceUntilPhase(
      frontWeapons,
      player,
      [],
      { [frontWeaponDefinition.id]: frontWeaponDefinition },
      { [frontFormation.id]: frontFormation },
      "burst"
    );
    expect(frontWeapons[0].attackMotionPhase).toBe("burst");
    expect(getWeaponCenter(frontWeapons[0]).x).toBeGreaterThan(playerCenterX);

    const backFormation = createFormationDefinition({
      id: "formation_id_arc_back01",
      type: "arc",
      radiusBase: 2,
      params: {
        arcDir: "back",
        arcDeg: 120,
        centerOffsetEnable: false,
      },
    });
    const backWeaponDefinition = { ...weaponDefinition, formationId: backFormation.id };
    const backWeapons = createPlayerWeapons([backWeaponDefinition], { [backFormation.id]: backFormation }, player);
    advanceUntilPhase(
      backWeapons,
      player,
      [],
      { [backWeaponDefinition.id]: backWeaponDefinition },
      { [backFormation.id]: backFormation },
      "burst"
    );
    expect(backWeapons[0].attackMotionPhase).toBe("burst");
    expect(getWeaponCenter(backWeapons[0]).x).toBeLessThan(playerCenterX);
  });

  it("line_front は burst 中に前方へ突進する", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 800, y: 132 },
      facing: "right",
    });
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 3, formationId: "formation_id_line_front01" });
    const formationDefinition = createFormationDefinition({
      id: "formation_id_line_front01",
      type: "line",
      radiusBase: 2,
      params: {
        lineLen: 3.2,
        motion: "pingpong",
        sideSpacing: 0,
      },
    });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const playerCenterX = player.x + player.width / 2;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < 120; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
      if (weapons[0].attackMotionPhase !== "burst") {
        continue;
      }
      const centerX = getWeaponCenter(weapons[0]).x;
      minX = Math.min(minX, centerX);
      maxX = Math.max(maxX, centerX);
    }

    expect(maxX - playerCenterX).toBeGreaterThan(80);
    expect(Math.abs(minX - playerCenterX)).toBeLessThan(4);
  });

  it("figure8 は burst 1回で前後を跨ぐ", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 800, y: 132 },
      facing: "right",
    });
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 3, formationId: "formation_id_figure801" });
    const formationDefinition = createFormationDefinition({
      id: "formation_id_figure801",
      type: "figure8",
      radiusBase: 2,
      params: {
        a: 1,
        b: 0.5,
        omegaMul: 1,
      },
    });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const playerCenterX = player.x + player.width / 2;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let sampleCount = 0;

    for (let i = 0; i < 160; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
      if (weapons[0].attackMotionPhase !== "burst") {
        continue;
      }
      sampleCount += 1;
      const centerX = getWeaponCenter(weapons[0]).x;
      minX = Math.min(minX, centerX);
      maxX = Math.max(maxX, centerX);
    }

    expect(sampleCount).toBeGreaterThan(4);
    expect(maxX - playerCenterX).toBeGreaterThan(30);
    expect(playerCenterX - minX).toBeGreaterThan(30);
  });

  it("spiral は burst 中に半径が内外へ変化する", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 800, y: 132 },
      facing: "right",
    });
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 3, formationId: "formation_id_spiral01" });
    const formationDefinition = createFormationDefinition({
      id: "formation_id_spiral01",
      type: "spiral",
      radiusBase: 2,
      params: {
        rMin: 1.2,
        rMax: 3.6,
        radialOmega: 1.6,
      },
    });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const playerCenter = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
    let minDistance = Number.POSITIVE_INFINITY;
    let maxDistance = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < 160; i += 1) {
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
      if (weapons[0].attackMotionPhase !== "burst") {
        continue;
      }
      const center = getWeaponCenter(weapons[0]);
      const distance = Math.hypot(center.x - playerCenter.x, center.y - playerCenter.y);
      minDistance = Math.min(minDistance, distance);
      maxDistance = Math.max(maxDistance, distance);
    }

    expect(maxDistance - minDistance).toBeGreaterThan(30);
  });

  it("stop は中心固定で burst 化しない", () => {
    const player = createPlayer({ x: 100, y: 100, width: 32, height: 64 });
    const weaponDefinition = createWeaponDefinition({
      attackCooldownSec: 2,
      width: 16,
      height: 16,
      formationId: "formation_id_stop01",
    });
    const formationDefinition = createFormationDefinition({
      id: "formation_id_stop01",
      type: "stop",
      radiusBase: 0,
      biasStrengthMul: 0,
      biasResponseMul: 0,
      params: {
        weaponVisible: false,
      },
    });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const enemy = createEnemy({ id: "enemy-stop", hp: 100, maxHp: 100, x: 100, y: 100 });

    const eventsA = stepCombat(weapons, player, [enemy], weaponDefinitionsById, formationsById);
    const centerA = getWeaponCenter(weapons[0]);

    expect(weapons[0].attackMotionPhase).toBe("idle");
    expect(eventsA).toHaveLength(0);
    expect(enemy.hp).toBe(100);
    expect(centerA.x).toBeCloseTo(player.x + player.width / 2, 5);
    expect(centerA.y).toBeCloseTo(player.y + player.height / 2, 5);

    player.x += 24;
    player.y += 12;
    stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
    const centerB = getWeaponCenter(weapons[0]);
    expect(centerB.x).toBeCloseTo(player.x + player.width / 2, 5);
    expect(centerB.y).toBeCloseTo(player.y + player.height / 2, 5);
  });

  it("idle 時の武器回転角が aim_dir を向く", () => {
    const player = createPlayer({
      pointerActive: true,
      target: { x: 900, y: 132 },
      facing: "right",
    });
    const weaponDefinition = createWeaponDefinition({ attackCooldownSec: 10 });
    const formationDefinition = createFormationDefinition({
      radiusBase: 1,
      params: { centerMode: "player" },
    });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const [weapon] = weapons;

    weapon.attackSeq = 1;
    weapon.cooldownRemainingSec = 5;
    weapon.attackMotionPhase = "idle";

    const testCases = [
      { target: { x: player.x + player.width / 2, y: player.y - 200 }, bias: { x: 0, y: -1 }, expectedDeg: 0 },
      { target: { x: player.x + player.width + 200, y: player.y + player.height / 2 }, bias: { x: 1, y: 0 }, expectedDeg: 90 },
      { target: { x: player.x + player.width / 2, y: player.y + player.height + 200 }, bias: { x: 0, y: 1 }, expectedDeg: 180 },
      { target: { x: player.x - 200, y: player.y + player.height / 2 }, bias: { x: -1, y: 0 }, expectedDeg: 270 },
    ];

    for (const testCase of testCases) {
      player.target = testCase.target;
      weapon.biasDirX = testCase.bias.x;
      weapon.biasDirY = testCase.bias.y;
      stepCombat(weapons, player, [], weaponDefinitionsById, formationsById);
      expect(weapon.rotationDeg).toBeCloseTo(testCase.expectedDeg, 3);
    }
  });

  it("命中時に CombatEvent を返し敵フラッシュを発火する", () => {
    const player = createPlayer();
    const weaponDefinition = createWeaponDefinition({ hitNum: 2, baseDamage: 6, attackCooldownSec: 0.2 });
    const formationDefinition = createFormationDefinition({ radiusBase: 0.1 });
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

    const { events } = advanceUntilDamageEvent(weapons, player, [enemy], weaponDefinitionsById, formationsById);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      kind: "damage",
      targetType: "enemy",
      weaponId: "weapon-0",
      weaponDefId: "test-weapon",
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
    const formationDefinition = createFormationDefinition({ radiusBase: 0.1 });
    const formationsById = { [formationDefinition.id]: formationDefinition };
    const weaponDefinitionsById = { [weaponDefinition.id]: weaponDefinition };
    const weapons = createPlayerWeapons([weaponDefinition], formationsById, player);
    const enemy = createEnemy({ id: "enemy-roll", hp: 100, maxHp: 100 });

    const { events } = advanceUntilDamageEvent(weapons, player, [enemy], weaponDefinitionsById, formationsById);
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
