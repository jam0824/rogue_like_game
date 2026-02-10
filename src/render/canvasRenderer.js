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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function drawFrameWithTransform(ctx, asset, sx, sy, drawWidth, drawHeight, dx, dy, rotationRad) {
  ctx.save();
  if (Math.abs(rotationRad) > 0.000001) {
    const centerX = dx + drawWidth / 2;
    const centerY = dy + drawHeight / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(rotationRad);
    ctx.drawImage(asset.image, sx, sy, drawWidth, drawHeight, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  } else {
    ctx.drawImage(asset.image, sx, sy, drawWidth, drawHeight, dx, dy, drawWidth, drawHeight);
  }
  ctx.restore();
}

const tintSurfaceCache = new Map();

function getTintSurface(width, height) {
  const key = `${width}x${height}`;
  const cached = tintSurfaceCache.get(key);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const surface = { canvas, ctx };
  tintSurfaceCache.set(key, surface);
  return surface;
}

function drawTintedFrame(
  ctx,
  asset,
  sx,
  sy,
  drawWidth,
  drawHeight,
  dx,
  dy,
  rotationRad,
  color,
  alpha
) {
  const tintAlpha = clamp(Number(alpha) || 0, 0, 1);
  if (tintAlpha <= 0) {
    return;
  }

  const tintSurface = getTintSurface(drawWidth, drawHeight);
  const tintCtx = tintSurface.ctx;

  tintCtx.globalCompositeOperation = "source-over";
  tintCtx.clearRect(0, 0, drawWidth, drawHeight);
  tintCtx.drawImage(asset.image, sx, sy, drawWidth, drawHeight, 0, 0, drawWidth, drawHeight);
  tintCtx.globalCompositeOperation = "source-in";
  tintCtx.fillStyle = color;
  tintCtx.fillRect(0, 0, drawWidth, drawHeight);
  tintCtx.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.globalAlpha = tintAlpha;
  if (Math.abs(rotationRad) > 0.000001) {
    const centerX = dx + drawWidth / 2;
    const centerY = dy + drawHeight / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(rotationRad);
    ctx.drawImage(tintSurface.canvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  } else {
    ctx.drawImage(tintSurface.canvas, dx, dy, drawWidth, drawHeight);
  }
  ctx.restore();
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

function drawSprite(ctx, asset, frame, entity, options = {}) {
  const sx = frame.col * asset.frameWidth;
  const sy = frame.row * asset.frameHeight;
  const dx = Math.round(entity.x);
  const dy = Math.round(entity.y);
  const rotationRad = Number.isFinite(options.rotationRad) ? options.rotationRad : 0;
  const telegraphAlpha = clamp(Number(options.telegraphAlpha) || 0, 0, 1);
  const flashAlpha = clamp(Number(options.flashAlpha) || 0, 0, 1);
  const drawWidth = asset.frameWidth;
  const drawHeight = asset.frameHeight;

  drawFrameWithTransform(ctx, asset, sx, sy, drawWidth, drawHeight, dx, dy, rotationRad);

  if (telegraphAlpha > 0) {
    drawTintedFrame(ctx, asset, sx, sy, drawWidth, drawHeight, dx, dy, rotationRad, "#ff2d2d", telegraphAlpha);
  }

  if (flashAlpha <= 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = flashAlpha;
  ctx.filter = "brightness(0) invert(1)";
  drawFrameWithTransform(ctx, asset, sx, sy, drawWidth, drawHeight, dx, dy, rotationRad);
  ctx.restore();
}

function drawDamagePopups(ctx, damagePopups) {
  if (!Array.isArray(damagePopups) || damagePopups.length === 0) {
    return;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 14px monospace";
  ctx.lineWidth = 3;

  for (const popup of damagePopups) {
    const alpha = clamp(Number(popup.alpha) || 0, 0, 1);
    if (alpha <= 0) {
      continue;
    }

    const x = Math.round(popup.x);
    const y = Math.round(popup.y);
    const text = String(Math.max(0, Math.round(Number(popup.value) || 0)));
    const isPlayerDamage = popup.targetType === "player";

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(24, 24, 24, 0.75)";
    ctx.fillStyle = isPlayerDamage ? "#ff4a4a" : "#fff6f0";
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  ctx.restore();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{canvas:HTMLCanvasElement,widthPx:number,heightPx:number}} backdrop
 * @param {{image:HTMLImageElement,frameWidth:number,frameHeight:number}|null} playerAsset
 * @param {{row:number,col:number}|null} playerFrame
 * @param {{x:number,y:number}|null} player
 * @param {number} playerFlashAlpha
 * @param {Array<{enemy:{x:number,y:number,height:number},asset:{image:HTMLImageElement,frameWidth:number,frameHeight:number}|null,frame:{row:number,col:number}|null,flashAlpha?:number,telegraphAlpha?:number}>} enemyDrawables
 * @param {Array<{weapon:{x:number,y:number,height:number},asset:{image:HTMLImageElement,frameWidth:number,frameHeight:number}|null,frame:{row:number,col:number}|null,rotationRad?:number}>} weaponDrawables
 * @param {Array<{weapon:{x:number,y:number,height:number},asset:{image:HTMLImageElement,frameWidth:number,frameHeight:number}|null,frame:{row:number,col:number}|null,rotationRad?:number}>} enemyWeaponDrawables
 * @param {Array<{value:number,x:number,y:number,alpha:number,targetType?:(\"enemy\"|\"player\")}>} damagePopups
 */
export function renderFrame(
  canvas,
  backdrop,
  playerAsset,
  playerFrame,
  player,
  playerFlashAlpha = 0,
  enemyDrawables = [],
  weaponDrawables = [],
  enemyWeaponDrawables = [],
  damagePopups = []
) {
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

  const drawQueue = [];

  for (const drawable of enemyDrawables) {
    if (!drawable.asset || !drawable.frame || !drawable.enemy) {
      continue;
    }

    drawQueue.push({
      feetY: drawable.enemy.y + drawable.enemy.height,
      draw() {
        drawSprite(ctx, drawable.asset, drawable.frame, drawable.enemy, {
          flashAlpha: drawable.flashAlpha ?? 0,
          telegraphAlpha: drawable.telegraphAlpha ?? 0,
        });
      },
    });
  }

  for (const drawable of weaponDrawables) {
    if (!drawable.asset || !drawable.frame || !drawable.weapon) {
      continue;
    }

    drawQueue.push({
      feetY: drawable.weapon.y + drawable.weapon.height,
      draw() {
        drawSprite(ctx, drawable.asset, drawable.frame, drawable.weapon, {
          rotationRad: drawable.rotationRad ?? 0,
        });
      },
    });
  }

  for (const drawable of enemyWeaponDrawables) {
    if (!drawable.asset || !drawable.frame || !drawable.weapon) {
      continue;
    }

    drawQueue.push({
      feetY: drawable.weapon.y + drawable.weapon.height,
      draw() {
        drawSprite(ctx, drawable.asset, drawable.frame, drawable.weapon, {
          rotationRad: drawable.rotationRad ?? 0,
        });
      },
    });
  }

  if (playerAsset && playerFrame && player) {
    drawQueue.push({
      feetY: player.y + playerAsset.frameHeight,
      draw() {
        drawSprite(ctx, playerAsset, playerFrame, player, {
          flashAlpha: playerFlashAlpha,
        });
      },
    });
  }

  drawQueue.sort((a, b) => a.feetY - b.feetY);
  for (const item of drawQueue) {
    item.draw();
  }

  drawDamagePopups(ctx, damagePopups);
}
