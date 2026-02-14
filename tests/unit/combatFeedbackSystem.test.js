import { describe, expect, it } from "vitest";
import {
  createFloatingTextPopup,
  spawnDamagePopupsFromEvents,
  updateDamagePopups,
} from "../../src/combat/combatFeedbackSystem.js";

describe("combatFeedbackSystem", () => {
  it("damageイベントからポップアップを生成する", () => {
    const events = [
      { kind: "damage", targetType: "enemy", enemyId: "enemy-1", damage: 12, isCritical: true, worldX: 100, worldY: 200 },
      { kind: "status", enemyId: "enemy-1", value: "poison" },
      { kind: "damage", targetType: "player", enemyId: "enemy-2", damage: 7.4, worldX: 120.2, worldY: 210.9 },
    ];

    const popups = spawnDamagePopupsFromEvents(events, 10);

    expect(popups).toHaveLength(2);
    expect(popups[0]).toMatchObject({
      id: "popup-10-0",
      value: 12,
      isCritical: true,
      x: 100,
      y: 200,
      ageSec: 0,
      lifetimeSec: 0.45,
      alpha: 1,
      targetType: "enemy",
    });
    expect(popups[1]).toMatchObject({
      id: "popup-10-1",
      value: 7,
      isCritical: false,
      x: 120.2,
      y: 210.9,
      ageSec: 0,
      lifetimeSec: 0.45,
      alpha: 1,
      targetType: "player",
    });
  });

  it("ポップアップは上昇しながらフェードし寿命で消える", () => {
    const initial = [
      {
        id: "popup-1",
        value: 9,
        isCritical: true,
        x: 10,
        y: 50,
        ageSec: 0,
        lifetimeSec: 0.45,
        alpha: 1,
        targetType: "player",
      },
    ];

    const after100ms = updateDamagePopups(initial, 0.1);
    expect(after100ms).toHaveLength(1);
    expect(after100ms[0].y).toBeCloseTo(47.2, 5);
    expect(after100ms[0].alpha).toBeCloseTo(1 - 0.1 / 0.45, 5);
    expect(after100ms[0].targetType).toBe("player");
    expect(after100ms[0].isCritical).toBe(true);

    const expired = updateDamagePopups(after100ms, 0.5);
    expect(expired).toHaveLength(0);
  });

  it("テキストポップアップを生成してフェード更新できる", () => {
    const popup = createFloatingTextPopup({
      id: "pickup-1",
      text: "薬草",
      textKey: "name_item_herb_01",
      x: 10,
      y: 20,
      lifetimeSec: 0.8,
      riseSpeedPxPerSec: 30,
      fillStyle: "#ffffff",
      strokeStyle: "#000000",
    });

    expect(popup).toMatchObject({
      id: "pickup-1",
      text: "薬草",
      textKey: "name_item_herb_01",
      x: 10,
      y: 20,
      lifetimeSec: 0.8,
      riseSpeedPxPerSec: 30,
      fillStyle: "#ffffff",
      strokeStyle: "#000000",
      alpha: 1,
    });

    const next = updateDamagePopups([popup], 0.2);
    expect(next).toHaveLength(1);
    expect(next[0].text).toBe("薬草");
    expect(next[0].textKey).toBe("name_item_herb_01");
    expect(next[0].y).toBeCloseTo(14, 5);
    expect(next[0].alpha).toBeCloseTo(1 - 0.2 / 0.8, 5);
  });
});
