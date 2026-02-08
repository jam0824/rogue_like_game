import { TILE_SIZE } from "../config/constants.js";
import { STANDARD_WALL_SYMBOLS, TALL_WALL_SYMBOLS } from "../tiles/tileCatalog.js";

function drawSymbolLayer(ctx, assets, symbolGrid, symbols) {
  const height = symbolGrid.length;
  const width = symbolGrid[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const symbol = symbolGrid[y][x];
      if (!symbols.has(symbol)) {
        continue;
      }

      const asset = assets[symbol];
      if (!asset) {
        continue;
      }

      ctx.drawImage(asset.image, x * TILE_SIZE, y * TILE_SIZE);
    }
  }
}

function drawFloor(ctx, assets, floorGrid) {
  const tile = assets[" "];
  const height = floorGrid.length;
  const width = floorGrid[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!floorGrid[y][x]) {
        continue;
      }
      ctx.drawImage(tile.image, x * TILE_SIZE, y * TILE_SIZE);
    }
  }
}

function drawRoomMarker(ctx, room, label, fillStyle, textStyle) {
  const px = room.x * TILE_SIZE;
  const py = room.y * TILE_SIZE;
  const pw = room.w * TILE_SIZE;
  const ph = room.h * TILE_SIZE;

  ctx.fillStyle = fillStyle;
  ctx.fillRect(px, py, pw, ph);

  ctx.strokeStyle = textStyle;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);

  ctx.font = "bold 18px monospace";
  ctx.fillStyle = textStyle;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, px + pw / 2, py + ph / 2);
}

function drawDungeonBase(ctx, assets, dungeon) {
  const widthPx = dungeon.gridWidth * TILE_SIZE;
  const heightPx = dungeon.gridHeight * TILE_SIZE;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#050609";
  ctx.fillRect(0, 0, widthPx, heightPx);

  drawFloor(ctx, assets, dungeon.floorGrid);
  drawSymbolLayer(ctx, assets, dungeon.symbolGrid, TALL_WALL_SYMBOLS);
  drawSymbolLayer(ctx, assets, dungeon.symbolGrid, STANDARD_WALL_SYMBOLS);

  const startRoom = dungeon.rooms.find((room) => room.id === dungeon.startRoomId);
  const stairsRoom = dungeon.rooms.find((room) => room.id === dungeon.stairsRoomId);

  if (startRoom) {
    drawRoomMarker(ctx, startRoom, "START", "rgba(58, 166, 255, 0.22)", "#7dc1ff");
  }

  if (stairsRoom) {
    drawRoomMarker(ctx, stairsRoom, "STAIRS", "rgba(244, 180, 0, 0.22)", "#ffd166");
  }
}

/**
 * @param {Record<string, {image:HTMLImageElement}>} assets
 * @param {import("../generation/dungeonGenerator.js").DungeonResult & {symbolGrid:(string|null)[][]}} dungeon
 */
export function buildDungeonBackdrop(assets, dungeon) {
  const widthPx = dungeon.gridWidth * TILE_SIZE;
  const heightPx = dungeon.gridHeight * TILE_SIZE;
  const surface = document.createElement("canvas");
  surface.width = widthPx;
  surface.height = heightPx;

  const ctx = surface.getContext("2d");
  drawDungeonBase(ctx, assets, dungeon);

  return {
    canvas: surface,
    widthPx,
    heightPx,
  };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{canvas:HTMLCanvasElement,widthPx:number,heightPx:number}} backdrop
 * @param {{image:HTMLImageElement,frameWidth:number,frameHeight:number}|null} playerAsset
 * @param {{row:number,col:number}|null} playerFrame
 * @param {{x:number,y:number}|null} player
 */
export function renderFrame(canvas, backdrop, playerAsset, playerFrame, player) {
  if (!backdrop) {
    return;
  }

  if (canvas.width !== backdrop.widthPx || canvas.height !== backdrop.heightPx) {
    canvas.width = backdrop.widthPx;
    canvas.height = backdrop.heightPx;
  }

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(backdrop.canvas, 0, 0);

  if (!playerAsset || !playerFrame || !player) {
    return;
  }

  const sx = playerFrame.col * playerAsset.frameWidth;
  const sy = playerFrame.row * playerAsset.frameHeight;
  const dx = Math.round(player.x);
  const dy = Math.round(player.y);

  ctx.drawImage(
    playerAsset.image,
    sx,
    sy,
    playerAsset.frameWidth,
    playerAsset.frameHeight,
    dx,
    dy,
    playerAsset.frameWidth,
    playerAsset.frameHeight
  );
}
