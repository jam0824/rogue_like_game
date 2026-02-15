import { describe, expect, it } from "vitest";
import {
  applyHitFlashColorsFromDamageEvents,
  DEFAULT_HIT_FLASH_COLOR,
  POISON_HIT_FLASH_COLOR,
} from "../../src/combat/hitFlashSystem.js";

function createEnemy(id, color = DEFAULT_HIT_FLASH_COLOR) {
  return {
    id,
    hitFlashColor: color,
  };
}

describe("hitFlashSystem", () => {
  it("毒DoTイベント時は対象敵を緑フラッシュ色にする", () => {
    const enemies = [createEnemy("enemy-1"), createEnemy("enemy-2")];
    const events = [
      {
        kind: "damage",
        targetType: "enemy",
        enemyId: "enemy-1",
        damage: 3,
        sourceType: "ailment",
        ailmentId: "poison",
      },
    ];

    applyHitFlashColorsFromDamageEvents({ events, player: null, enemies });

    expect(enemies[0].hitFlashColor).toBe(POISON_HIT_FLASH_COLOR);
    expect(enemies[1].hitFlashColor).toBe(DEFAULT_HIT_FLASH_COLOR);
  });

  it("通常ダメージのみなら白フラッシュ色になる", () => {
    const enemies = [createEnemy("enemy-1", POISON_HIT_FLASH_COLOR)];
    const player = { hitFlashColor: POISON_HIT_FLASH_COLOR };
    const events = [
      {
        kind: "damage",
        targetType: "enemy",
        enemyId: "enemy-1",
        damage: 5,
      },
      {
        kind: "damage",
        targetType: "player",
        damage: 7,
      },
    ];

    applyHitFlashColorsFromDamageEvents({ events, player, enemies });

    expect(enemies[0].hitFlashColor).toBe(DEFAULT_HIT_FLASH_COLOR);
    expect(player.hitFlashColor).toBe(DEFAULT_HIT_FLASH_COLOR);
  });

  it("同フレーム混在時は毒を優先して緑にする", () => {
    const enemies = [createEnemy("enemy-1"), createEnemy("enemy-2")];
    const player = { hitFlashColor: DEFAULT_HIT_FLASH_COLOR };
    const events = [
      {
        kind: "damage",
        targetType: "enemy",
        enemyId: "enemy-1",
        damage: 9,
      },
      {
        kind: "damage",
        targetType: "enemy",
        enemyId: "enemy-1",
        damage: 2,
        sourceType: "ailment",
        ailmentId: "poison",
      },
      {
        kind: "damage",
        targetType: "player",
        damage: 4,
      },
      {
        kind: "damage",
        targetType: "player",
        damage: 1,
        sourceType: "ailment",
        ailmentId: "poison",
      },
      {
        kind: "damage",
        targetType: "enemy",
        enemyId: "enemy-2",
        damage: 6,
      },
    ];

    applyHitFlashColorsFromDamageEvents({ events, player, enemies });

    expect(enemies[0].hitFlashColor).toBe(POISON_HIT_FLASH_COLOR);
    expect(enemies[1].hitFlashColor).toBe(DEFAULT_HIT_FLASH_COLOR);
    expect(player.hitFlashColor).toBe(POISON_HIT_FLASH_COLOR);
  });

  it("damage以外のイベントでは色を変更しない", () => {
    const enemies = [createEnemy("enemy-1", POISON_HIT_FLASH_COLOR)];
    const player = { hitFlashColor: POISON_HIT_FLASH_COLOR };
    const events = [
      { kind: "status", targetType: "enemy", enemyId: "enemy-1", value: "poison" },
    ];

    applyHitFlashColorsFromDamageEvents({ events, player, enemies });

    expect(enemies[0].hitFlashColor).toBe(POISON_HIT_FLASH_COLOR);
    expect(player.hitFlashColor).toBe(POISON_HIT_FLASH_COLOR);
  });
});
