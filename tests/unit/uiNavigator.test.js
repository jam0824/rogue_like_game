import { describe, expect, it, vi } from "vitest";
import { collectFocusableCandidates, createUiNavigator } from "../../src/input/uiNavigator.js";

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    toggle(value, force) {
      if (force === true) {
        values.add(value);
        return true;
      }
      if (force === false) {
        values.delete(value);
        return false;
      }
      if (values.has(value)) {
        values.delete(value);
        return false;
      }
      values.add(value);
      return true;
    },
    contains(value) {
      return values.has(value);
    },
  };
}

function createElement({ x = 0, y = 0, width = 24, height = 24, hidden = false, disabled = false, classNames = [] } = {}) {
  return {
    hidden,
    disabled,
    classList: createClassList(classNames),
    click: vi.fn(),
    focus: vi.fn(),
    getClientRects: vi.fn(() => (hidden ? [] : [{}])),
    getBoundingClientRect: vi.fn(() => ({
      left: x,
      top: y,
      width,
      height,
    })),
  };
}

describe("uiNavigator", () => {
  it("方向移動で最寄り要素にフォーカスし confirm で click する", () => {
    const left = createElement({ x: 0, y: 0 });
    const right = createElement({ x: 100, y: 0 });
    const navigator = createUiNavigator();

    navigator.setCandidates([left, right], { preferFirst: true });
    expect(navigator.getFocusedElement()).toBe(left);

    navigator.move("right");
    expect(navigator.getFocusedElement()).toBe(right);

    const confirmed = navigator.confirm();
    expect(confirmed).toBe(true);
    expect(right.click).toHaveBeenCalledTimes(1);
  });

  it("cycleTabs は is-active を基準に循環して選択する", () => {
    const tabA = createElement({ classNames: ["is-active"] });
    const tabB = createElement();
    const tabC = createElement();
    const navigator = createUiNavigator();

    const changed = navigator.cycleTabs([tabA, tabB, tabC], 1);
    expect(changed).toBe(true);
    expect(tabB.click).toHaveBeenCalledTimes(1);
    expect(navigator.getFocusedElement()).toBe(tabB);
  });

  it("collectFocusableCandidates は hidden/disabled を除外する", () => {
    const visible = createElement();
    const hidden = createElement({ hidden: true });
    const disabled = createElement({ disabled: true });
    const root = {
      querySelectorAll: vi.fn((selector) => {
        if (selector === ".a") {
          return [visible, hidden];
        }
        if (selector === ".b") {
          return [disabled];
        }
        return [];
      }),
    };

    const candidates = collectFocusableCandidates(root, [".a", ".b"]);
    expect(candidates).toEqual([visible]);
  });
});
