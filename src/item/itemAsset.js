function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadAssetForDefinition(definition) {
  const src = new URL(`../../graphic/item/${definition.iconFileName}`, import.meta.url).href;
  const image = await loadImage(src);

  return [
    definition.id,
    {
      image,
      src,
      width: image.width,
      height: image.height,
    },
  ];
}

export async function loadItemAssets(itemDefinitions) {
  const entries = await Promise.all((itemDefinitions ?? []).map((definition) => loadAssetForDefinition(definition)));
  return Object.fromEntries(entries);
}
