export const TILE_SIZE = 32;

export const GRID_WIDTH = 96;
export const GRID_HEIGHT = 96;

export const INITIAL_SEED = "20260208";

export const ROOM_COUNT_MIN = 9;
export const ROOM_COUNT_MAX = 12;

export const MAIN_PATH_MIN = 5;
export const MAIN_PATH_MAX = 7;

export const BRANCH_COUNT_MIN = 2;
export const BRANCH_COUNT_MAX = 3;

export const BRANCH_LENGTH_MIN = 1;
export const BRANCH_LENGTH_MAX = 2;

export const ROOM_SIZE_MIN = 6;
export const ROOM_SIZE_MAX = 11;

export const TALL_WALL_TILE_HEIGHT = 5;
export const CORRIDOR_WALKABLE_HEIGHT = 1;
export const HORIZONTAL_CORRIDOR_HEIGHT = TALL_WALL_TILE_HEIGHT + CORRIDOR_WALKABLE_HEIGHT;
export const VERTICAL_CORRIDOR_WIDTH = 2;
export const CORRIDOR_WIDTH = VERTICAL_CORRIDOR_WIDTH;
export const MIN_ROOM_GAP = TALL_WALL_TILE_HEIGHT;

export const MAX_GENERATION_ATTEMPTS = 300;

export const ROOM_TYPE = {
  START: "start",
  STAIRS: "stairs",
  NORMAL: "normal",
};

export const PLAYER_WIDTH = 32;
export const PLAYER_HEIGHT = 64;
export const PLAYER_FOOT_HITBOX_HEIGHT = 32;

export const PLAYER_SPEED_TILES_PER_SEC = 4.5;
export const PLAYER_SPEED_PX_PER_SEC = PLAYER_SPEED_TILES_PER_SEC * TILE_SIZE;

export const PLAYER_ANIM_FPS = 8;
export const PLAYER_IDLE_FRAME_COL = 1;
export const PLAYER_ANIM_SEQUENCE = [0, 1, 2, 1];

export const ENEMY_WALK_SPEED_TILES_PER_SEC = 2.5;
export const ENEMY_WALK_SPEED_PX_PER_SEC = ENEMY_WALK_SPEED_TILES_PER_SEC * TILE_SIZE;
export const ENEMY_CHASE_SPEED_MULTIPLIER = 1.3;

export const ENEMY_DIRECTION_MIN_SECONDS = 0.6;
export const ENEMY_DIRECTION_MAX_SECONDS = 1.4;

export const ENEMY_ANIM_FPS = 8;
export const ENEMY_IDLE_FRAME_COL = 1;
export const ENEMY_ANIM_SEQUENCE = [0, 1, 2, 1];
