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
    throw new Error(`Failed to load player assets: ${fieldName} is invalid.`);
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
    throw new Error(`Failed to load player assets: ${fieldName} is invalid (${value}).`);
  }
  return value;
}

async function loadPlayerSheet(assetPath, frameWidth, frameHeight, label) {
  const src = resolveAssetPath(assetPath);
  const image = await loadImage(src);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  if (!Number.isFinite(imageWidth) || imageWidth <= 0 || imageWidth % frameWidth !== 0) {
    throw new Error(
      `Failed to load player assets: ${label} width ${imageWidth} is not divisible by frameWidth ${frameWidth}.`
    );
  }

  if (!Number.isFinite(imageHeight) || imageHeight !== frameHeight) {
    throw new Error(
      `Failed to load player assets: ${label} height ${imageHeight} must match frameHeight ${frameHeight}.`
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

export async function loadPlayerAsset(playerDefinition) {
  if (!playerDefinition || typeof playerDefinition !== "object") {
    throw new Error("Failed to load player assets: player definition is required.");
  }

  const frameWidth = resolvePositiveNumber(playerDefinition.width, "width");
  const frameHeight = resolvePositiveNumber(playerDefinition.height, "height");
  const fps = resolvePositiveNumber(playerDefinition.fps, "fps");
  const defaultFacing = playerDefinition.playerPngFacingDirection === "right" ? "right" : "left";

  const [walk, idle, death] = await Promise.all([
    loadPlayerSheet(
      toNonEmptyPath(playerDefinition.walkPngFilePath, "walkPngFilePath"),
      frameWidth,
      frameHeight,
      "walk sheet"
    ),
    loadPlayerSheet(
      toNonEmptyPath(playerDefinition.idlePngFilePath, "idlePngFilePath"),
      frameWidth,
      frameHeight,
      "idle sheet"
    ),
    loadPlayerSheet(
      toNonEmptyPath(playerDefinition.deathPngFilePath, "deathPngFilePath"),
      frameWidth,
      frameHeight,
      "death sheet"
    ),
  ]);

  return {
    walk,
    idle,
    death,
    fps,
    defaultFacing,
    frameWidth,
    frameHeight,
  };
}
