const ITEM_DB_FALLBACK_FILE_NAMES = ["item_herb_01.json"];

const REQUIRED_KEYS = [
  "id",
  "name_key",
  "description_key",
  "icon_file_name",
  "category",
  "sub_type",
  "max_stack",
  "use_params",
];

function assertHasRequiredKeys(rawItem, fileName) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in rawItem)) {
      throw new Error(`Item DB ${fileName} is missing required key: ${key}`);
    }
  }
}

function assertItemShape(rawItem, fileName) {
  if (typeof rawItem.id !== "string" || rawItem.id.length <= 0) {
    throw new Error(`Item DB ${fileName} has invalid id: ${rawItem.id}`);
  }

  if (typeof rawItem.name_key !== "string" || rawItem.name_key.length <= 0) {
    throw new Error(`Item DB ${fileName} has invalid name_key: ${rawItem.name_key}`);
  }

  if (typeof rawItem.description_key !== "string" || rawItem.description_key.length <= 0) {
    throw new Error(`Item DB ${fileName} has invalid description_key: ${rawItem.description_key}`);
  }

  if (typeof rawItem.icon_file_name !== "string" || rawItem.icon_file_name.length <= 0) {
    throw new Error(`Item DB ${fileName} has invalid icon_file_name: ${rawItem.icon_file_name}`);
  }

  if (typeof rawItem.category !== "string" || rawItem.category.length <= 0) {
    throw new Error(`Item DB ${fileName} has invalid category: ${rawItem.category}`);
  }

  if (typeof rawItem.sub_type !== "string" || rawItem.sub_type.length <= 0) {
    throw new Error(`Item DB ${fileName} has invalid sub_type: ${rawItem.sub_type}`);
  }

  if (!Number.isFinite(rawItem.max_stack) || rawItem.max_stack <= 0) {
    throw new Error(`Item DB ${fileName} has invalid max_stack: ${rawItem.max_stack}`);
  }

  if (!rawItem.use_params || typeof rawItem.use_params !== "object" || Array.isArray(rawItem.use_params)) {
    throw new Error(`Item DB ${fileName} has invalid use_params`);
  }
}

function normalizeItemRecord(rawItem, fileName) {
  assertHasRequiredKeys(rawItem, fileName);
  assertItemShape(rawItem, fileName);

  return {
    id: rawItem.id,
    nameKey: rawItem.name_key,
    descriptionKey: rawItem.description_key,
    iconFileName: rawItem.icon_file_name,
    category: rawItem.category,
    subType: rawItem.sub_type,
    maxStack: Math.max(1, Math.floor(Number(rawItem.max_stack) || 1)),
    usableInQuickslot: rawItem.usable_in_quickslot !== false,
    useParams: { ...rawItem.use_params },
  };
}

async function loadItemFile(fileName, cacheBustKey) {
  const url = new URL(`../../db/item_db/${fileName}`, import.meta.url);
  if (cacheBustKey) {
    url.searchParams.set("cb", String(cacheBustKey));
  }

  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load item DB file ${fileName}: HTTP ${response.status}`);
  }

  const rawItem = await response.json();
  return normalizeItemRecord(rawItem, fileName);
}

function extractItemJsonFileNamesFromDirectoryHtml(html) {
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  const fileNames = new Set();
  let match = hrefPattern.exec(html);

  while (match) {
    const href = match[1];
    const normalized = href.split("?")[0].split("#")[0];
    if (!normalized.endsWith(".json")) {
      match = hrefPattern.exec(html);
      continue;
    }

    const baseName = normalized.split("/").pop();
    if (baseName && !baseName.startsWith(".")) {
      fileNames.add(baseName);
    }
    match = hrefPattern.exec(html);
  }

  return Array.from(fileNames)
    .filter((fileName) => !fileName.includes("_template"))
    .sort();
}

async function discoverItemDbFileNames(cacheBustKey) {
  const directoryUrl = new URL("../../db/item_db/", import.meta.url);
  if (cacheBustKey) {
    directoryUrl.searchParams.set("cb", String(cacheBustKey));
  }

  try {
    const response = await fetch(directoryUrl.href, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) {
      throw new Error(`Unsupported content type: ${contentType || "unknown"}`);
    }

    const html = await response.text();
    const fileNames = extractItemJsonFileNamesFromDirectoryHtml(html);
    if (!fileNames.length) {
      throw new Error("No JSON files found in directory listing");
    }

    return fileNames;
  } catch (error) {
    console.warn(`Item DB discovery fallback: ${error instanceof Error ? error.message : String(error)}`);
    return ITEM_DB_FALLBACK_FILE_NAMES;
  }
}

export async function loadItemDefinitions() {
  const cacheBustKey = Date.now();
  const fileNames = await discoverItemDbFileNames(cacheBustKey);
  const definitions = await Promise.all(fileNames.map((fileName) => loadItemFile(fileName, cacheBustKey)));
  const seenIds = new Set();

  for (const definition of definitions) {
    if (seenIds.has(definition.id)) {
      throw new Error(`Item DB has duplicate id: ${definition.id}`);
    }
    seenIds.add(definition.id);
  }

  return definitions;
}
