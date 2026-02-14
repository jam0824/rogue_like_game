function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function resolveFrameCount(image, definition) {
  if (definition.animationDirection === "vertical") {
    return Math.floor(image.height / definition.height);
  }

  return Math.floor(image.width / definition.width);
}

async function loadAssetForDefinition(definition) {
  const src = new URL(`../../${definition.effectFileName}`, import.meta.url).href;
  const image = await loadImage(src);
  const frameCount = resolveFrameCount(image, definition);

  if (!Number.isFinite(frameCount) || frameCount < 1) {
    throw new Error(`Failed to resolve effect frameCount (effectId=${definition.id}, frameCount=${frameCount})`);
  }

  return [
    definition.id,
    {
      image,
      src,
      frameWidth: definition.width,
      frameHeight: definition.height,
      frameCount,
      animationDirection: definition.animationDirection,
    },
  ];
}

export async function loadEffectAssets(effectDefinitions) {
  const entries = await Promise.all(effectDefinitions.map((definition) => loadAssetForDefinition(definition)));
  return Object.fromEntries(entries);
}
