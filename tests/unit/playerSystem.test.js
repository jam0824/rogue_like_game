import { describe, expect, it } from "vitest";
import {
  createPlayerState,
  getPlayerHitFlashAlpha,
  getPlayerFeetHitbox,
  getPlayerFrame,
  isPlayerDeathAnimationFinished,
  setDirectionalMoveInput,
  setPointerTarget,
  tryRestorePlayerPosition,
  updatePlayer,
} from "../../src/player/playerSystem.js";
import { TILE_SIZE } from "../../src/config/constants.js";

const PLAYER_DEFINITION = Object.freeze({
  id: "player_01",
  width: 24,
  height: 24,
  fps: 10,
  playerPngFacingDirection: "left",
});

const PLAYER_ASSETS = Object.freeze({
  fps: 10,
  defaultFacing: "left",
  walk: { frameCount: 4 },
  idle: { frameCount: 4 },
  death: { frameCount: 4 },
});

function createGrid(width, height, initial = true) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => initial));
}

function createDungeon({ walkableGrid, rooms, startRoomId }) {
  const gridHeight = walkableGrid.length;
  const gridWidth = walkableGrid[0].length;

  return {
    gridWidth,
    gridHeight,
    floorGrid: createGrid(gridWidth, gridHeight, true),
    walkableGrid,
    rooms,
    startRoomId,
  };
}

function createPlayer(overrides = {}) {
  return {
    x: 32,
    y: 32,
    width: 24,
    height: 24,
    footHitboxHeight: 24,
    facing: "down",
    spriteFacing: "left",
    defaultSpriteFacing: "left",
    spriteFacingSwitchMarginPx: 6,
    pointerActive: true,
    target: { x: 200, y: 80 },
    moveInputX: 0,
    moveInputY: 0,
    isMoving: false,
    isDead: false,
    animTime: 0,
    deathAnimTime: 0,
    animFps: 10,
    hp: 100,
    maxHp: 100,
    moveSpeedPxPerSec: 144,
    ...overrides,
  };
}

function getPlayerFeetCenter(player) {
  return {
    x: player.x + player.width / 2,
    y: player.y + player.height - player.footHitboxHeight / 2,
  };
}

describe("playerSystem", () => {
  describe("createPlayerState", () => {
    it("開始部屋中心が歩行可能なら中心にスポーンする", () => {
      const walkableGrid = createGrid(8, 8, true);
      const startRoom = { id: 10, x: 2, y: 3, w: 3, h: 3, centerX: 3, centerY: 4 };
      const dungeon = createDungeon({
        walkableGrid,
        rooms: [startRoom],
        startRoomId: 10,
      });

      const player = createPlayerState(dungeon, PLAYER_DEFINITION);
      const expectedX = startRoom.centerX * TILE_SIZE + TILE_SIZE / 2 - PLAYER_DEFINITION.width / 2;
      const expectedY = startRoom.centerY * TILE_SIZE + TILE_SIZE / 2 - PLAYER_DEFINITION.height / 2;

      expect(player.x).toBe(expectedX);
      expect(player.y).toBe(expectedY);
      expect(player.width).toBe(24);
      expect(player.height).toBe(24);
      expect(player.footHitboxHeight).toBe(24);
      expect(player.animFps).toBe(10);
      expect(player.spriteFacing).toBe("left");
      expect(player.hp).toBe(100);
      expect(player.maxHp).toBe(100);
      expect(player.hitFlashTimerSec).toBe(0);
      expect(player.hitFlashColor).toBe("#ffffff");
    });

    it("開始部屋中心が不可なら開始部屋内の代替歩行可能タイルにスポーンする", () => {
      const walkableGrid = createGrid(6, 6, true);
      walkableGrid[2][2] = false;

      const startRoom = { id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 };
      const dungeon = createDungeon({
        walkableGrid,
        rooms: [startRoom],
        startRoomId: 0,
      });

      const player = createPlayerState(dungeon, PLAYER_DEFINITION);
      const feet = getPlayerFeetHitbox(player);

      expect(Math.floor(feet.x / TILE_SIZE)).toBe(2);
      expect(Math.floor(feet.y / TILE_SIZE)).toBe(3);
    });

    it("開始部屋が見つからない場合は例外を投げる", () => {
      const walkableGrid = createGrid(6, 6, true);
      const dungeon = createDungeon({
        walkableGrid,
        rooms: [{ id: 1, x: 1, y: 1, w: 2, h: 2, centerX: 1, centerY: 1 }],
        startRoomId: 0,
      });

      expect(() => createPlayerState(dungeon, PLAYER_DEFINITION)).toThrow(
        "Failed to spawn player: start room is missing."
      );
    });
  });

  describe("setPointerTarget", () => {
    it("ポインター無効化でターゲットをクリアする", () => {
      const player = createPlayer({ pointerActive: true, target: { x: 120, y: 240 } });

      setPointerTarget(player, false, 10, 20);

      expect(player.pointerActive).toBe(false);
      expect(player.target).toBeNull();
    });

    it("有効座標ではターゲット設定し、無効座標は無視する", () => {
      const player = createPlayer({ pointerActive: false, target: null });

      setPointerTarget(player, true, 12, 34);
      expect(player.pointerActive).toBe(true);
      expect(player.target).toEqual({ x: 12, y: 34 });

      setPointerTarget(player, true, Number.NaN, 99);
      expect(player.pointerActive).toBe(true);
      expect(player.target).toEqual({ x: 12, y: 34 });
    });

    it("死亡時はターゲットを受け付けず pointerActive/target をクリアする", () => {
      const player = createPlayer({ hp: 0, pointerActive: true, target: { x: 100, y: 100 } });

      setPointerTarget(player, true, 12, 34);

      expect(player.pointerActive).toBe(false);
      expect(player.target).toBeNull();
    });
  });

  describe("setDirectionalMoveInput", () => {
    it("入力を -1..1 に正規化して保持する", () => {
      const player = createPlayer({ moveInputX: 0, moveInputY: 0 });

      setDirectionalMoveInput(player, 3, 4);

      expect(player.moveInputX).toBeCloseTo(0.6, 5);
      expect(player.moveInputY).toBeCloseTo(0.8, 5);

      setDirectionalMoveInput(player, Number.NaN, Number.POSITIVE_INFINITY);
      expect(player.moveInputX).toBe(0);
      expect(player.moveInputY).toBe(0);
    });
  });

  describe("tryRestorePlayerPosition", () => {
    it("歩行可能座標なら保存位置に復元する", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(8, 8, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });
      const player = createPlayer({ x: 32, y: 32 });

      const restored = tryRestorePlayerPosition(player, dungeon, { x: 64, y: 96 });

      expect(restored).toBe(true);
      expect(player.x).toBe(64);
      expect(player.y).toBe(96);
    });

    it("壁内座標なら復元せず false を返す", () => {
      const walkableGrid = createGrid(8, 8, true);
      walkableGrid[3][2] = false;
      const dungeon = createDungeon({
        walkableGrid,
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });
      const player = createPlayer({ x: 32, y: 32 });

      const restored = tryRestorePlayerPosition(player, dungeon, { x: 64, y: 96 });

      expect(restored).toBe(false);
      expect(player.x).toBe(32);
      expect(player.y).toBe(32);
    });

    it("範囲外の保存座標はクランプして復元する", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(8, 8, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });
      const player = createPlayer({ x: 32, y: 32 });

      const restored = tryRestorePlayerPosition(player, dungeon, { x: 9999, y: 9999 });

      expect(restored).toBe(true);
      expect(player.x).toBe(232);
      expect(player.y).toBe(232);
    });
  });

  describe("updatePlayer", () => {
    it("dt<=0 または非数なら状態を更新しない", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(8, 8, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });

      const player = createPlayer();
      const before = JSON.parse(JSON.stringify(player));

      updatePlayer(player, dungeon, 0);
      updatePlayer(player, dungeon, Number.NaN);

      expect(player).toEqual(before);
    });

    it("被弾フラッシュタイマーを毎フレーム減衰させる", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(8, 8, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });
      const player = createPlayer({ pointerActive: false, target: null, hitFlashTimerSec: 0.12 });

      updatePlayer(player, dungeon, 0.03);
      expect(player.hitFlashTimerSec).toBeCloseTo(0.09, 5);

      updatePlayer(player, dungeon, 0.2);
      expect(player.hitFlashTimerSec).toBe(0);
    });

    it("ターゲット未設定なら移動停止して idle アニメ時間を進める", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(8, 8, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });

      const player = createPlayer({ pointerActive: false, target: null, isMoving: true, animTime: 2.5 });

      updatePlayer(player, dungeon, 1 / 60);

      expect(player.isMoving).toBe(false);
      expect(player.animTime).toBeCloseTo(2.5 + 1 / 60, 6);
    });

    it("有効ターゲットへ移動時に isMoving=true かつ facing が進行方向になる", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(8, 8, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });

      const player = createPlayer({ x: 32, y: 32, target: { x: 200, y: 80 } });

      updatePlayer(player, dungeon, 1 / 60);

      expect(player.isMoving).toBe(true);
      expect(player.facing).toBe("right");
      expect(player.x).toBeGreaterThan(32);
      expect(player.animTime).toBeGreaterThan(0);
    });

    it("方向入力がある間はポインターターゲットより方向入力を優先する", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(16, 16, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 12, h: 12, centerX: 6, centerY: 6 }],
        startRoomId: 0,
      });
      const player = createPlayer({
        x: 64,
        y: 64,
        pointerActive: true,
        target: { x: 0, y: 64 },
      });

      setDirectionalMoveInput(player, 1, 0);
      updatePlayer(player, dungeon, 1 / 60);

      expect(player.x).toBeGreaterThan(64);
      expect(player.facing).toBe("right");
    });

    it("方向入力解除後は既存のポインター追従へ戻る", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(16, 16, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 12, h: 12, centerX: 6, centerY: 6 }],
        startRoomId: 0,
      });
      const player = createPlayer({
        x: 96,
        y: 96,
        pointerActive: true,
        target: { x: 0, y: 96 },
      });

      setDirectionalMoveInput(player, 1, 0);
      updatePlayer(player, dungeon, 1 / 60);
      const afterDirectionalX = player.x;

      setDirectionalMoveInput(player, 0, 0);
      updatePlayer(player, dungeon, 1 / 60);

      expect(player.x).toBeLessThan(afterDirectionalX);
    });

    it("上下移動中の小さな横ズレでは spriteFacing を切り替えない（6pxマージン）", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(12, 12, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 10, h: 10, centerX: 6, centerY: 6 }],
        startRoomId: 0,
      });
      const player = createPlayer({ spriteFacing: "left", spriteFacingSwitchMarginPx: 6 });
      const firstFeetCenter = getPlayerFeetCenter(player);

      player.target = {
        x: firstFeetCenter.x + 4,
        y: firstFeetCenter.y + 160,
      };
      updatePlayer(player, dungeon, 1 / 60);
      expect(player.spriteFacing).toBe("left");

      const secondFeetCenter = getPlayerFeetCenter(player);
      player.target = {
        x: secondFeetCenter.x + 20,
        y: secondFeetCenter.y + 160,
      };
      updatePlayer(player, dungeon, 1 / 60);
      expect(player.spriteFacing).toBe("right");
    });

    it("斜め衝突時に単軸フォールバックして壁スライドする", () => {
      const walkableGrid = createGrid(6, 6, true);
      walkableGrid[0][1] = false;

      const dungeon = createDungeon({
        walkableGrid,
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });

      const player = createPlayer({ x: 32, y: 32, target: { x: 200, y: 0 } });

      updatePlayer(player, dungeon, 1 / 60);

      expect(player.x).toBeGreaterThan(32);
      expect(player.y).toBe(32);
      expect(player.facing).toBe("right");
    });

    it("完全閉塞なら移動しない", () => {
      const walkableGrid = createGrid(6, 6, true);
      walkableGrid[1][2] = false;
      walkableGrid[2][1] = false;
      walkableGrid[2][2] = false;

      const dungeon = createDungeon({
        walkableGrid,
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });

      const player = createPlayer({ x: 41, y: 41, target: { x: 200, y: 80 }, isMoving: true, animTime: 1.2 });

      updatePlayer(player, dungeon, 1 / 60);

      expect(player.x).toBe(41);
      expect(player.y).toBe(41);
      expect(player.isMoving).toBe(false);
      expect(player.animTime).toBeCloseTo(1.2 + 1 / 60, 6);
    });

    it("HP<=0 で操作停止し deathAnimTime が進む", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(8, 8, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });
      const player = createPlayer({
        hp: 0,
        pointerActive: true,
        target: { x: 200, y: 100 },
        isMoving: true,
        deathAnimTime: 0.2,
      });

      updatePlayer(player, dungeon, 0.1);

      expect(player.isDead).toBe(true);
      expect(player.pointerActive).toBe(false);
      expect(player.target).toBeNull();
      expect(player.moveInputX).toBe(0);
      expect(player.moveInputY).toBe(0);
      expect(player.isMoving).toBe(false);
      expect(player.deathAnimTime).toBeCloseTo(0.3, 6);
    });
  });

  describe("描画補助", () => {
    it("walk/idle アニメーションは 0..last をループする", () => {
      const moving = createPlayer({ isMoving: true, animTime: 0 });
      const idle = createPlayer({ isMoving: false, animTime: 0 });

      const walkFrameCols = [0, 1, 2, 3, 4].map((index) => {
        const time = index / PLAYER_ASSETS.fps;
        return getPlayerFrame({ ...moving, animTime: time }, PLAYER_ASSETS).col;
      });
      const idleFrameCols = [0, 1, 2, 3, 4].map((index) => {
        const time = index / PLAYER_ASSETS.fps;
        return getPlayerFrame({ ...idle, animTime: time }, PLAYER_ASSETS).col;
      });

      expect(walkFrameCols).toEqual([0, 1, 2, 3, 0]);
      expect(idleFrameCols).toEqual([0, 1, 2, 3, 0]);
    });

    it("death アニメーションは3コマ目で停止する", () => {
      const dead = createPlayer({ hp: 0, isDead: true, deathAnimTime: 0 });

      const frameCols = [0, 1, 2, 6].map((index) => {
        const time = index / PLAYER_ASSETS.fps;
        return getPlayerFrame({ ...dead, deathAnimTime: time }, PLAYER_ASSETS).col;
      });
      const animation = getPlayerFrame({ ...dead, deathAnimTime: 10 }, PLAYER_ASSETS).animation;

      expect(frameCols).toEqual([0, 1, 2, 2]);
      expect(animation).toBe("death");
    });

    it("isPlayerDeathAnimationFinished は最終停止フレーム到達で true になる", () => {
      const alive = createPlayer({ hp: 100, isDead: false, deathAnimTime: 100 });
      expect(isPlayerDeathAnimationFinished(alive, PLAYER_ASSETS)).toBe(false);

      const deadBeforeStop = createPlayer({ hp: 0, isDead: true, deathAnimTime: 0.19 });
      expect(isPlayerDeathAnimationFinished(deadBeforeStop, PLAYER_ASSETS)).toBe(false);

      const deadAtStop = createPlayer({ hp: 0, isDead: true, deathAnimTime: 0.2 });
      expect(isPlayerDeathAnimationFinished(deadAtStop, PLAYER_ASSETS)).toBe(true);

      const deadAfterStop = createPlayer({ hp: 0, isDead: true, deathAnimTime: 10 });
      expect(isPlayerDeathAnimationFinished(deadAfterStop, PLAYER_ASSETS)).toBe(true);
    });

    it("defaultFacing=left に対して spriteFacing=right のときのみ flipX=true", () => {
      const leftFrame = getPlayerFrame(createPlayer({ spriteFacing: "left" }), PLAYER_ASSETS);
      const rightFrame = getPlayerFrame(createPlayer({ spriteFacing: "right" }), PLAYER_ASSETS);

      expect(leftFrame.flipX).toBe(false);
      expect(rightFrame.flipX).toBe(true);
    });

    it("足元ヒットボックス座標を小数第2位で丸める", () => {
      const hitbox = getPlayerFeetHitbox({
        x: 10.1234,
        y: 20.9876,
        width: 24,
        height: 24,
        footHitboxHeight: 24,
      });

      expect(hitbox).toEqual({
        x: 10.12,
        y: 20.99,
        width: 24,
        height: 24,
      });
    });

    it("getPlayerHitFlashAlpha は 0..1 を返す", () => {
      expect(getPlayerHitFlashAlpha(null)).toBe(0);

      const player = { hitFlashTimerSec: 0.12, hitFlashDurationSec: 0.12 };
      expect(getPlayerHitFlashAlpha(player)).toBe(1);

      player.hitFlashTimerSec = 0.06;
      expect(getPlayerHitFlashAlpha(player)).toBeCloseTo(0.5, 5);

      player.hitFlashTimerSec = 0;
      expect(getPlayerHitFlashAlpha(player)).toBe(0);
    });
  });
});
