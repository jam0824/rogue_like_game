import { describe, expect, it } from "vitest";
import { spawnDamagePopupsFromEvents, updateDamagePopups } from "../../src/combat/combatFeedbackSystem.js";

describe("combatFeedbackSystem", () => {
  it("damageイベントからポップアップを生成する", () => {
    const events = [
      { kind: "damage", enemyId: "enemy-1", damage: 12, worldX: 100, worldY: 200 },
      { kind: "status", enemyId: "enemy-1", value: "poison" },
      { kind: "damage", enemyId: "enemy-2", damage: 7.4, worldX: 120.2, worldY: 210.9 },
    ];

    const popups = spawnDamagePopupsFromEvents(events, 10);

    expect(popups).toHaveLength(2);
    expect(popups[0]).toMatchObject({
      id: "popup-10-0",
      value: 12,
      x: 100,
      y: 200,
      ageSec: 0,
      lifetimeSec: 0.45,
      alpha: 1,
    });
    expect(popups[1]).toMatchObject({
      id: "popup-10-1",
      value: 7,
      x: 120.2,
      y: 210.9,
      ageSec: 0,
      lifetimeSec: 0.45,
      alpha: 1,
    });
  });

  it("ポップアップは上昇しながらフェードし寿命で消える", () => {
    const initial = [
      {
        id: "popup-1",
        value: 9,
        x: 10,
        y: 50,
        ageSec: 0,
        lifetimeSec: 0.45,
        alpha: 1,
      },
    ];

    const after100ms = updateDamagePopups(initial, 0.1);
    expect(after100ms).toHaveLength(1);
    expect(after100ms[0].y).toBeCloseTo(47.2, 5);
    expect(after100ms[0].alpha).toBeCloseTo(1 - 0.1 / 0.45, 5);

    const expired = updateDamagePopups(after100ms, 0.5);
    expect(expired).toHaveLength(0);
  });
});
