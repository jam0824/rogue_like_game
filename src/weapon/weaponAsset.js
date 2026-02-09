function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadAssetForDefinition(definition) {
  const src = new URL(`../../graphic/wepon/wepon_tip/${definition.weaponFileName}`, import.meta.url).href;
  const image = await loadImage(src);

  return [
    definition.id,
    {
      image,
      src,
      frameWidth: definition.width,
      frameHeight: definition.height,
      columns: 1,
      rows: 1,
    },
  ];
}

export async function loadWeaponAssets(weaponDefinitions) {
  const entries = await Promise.all(weaponDefinitions.map((definition) => loadAssetForDefinition(definition)));
  return Object.fromEntries(entries);
}
