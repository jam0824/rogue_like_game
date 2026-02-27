const DEFAULT_FOCUS_CLASS_NAME = "is-pad-focused";
const DIRECTION_KEYS = new Set(["up", "down", "left", "right"]);

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value.length === "number") {
    return Array.from(value);
  }
  return [];
}

function isElementVisible(element) {
  if (!element || typeof element !== "object") {
    return false;
  }
  if (element.hidden === true || element.disabled === true) {
    return false;
  }

  if (typeof element.getClientRects === "function") {
    const rects = element.getClientRects();
    if (rects && typeof rects.length === "number" && rects.length === 0) {
      return false;
    }
  }

  if (typeof element.getBoundingClientRect === "function") {
    const rect = element.getBoundingClientRect();
    if (rect && Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
    }
  }

  return true;
}

function dedupeFocusable(elements) {
  const result = [];
  const seen = new Set();
  for (const element of toArray(elements)) {
    if (!isElementVisible(element)) {
      continue;
    }
    if (seen.has(element)) {
      continue;
    }
    seen.add(element);
    result.push(element);
  }
  return result;
}

function getElementCenter(element) {
  const rect = typeof element.getBoundingClientRect === "function"
    ? element.getBoundingClientRect()
    : { left: 0, top: 0, width: 0, height: 0 };
  const left = Number(rect?.left) || 0;
  const top = Number(rect?.top) || 0;
  const width = Number(rect?.width) || 0;
  const height = Number(rect?.height) || 0;
  return {
    x: left + width / 2,
    y: top + height / 2,
  };
}

function getDirectionScore(fromCenter, toCenter, direction) {
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  let mainAxisDistance = 0;
  let crossAxisDistance = 0;
  if (direction === "up") {
    if (dy >= -0.5) {
      return Number.POSITIVE_INFINITY;
    }
    mainAxisDistance = -dy;
    crossAxisDistance = Math.abs(dx);
  } else if (direction === "down") {
    if (dy <= 0.5) {
      return Number.POSITIVE_INFINITY;
    }
    mainAxisDistance = dy;
    crossAxisDistance = Math.abs(dx);
  } else if (direction === "left") {
    if (dx >= -0.5) {
      return Number.POSITIVE_INFINITY;
    }
    mainAxisDistance = -dx;
    crossAxisDistance = Math.abs(dy);
  } else if (direction === "right") {
    if (dx <= 0.5) {
      return Number.POSITIVE_INFINITY;
    }
    mainAxisDistance = dx;
    crossAxisDistance = Math.abs(dy);
  } else {
    return Number.POSITIVE_INFINITY;
  }

  return mainAxisDistance * 1000 + crossAxisDistance;
}

function setFocusClass(element, className, focused) {
  if (!element || !element.classList || typeof element.classList.toggle !== "function") {
    return;
  }
  element.classList.toggle(className, focused);
}

function focusElement(element) {
  if (!element || typeof element.focus !== "function") {
    return;
  }
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function pickFirstCandidate(candidates) {
  if (!Array.isArray(candidates) || candidates.length <= 0) {
    return null;
  }

  const sorted = [...candidates].sort((left, right) => {
    const a = getElementCenter(left);
    const b = getElementCenter(right);
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });
  return sorted[0] ?? null;
}

export function collectFocusableCandidates(root, selectors = []) {
  if (!root || typeof root.querySelectorAll !== "function" || !Array.isArray(selectors)) {
    return [];
  }

  const candidates = [];
  for (const selector of selectors) {
    if (typeof selector !== "string" || selector.trim().length <= 0) {
      continue;
    }
    candidates.push(...toArray(root.querySelectorAll(selector)));
  }
  return dedupeFocusable(candidates);
}

export function createUiNavigator(options = {}) {
  const focusClassName =
    typeof options.focusClassName === "string" && options.focusClassName.length > 0
      ? options.focusClassName
      : DEFAULT_FOCUS_CLASS_NAME;

  let candidates = [];
  let focusedElement = null;

  function clearFocusedElement() {
    if (!focusedElement) {
      return;
    }
    setFocusClass(focusedElement, focusClassName, false);
    focusedElement = null;
  }

  function setFocusedElement(nextElement) {
    if (nextElement === focusedElement) {
      return;
    }
    if (focusedElement) {
      setFocusClass(focusedElement, focusClassName, false);
    }
    focusedElement = nextElement ?? null;
    if (!focusedElement) {
      return;
    }
    setFocusClass(focusedElement, focusClassName, true);
    focusElement(focusedElement);
  }

  return {
    setCandidates(nextCandidates, optionsForSet = {}) {
      const filtered = dedupeFocusable(nextCandidates);
      const preferFirst = optionsForSet.preferFirst === true;
      const canKeepFocus = focusedElement && filtered.includes(focusedElement);
      candidates = filtered;

      if (canKeepFocus) {
        setFocusedElement(focusedElement);
        return focusedElement;
      }

      clearFocusedElement();
      if (!preferFirst) {
        return null;
      }
      const first = pickFirstCandidate(candidates);
      setFocusedElement(first);
      return focusedElement;
    },

    move(direction) {
      if (!DIRECTION_KEYS.has(direction)) {
        return focusedElement;
      }
      if (!Array.isArray(candidates) || candidates.length <= 0) {
        clearFocusedElement();
        return null;
      }

      const current = focusedElement && candidates.includes(focusedElement)
        ? focusedElement
        : pickFirstCandidate(candidates);
      if (!focusedElement || !candidates.includes(focusedElement)) {
        setFocusedElement(current);
        return focusedElement;
      }

      const currentCenter = getElementCenter(current);
      let best = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        if (candidate === current) {
          continue;
        }
        const score = getDirectionScore(currentCenter, getElementCenter(candidate), direction);
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      if (best) {
        setFocusedElement(best);
      }
      return focusedElement;
    },

    confirm() {
      if (!focusedElement || typeof focusedElement.click !== "function") {
        return false;
      }
      focusedElement.click();
      return true;
    },

    cycleTabs(tabButtons, step = 1) {
      const tabs = dedupeFocusable(tabButtons);
      if (tabs.length <= 0) {
        return false;
      }

      let currentIndex = tabs.findIndex(
        (tabButton) => tabButton.classList && typeof tabButton.classList.contains === "function" && tabButton.classList.contains("is-active")
      );
      if (currentIndex < 0 && focusedElement) {
        currentIndex = tabs.indexOf(focusedElement);
      }
      if (currentIndex < 0) {
        currentIndex = 0;
      }

      const normalizedStep = step >= 0 ? 1 : -1;
      const nextIndex = (currentIndex + normalizedStep + tabs.length) % tabs.length;
      const nextTab = tabs[nextIndex];
      if (!nextTab) {
        return false;
      }

      if (typeof nextTab.click === "function") {
        nextTab.click();
      }
      setFocusedElement(nextTab);
      return true;
    },

    clearFocus() {
      clearFocusedElement();
    },

    getFocusedElement() {
      return focusedElement;
    },
  };
}
