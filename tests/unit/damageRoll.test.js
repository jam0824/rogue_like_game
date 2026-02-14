import { describe, expect, it } from "vitest";
import { rollHitDamage } from "../../src/combat/damageRoll.js";

describe("damageRoll", () => {
  it("同じ seedKey なら同じロール結果を返す", () => {
    const input = {
      baseDamage: 12,
      damageMult: 1.25,
      attackScale: 1.4,
      critChance: 0.3,
      critMult: 1.8,
      seedKey: "deterministic-seed",
    };

    const first = rollHitDamage(input);
    const second = rollHitDamage(input);

    expect(first).toEqual(second);
  });

  it("RandMult が ±10% 範囲に収まる", () => {
    const result = rollHitDamage({
      baseDamage: 12,
      seedKey: "rand-range-seed",
    });

    expect(result.randMult).toBeGreaterThanOrEqual(0.9);
    expect(result.randMult).toBeLessThanOrEqual(1.1);
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });
});
