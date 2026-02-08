export const TILE_DEFINITIONS = {
  " ": { src: "map_tip/dungeon_01/tile_normal.png", width: 32, height: 32 },
  A: { src: "map_tip/dungeon_01/left_top_01.png", width: 32, height: 32 },
  B: { src: "map_tip/dungeon_01/top_01.png", width: 32, height: 160 },
  C: { src: "map_tip/dungeon_01/right_top.png", width: 32, height: 32 },
  D: { src: "map_tip/dungeon_01/left_01.png", width: 32, height: 32 },
  E: { src: "map_tip/dungeon_01/right_01.png", width: 32, height: 32 },
  F: { src: "map_tip/dungeon_01/left_top_corner.png", width: 32, height: 160 },
  G: { src: "map_tip/dungeon_01/right_top_corner.png", width: 32, height: 160 },
  H: { src: "map_tip/dungeon_01/left_bottom_corner.png", width: 32, height: 32 },
  I: { src: "map_tip/dungeon_01/bottom_01.png", width: 32, height: 32 },
  J: { src: "map_tip/dungeon_01/right_bottom_corner.png", width: 32, height: 32 },
  K: { src: "map_tip/dungeon_01/left_bottom_01.png", width: 32, height: 32 },
  L: { src: "map_tip/dungeon_01/right_bottom_01.png", width: 32, height: 32 },
};

export const TALL_WALL_SYMBOLS = new Set(["B", "F", "G"]);
export const STANDARD_WALL_SYMBOLS = new Set(["A", "C", "D", "E", "H", "I", "J", "K", "L"]);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

export async function loadTileAssets() {
  const entries = await Promise.all(
    Object.entries(TILE_DEFINITIONS).map(async ([symbol, definition]) => {
      const image = await loadImage(definition.src);
      return [
        symbol,
        {
          ...definition,
          image,
        },
      ];
    })
  );

  return Object.fromEntries(entries);
}
