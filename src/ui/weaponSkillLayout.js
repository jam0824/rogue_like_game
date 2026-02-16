const CHAIN_ROW = "chain";

function toNonNegativeInt(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function cloneSkillInstance(instance) {
  if (!instance || typeof instance.id !== "string" || instance.id.length <= 0) {
    return null;
  }
  return {
    id: instance.id,
    plus: toNonNegativeInt(instance.plus, 0),
  };
}

function normalizeSkillInstances(skills) {
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills
    .map((skill) => cloneSkillInstance(skill))
    .filter((skill) => skill !== null);
}

function cloneSlots(slots) {
  if (!Array.isArray(slots)) {
    return [];
  }
  return slots.map((slot) => cloneSkillInstance(slot));
}

function cloneLayout(layout) {
  return {
    chainSlots: cloneSlots(layout?.chainSlots),
  };
}

function getRowSlots(layout, row) {
  if (row === CHAIN_ROW) {
    return layout.chainSlots;
  }
  return null;
}

function normalizeSource(source, layout) {
  if (!source || typeof source !== "object") {
    return null;
  }
  const row = source.row === CHAIN_ROW ? CHAIN_ROW : "";
  if (!row) {
    return null;
  }
  const slots = getRowSlots(layout, row);
  const index = toNonNegativeInt(source.index, -1);
  if (!Array.isArray(slots) || index < 0 || index >= slots.length) {
    return null;
  }
  return {
    row,
    index,
  };
}

export function buildSkillEditorLayout(skills, chipSlotCount, skillDefinitionsById = {}) {
  const chainCount = Math.max(0, toNonNegativeInt(chipSlotCount, 0));
  void skillDefinitionsById;
  const layout = {
    chainSlots: Array.from({ length: chainCount }, () => null),
  };

  const instances = normalizeSkillInstances(skills);
  for (let index = 0; index < layout.chainSlots.length; index += 1) {
    layout.chainSlots[index] = cloneSkillInstance(instances[index]);
  }

  return layout;
}

export function swapSkillSlots(layout, source, target, skillDefinitionsById = {}) {
  const nextLayout = cloneLayout(layout);
  const src = normalizeSource(source, nextLayout);
  const dst = normalizeSource(target, nextLayout);

  if (!src || !dst) {
    return {
      layout: nextLayout,
      changed: false,
      reason: "invalid_slot",
    };
  }

  if (src.row === dst.row && src.index === dst.index) {
    return {
      layout: nextLayout,
      changed: false,
      reason: "same_slot",
    };
  }

  const srcSlots = getRowSlots(nextLayout, src.row);
  const dstSlots = getRowSlots(nextLayout, dst.row);
  const srcInstance = cloneSkillInstance(srcSlots[src.index]);
  const dstInstance = cloneSkillInstance(dstSlots[dst.index]);
  void skillDefinitionsById;

  srcSlots[src.index] = dstInstance;
  dstSlots[dst.index] = srcInstance;
  return {
    layout: nextLayout,
    changed: true,
    reason: "",
  };
}

export function flattenSkillEditorLayout(layout) {
  const nextLayout = cloneLayout(layout);
  return nextLayout.chainSlots
    .map((instance) => cloneSkillInstance(instance))
    .filter((instance) => instance !== null);
}
