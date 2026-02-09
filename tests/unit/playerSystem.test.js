import { describe, expect, it } from "vitest";
import {
  createPlayerState,
  getPlayerFeetHitbox,
  getPlayerFrame,
  setPointerTarget,
  tryRestorePlayerPosition,
  updatePlayer,
} from "../../src/player/playerSystem.js";
import {
  PLAYER_ANIM_FPS,
  PLAYER_ANIM_SEQUENCE,
  PLAYER_FOOT_HITBOX_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_IDLE_FRAME_COL,
  TILE_SIZE,
} from "../../src/config/constants.js";

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
    facing: "down",
    pointerActive: true,
    target: { x: 200, y: 80 },
    isMoving: false,
    animTime: 0,
    ...overrides,
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

      const player = createPlayerState(dungeon);
      const expectedX = startRoom.centerX * TILE_SIZE;
      const expectedY =
        startRoom.centerY * TILE_SIZE + TILE_SIZE / 2 - (PLAYER_HEIGHT - PLAYER_FOOT_HITBOX_HEIGHT / 2);

      expect(player.x).toBe(expectedX);
      expect(player.y).toBe(expectedY);
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

      const player = createPlayerState(dungeon);
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

      expect(() => createPlayerState(dungeon)).toThrow("Failed to spawn player: start room is missing.");
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
      walkableGrid[4][2] = false;
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
      expect(player.x).toBe(224);
      expect(player.y).toBe(192);
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

    it("ターゲット未設定なら移動停止して animTime を 0 にする", () => {
      const dungeon = createDungeon({
        walkableGrid: createGrid(8, 8, true),
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });

      const player = createPlayer({ pointerActive: false, target: null, isMoving: true, animTime: 2.5 });

      updatePlayer(player, dungeon, 1 / 60);

      expect(player.isMoving).toBe(false);
      expect(player.animTime).toBe(0);
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

    it("斜め衝突時に単軸フォールバックして壁スライドする", () => {
      const walkableGrid = createGrid(6, 6, true);
      walkableGrid[1][1] = false;

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
      walkableGrid[2][2] = false;

      const dungeon = createDungeon({
        walkableGrid,
        rooms: [{ id: 0, x: 1, y: 1, w: 3, h: 3, centerX: 2, centerY: 2 }],
        startRoomId: 0,
      });

      const player = createPlayer({ x: 32, y: 32, target: { x: 200, y: 80 }, isMoving: true, animTime: 1.2 });

      updatePlayer(player, dungeon, 1 / 60);

      expect(player.x).toBe(32);
      expect(player.y).toBe(32);
      expect(player.isMoving).toBe(false);
      expect(player.animTime).toBe(0);
    });
  });

  describe("描画補助", () => {
    it("移動中フレーム列が 0,1,2,1 で循環し、停止時は idle 列を返す", () => {
      const moving = { facing: "left", isMoving: true, animTime: 0 };

      const frameCols = [0, 1, 2, 3].map((index) => {
        const time = index / PLAYER_ANIM_FPS;
        return getPlayerFrame({ ...moving, animTime: time }).col;
      });

      const idle = getPlayerFrame({ ...moving, isMoving: false, animTime: 99 });

      expect(frameCols).toEqual(PLAYER_ANIM_SEQUENCE);
      expect(idle.col).toBe(PLAYER_IDLE_FRAME_COL);
    });

    it("足元ヒットボックス座標を小数第2位で丸める", () => {
      const hitbox = getPlayerFeetHitbox({ x: 10.1234, y: 20.9876 });

      expect(hitbox).toEqual({
        x: 10.12,
        y: 52.99,
        width: 32,
        height: 32,
      });
    });
  });
});
