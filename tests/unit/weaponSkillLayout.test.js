import { describe, expect, it } from "vitest";
import { buildSkillEditorLayout, flattenSkillEditorLayout, swapSkillSlots } from "../../src/ui/weaponSkillLayout.js";

const SKILL_DEFINITIONS = Object.freeze({
  skill_attack_01: { id: "skill_attack_01", skillType: "attack" },
  skill_modifier_01: { id: "skill_modifier_01", skillType: "modifier" },
  skill_orbit_01: { id: "skill_orbit_01", skillType: "orbit" },
});

describe("weaponSkillLayout", () => {
  it("skills[] を chainSlots に順序どおり配置する（orbit を分離しない）", () => {
    const layout = buildSkillEditorLayout(
      [
        { id: "skill_attack_01", plus: 1 },
        { id: "skill_orbit_01", plus: 0 },
        { id: "skill_modifier_01", plus: 2 },
      ],
      4,
      SKILL_DEFINITIONS
    );

    expect(layout.chainSlots).toEqual([
      { id: "skill_attack_01", plus: 1 },
      { id: "skill_orbit_01", plus: 0 },
      { id: "skill_modifier_01", plus: 2 },
      null,
    ]);
  });

  it("chain 内のスワップができる", () => {
    const layout = buildSkillEditorLayout(
      [
        { id: "skill_attack_01", plus: 1 },
        { id: "skill_modifier_01", plus: 0 },
      ],
      2,
      SKILL_DEFINITIONS
    );

    const result = swapSkillSlots(
      layout,
      { row: "chain", index: 0 },
      { row: "chain", index: 1 },
      SKILL_DEFINITIONS
    );

    expect(result.changed).toBe(true);
    expect(result.layout.chainSlots[0]).toEqual({ id: "skill_modifier_01", plus: 0 });
    expect(result.layout.chainSlots[1]).toEqual({ id: "skill_attack_01", plus: 1 });
  });

  it("chain 以外の row を指定したスワップを拒否する", () => {
    const layout = buildSkillEditorLayout(
      [
        { id: "skill_attack_01", plus: 1 },
        { id: "skill_orbit_01", plus: 0 },
      ],
      2,
      SKILL_DEFINITIONS
    );

    const result = swapSkillSlots(
      layout,
      { row: "chain", index: 0 },
      { row: "orbit", index: 0 },
      SKILL_DEFINITIONS
    );

    expect(result.changed).toBe(false);
    expect(result.reason).toBe("invalid_slot");
  });

  it("flatten 後の skills[] が chain の順序になる", () => {
    const layout = {
      chainSlots: [
        { id: "skill_attack_01", plus: 1 },
        { id: "skill_modifier_01", plus: 2 },
        null,
      ],
    };

    const flattened = flattenSkillEditorLayout(layout);
    expect(flattened).toEqual([
      { id: "skill_attack_01", plus: 1 },
      { id: "skill_modifier_01", plus: 2 },
    ]);
  });
});
