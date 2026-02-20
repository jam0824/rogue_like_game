function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function resolveSheetLayout(image, definition) {
  const frameWidth = Math.max(1, Number(definition.width) || 1);
  const frameHeight = Math.max(1, Number(definition.height) || 1);
  const frameColumns = Math.floor(image.width / frameWidth);
  const frameRows = Math.floor(image.height / frameHeight);

  if (frameColumns < 1 || frameRows < 1) {
    return {
      frameCount: 0,
      frameColumns,
      frameRows,
    };
  }

  const widthRemainder = image.width % frameWidth;
  const heightRemainder = image.height % frameHeight;
  if (widthRemainder !== 0 || heightRemainder !== 0) {
    console.warn(
      `[EffectAsset] sheet truncated for ${definition.id}: remainder width=${widthRemainder}, height=${heightRemainder}`
    );
  }

  if (definition.animationDirection === "vertical") {
    return {
      frameCount: frameRows,
      frameColumns,
      frameRows,
    };
  }

  return {
    frameCount: frameColumns * frameRows,
    frameColumns,
    frameRows,
  };
}

async function loadAssetForDefinition(definition) {
  const src = new URL(`../../${definition.effectFileName}`, import.meta.url).href;
  const image = await loadImage(src);
  const layout = resolveSheetLayout(image, definition);

  if (!Number.isFinite(layout.frameCount) || layout.frameCount < 1) {
    throw new Error(
      `Failed to resolve effect frameCount (effectId=${definition.id}, frameCount=${layout.frameCount})`
    );
  }

  return [
    definition.id,
    {
      image,
      src,
      frameWidth: definition.width,
      frameHeight: definition.height,
      frameCount: layout.frameCount,
      frameColumns: layout.frameColumns,
      frameRows: layout.frameRows,
      animationDirection: definition.animationDirection,
    },
  ];
}

export async function loadEffectAssets(effectDefinitions) {
  const entries = await Promise.all(effectDefinitions.map((definition) => loadAssetForDefinition(definition)));
  return Object.fromEntries(entries);
}
