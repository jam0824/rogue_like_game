export const TALL_WALL_SYMBOLS = new Set(["B", "F", "G"]);
export const STANDARD_WALL_SYMBOLS = new Set(["A", "C", "D", "E", "H", "I", "J", "K", "L"]);

const SYMBOL_TO_TIP_SET_KEY = {
  " ": "tile",
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  E: "E",
  F: "F",
  G: "G",
  H: "H",
  I: "I",
  J: "J",
  K: "K",
  L: "L",
};

const DEFAULT_WALKABLE_TILE_DECORATION_PROBABILITY = 0.05;
const WALKABLE_TILE_DECORATION_HASH_SYMBOL = "walkable_tile_decoration";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function hashString32(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeSeed(seed) {
  if (seed === null || seed === undefined) {
    return "0";
  }
  return String(seed);
}

function pickVariantIndex(seed, symbol, tileX, tileY, variantLength) {
  if (variantLength <= 1) {
    return 0;
  }
  const hash = hashString32(`${normalizeSeed(seed)}|${symbol}|${tileX}|${tileY}`);
  return hash % variantLength;
}

function pickDeterministicRoll(seed, symbol, tileX, tileY) {
  const hash = hashString32(`${normalizeSeed(seed)}|${symbol}|${tileX}|${tileY}|roll`);
  return hash / 4294967296;
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * @param {Record<string, {variants:{src:string,image:HTMLImageElement,width:number,height:number}[]}>} assets
 * @param {string} symbol
 * @param {string|number} seed
 * @param {number} tileX
 * @param {number} tileY
 */
export function resolveTileVariantAsset(assets, symbol, seed, tileX, tileY) {
  const variants = assets?.[symbol]?.variants ?? [];
  if (variants.length <= 0) {
    return null;
  }

  const variantIndex = pickVariantIndex(seed, symbol, tileX, tileY, variants.length);
  return variants[variantIndex] ?? variants[0] ?? null;
}

/**
 * @param {Record<string, {variants:{src:string,image:HTMLImageElement,width:number,height:number}[]}>} assets
 * @param {string|number} seed
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} probability
 */
export function resolveWalkableTileDecorationAsset(
  assets,
  seed,
  tileX,
  tileY,
  probability = DEFAULT_WALKABLE_TILE_DECORATION_PROBABILITY
) {
  const variants = assets?.walkableTileDecoration?.variants ?? [];
  if (variants.length <= 0) {
    return null;
  }

  const normalizedProbability = clamp01(probability);
  if (normalizedProbability <= 0) {
    return null;
  }

  const roll = pickDeterministicRoll(seed, WALKABLE_TILE_DECORATION_HASH_SYMBOL, tileX, tileY);
  if (roll >= normalizedProbability) {
    return null;
  }

  const variantIndex = pickVariantIndex(seed, WALKABLE_TILE_DECORATION_HASH_SYMBOL, tileX, tileY, variants.length);
  return variants[variantIndex] ?? variants[0] ?? null;
}

/**
 * @param {{
 *   tipSetRootPath: string,
 *   tipSet: Record<string, string[]>,
 *   walkableTileDecoration?: string[]
 * }} dungeonDefinition
 */
export async function loadTileAssets(dungeonDefinition) {
  if (!dungeonDefinition || typeof dungeonDefinition !== "object") {
    throw new Error("Failed to load tile assets: dungeon definition is missing.");
  }

  if (typeof dungeonDefinition.tipSetRootPath !== "string" || dungeonDefinition.tipSetRootPath.length <= 0) {
    throw new Error("Failed to load tile assets: tipSetRootPath is invalid.");
  }

  if (!dungeonDefinition.tipSet || typeof dungeonDefinition.tipSet !== "object") {
    throw new Error("Failed to load tile assets: tipSet is invalid.");
  }

  const entries = await Promise.all(
    Object.entries(SYMBOL_TO_TIP_SET_KEY).map(async ([symbol, tipSetKey]) => {
      const fileNames = dungeonDefinition.tipSet[tipSetKey];
      if (!Array.isArray(fileNames) || fileNames.length <= 0) {
        throw new Error(`Failed to load tile assets: missing tip_set entry for ${tipSetKey}`);
      }

      const variants = await Promise.all(
        fileNames.map(async (fileName) => {
          const src = `${dungeonDefinition.tipSetRootPath}/${fileName}`;
          const image = await loadImage(src);
          return {
            src,
            image,
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
          };
        })
      );

      return [
        symbol,
        {
          variants,
        },
      ];
    })
  );

  const walkableTileDecorationFileNames = Array.isArray(dungeonDefinition.walkableTileDecoration)
    ? dungeonDefinition.walkableTileDecoration
    : [];

  const walkableTileDecorationVariants = await Promise.all(
    walkableTileDecorationFileNames.map(async (fileName) => {
      const src = `${dungeonDefinition.tipSetRootPath}/${fileName}`;
      const image = await loadImage(src);
      return {
        src,
        image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      };
    })
  );

  return {
    ...Object.fromEntries(entries),
    walkableTileDecoration: {
      variants: walkableTileDecorationVariants,
    },
  };
}
