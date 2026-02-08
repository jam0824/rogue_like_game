import { PLAYER_HEIGHT, PLAYER_WIDTH } from "../config/constants.js";

const PLAYER_SPRITE_SRC = new URL("../../graphic/player/player_tip/char_p_hero_m03a.png", import.meta.url).href;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

export async function loadPlayerAsset() {
  const image = await loadImage(PLAYER_SPRITE_SRC);

  return {
    image,
    src: PLAYER_SPRITE_SRC,
    frameWidth: PLAYER_WIDTH,
    frameHeight: PLAYER_HEIGHT,
    columns: 3,
    rows: 4,
  };
}
