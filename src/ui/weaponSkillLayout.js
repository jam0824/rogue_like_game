const CHAIN_ROW = "chain";
const ORBIT_ROW = "orbit";
const ORBIT_SLOT_COUNT = 1;

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
    orbitSlots: cloneSlots(layout?.orbitSlots),
  };
}

function getSkillType(skillDefinitionsById, skillId) {
  if (typeof skillId !== "string" || skillId.length <= 0) {
    return "";
  }
  return skillDefinitionsById?.[skillId]?.skillType ?? "";
}

function isOrbitSkill(instance, skillDefinitionsById) {
  return getSkillType(skillDefinitionsById, instance?.id) === ORBIT_ROW;
}

function canPlaceInRow(instance, row, skillDefinitionsById) {
  if (!instance) {
    return true;
  }
  const isOrbit = isOrbitSkill(instance, skillDefinitionsById);
  if (row === ORBIT_ROW) {
    return isOrbit;
  }
  if (row === CHAIN_ROW) {
    return !isOrbit;
  }
  return false;
}

function getRowSlots(layout, row) {
  if (row === CHAIN_ROW) {
    return layout.chainSlots;
  }
  if (row === ORBIT_ROW) {
    return layout.orbitSlots;
  }
  return null;
}

function normalizeSource(source, layout) {
  if (!source || typeof source !== "object") {
    return null;
  }
  const row = source.row === ORBIT_ROW ? ORBIT_ROW : source.row === CHAIN_ROW ? CHAIN_ROW : "";
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
  const layout = {
    chainSlots: Array.from({ length: chainCount }, () => null),
    orbitSlots: Array.from({ length: ORBIT_SLOT_COUNT }, () => null),
  };

  let chainWriteIndex = 0;
  const instances = normalizeSkillInstances(skills);
  for (const instance of instances) {
    if (isOrbitSkill(instance, skillDefinitionsById) && layout.orbitSlots[0] === null) {
      layout.orbitSlots[0] = cloneSkillInstance(instance);
      continue;
    }

    if (chainWriteIndex >= layout.chainSlots.length) {
      continue;
    }

    layout.chainSlots[chainWriteIndex] = cloneSkillInstance(instance);
    chainWriteIndex += 1;
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

  if (!canPlaceInRow(srcInstance, dst.row, skillDefinitionsById)) {
    return {
      layout: nextLayout,
      changed: false,
      reason: "orbit_constraint",
    };
  }

  if (!canPlaceInRow(dstInstance, src.row, skillDefinitionsById)) {
    return {
      layout: nextLayout,
      changed: false,
      reason: "orbit_constraint",
    };
  }

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
  return [...nextLayout.chainSlots, ...nextLayout.orbitSlots]
    .map((instance) => cloneSkillInstance(instance))
    .filter((instance) => instance !== null);
}
