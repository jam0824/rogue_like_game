import { describe, expect, it } from "vitest";
import { PLAYER_SPEED_PX_PER_SEC } from "../../src/config/constants.js";
import { derivePlayerCombatStats } from "../../src/status/derivedStats.js";
import { buildPlayerStatusDigest, buildPlayerStatusRows } from "../../src/ui/debugPlayerStatsViewModel.js";

describe("debugPlayerStatsViewModel", () => {
  it("playerState または player が未設定なら初期化メッセージを返す", () => {
    expect(buildPlayerStatusRows(null, null, PLAYER_SPEED_PX_PER_SEC)).toEqual([
      { label: "状態", value: "プレイヤーデータ未初期化" },
    ]);
    expect(buildPlayerStatusRows({}, null, PLAYER_SPEED_PX_PER_SEC)).toEqual([
      { label: "状態", value: "プレイヤーデータ未初期化" },
    ]);
  });

  it("基本/ラン/装備/合計と派生値をフォーマットして返す", () => {
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
    const player = { hp: 137.8 };
    const derived = derivePlayerCombatStats(playerState, PLAYER_SPEED_PX_PER_SEC);
    const rows = buildPlayerStatusRows(playerState, player, PLAYER_SPEED_PX_PER_SEC);
    const rowMap = new Map(rows.map((row) => [row.label, row.value]));

    expect(rowMap.get("[基本] VIT")).toBe("2");
    expect(rowMap.get("[ラン] FOR")).toBe("2");
    expect(rowMap.get("[装備] AGI")).toBe("4");
    expect(rowMap.get("[合計] ARC")).toBe("9");
    expect(rowMap.get("HP(現在/最大)")).toBe(`${Math.round(player.hp)}/${derived.maxHp}`);
    expect(rowMap.get("移動速度(px/s)")).toBe(derived.moveSpeedPxPerSec.toFixed(2));
    expect(rowMap.get("与ダメ倍率")).toBe(derived.damageMult.toFixed(3));
    expect(rowMap.get("クリ率")).toBe(`${(derived.critChance * 100).toFixed(1)}%`);
    expect(rowMap.get("クリ倍率")).toBe(`x${derived.critMult.toFixed(2)}`);
    expect(rowMap.get("状態異常被適用倍率")).toBe(derived.ailmentTakenMult.toFixed(3));
    expect(rowMap.get("持続時間倍率")).toBe(derived.durationMult.toFixed(3));
    expect(rowMap.get("CC時間倍率")).toBe(derived.ccDurationMult.toFixed(3));
  });

  it("digest は同一入力で不変で、値変更時に変わる", () => {
    const playerState = {
      base: { base_stats: { vit: 1, for: 0, agi: 0, pow: 0, tec: 0, arc: 0 } },
      run: { stat_run: { vit: 0, for: 0, agi: 0, pow: 0, tec: 0, arc: 0 }, equipped_weapons: [] },
    };
    const playerA = { hp: 100 };
    const playerB = { hp: 99 };
    const rowsA = buildPlayerStatusRows(playerState, playerA, PLAYER_SPEED_PX_PER_SEC);
    const rowsB = buildPlayerStatusRows(playerState, playerB, PLAYER_SPEED_PX_PER_SEC);
    const digestA1 = buildPlayerStatusDigest(rowsA);
    const digestA2 = buildPlayerStatusDigest(rowsA);
    const digestB = buildPlayerStatusDigest(rowsB);

    expect(digestA1).toBe(digestA2);
    expect(digestB).not.toBe(digestA1);
  });
});
