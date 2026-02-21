function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function toNonEmptyPath(rawPath, fieldName) {
  if (typeof rawPath !== "string" || rawPath.trim().length <= 0) {
    throw new Error(`Failed to load enemy assets: ${fieldName} is invalid.`);
  }
  return rawPath.trim();
}

function resolveAssetPath(assetPath) {
  const normalizedPath = toNonEmptyPath(assetPath, "asset path");
  if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
    return normalizedPath;
  }
  if (normalizedPath.startsWith("/")) {
    return normalizedPath;
  }
  return new URL(`../../${normalizedPath.replace(/^\.\//, "")}`, import.meta.url).href;
}

function resolvePositiveNumber(value, fieldName) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Failed to load enemy assets: ${fieldName} is invalid (${value}).`);
  }
  return value;
}

async function loadEnemySheet(assetPath, frameWidth, frameHeight, label) {
  const src = resolveAssetPath(assetPath);
  const image = await loadImage(src);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  if (!Number.isFinite(imageWidth) || imageWidth <= 0 || imageWidth % frameWidth !== 0) {
    throw new Error(
      `Failed to load enemy assets: ${label} width ${imageWidth} is not divisible by frameWidth ${frameWidth}.`
    );
  }

  if (!Number.isFinite(imageHeight) || imageHeight !== frameHeight) {
    throw new Error(
      `Failed to load enemy assets: ${label} height ${imageHeight} must match frameHeight ${frameHeight}.`
    );
  }

  return {
    image,
    src,
    frameWidth,
    frameHeight,
    frameCount: imageWidth / frameWidth,
  };
}

async function loadAssetForDefinition(definition) {
  const frameWidth = resolvePositiveNumber(definition.width, "width");
  const frameHeight = resolvePositiveNumber(definition.height, "height");
  const fps = resolvePositiveNumber(definition.fps, "fps");
  const drawScale = resolvePositiveNumber(definition.imageMagnification, "imageMagnification");
  const defaultFacing = definition.pngFacingDirection === "left" ? "left" : "right";

  const attackPath =
    typeof definition.attackPngFilePath === "string" && definition.attackPngFilePath.trim().length > 0
      ? definition.attackPngFilePath
      : null;
  const attackPromise = attackPath
    ? loadEnemySheet(
        toNonEmptyPath(attackPath, "attackPngFilePath"),
        frameWidth,
        frameHeight,
        `attack sheet (${definition.id})`
      ).catch((error) => {
        console.warn(
          `Failed to load optional attack sheet (${definition.id}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return null;
      })
    : Promise.resolve(null);

  const [walk, idle, death, attack] = await Promise.all([
    loadEnemySheet(
      toNonEmptyPath(definition.walkPngFilePath, "walkPngFilePath"),
      frameWidth,
      frameHeight,
      `walk sheet (${definition.id})`
    ),
    loadEnemySheet(
      toNonEmptyPath(definition.idlePngFilePath, "idlePngFilePath"),
      frameWidth,
      frameHeight,
      `idle sheet (${definition.id})`
    ),
    loadEnemySheet(
      toNonEmptyPath(definition.deathPngFilePath, "deathPngFilePath"),
      frameWidth,
      frameHeight,
      `death sheet (${definition.id})`
    ),
    attackPromise,
  ]);

  return [
    definition.id,
    {
      walk,
      idle,
      attack,
      death,
      fps,
      defaultFacing,
      drawScale,
      frameWidth,
      frameHeight,
    },
  ];
}

export async function loadEnemyAssets(enemyDefinitions) {
  const entries = await Promise.all(enemyDefinitions.map((definition) => loadAssetForDefinition(definition)));
  return Object.fromEntries(entries);
}
