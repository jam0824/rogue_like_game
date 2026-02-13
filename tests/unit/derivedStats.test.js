import { describe, expect, it } from "vitest";
import { ENEMY_WALK_SPEED_PX_PER_SEC, PLAYER_SPEED_PX_PER_SEC } from "../../src/config/constants.js";
import { deriveEnemyCombatStats, derivePlayerCombatStats } from "../../src/status/derivedStats.js";

describe("derivedStats", () => {
  it("derivePlayerCombatStats は base + run + equip を合算して派生を計算する", () => {
    const playerState = {
      base: {
        base_stats: {
          vit: 2,
          for: 1,
          agi: 3,
          pow: 4,
          tec: 5,
          arc: 6,
        },
      },
      run: {
        stat_run: {
          vit: 1,
          for: 2,
          agi: 0,
          pow: 1,
          tec: 0,
          arc: 2,
        },
        equipped_weapons: [
          {
            weapon: {
              stat_overrides: {
                vit: 3,
                pow: 2,
              },
            },
          },
          {
            weapon: {
              stat_overrides: {
                agi: 4,
                tec: 1,
                arc: 1,
              },
            },
          },
        ],
      },
    };

    const result = derivePlayerCombatStats(playerState, PLAYER_SPEED_PX_PER_SEC);

    expect(result.statTotals).toEqual({
      vit: 6,
      for: 3,
      agi: 7,
      pow: 7,
      tec: 6,
      arc: 9,
    });
    expect(result.maxHp).toBe(148);
    expect(result.moveSpeedPxPerSec).toBeCloseTo(PLAYER_SPEED_PX_PER_SEC * 1.07, 5);
    expect(result.damageMult).toBeCloseTo(1.14, 5);
    expect(result.critChance).toBeCloseTo(0.068, 5);
    expect(result.critMult).toBeCloseTo(1.56, 5);
    expect(result.ailmentTakenMult).toBeCloseTo(1 / 1.075, 5);
    expect(result.durationMult).toBeCloseTo(result.ailmentTakenMult, 5);
    expect(result.ccDurationMult).toBeCloseTo(result.ailmentTakenMult, 5);
  });

  it("deriveEnemyCombatStats は Floor/Rank/tag を合成して派生を計算する", () => {
    const result = deriveEnemyCombatStats(
      {
        vit: 10,
        for: 10,
        agi: 10,
        pow: 10,
        tec: 10,
        arc: 10,
        rank: "elite",
        tags: ["minion", "heavy"],
      },
      10,
      ENEMY_WALK_SPEED_PX_PER_SEC
    );

    expect(result.rank).toBe("elite");
    expect(result.tags).toEqual(["minion", "heavy"]);
    expect(result.maxHp).toBe(472);
    expect(result.damageMult).toBeCloseTo(1.2, 5);
    expect(result.attackScale).toBeCloseTo(1.4465741825189846, 10);
    expect(result.moveSpeedPxPerSec).toBeCloseTo(ENEMY_WALK_SPEED_PX_PER_SEC * 1.1641975275082122, 8);
    expect(result.chaseSpeedPxPerSec).toBeCloseTo(result.moveSpeedPxPerSec * 1.3, 8);
    expect(result.critChance).toBeCloseTo(0.01, 8);
    expect(result.critMult).toBeCloseTo(1.52, 8);
    expect(result.ailmentTakenMult).toBeCloseTo(0.7317391304347827, 10);
    expect(result.durationMult).toBeCloseTo(0.7434782608695653, 10);
    expect(result.ccDurationMult).toBeCloseTo(0.591304347826087, 10);
  });
});
