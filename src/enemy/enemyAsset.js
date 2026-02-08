function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadAssetForDefinition(definition) {
  const src = new URL(`../../graphic/enemy/enemy_tip/${definition.tipFileName}`, import.meta.url).href;
  const image = await loadImage(src);

  return [
    definition.id,
    {
      image,
      src,
      frameWidth: definition.width,
      frameHeight: definition.height,
      columns: 3,
      rows: 4,
    },
  ];
}

export async function loadEnemyAssets(enemyDefinitions) {
  const entries = await Promise.all(enemyDefinitions.map((definition) => loadAssetForDefinition(definition)));
  return Object.fromEntries(entries);
}
