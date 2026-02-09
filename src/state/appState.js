export function createAppState(initialSeed) {
  return {
    seed: String(initialSeed),
    isPaused: false,
    dungeon: null,
    validation: null,
    player: null,
    enemies: [],
    weapons: [],
    damagePopups: [],
    backdrop: null,
    error: null,
  };
}

export function setDungeonState(state, payload) {
  state.seed = String(payload.seed);
  state.isPaused = false;
  state.dungeon = payload.dungeon;
  state.validation = payload.validation;
  state.player = payload.player ?? null;
  state.enemies = payload.enemies ?? [];
  state.weapons = payload.weapons ?? [];
  state.damagePopups = payload.damagePopups ?? [];
  state.backdrop = payload.backdrop ?? null;
  state.error = null;
}

export function setErrorState(state, seed, error) {
  state.seed = String(seed);
  state.isPaused = false;
  state.dungeon = null;
  state.validation = null;
  state.player = null;
  state.enemies = [];
  state.weapons = [];
  state.damagePopups = [];
  state.backdrop = null;
  state.error = error instanceof Error ? error.message : String(error);
}
